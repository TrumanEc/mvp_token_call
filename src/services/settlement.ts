import { prisma } from '@/lib/prisma'
import { Decimal } from '@prisma/client/runtime/library'
import { BalanceService } from './balance'

export type Outcome = 'YES' | 'NO'

export class SettlementService {
  static async resolve(marketId: string, outcome: Outcome | 'VOID') {
    return prisma.$transaction(async (tx) => {
      const market = await tx.market.findUnique({
        where: { id: marketId },
        include: {
          positions: true,
          listings: { where: { status: 'ACTIVE' } },
        },
      })

      if (!market) throw new Error('Market not found')
      if (market.status !== 'ACTIVE' && market.status !== 'CLOSED') {
        throw new Error('Market cannot be resolved')
      }

      // Cancel active listings
      if (market.listings.length > 0) {
        await tx.marketplaceListing.updateMany({
          where: { marketId, status: 'ACTIVE' },
          data: { status: 'CANCELLED', cancelledAt: new Date() },
        })
        await tx.position.updateMany({
          where: { marketId, isForSale: true },
          data: { isForSale: false },
        })
      }

      // Handle VOID
      if (outcome === 'VOID') {
        for (const position of market.positions) {
          if (position.status === 'ACTIVE') {
            await BalanceService.credit(tx, position.currentOwnerId, new Decimal(position.totalCost), 'BET_REFUNDED', 'Refund for voided market', marketId)
            await tx.position.update({
              where: { id: position.id },
              data: { status: 'REFUNDED', payout: new Decimal(position.totalCost) },
            })
          }
        }
        await tx.market.update({
          where: { id: marketId },
          data: { status: 'VOIDED', resolvedAt: new Date() },
        })
        return { type: 'VOID' as const, refunded: market.positions.length }
      }

      // LMSR Settlement: Winning Share = $1
      let winnersCount = 0
      let losersCount = 0
      let totalPaidOut = new Decimal(0)

      for (const position of market.positions) {
        if (position.status !== 'ACTIVE') continue

        const isWinner = position.side === outcome

        if (isWinner) {
          // Payout = 1.0 * shares (Decimal conversion needed)
          const payout = new Decimal(position.shares).times(1)
          
          await BalanceService.credit(tx, position.currentOwnerId, payout, 'PAYOUT_RECEIVED', 'Winnings from market resolution', marketId)
          
          await tx.position.update({
            where: { id: position.id },
            data: { status: 'WON', payout },
          })
          
          totalPaidOut = totalPaidOut.plus(payout)
          winnersCount++
        } else {
          await tx.position.update({
            where: { id: position.id },
            data: { status: 'LOST', payout: new Decimal(0) },
          })
          losersCount++
        }
      }

      // In LMSR, "platform fee" is effectively (Net Revenue - Paid Out), captured implicitly in the reserves.
      // But for report consistency, we might want to calculate the theoretical fee or just track net PnL.
      // For now, let's keep it simple.

      await tx.market.update({
        where: { id: marketId },
        data: { status: 'RESOLVED', outcome, resolvedAt: new Date() },
      })

      return {
        type: 'RESOLVED' as const,
        outcome,
        winnersCount,
        losersCount,
        totalPaidOut: totalPaidOut.toNumber(),
        // Platform fee is implicit in LMSR (spread + net outcome difference)
        platformFee: 0, 
        payoutMultiplier: 1,
      }
    })
  }

  static async getReport(marketId: string) {
    const market = await prisma.market.findUnique({
      where: { id: marketId },
      include: {
        positions: {
          include: {
            currentOwner: { select: { id: true, username: true } },
            originalOwner: { select: { id: true, username: true } },
            transfers: true,
          },
        },
      },
    })

    if (!market) throw new Error('Market not found')

    const winners = market.positions.filter((p) => p.status === 'WON')
    const losers = market.positions.filter((p) => p.status === 'LOST')
    const refunded = market.positions.filter((p) => p.status === 'REFUNDED')

    const totalWinnings = winners.reduce((sum, p) => sum.plus(p.payout || 0), new Decimal(0))
    const totalLosses = losers.reduce((sum, p) => sum.plus(p.amount), new Decimal(0))
    const totalPool = new Decimal(market.yesPool).plus(market.noPool)
    const platformFee = totalPool.times(market.platformFee)

    const allTransfers = market.positions.flatMap((p) => p.transfers)
    const secondaryVolume = allTransfers.reduce((sum, t) => sum.plus(t.price), new Decimal(0))
    const secondaryFees = secondaryVolume.times(0.025)

    return {
      market: {
        id: market.id,
        question: market.question,
        playerName: market.playerName,
        status: market.status,
        outcome: market.outcome,
        resolvedAt: market.resolvedAt,
      },
      pools: {
        yes: market.yesPool.toNumber(),
        no: market.noPool.toNumber(),
        total: totalPool.toNumber(),
      },
      results: {
        winners: winners.length,
        losers: losers.length,
        refunded: refunded.length,
        totalWinnings: totalWinnings.toNumber(),
        totalLosses: totalLosses.toNumber(),
      },
      fees: {
        primaryMarket: platformFee.toNumber(),
        secondaryMarket: secondaryFees.toNumber(),
        total: platformFee.plus(secondaryFees).toNumber(),
      },
      secondaryMarket: {
        transfers: allTransfers.length,
        volume: secondaryVolume.toNumber(),
      },
      positions: market.positions.map((p) => ({
        id: p.id,
        originalOwner: p.originalOwner.username,
        currentOwner: p.currentOwner.username,
        side: p.side,
        amount: p.amount.toNumber(),
        status: p.status,
        payout: p.payout?.toNumber() || 0,
        wasTraded: p.transfers.length > 0,
        transferCount: p.transfers.length,
      })),
    }
  }
}
