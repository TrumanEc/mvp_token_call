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
  const side = searchParams.get("side") as string | null;
  const sharesStr = searchParams.get("shares");

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
      include: { outcomes: { orderBy: { displayOrder: "asc" } } },
    });

    if (!market) return NextResponse.json({ error: "Market not found" }, { status: 404 });
    if (market.status !== "ACTIVE") return NextResponse.json({ error: "Market not active" }, { status: 400 });

    const primaryPaused =
      market.primaryMarketPaused ||
      (market.primaryPauseScheduledAt && new Date(market.primaryPauseScheduledAt) <= new Date());
    if (primaryPaused) {
      return NextResponse.json(
        { error: "El mercado primario está pausado. Solo se aceptan ventas P2P.", primaryPaused: true },
        { status: 403 },
      );
    }

    // Resolve outcomeId
    let resolvedOutcomeId = outcomeId;
    if (!resolvedOutcomeId && side) {
      const match = market.outcomes.find(o => o.name === side);
      if (match) resolvedOutcomeId = match.id;
    }
    if (!resolvedOutcomeId) {
      return NextResponse.json({ error: "outcomeId or side required" }, { status: 400 });
    }

    const outcomeRecord = market.outcomes.find(o => o.id === resolvedOutcomeId);
    if (!outcomeRecord) return NextResponse.json({ error: "Outcome not found" }, { status: 404 });

    const lmsr = new LmsrService();
    const sortedOutcomes = [...market.outcomes].sort((a, b) => a.displayOrder - b.displayOrder);
    const qVector = sortedOutcomes.map(o => o.qOutstanding);
    const outcomeIdx = sortedOutcomes.findIndex(o => o.id === resolvedOutcomeId);
    const liquidityParams = { b: market.b, alpha: market.alpha, bMin: market.bMin };
    const feeRate = market.platformFee ? Number(market.platformFee) : 0.015;

    const availableOnCurve = outcomeRecord.qOutstanding;
    if (availableOnCurve <= 0) {
      return NextResponse.json({
        outcomeId: resolvedOutcomeId,
        outcomeName: outcomeRecord.name,
        shares: 0, grossAmount: 0, feeAmount: 0, netAmount: 0,
        avgPricePerShare: 0, feeRate,
        newProbabilities: {},
        liquidityAvailable: 0, capped: true,
        capReason: "No hay liquidez en la curva LMSR para este outcome",
      });
    }

    const effectiveShares = Math.min(shares, availableOnCurve);
    const grossAmount = lmsr.getRevenueFromSellLSN(qVector, liquidityParams, outcomeIdx, effectiveShares);
    const feeAmount = grossAmount * feeRate;
    const netAmount = grossAmount - feeAmount;
    const avgPricePerShare = effectiveShares > 0 ? grossAmount / effectiveShares : 0;

    const newQ = [...qVector];
    newQ[outcomeIdx] -= effectiveShares;
    const newPrices = lmsr.getPricesLSN(newQ, liquidityParams);

    const newProbabilities: Record<string, number> = {};
    sortedOutcomes.forEach((o, i) => { newProbabilities[o.id] = newPrices[i]; });

    return NextResponse.json({
      outcomeId: resolvedOutcomeId,
      outcomeName: outcomeRecord.name,
      shares: effectiveShares,
      requestedShares: shares,
      grossAmount, feeAmount, netAmount, avgPricePerShare, feeRate,
      newProbabilities,
      liquidityAvailable: availableOnCurve,
      capped: effectiveShares < shares,
      capReason: effectiveShares < shares ? "Limitado por liquidez en la curva" : null,
    });
  } catch (error) {
    console.error("Error in sell-quote:", error);
    return NextResponse.json(
      { error: "Internal Server Error", details: error instanceof Error ? error.message : String(error) },
      { status: 500 },
    );
  }
}
