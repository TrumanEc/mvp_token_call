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
        pYesAfter: true,
        qYesAfter: true,
        qNoAfter: true,
        cost: true,
        triggerType: true,
      }
    })

    // Transform for chart plotting if needed, or return raw
    const history = snapshots.map(s => ({
      timestamp: s.createdAt,
      price: s.pYesAfter, // Plot probability of YES
      qYes: s.qYesAfter,
      qNo: s.qNoAfter,
      volume: s.cost, // Transaction volume
    }))

    return NextResponse.json(history)

  } catch (error) {
    console.error('Error fetching market snapshots:', error)
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 })
  }
}
