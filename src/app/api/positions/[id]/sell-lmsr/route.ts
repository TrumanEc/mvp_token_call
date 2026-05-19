import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { LmsrService } from "@/services/lmsr.service";
import { BalanceService } from "@/services/balance";
import { Decimal } from "@prisma/client/runtime/library";

/**
 * Sell-back via LMSR: burn shares against the curve, receive cash net of fee.
 * POST /api/positions/[id]/sell-lmsr  { userId, shares }
 */
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
      // 1. Load position + market
      const position = await tx.position.findUnique({
        where: { id: positionId },
        include: { market: true },
      });
      if (!position) throw new Error("Posición no encontrada");
      if (position.currentOwnerId !== userId) throw new Error("No eres dueño de esta posición");
      if (position.status !== "ACTIVE") throw new Error("Posición no activa");
      if (position.isForSale) throw new Error("Esta posición tiene una orden P2P activa. Cancélala primero.");

      const market = position.market;
      if (market.status !== "ACTIVE") throw new Error("El mercado no está activo");

      const isPrimaryPaused =
        market.primaryMarketPaused ||
        (market.primaryPauseScheduledAt &&
          new Date(market.primaryPauseScheduledAt) <= new Date());
      if (isPrimaryPaused) {
        throw new Error("El mercado primario está pausado. Crea una orden P2P en su lugar.");
      }

      // 2. Validate shares
      const availableShares = position.shares;
      if (shares > availableShares + 1e-6) {
        throw new Error(`Solo tienes ${availableShares.toFixed(2)} shares disponibles`);
      }
      const effectiveShares = Math.min(shares, availableShares);

      const side = position.side as "YES" | "NO";
      const availableOnCurve = side === "YES" ? market.qYes : market.qNo;
      if (availableOnCurve <= 0) {
        throw new Error("No hay liquidez en la curva LMSR para vender este lado");
      }

      // Cap to curve availability (shouldn't normally happen since user owns shares)
      const sharesToBurn = Math.min(effectiveShares, availableOnCurve);

      // 3. Compute revenue from LMSR curve
      const lmsr = new LmsrService();
      const liquidityParams = { b: market.b, alpha: market.alpha, bMin: market.bMin };
      const feeRate = market.platformFee ? Number(market.platformFee) : 0.015;
      const grossAmount = lmsr.getRevenueFromSellLS(
        market.qYes,
        market.qNo,
        liquidityParams,
        side,
        sharesToBurn,
      );
      if (grossAmount <= 0) throw new Error("La venta no genera ingresos en este momento");

      const feeAmount = grossAmount * feeRate;
      const netAmount = grossAmount - feeAmount;

      // 4. Update market state (burn shares, decrement pool)
      const newQYes = side === "YES" ? market.qYes - sharesToBurn : market.qYes;
      const newQNo = side === "NO" ? market.qNo - sharesToBurn : market.qNo;

      // Pool decreases by grossAmount (the cash leaving the market).
      // We decrement from the winning side's pool first.
      const currentSidePool = new Decimal(side === "YES" ? market.yesPool : market.noPool);
      const decFromSide = Decimal.min(currentSidePool, new Decimal(grossAmount));
      const remainder = new Decimal(grossAmount).minus(decFromSide);

      await tx.market.update({
        where: { id: market.id },
        data: {
          qYes: newQYes,
          qNo: newQNo,
          ...(side === "YES"
            ? {
                yesPool: { decrement: decFromSide },
                ...(remainder.gt(0) ? { noPool: { decrement: remainder } } : {}),
              }
            : {
                noPool: { decrement: decFromSide },
                ...(remainder.gt(0) ? { yesPool: { decrement: remainder } } : {}),
              }),
        },
      });

      // 5. Update position
      const newPositionShares = availableShares - sharesToBurn;
      const newTotalCost = Math.max(0, position.totalCost * (newPositionShares / availableShares));
      const newAmount = position.amount.times(newPositionShares).dividedBy(availableShares);

      await tx.position.update({
        where: { id: positionId },
        data: {
          shares: newPositionShares,
          amount: newAmount,
          totalCost: newTotalCost,
          // Keep status ACTIVE even if shares == 0; admin/cleanup can handle later
        },
      });

      // 6. Credit user balance net of fee
      await BalanceService.credit(
        tx,
        userId,
        new Decimal(netAmount),
        "POSITION_SOLD",
        `Sell-back LMSR: ${sharesToBurn.toFixed(2)} ${side} shares por $${netAmount.toFixed(2)} (fee $${feeAmount.toFixed(2)})`,
        market.id,
      );

      // 7. Record transfer (audit trail) — fromUser=user, toUser=user (burn = self-transfer to "market")
      // Actually we'll just rely on the Transaction record for audit. Optional: PositionTransfer requires both users.

      return {
        positionId,
        sharesSold: sharesToBurn,
        grossAmount,
        feeAmount,
        netAmount,
        remainingShares: newPositionShares,
        newProbabilities: lmsr.getPriceLS(newQYes, newQNo, liquidityParams),
      };
    });

    return NextResponse.json(result);
  } catch (e) {
    const message = e instanceof Error ? e.message : "Error al ejecutar sell-back";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
