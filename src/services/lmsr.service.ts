import { Decimal } from "@prisma/client/runtime/library";

export class LmsrService {
  /**
   * Cost function C(q) = b * ln(e^(qYes/b) + e^(qNo/b))
   * Uses log-sum-exp trick for numerical stability
   */
  costFunction(qYes: number, qNo: number, b: number): number {
    const maxQ = Math.max(qYes / b, qNo / b);
    return (
      b *
      (maxQ + Math.log(Math.exp(qYes / b - maxQ) + Math.exp(qNo / b - maxQ)))
    );
  }

  /**
   * Instantaneous price (probability) of an outcome
   * P_yes = e^(qYes/b) / (e^(qYes/b) + e^(qNo/b))
   */
  getPrice(
    qYes: number,
    qNo: number,
    b: number,
  ): { pYes: number; pNo: number } {
    const expYes = Math.exp(qYes / b);
    const expNo = Math.exp(qNo / b);
    const sum = expYes + expNo;

    // Handle potential overflow/underflow if b is very small or q is very large
    if (!isFinite(expYes) || !isFinite(expNo) || !isFinite(sum)) {
      // Fallback: if qYes >>> qNo, pYes -> 1
      if (qYes > qNo) return { pYes: 1, pNo: 0 };
      else return { pYes: 0, pNo: 1 };
    }

    return {
      pYes: expYes / sum,
      pNo: expNo / sum,
    };
  }

  /**
   * Cost to buy deltaShares of a specific side
   * Cost = C(new) - C(old)
   */
  getCostToBuy(
    qYes: number,
    qNo: number,
    b: number,
    side: "YES" | "NO",
    deltaShares: number,
  ): number {
    const before = this.costFunction(qYes, qNo, b);
    const after =
      side === "YES"
        ? this.costFunction(qYes + deltaShares, qNo, b)
        : this.costFunction(qYes, qNo + deltaShares, b);
    return after - before;
  }

  /**
   * Calculate how many shares can be bought for a fixed amount of money
   * Uses binary search as the inverse of costFunction is not easily solvable analytically for delta
   */
  getSharesToBuy(
    qYes: number,
    qNo: number,
    b: number,
    side: "YES" | "NO",
    amount: number,
    tolerance: number = 1e-6,
  ): number {
    let low = 0;
    let high = amount * 10000; // Heuristic upper bound, assuming lowest possible price is around 0.0001

    // Binary search for 100 iterations (sufficient precision)
    for (let i = 0; i < 100; i++) {
      const mid = (low + high) / 2;
      const cost = this.getCostToBuy(qYes, qNo, b, side, mid);

      if (Math.abs(cost - amount) < tolerance) {
        return mid;
      }

      if (cost < amount) {
        low = mid;
      } else {
        high = mid;
      }
    }

    return (low + high) / 2;
  }

  /**
   * Calcula cuánto capital ($) se necesita invertir para llevar el precio marginal
   * (probabilidad instantánea) del LMSR hasta un `targetPrice` específico.
   * Usado por el Router Híbrido para no exceder el precio del Orderbook.
   */
  getCostToReachTargetPrice(
    qYes: number,
    qNo: number,
    b: number,
    side: "YES" | "NO",
    targetPrice: number,
  ): number {
    const { pYes, pNo } = this.getPrice(qYes, qNo, b);
    const currentPrice = side === "YES" ? pYes : pNo;

    // Si el LMSR ya está más caro o igual al Orderbook (targetPrice), cuesta $0 (no minteamos)
    if (currentPrice >= targetPrice) {
      return 0;
    }

    let lowShares = 0;
    let highShares = b * 20; 

    // Búsqueda binaria de shares necesarios para alcanzar targetPrice
    for (let i = 0; i < 100; i++) {
       const midShares = (lowShares + highShares) / 2;
       const tempQYes = side === "YES" ? qYes + midShares : qYes;
       const tempQNo = side === "NO" ? qNo + midShares : qNo;
       const { pYes: newPYes, pNo: newPNo } = this.getPrice(tempQYes, tempQNo, b);
       const priceAfter = side === "YES" ? newPYes : newPNo;
       
       if (priceAfter < targetPrice) lowShares = midShares;
       else highShares = midShares;
    }
    
    const optimalShares = (lowShares + highShares) / 2;
    return this.getCostToBuy(qYes, qNo, b, side, optimalShares);
  }

