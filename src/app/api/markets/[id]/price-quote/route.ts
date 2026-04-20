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
        status: true,
        yesPool: true,
        noPool: true,
        primaryMarketPaused: true,
        primaryPauseScheduledAt: true,
      },
    });

    if (!market) {
      return NextResponse.json({ error: "Market not found" }, { status: 404 });
    }

    const primaryPaused =
      market.primaryMarketPaused ||
      (market.primaryPauseScheduledAt &&
        new Date(market.primaryPauseScheduledAt) <= new Date());

    if (primaryPaused) {
      return NextResponse.json(
        { error: "Mercado primario pausado", primaryPaused: true },
        { status: 403 },
      );
    }

    const lmsrService = new LmsrService();

    let shares = 0;
    let totalCost = 0;
    let lmsrShares = 0;
    let obShares = 0;
    let feeAmount = 0;
    let lmsrFeeAmount = 0;
    let obFeeAmount = 0;
    let newPrices = { pYes: 0, pNo: 0 };
    const platformFeeRate = market.platformFee ? Number(market.platformFee) : 0.015;

    if (amountStr && !sharesStr) {
      totalCost = parseFloat(amountStr);
      if (isNaN(totalCost) || totalCost <= 0) {
        return NextResponse.json({ error: "Invalid amount" }, { status: 400 });
      }

      const { RouterService } = await import("@/services/router.service");

      const sim = await RouterService.simulateMarketBuy({
        marketId: id,
        side,
        budget: totalCost,
      });

      feeAmount = sim.fee;
      lmsrFeeAmount = sim.lmsrFee;
      obFeeAmount = sim.obFee;
      shares = sim.sharesCollected;
      lmsrShares = sim.lmsrShares;
      obShares = sim.obShares;
      newPrices = { pYes: sim.newProbabilities.yes, pNo: sim.newProbabilities.no };

      const avgPrice = shares > 0 ? totalCost / shares : 0;
      const netInvestment = totalCost - feeAmount;

      const currentTotalPool = Number(market.yesPool) + Number(market.noPool);
      const poolAfterBuy = currentTotalPool + netInvestment;
      const currentWinningShares = side === "YES" ? market.qYes : market.qNo;
      const totalWinningSharesAfter = currentWinningShares + shares;
      const estimatedPayoutPerShare = totalWinningSharesAfter > 0
        ? poolAfterBuy / totalWinningSharesAfter
        : 1;

      const validation = lmsrService.validateBetAmount(
        netInvestment,
        market.qYes,
        market.qNo,
        market.b,
        side,
        market.maxBetAmount ?? null,
        market.maxPriceImpact ?? null,
      );

      return NextResponse.json({
        side,
        shares,
        lmsrShares,
        obShares,
        totalCost,
        avgPrice,
        feeAmount,
        lmsrFeeAmount,
        obFeeAmount,
        platformFeeRate,
        lmsrFeeRate: platformFeeRate,
        obFeeRate: 0.02,
        estimatedPayoutPerShare,
        newProbabilities: {
          yes: newPrices.pYes,
          no: newPrices.pNo,
        },
        priceImpact: 0,
        maxAllowedAmount: validation.maxAllowed,
        capReason: validation.reason || null,
        wouldExceedCap: !validation.allowed,
      });

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
      lmsrFeeAmount = feeAmount;
      obFeeAmount = 0;
      
      const newQYes = side === "YES" ? market.qYes + shares : market.qYes;
      const newQNo = side === "NO" ? market.qNo + shares : market.qNo;
      newPrices = lmsrService.getPrice(newQYes, newQNo, market.b);
      lmsrShares = shares; 
      obShares = 0;

      const avgPrice = shares > 0 ? totalCost / shares : 0;
      const netInvestment = totalCost - feeAmount;

      const currentTotalPool2 = Number(market.yesPool) + Number(market.noPool);
      const poolAfterBuy2 = currentTotalPool2 + netInvestment;
      const currentWinningShares2 = side === "YES" ? market.qYes : market.qNo;
      const totalWinningSharesAfter2 = currentWinningShares2 + shares;
      const estimatedPayoutPerShare2 = totalWinningSharesAfter2 > 0
        ? poolAfterBuy2 / totalWinningSharesAfter2
        : 1;

      const validation = lmsrService.validateBetAmount(
        netInvestment,
        market.qYes,
        market.qNo,
        market.b,
        side,
        market.maxBetAmount ?? null,
        market.maxPriceImpact ?? null,
      );

      return NextResponse.json({
        side,
        shares,
        lmsrShares,
        obShares,
        totalCost,
        avgPrice,
        feeAmount,
        lmsrFeeAmount,
        obFeeAmount,
        platformFeeRate,
        lmsrFeeRate: platformFeeRate,
        obFeeRate: 0.02,
        estimatedPayoutPerShare: estimatedPayoutPerShare2,
        newProbabilities: {
          yes: newPrices.pYes,
          no: newPrices.pNo,
        },
        priceImpact: 0,
        maxAllowedAmount: validation.maxAllowed,
        capReason: validation.reason || null,
        wouldExceedCap: !validation.allowed,
      });
    } else {
      return NextResponse.json(
        { error: "Must provide either amount or shares" },
        { status: 400 },
      );
    }
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
