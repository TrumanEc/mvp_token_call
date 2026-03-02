import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { LmsrService } from '@/services/lmsr.service'

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  
  try {
    const market = await prisma.market.findUnique({
      where: { id },
      select: {
        id: true,
        qYes: true,
        qNo: true,
        b: true,
        yesPool: true,
        noPool: true,
        seedCost: true,
      }
    })

    if (!market) {
      return NextResponse.json({ error: 'Market not found' }, { status: 404 })
    }

    const lmsrService = new LmsrService()
    const prices = lmsrService.getPrice(market.qYes, market.qNo, market.b)
    
    // Calculate current market value / liquidity depth
    // In LMSR, liqudity is constant 'b', but effective depth varies with price
    
    return NextResponse.json({
      marketId: market.id,
      b: market.b,
      qYes: market.qYes,
      qNo: market.qNo,
      prices: {
        yes: prices.pYes,
        no: prices.pNo
      },
      liquidityParameter: market.b,
      maxLoss: market.seedCost,
      // Legacy pools for reference
      legacyPools: {
        yes: market.yesPool,
        no: market.noPool
      }
    })
  } catch (error) {
    console.error('Error fetching market state:', error)
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 })
  }
}
