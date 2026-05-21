import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params

  try {
    // Fetch snapshots ordered by time
    const snapshots = await prisma.lmsrSnapshot.findMany({
      where: { marketId: id },
      orderBy: { createdAt: 'asc' },
      select: {
        createdAt: true,
        outcomeId: true,
        side: true,
        pAfter: true,
        qAfter: true,
        cost: true,
        triggerType: true,
      }
    })

    // Transform for chart plotting
    // pAfter and qAfter are JSON maps: { outcomeId: value }
    const history = snapshots.map(s => ({
      timestamp: s.createdAt,
      prices: s.pAfter as Record<string, number>,   // all outcome prices after this event
      qValues: s.qAfter as Record<string, number>,  // all q values after this event
      outcomeId: s.outcomeId,                        // which outcome was traded
      side: s.side,
      volume: s.cost,
    }))

    return NextResponse.json(history)

  } catch (error) {
    console.error('Error fetching market snapshots:', error)
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 })
  }
}
