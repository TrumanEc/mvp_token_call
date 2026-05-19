import { Decimal } from "@prisma/client/runtime/library";

/**
 * Liquidity-sensitive parameters. When `alpha` is provided, b becomes a function
 * of liquidity Q = qYes + qNo:  b(Q) = max(bMin, alpha * Q).
 * When alpha is null/undefined, the service falls back to classic LMSR with fixed b.
 */
export interface LiquidityParams {
  /** Static fallback b. Used when `alpha` is undefined OR as a clamp floor in edge cases. */
  b: number;
  /** LS-LMSR slope. If set, enables dynamic b(Q). */
  alpha?: number | null;
  /** Floor b_min when alpha is set; ignored if `alpha` is null. */
  bMin?: number | null;
}

const LS_INTEGRATION_STEPS = 50; // N steps for numerical integration per trade

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
   * Gross revenue from burning (selling-back) deltaShares of a specific side against the LMSR curve.
   * Revenue = C(before) - C(after)
   * Returns a positive number representing how much cash leaves the pool.
   */
  getRevenueFromSell(
    qYes: number,
    qNo: number,
    b: number,
    side: "YES" | "NO",
    deltaShares: number,
  ): number {
    if (deltaShares <= 0) return 0;
    // Cannot sell more than what exists on that side (allow going slightly below zero for floating precision but normally no)
    if (side === "YES" && deltaShares > qYes && qYes > 0) {
      deltaShares = Math.max(0, qYes);
    }
    if (side === "NO" && deltaShares > qNo && qNo > 0) {
      deltaShares = Math.max(0, qNo);
    }
    const before = this.costFunction(qYes, qNo, b);
    const after =
      side === "YES"
        ? this.costFunction(qYes - deltaShares, qNo, b)
        : this.costFunction(qYes, qNo - deltaShares, b);
    return Math.max(0, before - after);
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

  // ─── LS-LMSR (Liquidity-Sensitive LMSR) ────────────────────────────────────
  // Reference: WIN_Cambios_Formula_LMSR_v1.docx — Cambio 2

  /**
   * Effective b at the current state. b(Q) = max(bMin, alpha * Q) where Q = qYes + qNo.
   * Falls back to classic fixed `b` when alpha is null/undefined.
   */
  getEffectiveB(qYes: number, qNo: number, params: LiquidityParams): number {
    if (params.alpha == null) return params.b;
    const Q = Math.max(0, qYes + qNo);
    const bMin = params.bMin ?? 100;
    return Math.max(bMin, params.alpha * Q);
  }

  /**
   * True when liquidity-sensitive mode is enabled for this market.
   */
  isLiquiditySensitive(params: LiquidityParams): boolean {
    return params.alpha != null;
  }

  /**
   * Cost function evaluated at (qYes, qNo) using the effective b at that state.
   */
  costFunctionLS(qYes: number, qNo: number, params: LiquidityParams): number {
    const b = this.getEffectiveB(qYes, qNo, params);
    return this.costFunction(qYes, qNo, b);
  }

  /**
   * Instantaneous price (probability) at (qYes, qNo) using the effective b.
   */
  getPriceLS(
    qYes: number,
    qNo: number,
    params: LiquidityParams,
  ): { pYes: number; pNo: number } {
    const b = this.getEffectiveB(qYes, qNo, params);
    return this.getPrice(qYes, qNo, b);
  }

  /**
   * Cost to buy `shares` of `side` via numerical integration over the LS-LMSR curve.
   * In LS-LMSR, b changes with q, so cost ≠ C(after) − C(before) directly; we
   * integrate the price function over the interval in N steps.
   */
  getCostToBuyLS(
    qYes: number,
    qNo: number,
    params: LiquidityParams,
    side: "YES" | "NO",
    shares: number,
    N: number = LS_INTEGRATION_STEPS,
  ): number {
    if (shares <= 0) return 0;
    // Classic LMSR fast path when alpha is null
    if (params.alpha == null) {
      return this.getCostToBuy(qYes, qNo, params.b, side, shares);
    }
    const step = shares / N;
    let cost = 0;
    let currentQYes = qYes;
    let currentQNo = qNo;
    for (let i = 0; i < N; i++) {
      const cBefore = this.costFunctionLS(currentQYes, currentQNo, params);
      if (side === "YES") currentQYes += step;
      else currentQNo += step;
      const cAfter = this.costFunctionLS(currentQYes, currentQNo, params);
      cost += cAfter - cBefore;
    }
    return cost;
  }

  /**
   * Revenue from selling-back `shares` of `side` via numerical integration over the LS-LMSR curve.
   * Same integral but in reverse direction.
   */
  getRevenueFromSellLS(
    qYes: number,
    qNo: number,
    params: LiquidityParams,
    side: "YES" | "NO",
    shares: number,
    N: number = LS_INTEGRATION_STEPS,
  ): number {
    if (shares <= 0) return 0;
    // Cap shares to available on the curve
    const onCurve = side === "YES" ? qYes : qNo;
    const effectiveShares = Math.min(shares, Math.max(0, onCurve));
    if (effectiveShares <= 0) return 0;

    if (params.alpha == null) {
      return this.getRevenueFromSell(qYes, qNo, params.b, side, effectiveShares);
    }
    const step = effectiveShares / N;
    let revenue = 0;
    let currentQYes = qYes;
    let currentQNo = qNo;
    for (let i = 0; i < N; i++) {
      const cBefore = this.costFunctionLS(currentQYes, currentQNo, params);
      if (side === "YES") currentQYes -= step;
      else currentQNo -= step;
      const cAfter = this.costFunctionLS(currentQYes, currentQNo, params);
      revenue += cBefore - cAfter; // pool releases (positive)
    }
    return Math.max(0, revenue);
  }

  /**
   * How many shares can be bought for a target net amount under LS-LMSR.
   * Binary search since the integrated cost is monotonic in shares.
   */
  getSharesToBuyLS(
    qYes: number,
    qNo: number,
    params: LiquidityParams,
    side: "YES" | "NO",
    amount: number,
    tolerance: number = 1e-4,
  ): number {
    if (amount <= 0) return 0;
    if (params.alpha == null) {
      return this.getSharesToBuy(qYes, qNo, params.b, side, amount, tolerance);
    }
    let low = 0;
    let high = amount * 10000;
    for (let i = 0; i < 60; i++) {
      const mid = (low + high) / 2;
      const cost = this.getCostToBuyLS(qYes, qNo, params, side, mid);
      if (Math.abs(cost - amount) < tolerance) return mid;
      if (cost < amount) low = mid;
      else high = mid;
    }
    return (low + high) / 2;
  }

  /**
   * Cost to reach a target price under LS-LMSR. Binary search since b varies along the curve.
   */
  getCostToReachTargetPriceLS(
    qYes: number,
    qNo: number,
    params: LiquidityParams,
    side: "YES" | "NO",
    targetPrice: number,
  ): number {
    if (params.alpha == null) {
      return this.getCostToReachTargetPrice(qYes, qNo, params.b, side, targetPrice);
    }
    const { pYes, pNo } = this.getPriceLS(qYes, qNo, params);
    const currentPrice = side === "YES" ? pYes : pNo;
    if (currentPrice >= targetPrice) return 0;

    // Binary search on shares
    const bMin = params.bMin ?? 100;
    let lowShares = 0;
    let highShares = Math.max(bMin, params.alpha * (qYes + qNo)) * 20;
    for (let i = 0; i < 60; i++) {
      const midShares = (lowShares + highShares) / 2;
      const tempQYes = side === "YES" ? qYes + midShares : qYes;
      const tempQNo = side === "NO" ? qNo + midShares : qNo;
      const { pYes: newPYes, pNo: newPNo } = this.getPriceLS(tempQYes, tempQNo, params);
      const priceAfter = side === "YES" ? newPYes : newPNo;
      if (priceAfter < targetPrice) lowShares = midShares;
      else highShares = midShares;
    }
    const optimalShares = (lowShares + highShares) / 2;
    return this.getCostToBuyLS(qYes, qNo, params, side, optimalShares);
  }

  /**
   * Max amount allowed by price-impact cap under LS-LMSR.
   */
  getMaxAmountForPriceImpactLS(
    qYes: number,
    qNo: number,
    params: LiquidityParams,
    side: "YES" | "NO",
    maxImpactPercent: number,
  ): number {
    if (params.alpha == null) {
      return this.getMaxAmountForPriceImpact(qYes, qNo, params.b, side, maxImpactPercent);
    }
    const { pYes, pNo } = this.getPriceLS(qYes, qNo, params);
    const currentPrice = side === "YES" ? pYes : pNo;
    const maxPrice = Math.min(currentPrice + maxImpactPercent / 100, 0.99);

    const bMin = params.bMin ?? 100;
    let low = 0;
    let high = Math.max(bMin, params.alpha * (qYes + qNo)) * 20;
    for (let i = 0; i < 60; i++) {
      const mid = (low + high) / 2;
      const newQYes = side === "YES" ? qYes + mid : qYes;
      const newQNo = side === "NO" ? qNo + mid : qNo;
      const { pYes: pAfter, pNo: pNoAfter } = this.getPriceLS(newQYes, newQNo, params);
      const priceAfter = side === "YES" ? pAfter : pNoAfter;
      if (priceAfter < maxPrice) low = mid;
      else high = mid;
    }
    const maxShares = (low + high) / 2;
    return this.getCostToBuyLS(qYes, qNo, params, side, maxShares);
  }

  /**
   * Validate bet amount under LS-LMSR (price impact cap uses dynamic b).
   */
  validateBetAmountLS(
    amount: number,
    qYes: number,
    qNo: number,
    params: LiquidityParams,
    side: "YES" | "NO",
    maxBetAmount?: number | null,
    maxPriceImpact?: number | null,
  ): { allowed: boolean; maxAllowed: number; reason?: string } {
    if (maxBetAmount && amount > maxBetAmount + 0.01) {
      return {
        allowed: false,
        maxAllowed: maxBetAmount,
        reason: `El monto máximo por transacción es $${maxBetAmount}`,
      };
    }
    if (maxPriceImpact) {
      const maxByImpact = this.getMaxAmountForPriceImpactLS(
        qYes, qNo, params, side, maxPriceImpact,
      );
      if (amount > maxByImpact + 0.01) {
        return {
          allowed: false,
          maxAllowed: maxBetAmount ? Math.min(maxBetAmount, maxByImpact) : maxByImpact,
          reason: `Esta compra movería el precio más del ${maxPriceImpact}% permitido`,
        };
      }
    }
    return { allowed: true, maxAllowed: amount };
  }

  /**
   * Seed cost = bMin * ln(2) under LS-LMSR (much smaller than classic b·ln(2)).
   */
  getSeedCostLS(params: LiquidityParams): number {
    if (params.alpha == null) return this.getMaxLoss(params.b);
    const bMin = params.bMin ?? 100;
    return bMin * Math.log(2);
  }

  /**
   * Initial q values to start the market at a target probability under LS-LMSR.
   * At Q=0 the effective b is bMin, so we use bMin for the initial offset.
   */
  getInitialQValuesLS(params: LiquidityParams, pYes: number): { qYes: number; qNo: number } {
    if (pYes <= 0 || pYes >= 1) {
      throw new Error("initialProbabilityYes must be between 0 and 1 (exclusive)");
    }
    if (Math.abs(pYes - 0.5) < 1e-6) return { qYes: 0, qNo: 0 };
    const bUsed = params.alpha != null ? (params.bMin ?? 100) : params.b;
    const qYes = bUsed * Math.log(pYes / (1 - pYes));
    return { qYes, qNo: 0 };
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
