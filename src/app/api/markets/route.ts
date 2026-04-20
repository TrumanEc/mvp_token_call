import { NextRequest, NextResponse } from "next/server";
import { MarketService, MarketStatus } from "@/services/market";

export async function GET(request: NextRequest) {
  const status = request.nextUrl.searchParams.get(
    "status",
  ) as MarketStatus | null;
  const markets = await MarketService.getAll(status || undefined);
  return NextResponse.json(markets);
}

export async function POST(request: NextRequest) {
  const body = await request.json();
  const {
    playerName,
    question,
    description,
    resolutionDate,
    maxPool,
    maxBetAmount,
    maxPriceImpact,
    b,
    initialProbabilityYes,
  } = body;

  if (!question || !resolutionDate) {
    return NextResponse.json(
      { error: "Missing required fields" },
      { status: 400 },
    );
  }

  // Validate initialProbabilityYes if provided
  if (
    initialProbabilityYes !== undefined &&
    (typeof initialProbabilityYes !== "number" ||
      initialProbabilityYes <= 0 ||
      initialProbabilityYes >= 1)
  ) {
    return NextResponse.json(
      { error: "initialProbabilityYes must be a number between 0 and 1 (exclusive)" },
      { status: 400 },
    );
  }

  const market = await MarketService.create({
    playerName,
    question,
    description,
    resolutionDate: new Date(resolutionDate),
    maxPool,
    maxBetAmount,
    maxPriceImpact,
    b,
    initialProbabilityYes,
  });

  return NextResponse.json(market, { status: 201 });
}
