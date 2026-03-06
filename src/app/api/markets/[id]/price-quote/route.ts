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
    if (amountStr && !sharesStr) {
      const amount = parseFloat(amountStr);
      if (isNaN(amount) || amount <= 0) {
        return NextResponse.json({ error: "Invalid amount" }, { status: 400 });
      }

      feeAmount = amount * platformFeeRate;
      const netAmount = amount - feeAmount;

      // Calculate shares for amount
      shares = lmsrService.getSharesToBuy(
        market.qYes,
        market.qNo,
        market.b,
        side,
        netAmount,
      );
      totalCost = amount; // User pays the full amount
    }
    // Scenario 2: User wants to buy Y shares (e.g. 10 shares)
    else if (sharesStr) {
      shares = parseFloat(sharesStr);
      if (isNaN(shares) || shares <= 0) {
        return NextResponse.json({ error: "Invalid shares" }, { status: 400 });
      }

      // Calculate net cost to pool for these shares
      const netCost = lmsrService.getCostToBuy(
        market.qYes,
        market.qNo,
        market.b,
        side,
        shares,
      );
      totalCost = netCost / (1 - platformFeeRate);
      feeAmount = totalCost - netCost;
    } else {
      return NextResponse.json(
        { error: "Must provide either amount or shares" },
        { status: 400 },
      );
    }

    const avgPrice = shares > 0 ? totalCost / shares : 0;

    // Validate bounds for the requested amount (explicit limits only)
    const maxBetAmount = market.maxBetAmount ?? null;
    const maxPriceImpact = market.maxPriceImpact ?? null;

    const validation = lmsrService.validateBetAmount(
      totalCost, // Check the actual cost to be precise
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
      newProbabilities: {
        yes: newPrices.pYes,
        no: newPrices.pNo,
      },
      feeAmount,
      platformFeeRate,
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
