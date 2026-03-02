import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  // TODO: Add Admin Authentication Check here
  const { id } = await params
  
  try {
    const body = await request.json()
    const { b } = body

    if (!b || typeof b !== 'number' || b <= 0) {
      return NextResponse.json({ error: 'Invalid liquidity parameter b' }, { status: 400 })
    }

    const market = await prisma.market.findUnique({ where: { id } })
    if (!market) {
      return NextResponse.json({ error: 'Market not found' }, { status: 404 })
    }

    // Updating 'b' changes the cost function and prices immediately.
    // We should log this change.
    
    const updatedMarket = await prisma.market.update({
      where: { id },
      data: { b }
    })

    return NextResponse.json({
      message: 'Market liquidity parameter updated',
      market: {
        id: updatedMarket.id,
        b: updatedMarket.b
      }
    })

  } catch (error) {
    console.error('Error updating market LMSR params:', error)
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 })
  }
}
