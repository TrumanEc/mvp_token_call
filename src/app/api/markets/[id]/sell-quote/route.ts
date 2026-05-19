import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { LmsrService } from "@/services/lmsr.service";

/**
 * Quote for selling shares back to the LMSR (sell-back).
 * GET /api/markets/[id]/sell-quote?side=YES&shares=10
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { searchParams } = new URL(request.url);
  const { id } = await params;
  const side = searchParams.get("side") as "YES" | "NO";
  const sharesStr = searchParams.get("shares");

  if (!side || (side !== "YES" && side !== "NO")) {
    return NextResponse.json({ error: "Invalid side" }, { status: 400 });
  }
  if (!sharesStr) {
    return NextResponse.json({ error: "Missing shares" }, { status: 400 });
  }
  const shares = parseFloat(sharesStr);
  if (isNaN(shares) || shares <= 0) {
    return NextResponse.json({ error: "Invalid shares" }, { status: 400 });
  }

  try {
    const market = await prisma.market.findUnique({
      where: { id },
      select: {
        id: true,
        qYes: true,
        qNo: true,
        b: true,
        alpha: true,
        bMin: true,
        status: true,
        yesPool: true,
        noPool: true,
        platformFee: true,
        primaryMarketPaused: true,
        primaryPauseScheduledAt: true,
      },
    });

    if (!market) {
      return NextResponse.json({ error: "Market not found" }, { status: 404 });
    }
    if (market.status !== "ACTIVE") {
      return NextResponse.json({ error: "Market not active" }, { status: 400 });
    }

    const primaryPaused =
      market.primaryMarketPaused ||
      (market.primaryPauseScheduledAt &&
        new Date(market.primaryPauseScheduledAt) <= new Date());
    if (primaryPaused) {
      return NextResponse.json(
        { error: "El mercado primario está pausado. Solo se aceptan ventas P2P.", primaryPaused: true },
        { status: 403 },
      );
    }

    const lmsr = new LmsrService();
    const liquidityParams = { b: market.b, alpha: market.alpha, bMin: market.bMin };
    const feeRate = market.platformFee ? Number(market.platformFee) : 0.015;

    // Cap shares to what exists on the LMSR curve for that side
    const availableOnCurve = side === "YES" ? market.qYes : market.qNo;
    if (availableOnCurve <= 0) {
      return NextResponse.json({
        side,
        shares: 0,
        grossAmount: 0,
        feeAmount: 0,
        netAmount: 0,
        avgPricePerShare: 0,
        feeRate,
        newProbabilities: { yes: 0, no: 0 },
        liquidityAvailable: 0,
        capped: true,
        capReason: "No hay liquidez en la curva LMSR para este lado",
      });
    }

    const effectiveShares = Math.min(shares, availableOnCurve);
    const grossAmount = lmsr.getRevenueFromSellLS(
      market.qYes,
      market.qNo,
      liquidityParams,
      side,
      effectiveShares,
    );
    const feeAmount = grossAmount * feeRate;
    const netAmount = grossAmount - feeAmount;
    const avgPricePerShare = effectiveShares > 0 ? grossAmount / effectiveShares : 0;

    // New state after sell
    const newQYes = side === "YES" ? market.qYes - effectiveShares : market.qYes;
    const newQNo = side === "NO" ? market.qNo - effectiveShares : market.qNo;
    const newPrices = lmsr.getPriceLS(newQYes, newQNo, liquidityParams);

    return NextResponse.json({
      side,
      shares: effectiveShares,
      requestedShares: shares,
      grossAmount,
      feeAmount,
      netAmount,
      avgPricePerShare,
      feeRate,
      newProbabilities: { yes: newPrices.pYes, no: newPrices.pNo },
      liquidityAvailable: availableOnCurve,
      capped: effectiveShares < shares,
      capReason: effectiveShares < shares ? "Limitado por liquidez en la curva" : null,
    });
  } catch (error) {
    console.error("Error in sell-quote:", error);
    return NextResponse.json(
      {
        error: "Internal Server Error",
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 },
    );
  }
}
