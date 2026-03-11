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

    const platformFeeRate = market.platformFee
      ? Number(market.platformFee)
      : 0.1;
    let feeAmount = 0;

    // Scenario 1: User wants to spend X amount (e.g. $10)
    // Inclusive fee: If user spends 10, totalCost is 10, fee is 1, net is 9.
    if (amountStr && !sharesStr) {
      totalCost = parseFloat(amountStr);
      if (isNaN(totalCost) || totalCost <= 0) {
        return NextResponse.json({ error: "Invalid amount" }, { status: 400 });
      }

      feeAmount = totalCost * platformFeeRate;
      const netAmount = totalCost - feeAmount;

      // Calculate shares for net amount
      shares = lmsrService.getSharesToBuy(
        market.qYes,
        market.qNo,
        market.b,
        side,
        netAmount,
      );
    }
    // Scenario 2: User wants to buy Y shares (e.g. 10 shares)
    else if (sharesStr) {
      shares = parseFloat(sharesStr);
      if (isNaN(shares) || shares <= 0) {
        return NextResponse.json({ error: "Invalid shares" }, { status: 400 });
      }

      // Cost to buy these shares in the pool (NET COST)
      const netCost = lmsrService.getCostToBuy(
        market.qYes,
        market.qNo,
        market.b,
        side,
        shares,
      );
      // If WIN takes 10% of total, then netCost = 90% of total.
      // E.g. 9 = 0.9 * Total => Total = 9 / 0.9 = 10.
      totalCost = netCost / (1 - platformFeeRate);
      feeAmount = totalCost - netCost;
    } else {
      return NextResponse.json(
        { error: "Must provide either amount or shares" },
        { status: 400 },
      );
    }

    // avgPrice is based on Net Amount (the price per share in the pool)
    const avgPrice = shares > 0 ? (totalCost - feeAmount) / shares : 0;

    // Validate bounds for the requested net investment
    const maxBetAmount = market.maxBetAmount ?? null;
    const maxPriceImpact = market.maxPriceImpact ?? null;

    const netInvestment = totalCost - feeAmount;

    const validation = lmsrService.validateBetAmount(
      netInvestment, // Validate against the net investment amount
      market.qYes,
      market.qNo,
      market.b,
      side,
      maxBetAmount,
      maxPriceImpact,
    );

    // Calculate new probabilities (post-trade state simulation)
    const newQYes = side === "YES" ? market.qYes + shares : market.qYes;
    const newQNo = side === "NO" ? market.qNo + shares : market.qNo;
    const newPrices = lmsrService.getPrice(newQYes, newQNo, market.b);

    return NextResponse.json({
      side,
      shares,
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
