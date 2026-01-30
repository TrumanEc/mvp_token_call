import { prisma } from '@/lib/prisma'
import { Decimal } from '@prisma/client/runtime/library'
import { OddsCalculator } from './odds-calculator'
import { BalanceService } from './balance'
import { Side } from '@prisma/client'

export class PositionService {
  static async create(data: { marketId: string; userId: string; side: Side; amount: number }) {
    return prisma.$transaction(async (tx) => {
      const market = await tx.market.findUnique({ where: { id: data.marketId } })
      if (!market || market.status !== 'ACTIVE') {
        throw new Error('Market is not active')
      }

      const user = await tx.user.findUnique({ where: { id: data.userId } })
      if (!user) throw new Error('User not found')

      const amount = new Decimal(data.amount)
      if (new Decimal(user.balance).lessThan(amount)) {
        throw new Error('Insufficient balance')
      }

      await BalanceService.deduct(tx, user.id, amount, 'BET_PLACED', `Bet ${data.amount} on ${data.side}`)

      const currentOdds = OddsCalculator.calculateOdds(market.yesPool, market.noPool)
      const initialProbability = data.side === 'YES' ? currentOdds.yesOdds : currentOdds.noOdds

      const position = await tx.position.create({
        data: {
          marketId: data.marketId,
          originalOwnerId: data.userId,
          currentOwnerId: data.userId,
          side: data.side,
          amount,
          status: 'ACTIVE',
          initialProbability: new Decimal(initialProbability),
        },
        include: { market: true, currentOwner: true },
      })

      const poolUpdate = data.side === 'YES' 
        ? { yesPool: { increment: amount } } 
        : { noPool: { increment: amount } }

      await tx.market.update({ where: { id: data.marketId }, data: poolUpdate })

      return position
    })
  }

  static async getUserPositions(userId: string, marketId?: string) {
    const positions = await prisma.position.findMany({
      where: {
        currentOwnerId: userId,
        ...(marketId && { marketId }),
      },
      include: {
        market: true,
        listing: true,
      },
      orderBy: { createdAt: 'desc' },
    })

    return positions.map((p) => {
      const odds = OddsCalculator.calculateOdds(p.market.yesPool, p.market.noPool)
      const payout = p.side === 'YES' ? odds.yesPayout : odds.noPayout
      const fairValue = OddsCalculator.calculateFairValue(
        { amount: p.amount, side: p.side },
        { yesPool: p.market.yesPool, noPool: p.market.noPool }
      )

      return {
        ...p,
        amount: p.amount.toNumber(),
        payout: p.payout?.toNumber(),
        fairValue: fairValue.toNumber(),
        currentPayout: payout,
        potentialReturn: new Decimal(p.amount).times(payout).toNumber(),
        market: {
          ...p.market,
          yesPool: p.market.yesPool.toNumber(),
          noPool: p.market.noPool.toNumber(),
        },
      }
    })
  }

  static async getById(id: string) {
    const position = await prisma.position.findUnique({
      where: { id },
      include: { market: true, currentOwner: true, listing: true },
    })

    if (!position) return null

    const odds = OddsCalculator.calculateOdds(position.market.yesPool, position.market.noPool)
    const payout = position.side === 'YES' ? odds.yesPayout : odds.noPayout
    const fairValue = OddsCalculator.calculateFairValue(
      { amount: position.amount, side: position.side },
      { yesPool: position.market.yesPool, noPool: position.market.noPool }
    )

    return {
      ...position,
      amount: position.amount.toNumber(),
      payout: position.payout?.toNumber(),
      fairValue: fairValue.toNumber(),
      currentPayout: payout,
      potentialReturn: new Decimal(position.amount).times(payout).toNumber(),
    }
  }
}
