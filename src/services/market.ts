import { prisma } from '@/lib/prisma'
import { Decimal } from '@prisma/client/runtime/library'
import { OddsCalculator } from './odds-calculator'
import { LmsrService } from './lmsr.service'

export type MarketStatus = 'DRAFT' | 'ACTIVE' | 'CLOSED' | 'RESOLVED' | 'VOIDED'

export class MarketService {
  static async getAll(status?: MarketStatus) {
    const markets = await prisma.market.findMany({
      where: status ? { status } : undefined,
      orderBy: { createdAt: 'desc' },
    })

    const lmsrService = new LmsrService()

    return markets.map((market) => {
      const prices = lmsrService.getPrice(market.qYes, market.qNo, market.b)
      return {
        ...market,
        yesPool: market.yesPool.toNumber(),
        noPool: market.noPool.toNumber(),
        odds: {
          yesOdds: prices.pYes * 100,
          noOdds: prices.pNo * 100,
        }
      }
    })
  }

  static async getById(id: string) {
    const market = await prisma.market.findUnique({
      where: { id },
      include: {
        positions: {
          include: {
            currentOwner: { select: { id: true, username: true } },
          },
        },
        listings: true,
        lmsrSnapshots: {
          orderBy: { createdAt: 'desc' },
          take: 100
        },
      },
    })

    if (!market) return null

    const lmsrService = new LmsrService()
    const prices = lmsrService.getPrice(market.qYes, market.qNo, market.b)
    
    // Calculate legacy-style odds for compatibility if needed, or just use LMSR prices * 100
    const odds = {
      yesOdds: prices.pYes * 100,
      noOdds: prices.pNo * 100,
    }

    return {
      ...market,
      yesPool: market.yesPool.toNumber(),
      noPool: market.noPool.toNumber(),
      maxPool: market.maxPool.toNumber(),
      odds, // Overwrite legacy odds with LMSR odds
      positions: (market as any).positions.map((p: any) => ({
        ...p,
        amount: p.amount.toNumber(),
        payout: p.payout?.toNumber(),
        initialProbability: p.initialProbability.toNumber(),
        shares: Number(p.shares || 0),
        purchasePrice: Number(p.purchasePrice || 0),
        // Calculate current fair value for position
        fairValue: Number(p.shares || 0) * (p.side === 'YES' ? prices.pYes : prices.pNo),
        currentPrice: p.side === 'YES' ? prices.pYes : prices.pNo
      })),
      history: (market as any).lmsrSnapshots.map((s: any) => ({
        timestamp: s.createdAt,
        price: s.pYesAfter,
        volume: s.cost,
        qYes: s.qYesAfter,
        qNo: s.qNoAfter
      })).reverse() // Oldest first for chart
    }
  }

  static async create(data: {
    playerName?: string
    question: string
    description?: string
    resolutionDate: Date
    maxPool?: number
    b?: number
    maxBetAmount?: number
    maxPriceImpact?: number
  }) {
    // Default liquidity parameter b = 100 if not provided
    const b = data.b || 100
    const lmsrService = new LmsrService()
    const seedCost = lmsrService.getMaxLoss(b)

    return prisma.market.create({
      data: {
        ...data,
        maxPool: data.maxPool ? new Decimal(data.maxPool) : undefined,
        maxBetAmount: data.maxBetAmount ? Number(data.maxBetAmount) : undefined,
        maxPriceImpact: data.maxPriceImpact ? Number(data.maxPriceImpact) : undefined,
        status: 'DRAFT',
        // LMSR Initialization
        b,
        qYes: 0,
        qNo: 0,
        seedCost,
        // Legacy/Audit history
        history: {
          create: {
            yesOdds: new Decimal(50),
            noOdds: new Decimal(50),
            totalPool: new Decimal(0)
          }
        },
        lmsrSnapshots: {
          create: {
            qYesBefore: 0,
            qNoBefore: 0,
            pYesBefore: 0.5,
            side: 'INIT',
            deltaShares: 0,
            cost: seedCost,
            qYesAfter: 0,
            qNoAfter: 0,
            pYesAfter: 0.5,
            triggerType: 'INIT',
            userId: 'SYSTEM',
          }
        }
      },
    })
  }

  static async activate(id: string) {
    return prisma.market.update({
      where: { id },
      data: { status: 'ACTIVE' },
    })
  }

  static async close(id: string) {
    return prisma.market.update({
      where: { id },
      data: { status: 'CLOSED' },
    })
  }
}