  /**
   * Calcula el monto máximo permitido para una transacción
   * dado un límite de price impact en porcentaje
   */
  getMaxAmountForPriceImpact(
    qYes: number,
    qNo: number,
    b: number,
    side: "YES" | "NO",
    maxImpactPercent: number, // ej: 5 = no mover más de 5%
  ): number {
    const { pYes, pNo } = this.getPrice(qYes, qNo, b);
    const currentPrice = side === "YES" ? pYes : pNo;
    const maxPrice = Math.min(currentPrice + maxImpactPercent / 100, 0.99);

    // Buscar binariamente cuántos shares llevan el precio hasta maxPrice
    let low = 0;
    let high = b * 20;

    for (let i = 0; i < 100; i++) {
      const mid = (low + high) / 2;
      const newQYes = side === "YES" ? qYes + mid : qYes;
      const newQNo = side === "NO" ? qNo + mid : qNo;
      const { pYes: pAfter, pNo: pNoAfter } = this.getPrice(newQYes, newQNo, b);
      const priceAfter = side === "YES" ? pAfter : pNoAfter;

      if (priceAfter < maxPrice) low = mid;
      else high = mid;
    }

    const maxShares = (low + high) / 2;
    return this.getCostToBuy(qYes, qNo, b, side, maxShares);
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
    side: "YES" | "NO",
    maxBetAmount?: number | null,
    maxPriceImpact?: number | null,
  ): { allowed: boolean; maxAllowed: number; reason?: string } {
    // 1. CAP fijo (Add 1 cent tolerance for float precision)
    if (maxBetAmount && amount > maxBetAmount + 0.01) {
      return {
        allowed: false,
        maxAllowed: maxBetAmount,
        reason: `El monto máximo por transacción es $${maxBetAmount}`,
      };
    }

    // 2. CAP dinámico por price impact (si está configurado)
    if (maxPriceImpact) {
      const maxByImpact = this.getMaxAmountForPriceImpact(
        qYes,
        qNo,
        b,
        side,
        maxPriceImpact,
      );

      if (amount > maxByImpact + 0.01) {
        return {
          allowed: false,
          maxAllowed: maxBetAmount
            ? Math.min(maxBetAmount, maxByImpact)
            : maxByImpact,
          reason: `Esta compra movería el precio más del ${maxPriceImpact}% permitido`,
        };
      }
    }

    return { allowed: true, maxAllowed: amount };
  }

  /**
   * Compute initial q values to start a market at a target probability.
   * Formula: qYes - qNo = b × ln(pYes / pNo)
   * We set qNo = 0, qYes = b × ln(pYes / (1 - pYes)).
   * For pYes < 0.5, qYes will be negative — this is valid and correct.
   */
  getInitialQValues(b: number, pYes: number): { qYes: number; qNo: number } {
    if (pYes <= 0 || pYes >= 1) {
      throw new Error("initialProbabilityYes must be between 0 and 1 (exclusive)");
    }
    if (Math.abs(pYes - 0.5) < 1e-6) {
      return { qYes: 0, qNo: 0 };
    }
    const qYes = b * Math.log(pYes / (1 - pYes));
    return { qYes, qNo: 0 };
  }

  /**
   * Max loss (initial funding required) for the market maker
   * Max Loss = b * ln(2) for binary market
   */
  getMaxLoss(b: number): number {
    return b * Math.log(2);
  }

  /**
   * Market snapshot state
   */
  getMarketState(qYes: number, qNo: number, b: number) {
    const { pYes, pNo } = this.getPrice(qYes, qNo, b);
    const cost = this.costFunction(qYes, qNo, b);
    const maxLoss = this.getMaxLoss(b);

    return {
      qYes,
      qNo,
      pYes,
      pNo,
      costAccumulated: cost,
      maxLoss,
      liquidityRemaining: maxLoss - cost + maxLoss, // Rough estimate
      impliedOddsYes: pYes > 0 ? 1 / pYes : 0,
      impliedOddsNo: pNo > 0 ? 1 / pNo : 0,
    };
  }
}
