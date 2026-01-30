import { prisma } from '@/lib/prisma'
import { OddsCalculator } from './odds-calculator'
import { MarketStatus } from '@prisma/client'

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
      },
    })

    if (!market) return null

    const odds = OddsCalculator.calculateOdds(market.yesPool, market.noPool)

    return {
      ...market,
      yesPool: market.yesPool.toNumber(),
      noPool: market.noPool.toNumber(),
      odds,
      positions: market.positions.map((p) => ({
        ...p,
        amount: p.amount.toNumber(),
        payout: p.payout?.toNumber(),
      })),
    }
  }

  static async create(data: {
    playerName: string
    question: string
    description?: string
    resolutionDate: Date
  }) {
    return prisma.market.create({
      data: {
        ...data,
        status: 'DRAFT',
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
