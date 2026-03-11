import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { LmsrService } from "@/services/lmsr.service";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { searchParams } = new URL(request.url);
  const { id } = await params;
  const side = searchParams.get("side") as "YES" | "NO";
  const amountStr = searchParams.get("amount");
  const sharesStr = searchParams.get("shares");

  if (!side || (side !== "YES" && side !== "NO")) {
    return NextResponse.json({ error: "Invalid side" }, { status: 400 });
  }

  try {
    const market = await prisma.market.findUnique({
      where: { id },
      select: {
        id: true,
        qYes: true,
        qNo: true,
        b: true,
        maxBetAmount: true,
        maxPriceImpact: true,
        platformFee: true,
      },
    });

    if (!market) {
      return NextResponse.json({ error: "Market not found" }, { status: 404 });
    }

    const lmsrService = new LmsrService();

    let shares = 0;
    let totalCost = 0;
    let lmsrShares = 0;
    let obShares = 0;

    const platformFeeRate = market.platformFee
      ? Number(market.platformFee)
      : 0.1;
    let feeAmount = 0;
    let newQYes = market.qYes;
    let newQNo = market.qNo;
    let newPrices = { pYes: 0, pNo: 0 };

    if (amountStr && !sharesStr) {
      totalCost = parseFloat(amountStr);
      if (isNaN(totalCost) || totalCost <= 0) {
        return NextResponse.json({ error: "Invalid amount" }, { status: 400 });
      }

      feeAmount = totalCost * platformFeeRate;
      const netAmount = totalCost - feeAmount;

      const { RouterService } = await import("@/services/router.service");
      const sim = await RouterService.simulateMarketBuy({
        marketId: id,
        side,
        budget: netAmount,
      });

      shares = sim.sharesCollected;
      lmsrShares = sim.lmsrShares;
      obShares = sim.obShares;
      newPrices = { pYes: sim.newProbabilities.yes, pNo: sim.newProbabilities.no };
    } else if (sharesStr) {
      shares = parseFloat(sharesStr);
      if (isNaN(shares) || shares <= 0) {
        return NextResponse.json({ error: "Invalid shares" }, { status: 400 });
      }

      const netCost = lmsrService.getCostToBuy(
        market.qYes,
        market.qNo,
        market.b,
        side,
        shares,
      );
      totalCost = netCost / (1 - platformFeeRate);
      feeAmount = totalCost - netCost;
      
      newQYes = side === "YES" ? market.qYes + shares : market.qYes;
      newQNo = side === "NO" ? market.qNo + shares : market.qNo;
      newPrices = lmsrService.getPrice(newQYes, newQNo, market.b);
      lmsrShares = shares; 
      obShares = 0;
    } else {
      return NextResponse.json(
        { error: "Must provide either amount or shares" },
        { status: 400 },
      );
    }

    const avgPrice = shares > 0 ? (totalCost - feeAmount) / shares : 0;
    const maxBetAmount = market.maxBetAmount ?? null;
    const maxPriceImpact = market.maxPriceImpact ?? null;
    const netInvestment = totalCost - feeAmount;

    const validation = lmsrService.validateBetAmount(
      netInvestment, 
      market.qYes,
      market.qNo,
      market.b,
      side,
      maxBetAmount,
      maxPriceImpact,
    );

    return NextResponse.json({
      side,
      shares,
      lmsrShares,
      obShares,
      totalCost,
      avgPrice,
      feeAmount,
      platformFeeRate,
      newProbabilities: {
        yes: newPrices.pYes,
        no: newPrices.pNo,
      },
      priceImpact: 0, // TODO: Calculate price impact %
      maxAllowedAmount: validation.maxAllowed,
      capReason: validation.reason || null,
      wouldExceedCap: !validation.allowed,
    });
  } catch (error) {
    console.error("Error calculating price quote:", error);
    return NextResponse.json(
      {
        error: "Internal Server Error",
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 },
    );
  }
}
