import { prisma } from '@/lib/prisma'
import { Decimal } from '@prisma/client/runtime/library'
import { OddsCalculator } from './odds-calculator'
import { BalanceService } from './balance'
import { PositionService } from './position'

export class ListingService {
  /**
   * Create a listing for a position or a portion of it.
   * @param data.positionId - The position to list
   * @param data.userId - The owner's ID
   * @param data.askPrice - The asking price for the listed amount
   * @param data.amount - Optional: partial amount to list (will split the position)
   */
  static async create(data: { positionId: string; userId: string; askPrice: number; amount?: number }) {
    return prisma.$transaction(async (tx) => {
      const originalPosition = await tx.position.findUnique({
        where: { id: data.positionId },
        include: { market: true },
      })

      if (!originalPosition) throw new Error('Position not found')
      if (originalPosition.currentOwnerId !== data.userId) throw new Error('Not position owner')
      if (originalPosition.isForSale) throw new Error('Position already listed')
      if (originalPosition.market.status !== 'ACTIVE') throw new Error('Market not active')

      let positionToList = originalPosition
      let positionIdToList = data.positionId

      // If partial amount is specified, split the position
      if (data.amount !== undefined && data.amount < originalPosition.amount.toNumber()) {
        const splitPosition = await PositionService.split(tx, data.positionId, data.userId, data.amount)
        positionToList = splitPosition
        positionIdToList = splitPosition.id
      } else {
        // Mark original position for sale
        await tx.position.update({
          where: { id: data.positionId },
          data: { isForSale: true },
        })
      }

      const fairValue = OddsCalculator.calculateFairValue(
        { amount: positionToList.amount, side: positionToList.side as 'YES' | 'NO' },
        { yesPool: positionToList.market.yesPool, noPool: positionToList.market.noPool }
      )

      const askPrice = new Decimal(data.askPrice)
      const listing = await tx.marketplaceListing.upsert({
        where: { positionId: positionIdToList },
        create: {
          positionId: positionIdToList,
          marketId: positionToList.marketId,
          sellerId: data.userId,
          askPrice,
          suggestedPrice: fairValue,
          status: 'ACTIVE',
        },
        update: {
          askPrice,
          suggestedPrice: fairValue,
          status: 'ACTIVE',
          cancelledAt: null,
          listedAt: new Date(), 
        },
        include: {
          position: { include: { market: true } },
          seller: { select: { id: true, username: true } },
        },
      })

      return listing
    })
  }

  static async buy(data: { listingId: string; buyerId: string; amount?: number }) {
    return prisma.$transaction(async (tx) => {
      const listing = await tx.marketplaceListing.findUnique({
        where: { id: data.listingId },
        include: { position: { include: { market: true } }, seller: true },
      })

      if (!listing) throw new Error('Listing not found')
      if (listing.status !== 'ACTIVE') throw new Error('Listing not available')
      if (listing.sellerId === data.buyerId) throw new Error('Cannot buy own listing')

      const askPrice = listing.askPrice
      const buyAmount = data.amount ? new Decimal(data.amount) : askPrice

      if (buyAmount.greaterThan(askPrice)) {
        throw new Error('Cannot buy more than the listed price')
      }
      if (buyAmount.lessThanOrEqualTo(0)) {
        throw new Error('Buy amount must be positive')
      }

      const buyer = await tx.user.findUnique({ where: { id: data.buyerId } })
      if (!buyer) throw new Error('Buyer not found')
      if (new Decimal(buyer.balance).lessThan(buyAmount)) {
        throw new Error('Insufficient balance')
      }

      const isPartial = buyAmount.lessThan(askPrice)
      const platformFee = buyAmount.times(listing.platformFee)
      const sellerReceives = buyAmount.minus(platformFee)

      await BalanceService.deduct(tx, buyer.id, buyAmount, 'POSITION_PURCHASED', `Bought ${isPartial ? 'portion of ' : ''}position #${listing.positionId}`)
      await BalanceService.credit(tx, listing.sellerId, sellerReceives, 'POSITION_SOLD', `Sold ${isPartial ? 'portion of ' : ''}position #${listing.positionId}`)

      if (!isPartial) {
        // Full buy logic
        await tx.position.update({
          where: { id: listing.positionId },
          data: {
            currentOwnerId: data.buyerId,
            isForSale: false,
            lastTransferredAt: new Date(),
          },
        })

        await tx.positionTransfer.create({
          data: {
            positionId: listing.positionId,
            fromUserId: listing.sellerId,
            toUserId: data.buyerId,
            price: buyAmount,
            listingId: listing.id,
          },
        })

        await tx.marketplaceListing.update({
          where: { id: data.listingId },
          data: {
            status: 'SOLD',
            buyerId: data.buyerId,
            soldAt: new Date(),
          },
        })
      } else {
        // Partial buy logic
        const ratio = buyAmount.dividedBy(askPrice)
        const tokensToBuy = listing.position.amount.times(ratio)

        // 1. Reduce original position (tied to listing)
        await tx.position.update({
          where: { id: listing.positionId },
          data: { amount: { decrement: tokensToBuy } },
        })

        // 2. Create new position for buyer
        const buyerPosition = await tx.position.create({
          data: {
            marketId: listing.marketId,
            originalOwnerId: listing.position.originalOwnerId,
            currentOwnerId: data.buyerId,
            side: listing.position.side,
            amount: tokensToBuy,
            status: 'ACTIVE',
            initialProbability: listing.position.initialProbability,
            isForSale: false,
          },
        })

        // 3. Update listing
        await tx.marketplaceListing.update({
          where: { id: data.listingId },
          data: {
            askPrice: { decrement: buyAmount },
            suggestedPrice: { decrement: listing.suggestedPrice.times(ratio) },
          },
        })

        // 4. Record transfer
        await tx.positionTransfer.create({
          data: {
            positionId: buyerPosition.id,
            fromUserId: listing.sellerId,
            toUserId: data.buyerId,
            price: buyAmount,
            listingId: listing.id,
          },
        })
      }

      return listing
    })
  }

