import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { LmsrService } from "@/services/lmsr.service";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { searchParams } = new URL(request.url);
  const { id } = await params;
  const outcomeId = searchParams.get("outcomeId");
  const side = searchParams.get("side") as "YES" | "NO" | null;
  const amountStr = searchParams.get("amount");

  try {
    const market = await prisma.market.findUnique({
      where: { id },
      include: { outcomes: { orderBy: { displayOrder: "asc" } } },
    });

    if (!market) {
      return NextResponse.json({ error: "Market not found" }, { status: 404 });
    }

    // Resolve outcomeId: either explicit or from legacy `side` param
    let resolvedOutcomeId = outcomeId;
    if (!resolvedOutcomeId && side) {
      const match = market.outcomes.find(o => o.name === side);
      if (match) resolvedOutcomeId = match.id;
    }
    if (!resolvedOutcomeId) {
      return NextResponse.json({ error: "outcomeId or side required" }, { status: 400 });
    }

    const outcomeRecord = market.outcomes.find(o => o.id === resolvedOutcomeId);
    if (!outcomeRecord) {
      return NextResponse.json({ error: "Outcome not found" }, { status: 404 });
    }

    if (!amountStr) {
      return NextResponse.json({ error: "amount parameter required" }, { status: 400 });
    }

    const totalCostBudget = parseFloat(amountStr);
    if (isNaN(totalCostBudget) || totalCostBudget <= 0) {
      return NextResponse.json({ error: "Invalid amount" }, { status: 400 });
    }

    const { RouterService } = await import("@/services/router.service");

    const sim = await RouterService.simulateMarketBuy({
      marketId: id,
      outcomeId: resolvedOutcomeId,
      budget: totalCostBudget,
    });

    const lmsrService = new LmsrService();
    const sortedOutcomes = [...market.outcomes].sort((a, b) => a.displayOrder - b.displayOrder);
    const qVector = sortedOutcomes.map(o => o.qOutstanding);
    const params2 = { b: market.b, alpha: market.alpha, bMin: market.bMin };
    const outcomeIdx = sortedOutcomes.findIndex(o => o.id === resolvedOutcomeId);

    const platformFeeRate = market.platformFee ? Number(market.platformFee) : 0.015;
    const netInvestment = sim.spentGross - sim.fee;
    const avgPrice = sim.sharesCollected > 0 ? sim.spentGross / sim.sharesCollected : 0;

    // Estimated payout per share (proportional)
    const currentTotalPool = market.totalPool.toNumber();
    const poolAfterBuy = currentTotalPool + netInvestment;
    const currentWinningShares = outcomeRecord.qOutstanding;
    const totalWinningSharesAfter = currentWinningShares + sim.sharesCollected;
    const estimatedPayoutPerShare = totalWinningSharesAfter > 0 ? poolAfterBuy / totalWinningSharesAfter : 1;

    const validation = lmsrService.validateBetAmountLSN(
      netInvestment, qVector, params2, outcomeIdx,
      market.maxBetAmount ?? null, market.maxPriceImpact ?? null,
    );

    return NextResponse.json({
      outcomeId: resolvedOutcomeId,
      outcomeName: outcomeRecord.name,
      side: outcomeRecord.name,
      shares: sim.sharesCollected,
      lmsrShares: sim.lmsrShares,
      obShares: sim.obShares,
      totalCost: sim.spentGross,
      avgPrice,
      feeAmount: sim.fee,
      lmsrFeeAmount: sim.lmsrFee,
      obFeeAmount: sim.obFee,
      platformFeeRate,
      lmsrFeeRate: platformFeeRate,
      obFeeRate: 0.02,
      estimatedPayoutPerShare,
      newProbabilities: sim.newProbabilities,
      priceImpact: 0,
      maxAllowedAmount: validation.maxAllowed,
      capReason: validation.reason || null,
      wouldExceedCap: !validation.allowed,
    });
  } catch (error) {
    console.error("Error calculating price quote:", error);
    return NextResponse.json(
      { error: "Internal Server Error", details: error instanceof Error ? error.message : String(error) },
      { status: 500 },
    );
  }
}
