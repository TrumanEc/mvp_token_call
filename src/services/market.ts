import { prisma } from '@/lib/prisma'
import { Decimal } from '@prisma/client/runtime/library'
import { OddsCalculator } from './odds-calculator'

export type MarketStatus = 'DRAFT' | 'ACTIVE' | 'CLOSED' | 'RESOLVED' | 'VOIDED'

export class MarketService {
  static async getAll(status?: MarketStatus) {
    const markets = await prisma.market.findMany({
      where: status ? { status } : undefined,
      orderBy: { createdAt: 'desc' },
    })

    return markets.map((market) => ({
      ...market,
      yesPool: market.yesPool.toNumber(),
      noPool: market.noPool.toNumber(),
      odds: OddsCalculator.calculateOdds(market.yesPool, market.noPool),
    }))
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
        history: {
          orderBy: { createdAt: 'desc' },
          take: 50
        },
      },
    })

    if (!market) return null

    const odds = OddsCalculator.calculateOdds(market.yesPool, market.noPool)

    return {
      ...market,
      yesPool: market.yesPool.toNumber(),
      noPool: market.noPool.toNumber(),
      maxPool: market.maxPool.toNumber(),
      odds,
      positions: (market as any).positions.map((p: any) => ({
        ...p,
        amount: p.amount.toNumber(),
        payout: p.payout?.toNumber(),
        initialProbability: p.initialProbability.toNumber(),
      })),
      history: (market as any).history.map((h: any) => ({
        id: h.id,
        yesOdds: h.yesOdds.toNumber(),
        noOdds: h.noOdds.toNumber(),
        totalPool: h.totalPool.toNumber(),
        createdAt: h.createdAt
      }))
    }
  }

  static async create(data: {
    playerName?: string
    question: string
    description?: string
    resolutionDate: Date
    maxPool?: number
  }) {
    return prisma.market.create({
      data: {
        ...data,
        maxPool: data.maxPool ? new Decimal(data.maxPool) : undefined,
        status: 'DRAFT',
        history: {
          create: {
            yesOdds: new Decimal(50),
            noOdds: new Decimal(50),
            totalPool: new Decimal(0)
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
