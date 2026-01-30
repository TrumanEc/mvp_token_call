import { Decimal } from '@prisma/client/runtime/library'

export class OddsCalculator {
  static calculateOdds(yesPool: Decimal | number, noPool: Decimal | number) {
    const yes = new Decimal(yesPool)
    const no = new Decimal(noPool)
    const total = yes.plus(no)

    if (total.isZero()) {
      return {
        yesOdds: 50,
        noOdds: 50,
        yesPayout: new Decimal(2),
        noPayout: new Decimal(2),
      }
    }

    const yesOdds = yes.dividedBy(total).times(100)
    const noOdds = no.dividedBy(total).times(100)

    return {
      yesOdds: yesOdds.toNumber(),
      noOdds: noOdds.toNumber(),
      yesPayout: this.calculatePayout(yes, total, 0.1),
      noPayout: this.calculatePayout(no, total, 0.1),
    }
  }

  private static calculatePayout(sidePool: Decimal, totalPool: Decimal, fee: number): Decimal {
    if (sidePool.isZero()) return new Decimal(0)
    const netPool = totalPool.times(1 - fee)
    return netPool.dividedBy(sidePool)
  }

  static calculateFairValue(
    position: { amount: Decimal | number; side: 'YES' | 'NO' },
    market: { yesPool: Decimal | number; noPool: Decimal | number }
  ): Decimal {
    const odds = this.calculateOdds(market.yesPool, market.noPool)
    const payout = position.side === 'YES' ? odds.yesPayout : odds.noPayout
    const potentialReturn = new Decimal(position.amount).times(payout)
    return potentialReturn.times(0.95)
  }
}
