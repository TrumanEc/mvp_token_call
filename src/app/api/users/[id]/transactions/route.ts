import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

/**
 * GET /api/users/[id]/transactions
 * Returns the user's full transaction history with market metadata.
 * Optional filters: ?type=BET_PLACED&limit=50
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: userId } = await params;
  const { searchParams } = new URL(request.url);
  const typeFilter = searchParams.get("type");
  const limit = Math.min(parseInt(searchParams.get("limit") || "200"), 500);

  if (!userId) {
    return NextResponse.json({ error: "userId required" }, { status: 400 });
  }

  try {
    const txs = await prisma.transaction.findMany({
      where: {
        userId,
        ...(typeFilter ? { type: typeFilter } : {}),
      },
      orderBy: { createdAt: "desc" },
      take: limit,
    });

    // Collect referenced marketIds to fetch metadata in one query
    const marketRefs = Array.from(
      new Set(txs.map((t) => t.reference).filter((r): r is string => !!r && r.length > 0)),
    );

    const markets = marketRefs.length
      ? await prisma.market.findMany({
          where: { id: { in: marketRefs } },
          select: {
            id: true,
            playerName: true,
            question: true,
            status: true,
            winningOutcomeId: true,
          },
        })
      : [];
    const marketMap = new Map(markets.map((m) => [m.id, m]));

    const enriched = txs.map((t) => {
      const market = t.reference ? marketMap.get(t.reference) : null;
      return {
        id: t.id,
        type: t.type,
        amount: Number(t.amount),
        balanceBefore: Number(t.balanceBefore),
        balanceAfter: Number(t.balanceAfter),
        reference: t.reference,
        description: t.description,
        createdAt: t.createdAt,
        market: market
          ? {
              id: market.id,
              playerName: market.playerName,
              question: market.question,
              status: market.status,
              winningOutcomeId: market.winningOutcomeId,
            }
          : null,
      };
    });

    // Compute aggregate stats (lifetime totals)
    const all = await prisma.transaction.findMany({
      where: { userId },
      select: { type: true, amount: true },
    });
    const stats = all.reduce(
      (acc, t) => {
        const amt = Number(t.amount);
        if (t.type === "BET_PLACED") acc.totalBet += Math.abs(amt);
        if (t.type === "POSITION_SOLD") acc.totalSold += amt;
        if (t.type === "POSITION_PURCHASED") acc.totalBought += Math.abs(amt);
        if (t.type === "PAYOUT_RECEIVED") acc.totalPayouts += amt;
        if (t.type === "BET_REFUNDED") acc.totalRefunded += amt;
        acc.count++;
        return acc;
      },
      { totalBet: 0, totalSold: 0, totalBought: 0, totalPayouts: 0, totalRefunded: 0, count: 0 },
    );

    return NextResponse.json({ transactions: enriched, stats });
  } catch (error) {
    console.error("Error fetching transactions:", error);
    return NextResponse.json(
      {
        error: "Internal Server Error",
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 },
    );
  }
}
