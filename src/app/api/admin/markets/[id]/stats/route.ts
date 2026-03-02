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
      include: {
        positions: {
          include: {
            currentOwner: { select: { id: true, username: true } },
          },
          orderBy: { createdAt: 'desc' }
        },
        lmsrSnapshots: {
          orderBy: { createdAt: 'asc' } // Oldest first for chart
        }
      }
    })

    if (!market) {
      return NextResponse.json({ error: 'Market not found' }, { status: 404 })
    }

    const lmsrService = new LmsrService()
    const prices = lmsrService.getPrice(market.qYes, market.qNo, market.b)

    // Stats Logic
    const purchases = market.positions.map(p => ({
      id: p.id,
      username: p.currentOwner.username,
      side: p.side,
      amount: p.amount,
      initialProbability: p.initialProbability,
      createdAt: p.createdAt
    }))

    const priceHistory = market.lmsrSnapshots.map(s => ({
      timestamp: s.createdAt,
      price: s.pYesAfter, // PriceChart expects 0-1 price
      yesOdds: s.pYesAfter * 100,
      noOdds: (1 - s.pYesAfter) * 100,
      totalPool: s.cost
    }))

    // Simulation
    // Payout per dollar invested NOW at current odds:
    // If I buy YES at 0.60, payout is $1. So multiplier is 1 / 0.60 = 1.66x
    const payoutYes = prices.pYes > 0 ? (1 / prices.pYes) : 0
    const payoutNo  = prices.pNo  > 0 ? (1 / prices.pNo)  : 0

    const stats = {
      // Basic Info
      id: market.id,
      question: market.question,
      status: market.status,
      
      // Pools (Legacy + LMSR)
      yesPool: market.yesPool,
      noPool: market.noPool,
      totalPool: market.yesPool.toNumber() + market.noPool.toNumber(), // Legacy total
      
      // LMSR Specifics
      b: market.b,
      qYes: market.qYes,
      qNo: market.qNo,
      seedCost: market.seedCost,
      currentPrices: prices,

      // Lists
      purchases,
      priceHistory,

      // Simulation
      simulation: {
        platformCommission: 0, // Fee is taken on entry, not settlement in this LMSR implementation
        ifYesWins: {
          payoutPerDollar: payoutYes
        },
        ifNoWins: {
          payoutPerDollar: payoutNo
        }
      }
    }

    return NextResponse.json(stats)

  } catch (error) {
    console.error('Error fetching admin market stats:', error)
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 })
  }
}
