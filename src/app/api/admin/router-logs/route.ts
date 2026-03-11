import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const marketId = searchParams.get("marketId");

    const whereClause = marketId ? { marketId } : {};

    const auditLogs = await prisma.marketRouterAuditLog.findMany({
      where: whereClause,
      include: {
        market: { select: { question: true, playerName: true } },
        user: { select: { username: true, email: true } }
      },
      orderBy: { timestamp: 'desc' },
      take: 100
    });

    return NextResponse.json(auditLogs);
  } catch (error) {
    console.error("Error fetching router logs:", error);
    return NextResponse.json(
      { error: "Internal Server Error" },
      { status: 500 }
    );
  }
}
