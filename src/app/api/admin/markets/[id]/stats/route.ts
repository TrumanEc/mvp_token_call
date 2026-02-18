/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { Decimal } from "@prisma/client/runtime/library";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id: marketId } = await params;

    const market = await prisma.market.findUnique({
      where: { id: marketId },
      include: {
        positions: {
          include: {
            currentOwner: { select: { id: true, username: true } },
          },
        },
        history: {
          orderBy: { createdAt: "desc" },
          take: 50,
        },
      },
    });

    if (!market)
      return NextResponse.json({ error: "Market not found" }, { status: 404 });

    const yes = new Decimal(market.yesPool);
    const no = new Decimal(market.noPool);
    const total = yes.plus(no);
    const fee = new Decimal(0.1);
    const netPool = total.times(new Decimal(1).minus(fee));

    return NextResponse.json({
      id: market.id,
      playerName: market.playerName,
      status: market.status,
      yesPool: yes.toNumber(),
      noPool: no.toNumber(),
      totalPool: total.toNumber(),
      simulation: {
        ifYesWins: {
          payoutPerDollar: yes.isZero() ? 0 : netPool.dividedBy(yes).toNumber(),
        },
        ifNoWins: {
          payoutPerDollar: no.isZero() ? 0 : netPool.dividedBy(no).toNumber(),
        },
        platformCommission: total.times(fee).toNumber(),
      },
      priceHistory:
        (market as any).history?.map((h: any) => ({
          id: h.id,
          yesOdds: h.yesOdds.toNumber(),
          noOdds: h.noOdds.toNumber(),
          totalPool: h.totalPool.toNumber(),
          createdAt: h.createdAt,
        })) || [],
      purchases:
        (market as any).positions?.map((p: any) => ({
          id: p.id,
          username: p.currentOwner.username,
          side: p.side,
          amount: p.amount.toNumber(),
          initialProbability: p.initialProbability.toNumber(),
          createdAt: p.createdAt,
        })) || [],
    });
  } catch (error: any) {
    console.error("Market stats error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
