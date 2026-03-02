import { Decimal } from '@prisma/client/runtime/library'

export class LmsrService {
  /**
   * Cost function C(q) = b * ln(e^(qYes/b) + e^(qNo/b))
   * Uses log-sum-exp trick for numerical stability
   */
  costFunction(qYes: number, qNo: number, b: number): number {
    const maxQ = Math.max(qYes / b, qNo / b)
    return b * (maxQ + Math.log(
      Math.exp(qYes / b - maxQ) + Math.exp(qNo / b - maxQ)
    ))
  }

  /**
   * Instantaneous price (probability) of an outcome
   * P_yes = e^(qYes/b) / (e^(qYes/b) + e^(qNo/b))
   */
  getPrice(qYes: number, qNo: number, b: number): { pYes: number; pNo: number } {
    const expYes = Math.exp(qYes / b)
    const expNo  = Math.exp(qNo / b)
    const sum    = expYes + expNo
    
    // Handle potential overflow/underflow if b is very small or q is very large
    if (!isFinite(expYes) || !isFinite(expNo) || !isFinite(sum)) {
      // Fallback: if qYes >>> qNo, pYes -> 1
      if (qYes > qNo) return { pYes: 1, pNo: 0 }
      else return { pYes: 0, pNo: 1 }
    }

    return {
      pYes: expYes / sum,
      pNo:  expNo / sum,
    }
  }

  /**
   * Cost to buy deltaShares of a specific side
   * Cost = C(new) - C(old)
   */
  getCostToBuy(
    qYes: number,
    qNo: number,
    b: number,
    side: 'YES' | 'NO',
    deltaShares: number
  ): number {
    const before = this.costFunction(qYes, qNo, b)
    const after  = side === 'YES'
      ? this.costFunction(qYes + deltaShares, qNo, b)
      : this.costFunction(qYes, qNo + deltaShares, b)
    return after - before
  }

  /**
   * Calculate how many shares can be bought for a fixed amount of money
   * Uses binary search as the inverse of costFunction is not easily solvable analytically for delta
   */
  getSharesToBuy(
    qYes: number,
    qNo: number,
    b: number,
    side: 'YES' | 'NO',
    amount: number,
    tolerance: number = 1e-6
  ): number {
    let low = 0
    let high = amount * 10 // Heuristic upper bound, usually price < 1 so shares > amount
    
    // Binary search for 100 iterations (sufficient precision)
    for (let i = 0; i < 100; i++) {
      const mid = (low + high) / 2
      const cost = this.getCostToBuy(qYes, qNo, b, side, mid)
      
      if (Math.abs(cost - amount) < tolerance) {
        return mid
      }
      
      if (cost < amount) {
        low = mid
      } else {
        high = mid
      }
    }
    
    return (low + high) / 2
  }

  /**
   * Calcula el monto máximo permitido para una transacción
   * dado un límite de price impact en porcentaje
   */
  getMaxAmountForPriceImpact(
    qYes: number,
    qNo: number,
    b: number,
    side: 'YES' | 'NO',
    maxImpactPercent: number // ej: 5 = no mover más de 5%
  ): number {
    const { pYes, pNo } = this.getPrice(qYes, qNo, b)
    const currentPrice = side === 'YES' ? pYes : pNo
    const maxPrice = Math.min(currentPrice + maxImpactPercent / 100, 0.99)

    // Buscar binariamente cuántos shares llevan el precio hasta maxPrice
    let low = 0
    let high = b * 20

    for (let i = 0; i < 100; i++) {
      const mid = (low + high) / 2
      const newQYes = side === 'YES' ? qYes + mid : qYes
      const newQNo  = side === 'NO'  ? qNo  + mid : qNo
      const { pYes: pAfter, pNo: pNoAfter } = this.getPrice(newQYes, newQNo, b)
      const priceAfter = side === 'YES' ? pAfter : pNoAfter

      if (priceAfter < maxPrice) low = mid
      else high = mid
    }

    const maxShares = (low + high) / 2
    return this.getCostToBuy(qYes, qNo, b, side, maxShares)
  }

  /**
   * Valida una transacción contra todos los límites configurados.
   * Devuelve el monto máximo permitido y la razón si fue limitado.
   */
  validateBetAmount(
    amount: number,
    qYes: number,
    qNo: number,
    b: number,
    side: 'YES' | 'NO',
    maxBetAmount: number,
    maxPriceImpact?: number | null
  ): { allowed: boolean; maxAllowed: number; reason?: string } {
    
    // 1. CAP fijo
    if (amount > maxBetAmount) {
      return {
        allowed: false,
        maxAllowed: maxBetAmount,
        reason: `El monto máximo por transacción es $${maxBetAmount}`,
      }
    }

    // 2. CAP dinámico por price impact (si está configurado)
    if (maxPriceImpact) {
      const maxByImpact = this.getMaxAmountForPriceImpact(
        qYes, qNo, b, side, maxPriceImpact
      )

      if (amount > maxByImpact) {
        return {
          allowed: false,
          maxAllowed: Math.min(maxBetAmount, maxByImpact),
          reason: `Esta compra movería el precio más del ${maxPriceImpact}% permitido`,
        }
      }
    }

    return { allowed: true, maxAllowed: amount }
  }

  /**
   * Max loss (initial funding required) for the market maker
   * Max Loss = b * ln(2) for binary market
   */
  getMaxLoss(b: number): number {
    return b * Math.log(2)
  }

  /**
   * Market snapshot state
   */
  getMarketState(qYes: number, qNo: number, b: number) {
    const { pYes, pNo } = this.getPrice(qYes, qNo, b)
    const cost = this.costFunction(qYes, qNo, b)
    const maxLoss = this.getMaxLoss(b)
    
    return {
      qYes,
      qNo,
      pYes: parseFloat((pYes * 100).toFixed(4)),
      pNo:  parseFloat((pNo * 100).toFixed(4)),
      costAccumulated: cost,
      maxLoss,
      liquidityRemaining: maxLoss - cost + maxLoss, // Rough estimate
      impliedOddsYes: pYes > 0 ? 1 / pYes : 0,
      impliedOddsNo:  pNo > 0 ? 1 / pNo : 0,
    }
  }
}
