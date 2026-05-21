import { NextRequest, NextResponse } from "next/server";
import { MarketService, MarketStatus } from "@/services/market";

export async function GET(request: NextRequest) {
  const status = request.nextUrl.searchParams.get("status") as MarketStatus | null;
  const admin = request.nextUrl.searchParams.get("admin") === "1";
  const markets = await MarketService.getAll(status || undefined, !admin);
  return NextResponse.json(markets);
}

export async function POST(request: NextRequest) {
  const body = await request.json();
  const {
    playerName, question, description, resolutionDate,
    maxPool, maxBetAmount, maxPriceImpact, b, alpha, bMin, sport,
    outcomes,
    imageUrl, bannerUrl, isFeatured, rules, criterio, tags,
    // Legacy binary compat
    initialProbabilityYes,
  } = body;

  if (!question || !resolutionDate) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
  }

  if (alpha !== undefined && alpha !== null && (typeof alpha !== "number" || alpha <= 0 || alpha > 1)) {
    return NextResponse.json({ error: "alpha must be a positive number ≤ 1" }, { status: 400 });
  }
  if (bMin !== undefined && bMin !== null && (typeof bMin !== "number" || bMin <= 0)) {
    return NextResponse.json({ error: "bMin must be a positive number" }, { status: 400 });
  }

  // Build outcomes array
  let outcomesData: { name: string; initialProbability?: number }[];
  if (outcomes && Array.isArray(outcomes) && outcomes.length >= 2) {
    outcomesData = outcomes;
  } else {
    // Binary fallback
    const pYes = initialProbabilityYes ?? 0.5;
    outcomesData = [
      { name: "YES", initialProbability: pYes },
      { name: "NO", initialProbability: 1 - pYes },
    ];
  }

  try {
    const market = await MarketService.create({
      playerName, question, description,
      resolutionDate: new Date(resolutionDate),
      maxPool, maxBetAmount, maxPriceImpact, b, alpha, bMin, sport,
      outcomes: outcomesData,
      imageUrl, bannerUrl, isFeatured, rules, criterio,
      tags: Array.isArray(tags) ? tags : [],
    });
    return NextResponse.json(market, { status: 201 });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 400 });
  }
}
