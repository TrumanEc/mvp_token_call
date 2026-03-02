import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  try {
    const marketId = request.nextUrl.searchParams.get('marketId')
    
    const positions = await prisma.position.findMany({
      where: {
        ...(marketId && { marketId })
      },
      include: {
        market: true,
        currentOwner: {
          select: {
            id: true,
            username: true,
            email: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    })

    return NextResponse.json(positions)
  } catch (error) {
    console.error('Error fetching admin purchases:', error)
    return NextResponse.json({ error: 'Failed to fetch purchases' }, { status: 500 })
  }
}
