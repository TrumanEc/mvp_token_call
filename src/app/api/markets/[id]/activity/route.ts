import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { Prisma } from '@prisma/client'

// "Market Buy: 82.10 ESPAÑA for $50.00"
const BUY_RE = /Market Buy:\s*([\d.]+)\s+(.+?)\s+for\s+\$([\d.]+)/i
// "Sell-back LMSR: 82.10 ESPAÑA shares por $48.51 (fee $0.74)"
const SELL_RE = /Sell-back LMSR:\s*([\d.]+)\s+(.+?)\s+shares\s+por\s+\$([\d.]+)\s+\(fee\s+\$([\d.]+)\)/i

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const all = req.nextUrl.searchParams.get('all') === '1'
  const userId = req.nextUrl.searchParams.get('userId') ?? undefined

  const where: Prisma.TransactionWhereInput = {
    reference: id,
    type: { in: ['BET_PLACED', 'POSITION_SOLD', 'PAYOUT_RECEIVED'] },
    ...(userId ? { userId } : {}),
  }

  const [txns, total] = await Promise.all([
    prisma.transaction.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: all ? 200 : 20,
      include: {
        user: { select: { id: true, username: true } },
      },
    }),
    prisma.transaction.count({ where }),
  ])

  const events = txns.map((tx) => {
    const desc = tx.description

    if (tx.type === 'BET_PLACED') {
      const m = BUY_RE.exec(desc)
      return {
        id: tx.id,
        type: 'BUY' as const,
        side: m?.[2] ?? '?',
        shares: m ? parseFloat(m[1]) : 0,
        cost: m ? parseFloat(m[3]) : Math.abs(Number(tx.amount)),
        user: tx.user,
        createdAt: tx.createdAt.toISOString(),
      }
    }

    if (tx.type === 'POSITION_SOLD') {
      const m = SELL_RE.exec(desc)
      return {
        id: tx.id,
        type: 'SELL' as const,
        side: m?.[2] ?? '?',
        shares: m ? parseFloat(m[1]) : 0,
        proceeds: m ? parseFloat(m[3]) : Number(tx.amount),
        fee: m ? parseFloat(m[4]) : 0,
        user: tx.user,
        createdAt: tx.createdAt.toISOString(),
      }
    }

    // PAYOUT_RECEIVED
    return {
      id: tx.id,
      type: 'PAYOUT' as const,
      side: '?',
      shares: 0,
      payout: Number(tx.amount),
      user: tx.user,
      createdAt: tx.createdAt.toISOString(),
    }
  })

  return NextResponse.json({ events, total })
}
