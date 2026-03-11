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
      where: { marketId: id, executionType: "BEST_BUY" },
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

    // Secondary market: filled orders (from audit log - OB portion)
    const obFills = routerLogs
      .filter((l) => l.obSharesBought > 0)
      .map((l) => ({
        id: l.id,
        username: l.user.username,
        side: l.side,
        obShares: l.obSharesBought,
        obAmount: Number(l.obAllocated),
        obAvgPrice: l.obAveragePrice,
        lmsrShares: l.lmsrSharesGenerated,
        lmsrAmount: Number(l.lmsrAllocated),
        finalAvgPrice: l.finalAveragePricePaid,
        totalAmount: Number(l.requestAmount),
        timestamp: l.timestamp,
      }));

    // P2P Volume summary
    const totalP2PVolumeExecuted = obFills.reduce((acc, f) => acc + f.obAmount, 0);
    const totalP2PSharesExecuted = obFills.reduce((acc, f) => acc + f.obShares, 0);
    const avgP2PPrice = totalP2PSharesExecuted > 0
      ? totalP2PVolumeExecuted / totalP2PSharesExecuted
      : 0;
    const totalOpenOrderValue = openOrders.reduce((acc, o) => acc + o.totalListed, 0);
    const totalOpenShares = openOrders.reduce((acc, o) => acc + o.remainingShares, 0);

    const secondaryMarket = {
      openOrders,
      obFills,
      summary: {
        totalP2PVolumeExecuted,
        totalP2PSharesExecuted,
        avgP2PPrice,
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

      // Liquidity Balance (Always present)
      liquidity: await SettlementService.getLiquidityStats(id),

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
