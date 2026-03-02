import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function GET(request: NextRequest) {
  try {
    const marketId = request.nextUrl.searchParams.get('marketId')

    const transactions = await prisma.transaction.findMany({
      where: {
        type: {
          in: ['PAYOUT_RECEIVED', 'BET_REFUNDED', 'POSITION_SOLD', 'POSITION_PURCHASED']
        },
        ...(marketId && { reference: marketId })
      },
      include: {
        user: {
          select: {
            id: true,
            username: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    })

    return NextResponse.json(transactions)
  } catch (error) {
    console.error('Error fetching admin transactions:', error)
    return NextResponse.json({ error: 'Failed to fetch transactions' }, { status: 500 })
  }
}
