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
        outcomes: { orderBy: { displayOrder: "asc" } },
        positions: {
          include: {
            currentOwner: { select: { id: true, username: true } },
            outcome: { select: { id: true, name: true } },
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

    const lmsrService = new LmsrService();
    const qVector = LmsrService.buildQVector(market.outcomes);
    const lmsrParams = { b: market.b, alpha: market.alpha, bMin: market.bMin };
    const pricesArray = lmsrService.getPricesLSN(qVector, lmsrParams);
    const effectiveB = lmsrService.getEffectiveBN(qVector, lmsrParams);
    const Q = qVector.reduce((s, q) => s + q, 0);

    // Build outcome prices map
    const outcomePrices: Record<string, number> = {};
    market.outcomes.forEach((outcome, idx) => {
      outcomePrices[outcome.name] = pricesArray[idx];
    });

    // Stats Logic
    const priceHistory = market.lmsrSnapshots.map((s) => {
      const pAfter = s.pAfter as Record<string, number>;
      return {
        timestamp: s.createdAt,
        prices: pAfter, // all outcome prices
        volume: s.cost,
      };
    });

    const purchases = market.positions.map((p) => {
      const prob = p.initialProbability.toNumber();
      return {
        id: p.id,
        username: p.currentOwner.username,
        outcome: p.outcome.name,
        outcomeId: p.outcomeId,
        side: p.side,
        amount: p.amount,
        initialProbability: prob <= 1 ? prob * 100 : prob,
        createdAt: p.createdAt,
      };
    });

    // Simulation: payout per dollar invested at current odds per outcome
    const simulation: Record<string, { payoutPerDollar: number }> = {};
    market.outcomes.forEach((outcome, idx) => {
      const price = pricesArray[idx];
      simulation[outcome.name] = {
        payoutPerDollar: price > 0 ? 1 / price : 0,
      };
    });

    // Commission Calculation
    const platformFeeRate = market.platformFee
      ? Number(market.platformFee)
      : 0.1;
    const platformCommission = market.positions.reduce((acc, p) => {
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
      winningOutcomeId: market.winningOutcomeId,

      // Liquidity Balance (safe fallback if it fails)
      liquidity: await SettlementService.getLiquidityStats(id).catch(() => ({
        b: market.b,
        initialSeed: market.seedCost,
        netInvestments: market.totalPool.toNumber(),
        totalPayouts: 0,
        netProfitLoss: 0,
      })),

      // Pools
      totalPool: market.totalPool.toNumber(),
      outcomes: market.outcomes.map((o, idx) => ({
        id: o.id,
        name: o.name,
        pool: Number(o.pool),
        qOutstanding: o.qOutstanding,
        price: pricesArray[idx],
      })),

      // LMSR Specifics
      b: market.b,
      effectiveB,
      Q,
      alpha: market.alpha,
      bMin: market.bMin,
      seedCost: market.seedCost,
      currentPrices: outcomePrices,
      platformFee: market.platformFee,

      // Lists
      purchases,
      priceHistory,

      // Simulation / Results
      simulation: {
        platformCommission,
        byOutcome: simulation,
      },
      resolutionReport,
    };

    return NextResponse.json(stats);
  } catch (error) {
    console.error("Error fetching admin market stats:", error);
    return NextResponse.json(
      {
        error: "Internal Server Error",
        message: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack?.split("\n").slice(0, 5) : undefined,
      },
      { status: 500 },
    );
  }
}
