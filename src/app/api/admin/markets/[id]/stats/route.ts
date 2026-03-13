import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { LmsrService } from "@/services/lmsr.service";
import { SettlementService } from "@/services/settlement";

export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  try {
    const market = await prisma.market.findUnique({
      where: { id },
      include: {
        positions: {
          include: {
            currentOwner: { select: { id: true, username: true } },
          },
          orderBy: { createdAt: "desc" },
        },
        lmsrSnapshots: {
          orderBy: { createdAt: "asc" }, // Oldest first for chart
        },
      },
    });

    if (!market) {
      return NextResponse.json({ error: "Market not found" }, { status: 404 });
    }

    // Fetch all orders for this market (secondary market)
    const allOrders = await prisma.order.findMany({
      where: { marketId: id },
      include: {
        user: { select: { id: true, username: true } },
      },
      orderBy: { createdAt: "desc" },
    });

    // Fetch router audit logs (tracks actual fills: LMSR + OB executions)
    const routerLogs = await prisma.marketRouterAuditLog.findMany({
      where: { marketId: id },
      include: {
        user: { select: { id: true, username: true } },
      },
      orderBy: { timestamp: "desc" },
    });

    const lmsrService = new LmsrService();
    const prices = lmsrService.getPrice(market.qYes, market.qNo, market.b);

    // Stats Logic
    const priceHistory = market.lmsrSnapshots.map((s) => {
      const p = s.pYesAfter > 1 ? s.pYesAfter / 100 : s.pYesAfter;
      return {
        timestamp: s.createdAt,
        price: p, // Chart expects 0-1
        yesOdds: p * 100,
        noOdds: (1 - p) * 100,
        totalPool: s.cost,
      };
    });

    const purchases = market.positions.map((p) => {
      const prob = p.initialProbability.toNumber();
      return {
        id: p.id,
        username: p.currentOwner.username,
        side: p.side,
        amount: p.amount,
        initialProbability: prob <= 1 ? prob * 100 : prob,
        createdAt: p.createdAt,
      };
    });

    // Secondary market: open/partial orders
    const openOrders = allOrders
      .filter((o) => o.status === "OPEN" || o.status === "PARTIAL")
      .map((o) => ({
        id: o.id,
        username: o.user.username,
        side: o.side,
        type: o.type,
        status: o.status,
        pricePerShare: o.pricePerShare,
        initialShares: o.initialShares,
        remainingShares: o.remainingShares,
        filledShares: o.initialShares - o.remainingShares,
        totalListed: o.initialShares * o.pricePerShare,
        totalFilled: (o.initialShares - o.remainingShares) * o.pricePerShare,
        createdAt: o.createdAt,
      }));

    // Secondary market: filled orders (P2P Transfers)
    // Buscamos todas las transferencias de posiciones del mercado actual asociadas a una orden (listingId != null)
    const p2pTransfers = await prisma.positionTransfer.findMany({
      where: {
        position: { marketId: id },
        listingId: { not: null }
      },
      include: {
        toUser: { select: { username: true } },
        fromUser: { select: { username: true } },
      },
      orderBy: { transferredAt: "desc" }
    });

    const obFills = [];
    let totalP2PVolumeExecuted = 0;
    let totalP2PFeeCollected = 0;

    for (const t of p2pTransfers) {
      // El seller recibe el precio neto (98%). El comprador pagó el 100%.
      // Gross = Net / 0.98
      const netAmount = Number(t.price);
      const grossAmount = netAmount / 0.98;
      const fee = grossAmount - netAmount;

      totalP2PVolumeExecuted += netAmount;
      totalP2PFeeCollected += fee;

      obFills.push({
        id: t.id,
        buyer: t.toUser?.username || "Unknown",
        seller: t.fromUser?.username || "Unknown",
        netAmount,
        grossAmount,
        fee,
        timestamp: t.transferredAt,
        listingId: t.listingId
      });
    }

    const totalOpenOrderValue = openOrders.reduce((acc, o) => acc + o.totalListed, 0);
    const totalOpenShares = openOrders.reduce((acc, o) => acc + o.remainingShares, 0);

    const secondaryMarket = {
      openOrders,
      obFills,
      summary: {
        totalP2PVolumeExecuted,
        totalP2PFeeCollected,
        p2pTradeCount: obFills.length,
        openOrderCount: openOrders.length,
        totalOpenOrderValue,
        totalOpenShares,
      },
    };

    // Simulation
    // Payout per dollar invested NOW at current odds:
    // If I buy YES at 0.60, payout is $1. So multiplier is 1 / 0.60 = 1.66x
    const payoutYes = prices.pYes > 0 ? 1 / prices.pYes : 0;
    const payoutNo = prices.pNo > 0 ? 1 / prices.pNo : 0;

    // Commission Calculation
    const platformFeeRate = market.platformFee
      ? Number(market.platformFee)
      : 0.1;
    const platformCommission = market.positions.reduce((acc, p) => {
      // Calculate fee based on the currently set platform fee rate
      const fee = p.amount.toNumber() * platformFeeRate;
      return acc + fee;
    }, 0);

    // Resolution Report (only if market is resolved)
    let resolutionReport = null;
    if (market.status === "RESOLVED" || market.status === "VOIDED") {
      try {
        resolutionReport = await SettlementService.getReport(id);
      } catch (e) {
        console.warn("Failed to generate resolution report:", e);
      }
    }

    const stats = {
      // Basic Info
      id: market.id,
      question: market.question,
      status: market.status,
      outcome: market.outcome,

      // Liquidity Balance (safe fallback if it fails)
      liquidity: await SettlementService.getLiquidityStats(id).catch(() => ({
        b: market.b,
        initialSeed: market.seedCost,
        netInvestments: market.yesPool.toNumber() + market.noPool.toNumber(),
        totalPayouts: 0,
        netProfitLoss: 0,
      })),

      // Pools (Legacy + LMSR)
      yesPool: market.yesPool,
      noPool: market.noPool,
      totalPool: market.yesPool.toNumber() + market.noPool.toNumber(), // Legacy total

      // LMSR Specifics
      b: market.b,
      qYes: market.qYes,
      qNo: market.qNo,
      seedCost: market.seedCost,
      currentPrices: prices,
      platformFee: market.platformFee,

      // Lists
      purchases,
      priceHistory,

      // Secondary Market
      secondaryMarket,

      // Simulation / Results
      simulation: {
        platformCommission,
        ifYesWins: {
          payoutPerDollar: payoutYes,
        },
        ifNoWins: {
          payoutPerDollar: payoutNo,
        },
      },
      resolutionReport,
    };

    return NextResponse.json(stats);
  } catch (error) {
    console.error("Error fetching admin market stats:", error);
    return NextResponse.json(
      { error: "Internal Server Error" },
      { status: 500 },
    );
  }
}
