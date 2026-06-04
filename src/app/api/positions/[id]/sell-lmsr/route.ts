import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { LmsrService } from "@/services/lmsr.service";
import { BalanceService } from "@/services/balance";
import { Decimal } from "@prisma/client/runtime/library";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: positionId } = await params;
  const { userId, shares } = await request.json();

  if (!userId || !shares || shares <= 0) {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  try {
    const result = await prisma.$transaction(async (tx) => {
      const position = await tx.position.findUnique({
        where: { id: positionId },
        include: {
          market: { include: { outcomes: { orderBy: { displayOrder: "asc" } } } },
          outcome: true,
        },
      });
      if (!position) throw new Error("Posición no encontrada");
      if (position.currentOwnerId !== userId) throw new Error("No eres dueño de esta posición");
      if (position.status !== "ACTIVE") throw new Error("Posición no activa");

      const market = position.market;
      if (market.status !== "ACTIVE") throw new Error("El mercado no está activo");

      const isPrimaryPaused =
        market.primaryMarketPaused ||
        (market.primaryPauseScheduledAt && new Date(market.primaryPauseScheduledAt) <= new Date());
      if (isPrimaryPaused) {
        throw new Error("El mercado primario está pausado. Crea una orden P2P en su lugar.");
      }

      const availableShares = position.shares;
      if (shares > availableShares + 1e-6) {
        throw new Error(`Solo tienes ${availableShares.toFixed(2)} shares disponibles`);
      }
      const effectiveShares = Math.min(shares, availableShares);

      const sortedOutcomes = [...market.outcomes].sort((a, b) => a.displayOrder - b.displayOrder);
      const qVector = sortedOutcomes.map(o => o.qOutstanding);
      const outcomeIdx = sortedOutcomes.findIndex(o => o.id === position.outcomeId);
      const outcomeRecord = sortedOutcomes[outcomeIdx];

      // qOutstanding can be negative under LS-LMSR with non-uniform priors. The real cap
      // is the user's owned shares (already enforced by `effectiveShares`).
      const sharesToBurn = effectiveShares;

      const lmsr = new LmsrService();
      const liquidityParams = { b: market.b, alpha: market.alpha, bMin: market.bMin };
      const feeRate = market.platformFee ? Number(market.platformFee) : 0.015;
      const grossAmount = lmsr.getRevenueFromSellLSN(qVector, liquidityParams, outcomeIdx, sharesToBurn);
      if (grossAmount <= 0) throw new Error("La venta no genera ingresos en este momento");

      const feeAmount = grossAmount * feeRate;
      const netAmount = grossAmount - feeAmount;

      // Update outcome qOutstanding and pool
      const currentPool = new Decimal(outcomeRecord.pool);
      const decFromPool = Decimal.min(currentPool, new Decimal(grossAmount));

      await tx.marketOutcome.update({
        where: { id: position.outcomeId },
        data: {
          qOutstanding: outcomeRecord.qOutstanding - sharesToBurn,
          pool: { decrement: decFromPool },
        },
      });

      // Update market totalPool
      await tx.market.update({
        where: { id: market.id },
        data: { totalPool: { decrement: new Decimal(grossAmount) } },
      });

      // Update position
      const newPositionShares = availableShares - sharesToBurn;
      const newTotalCost = Math.max(0, position.totalCost * (newPositionShares / availableShares));
      const newAmount = position.amount.times(newPositionShares).dividedBy(availableShares);

      await tx.position.update({
        where: { id: positionId },
        data: { shares: newPositionShares, amount: newAmount, totalCost: newTotalCost },
      });

      await BalanceService.credit(
        tx, userId, new Decimal(netAmount), "POSITION_SOLD",
        `Sell-back LMSR: ${sharesToBurn.toFixed(2)} ${outcomeRecord.name} shares por $${netAmount.toFixed(2)} (fee $${feeAmount.toFixed(2)})`,
        market.id,
      );

      // Build new probabilities
      const newQ = [...qVector];
      newQ[outcomeIdx] -= sharesToBurn;
      const newPrices = lmsr.getPricesLSN(newQ, liquidityParams);
      const newProbabilities: Record<string, number> = {};
      sortedOutcomes.forEach((o, i) => { newProbabilities[o.id] = newPrices[i]; });

      return {
        positionId,
        outcomeId: position.outcomeId,
        outcomeName: outcomeRecord.name,
        sharesSold: sharesToBurn,
        grossAmount, feeAmount, netAmount,
        remainingShares: newPositionShares,
        newProbabilities,
      };
    });

    return NextResponse.json(result);
  } catch (e) {
    const message = e instanceof Error ? e.message : "Error al ejecutar sell-back";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