  static async getActive(marketId?: string, side?: 'YES' | 'NO') {
    const listings = await prisma.marketplaceListing.findMany({
      where: {
        status: 'ACTIVE',
        ...(marketId && { marketId }),
        ...(side && { position: { side } }),
      },
      include: {
        position: { include: { market: true } },
        seller: { select: { id: true, username: true } },
      },
      orderBy: { listedAt: 'desc' },
    })

    return listings.map((listing) => {
      const odds = OddsCalculator.calculateOdds(
        listing.position.market.yesPool,
        listing.position.market.noPool
      )
      const payout = listing.position.side === 'YES' ? odds.yesPayout : odds.noPayout
      const potentialReturn = new Decimal(listing.position.amount).times(payout)
      const potentialProfit = potentialReturn.minus(listing.askPrice)
      const roi = new Decimal(listing.askPrice).isZero()
        ? 0
        : potentialProfit.dividedBy(listing.askPrice).times(100).toNumber()

      return {
        ...listing,
        askPrice: listing.askPrice.toNumber(),
        suggestedPrice: listing.suggestedPrice.toNumber(),
        currentPayout: payout,
        potentialReturn: potentialReturn.toNumber(),
        potentialProfit: potentialProfit.toNumber(),
        roi,
        position: {
          ...listing.position,
          amount: listing.position.amount.toNumber(),
          market: {
            ...listing.position.market,
            yesPool: listing.position.market.yesPool.toNumber(),
            noPool: listing.position.market.noPool.toNumber(),
          },
        },
      }
    })
  }

  static async cancel(listingId: string, userId: string) {
    return prisma.$transaction(async (tx) => {
      const listing = await tx.marketplaceListing.findUnique({ where: { id: listingId } })

      if (!listing) throw new Error('Listing not found')
      if (listing.sellerId !== userId) throw new Error('Not listing owner')
      if (listing.status !== 'ACTIVE') throw new Error('Listing not active')

      await tx.marketplaceListing.update({
        where: { id: listingId },
        data: { status: 'CANCELLED', cancelledAt: new Date() },
      })

      await tx.position.update({
        where: { id: listing.positionId },
        data: { isForSale: false },
      })

      return listing
    })
  }

  static async getHistory(marketId?: string) {
    const listings = await prisma.marketplaceListing.findMany({
      where: {
        status: { in: ['SOLD', 'CANCELLED'] },
        ...(marketId && { marketId }),
      },
      include: {
        position: { include: { market: true } },
        seller: { select: { id: true, username: true } },
        buyer: { select: { id: true, username: true } },
      },
      orderBy: { listedAt: 'desc' },
    })

    return listings.map((listing) => {
      // For history, we can't always calculate current odds/payouts meaningfully if market changed,
      // but showing snapshot data or current market data is acceptable.
      // We'll stick to current market data for now.
      const odds = OddsCalculator.calculateOdds(
        listing.position.market.yesPool,
        listing.position.market.noPool
      )
      const payout = listing.position.side === 'YES' ? odds.yesPayout : odds.noPayout

      return {
        ...listing,
        askPrice: listing.askPrice.toNumber(),
        suggestedPrice: listing.suggestedPrice.toNumber(),
        // For history, current payout might differ from sold time, but useful context
        currentPayout: payout, 
        position: {
          ...listing.position,
          amount: listing.position.amount.toNumber(),
          market: {
            ...listing.position.market,
            yesPool: listing.position.market.yesPool.toNumber(),
            noPool: listing.position.market.noPool.toNumber(),
          },
        },
      }
    })
  }

  static async updatePrice(listingId: string, userId: string, newPrice: number) {
    return prisma.$transaction(async (tx) => {
      const listing = await tx.marketplaceListing.findUnique({
        where: { id: listingId },
        include: { position: { include: { market: true } } },
      })

      if (!listing) throw new Error('Listing not found')
      if (listing.sellerId !== userId) throw new Error('Not listing owner')
      if (listing.status !== 'ACTIVE') throw new Error('Listing not active')

      const fairValue = OddsCalculator.calculateFairValue(
        { amount: listing.position.amount, side: listing.position.side as 'YES' | 'NO' },
        { yesPool: listing.position.market.yesPool, noPool: listing.position.market.noPool }
      )

      const askPrice = new Decimal(newPrice)
      if (askPrice.greaterThan(fairValue.times(1.2))) {
        throw new Error('New price too high')
      }

      return tx.marketplaceListing.update({
        where: { id: listingId },
        data: { askPrice, suggestedPrice: fairValue },
      })
    })
  }
}
