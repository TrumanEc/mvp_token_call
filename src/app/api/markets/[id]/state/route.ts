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
        b: true,
        alpha: true,
        bMin: true,
        totalPool: true,
        seedCost: true,
        outcomes: {
          orderBy: { displayOrder: 'asc' },
          select: {
            id: true,
            name: true,
            qOutstanding: true,
            pool: true,
            displayOrder: true,
          },
        },
      }
    })

    if (!market) {
      return NextResponse.json({ error: 'Market not found' }, { status: 404 })
    }

    const qVector = LmsrService.buildQVector(market.outcomes)
    const lmsrService = new LmsrService()
    const lmsrParams = { b: market.b, alpha: market.alpha, bMin: market.bMin }
    const pricesArray = lmsrService.getPricesLSN(qVector, lmsrParams)

    // Build prices map: outcomeId -> price
    const prices: Record<string, { name: string; price: number; qOutstanding: number; pool: number }> = {}
    market.outcomes.forEach((outcome, idx) => {
      prices[outcome.id] = {
        name: outcome.name,
        price: pricesArray[idx],
        qOutstanding: outcome.qOutstanding,
        pool: Number(outcome.pool),
      }
    })

    return NextResponse.json({
      marketId: market.id,
      b: market.b,
      alpha: market.alpha,
      bMin: market.bMin,
      outcomes: prices,
      liquidityParameter: market.b,
      maxLoss: market.seedCost,
      totalPool: Number(market.totalPool),
    })
  } catch (error) {
    console.error('Error fetching market state:', error)
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 })
  }
}
