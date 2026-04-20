import { NextRequest, NextResponse } from "next/server";
import { MarketService } from "@/services/market";

// GET /api/admin/inactive-markets?minDays=7
// Returns markets with no trading activity older than minDays
export async function GET(request: NextRequest) {
  const minDays = parseInt(
    request.nextUrl.searchParams.get("minDays") ?? "7",
    10,
  );

  const markets = await MarketService.getInactiveMarkets(minDays);
  return NextResponse.json(markets);
}

// POST /api/admin/inactive-markets
// { marketId, minDaysOpen? } — recover seed from a single inactive market
export async function POST(request: NextRequest) {
  const body = await request.json();
  const { marketId, minDaysOpen } = body;

  if (!marketId) {
    return NextResponse.json({ error: "marketId is required" }, { status: 400 });
  }

  try {
    const result = await MarketService.recoverInactiveSeed(marketId, {
      minDaysOpen: minDaysOpen ?? 0,
    });
    return NextResponse.json(result);
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 400 });
  }
}
