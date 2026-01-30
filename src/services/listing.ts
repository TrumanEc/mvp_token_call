import { prisma } from '@/lib/prisma'
import { Decimal } from '@prisma/client/runtime/library'
import { OddsCalculator } from './odds-calculator'
import { BalanceService } from './balance'

export class ListingService {
  static async create(data: { positionId: string; userId: string; askPrice: number }) {
    return prisma.$transaction(async (tx) => {
      const position = await tx.position.findUnique({
        where: { id: data.positionId },
        include: { market: true },
      })

      if (!position) throw new Error('Position not found')
      if (position.currentOwnerId !== data.userId) throw new Error('Not position owner')
      if (position.isForSale) throw new Error('Position already listed')
      if (position.market.status !== 'ACTIVE') throw new Error('Market not active')

      const fairValue = OddsCalculator.calculateFairValue(
        { amount: position.amount, side: position.side },
        { yesPool: position.market.yesPool, noPool: position.market.noPool }
      )

      const askPrice = new Decimal(data.askPrice)
      const listing = await tx.marketplaceListing.upsert({
        where: { positionId: data.positionId },
        create: {
          positionId: data.positionId,
          marketId: position.marketId,
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

      await tx.position.update({
        where: { id: data.positionId },
        data: { isForSale: true },
      })

      return listing
    })
  }

  static async buy(data: { listingId: string; buyerId: string }) {
    return prisma.$transaction(async (tx) => {
      const listing = await tx.marketplaceListing.findUnique({
        where: { id: data.listingId },
        include: { position: true, seller: true },
      })

      if (!listing) throw new Error('Listing not found')
      if (listing.status !== 'ACTIVE') throw new Error('Listing not available')
      if (listing.sellerId === data.buyerId) throw new Error('Cannot buy own listing')

      const buyer = await tx.user.findUnique({ where: { id: data.buyerId } })
      if (!buyer) throw new Error('Buyer not found')
      if (new Decimal(buyer.balance).lessThan(listing.askPrice)) {
        throw new Error('Insufficient balance')
      }

      const platformFee = new Decimal(listing.askPrice).times(listing.platformFee)
      const sellerReceives = new Decimal(listing.askPrice).minus(platformFee)

      await BalanceService.deduct(tx, buyer.id, listing.askPrice, 'POSITION_PURCHASED', `Bought position #${listing.positionId}`)
      await BalanceService.credit(tx, listing.sellerId, sellerReceives, 'POSITION_SOLD', `Sold position #${listing.positionId}`)

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
          price: listing.askPrice,
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
        { amount: listing.position.amount, side: listing.position.side },
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
