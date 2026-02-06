import { prisma } from '@/lib/prisma'
import { Decimal } from '@prisma/client/runtime/library'
import { OddsCalculator } from './odds-calculator'
import { BalanceService } from './balance'

export type Side = 'YES' | 'NO'

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

      const totalPool = market.yesPool.plus(market.noPool)
      if (totalPool.plus(amount).greaterThan(market.maxPool)) {
        throw new Error('Market cap reached. Please buy from the secondary market.')
      }

      await BalanceService.deduct(tx, user.id, amount, 'BET_PLACED', `Bet ${data.amount} on ${data.side}`, data.marketId)

      const currentOdds = OddsCalculator.calculateOdds(market.yesPool, market.noPool)
      const initialProbability = data.side === 'YES' ? currentOdds.yesOdds : currentOdds.noOdds
      
      const purchasePrice = new Decimal(initialProbability).dividedBy(100)
      const shares = amount.dividedBy(purchasePrice)

      const position = await tx.position.create({
        data: {
          marketId: data.marketId,
          originalOwnerId: data.userId,
          currentOwnerId: data.userId,
          side: data.side,
          amount,
          status: 'ACTIVE',
          initialProbability: new Decimal(initialProbability),
          shares,
          purchasePrice,
        },
        include: { market: true, currentOwner: true },
      })

      const poolUpdate = data.side === 'YES' 
        ? { yesPool: { increment: amount } } 
        : { noPool: { increment: amount } }

      const updatedMarket = await tx.market.update({ where: { id: data.marketId }, data: poolUpdate })

      // Create price history snapshot
      const marketHistory = (tx as any).marketHistory;
      if (marketHistory) {
        await marketHistory.create({
          data: {
            marketId: data.marketId,
            yesOdds: new Decimal(updatedMarket.yesPool.toNumber() / (updatedMarket.yesPool.toNumber() + updatedMarket.noPool.toNumber()) * 100),
            noOdds: new Decimal(updatedMarket.noPool.toNumber() / (updatedMarket.yesPool.toNumber() + updatedMarket.noPool.toNumber()) * 100),
            totalPool: updatedMarket.yesPool.plus(updatedMarket.noPool),
          }
        })
      }

      return {
        ...position,
        amount: position.amount.toNumber(),
        initialProbability: position.initialProbability.toNumber(),
      }
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

    return positions.map((p: any) => {
      const odds = OddsCalculator.calculateOdds(p.market.yesPool, p.market.noPool)
      const currentPrice = new Decimal(p.side === 'YES' ? odds.yesOdds : odds.noOdds).dividedBy(100)
      
      // Fallback for legacy positions: derive shares from initialProbability
      const initialProb = p.initialProbability?.toNumber() || 50
      const legacyPrice = new Decimal(initialProb).dividedBy(100)
      
      const purchasePrice = p.purchasePrice && !p.purchasePrice.isZero() 
        ? new Decimal(p.purchasePrice) 
        : legacyPrice
      
      const shares = p.shares && !p.shares.isZero() 
        ? new Decimal(p.shares) 
        : p.amount.dividedBy(legacyPrice)

      // Total current value if sold (shares * currentPrice)
      const fairValue = shares.times(currentPrice)
      
      // Total potential return if wins (shares * $1)
      const potentialReturn = shares.toNumber()

      return {
        ...p,
        amount: p.amount.toNumber(),
        payout: p.payout?.toNumber(),
        initialProbability: initialProb,
        shares: shares.toNumber(),
        purchasePrice: purchasePrice.toNumber(),
        currentPrice: currentPrice.toNumber(),
        fairValue: fairValue.toNumber(),
        currentPayout: p.side === 'YES' ? odds.yesPayout : odds.noPayout,
        potentialReturn,
        market: {
          ...p.market,
          yesPool: p.market.yesPool.toNumber(),
          noPool: p.market.noPool.toNumber(),
          maxPool: p.market.maxPool?.toNumber(),
          platformFee: p.market.platformFee?.toNumber(),
        },
        listing: p.listing ? {
          ...p.listing,
          askPrice: p.listing.askPrice.toNumber(),
          suggestedPrice: p.listing.suggestedPrice.toNumber(),
          platformFee: p.listing.platformFee.toNumber(),
        } : null,
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
    const currentPrice = new Decimal(position.side === 'YES' ? odds.yesOdds : odds.noOdds).dividedBy(100)
    
    // Fallback for legacy
    const initialProb = position.initialProbability?.toNumber() || 50
    const legacyPrice = new Decimal(initialProb).dividedBy(100)
    
    const shares = (position as any).shares && !(position as any).shares.isZero()
      ? new Decimal((position as any).shares)
      : position.amount.dividedBy(legacyPrice)
    
    const purchasePrice = (position as any).purchasePrice && !(position as any).purchasePrice.isZero()
      ? new Decimal((position as any).purchasePrice)
      : legacyPrice

    const fairValue = shares.times(currentPrice)

    return {
      ...position,
      amount: position.amount.toNumber(),
      payout: position.payout?.toNumber(),
      initialProbability: position.initialProbability.toNumber(),
      shares: shares.toNumber(),
      purchasePrice: position.purchasePrice.toNumber(),
      currentPrice: currentPrice.toNumber(),
      fairValue: fairValue.toNumber(),
      currentPayout: position.side === 'YES' ? odds.yesPayout : odds.noPayout,
      potentialReturn: shares.toNumber(),
      market: {
        ...position.market,
        yesPool: position.market.yesPool.toNumber(),
        noPool: position.market.noPool.toNumber(),
        maxPool: position.market.maxPool?.toNumber(),
        platformFee: position.market.platformFee?.toNumber(),
      }
    }
  }

  /**
   * Split a position into two parts for fractional selling.
   * @param tx - Prisma transaction client
   * @param positionId - The position to split
   * @param userId - The current owner (for validation)
   * @param splitAmount - The amount to split off (for listing)
   * @returns The new position created from the split
   */
  static async split(
    tx: Parameters<Parameters<typeof prisma.$transaction>[0]>[0],
    positionId: string,
    userId: string,
    splitAmount: number
  ) {
    const position = await tx.position.findUnique({
      where: { id: positionId },
      include: { market: true },
    })

    if (!position) throw new Error('Position not found')
    if (position.currentOwnerId !== userId) throw new Error('Not position owner')
    if (position.isForSale) throw new Error('Position already listed')
    if (position.market.status !== 'ACTIVE') throw new Error('Market not active')

    const splitDecimal = new Decimal(splitAmount)
    if (splitDecimal.lessThanOrEqualTo(0)) {
      throw new Error('Split amount must be positive')
    }
    if (splitDecimal.greaterThanOrEqualTo(position.amount)) {
      throw new Error('Split amount must be less than position amount')
    }

    // Reduce the original position amount
    await tx.position.update({
      where: { id: positionId },
      data: { amount: position.amount.minus(splitDecimal) },
    })

    // Create a new position with the split amount
    const newPosition = await tx.position.create({
      data: {
        marketId: position.marketId,
        originalOwnerId: position.originalOwnerId,
        currentOwnerId: position.currentOwnerId,
        side: position.side,
        amount: splitDecimal,
        status: 'ACTIVE',
        shares: (position as any).shares.times(splitDecimal.dividedBy(position.amount)),
        purchasePrice: (position as any).purchasePrice,
        isForSale: true, // Mark for sale immediately
      },
      include: { market: true },
    })

    return newPosition
  }
}
