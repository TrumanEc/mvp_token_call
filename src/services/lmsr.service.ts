/**
 * Multi-outcome LMSR (Logarithmic Market Scoring Rule) service.
 *
 * Generalises the binary (YES/NO) LMSR to N mutually exclusive outcomes.
 * Supports classic fixed-b and LS-LMSR (liquidity-sensitive, dynamic b).
 *
 * Core formulas (Hanson 2002):
 *   C(q) = b · ln(Σ exp(q_i / b))                   — cost function
 *   P_i  = exp(q_i / b) / Σ exp(q_j / b)            — spot price (probability)
 *   Seed = b · ln(N)                                 — max loss / initial funding
 *
 * LS-LMSR (Cambio 2):
 *   Q    = Σ q_i                                     — total outstanding shares
 *   b(Q) = max(bMin, α · Q)                          — dynamic liquidity parameter
 */

export interface LiquidityParams {
  b: number;
  alpha?: number | null;
  bMin?: number | null;
}

const LS_INTEGRATION_STEPS = 50;

export class LmsrService {
  // ─── Core N-outcome functions ──────────────────────────────────────────────

  /**
   * Cost function C(q) = b · ln(Σ exp(q_i / b))
   * Uses log-sum-exp trick: C = b · (z_max + ln(Σ exp(z_i - z_max)))
   */
  costFunctionN(qVector: number[], b: number): number {
    if (b <= 0) return 0;
    const z = qVector.map(q => q / b);
    const zMax = Math.max(...z);
    const sumExp = z.reduce((s, zi) => s + Math.exp(zi - zMax), 0);
    return b * (zMax + Math.log(sumExp));
  }

  /**
   * Spot prices (probabilities) for all outcomes.
   * P_i = exp(q_i / b) / Σ exp(q_j / b)
   * Uses shifted exponentials for numerical stability.
   */
  getPricesN(qVector: number[], b: number): number[] {
    if (b <= 0) return qVector.map(() => 1 / qVector.length);
    const z = qVector.map(q => q / b);
    const zMax = Math.max(...z);
    const exps = z.map(zi => Math.exp(zi - zMax));
    const sumExp = exps.reduce((s, e) => s + e, 0);

    if (!isFinite(sumExp) || sumExp === 0) {
      return qVector.map(() => 1 / qVector.length);
    }
    return exps.map(e => e / sumExp);
  }

  /**
   * Cost to buy deltaShares of outcome at index `outcomeIdx`.
   * Cost = C(q_new) - C(q_old)
   */
  getCostToBuyN(qVector: number[], b: number, outcomeIdx: number, deltaShares: number): number {
    const before = this.costFunctionN(qVector, b);
    const qNew = [...qVector];
    qNew[outcomeIdx] += deltaShares;
    const after = this.costFunctionN(qNew, b);
    return after - before;
  }

  /**
   * Revenue from selling (burning) deltaShares of outcome at outcomeIdx.
   * Revenue = C(before) - C(after) > 0
   */
  getRevenueFromSellN(qVector: number[], b: number, outcomeIdx: number, deltaShares: number): number {
    if (deltaShares <= 0) return 0;
    const effectiveDelta = Math.min(deltaShares, Math.max(0, qVector[outcomeIdx]));
    if (effectiveDelta <= 0) return 0;
    const before = this.costFunctionN(qVector, b);
    const qNew = [...qVector];
    qNew[outcomeIdx] -= effectiveDelta;
    const after = this.costFunctionN(qNew, b);
    return Math.max(0, before - after);
  }

  /**
   * How many shares of outcome `outcomeIdx` can be bought for `amount`.
   * Binary search (monotonic in shares).
   */
  getSharesToBuyN(
    qVector: number[], b: number, outcomeIdx: number,
    amount: number, tolerance = 1e-6,
  ): number {
    if (amount <= 0) return 0;
    let low = 0;
    let high = amount * 10000;
    for (let i = 0; i < 100; i++) {
      const mid = (low + high) / 2;
      const cost = this.getCostToBuyN(qVector, b, outcomeIdx, mid);
      if (Math.abs(cost - amount) < tolerance) return mid;
      if (cost < amount) low = mid;
      else high = mid;
    }
    return (low + high) / 2;
  }

  /**
   * Cost to reach a target price for a specific outcome.
   */
  getCostToReachTargetPriceN(
    qVector: number[], b: number, outcomeIdx: number, targetPrice: number,
  ): number {
    const prices = this.getPricesN(qVector, b);
    if (prices[outcomeIdx] >= targetPrice) return 0;

    let lowShares = 0;
    let highShares = b * 20;
    for (let i = 0; i < 100; i++) {
      const midShares = (lowShares + highShares) / 2;
      const qNew = [...qVector];
      qNew[outcomeIdx] += midShares;
      const newPrices = this.getPricesN(qNew, b);
      if (newPrices[outcomeIdx] < targetPrice) lowShares = midShares;
      else highShares = midShares;
    }
    const optimalShares = (lowShares + highShares) / 2;
    return this.getCostToBuyN(qVector, b, outcomeIdx, optimalShares);
  }

  /**
   * Max amount allowed before hitting a price impact cap.
   */
  getMaxAmountForPriceImpactN(
    qVector: number[], b: number, outcomeIdx: number, maxImpactPercent: number,
  ): number {
    const prices = this.getPricesN(qVector, b);
    const maxPrice = Math.min(prices[outcomeIdx] + maxImpactPercent / 100, 0.99);

    let low = 0;
    let high = b * 20;
    for (let i = 0; i < 100; i++) {
      const mid = (low + high) / 2;
      const qNew = [...qVector];
      qNew[outcomeIdx] += mid;
      const newPrices = this.getPricesN(qNew, b);
      if (newPrices[outcomeIdx] < maxPrice) low = mid;
      else high = mid;
    }
    const maxShares = (low + high) / 2;
    return this.getCostToBuyN(qVector, b, outcomeIdx, maxShares);
  }

  /**
   * Validate bet amount against caps.
   */
  validateBetAmountN(
    amount: number, qVector: number[], b: number, outcomeIdx: number,
    maxBetAmount?: number | null, maxPriceImpact?: number | null,
  ): { allowed: boolean; maxAllowed: number; reason?: string } {
    if (maxBetAmount && amount > maxBetAmount + 0.01) {
      return { allowed: false, maxAllowed: maxBetAmount, reason: `El monto máximo por transacción es $${maxBetAmount}` };
    }
    if (maxPriceImpact) {
      const maxByImpact = this.getMaxAmountForPriceImpactN(qVector, b, outcomeIdx, maxPriceImpact);
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
   * Initial q values for N outcomes with optional prior probabilities.
   * Default: equal priors (1/N each).
   * Sets q[0] = 0 as reference, derives others from log-odds ratio.
   */
  getInitialQValuesN(b: number, priors?: number[]): number[] {
    if (!priors || priors.length === 0) {
      throw new Error("priors array required");
    }
    const n = priors.length;
    const sum = priors.reduce((s, p) => s + p, 0);
    const normalized = priors.map(p => p / sum);
    const refProb = normalized[0];
    return normalized.map(p => {
      if (Math.abs(p - refProb) < 1e-9) return 0;
      return b * Math.log(p / refProb);
    });
  }

  /**
   * Seed cost = b · ln(N)
   */
  getSeedCostN(b: number, numOutcomes: number): number {
    return b * Math.log(numOutcomes);
  }

  // ─── LS-LMSR (Liquidity-Sensitive) N-outcome ──────────────────────────────

  getEffectiveBN(qVector: number[], params: LiquidityParams): number {
    if (params.alpha == null) return params.b;
    const Q = Math.max(0, qVector.reduce((s, q) => s + q, 0));
    const bMin = params.bMin ?? 100;
    return Math.max(bMin, params.alpha * Q);
  }

  isLiquiditySensitive(params: LiquidityParams): boolean {
    return params.alpha != null;
  }

  costFunctionLSN(qVector: number[], params: LiquidityParams): number {
    const b = this.getEffectiveBN(qVector, params);
    return this.costFunctionN(qVector, b);
  }

  getPricesLSN(qVector: number[], params: LiquidityParams): number[] {
    const b = this.getEffectiveBN(qVector, params);
    return this.getPricesN(qVector, b);
  }

  getCostToBuyLSN(
    qVector: number[], params: LiquidityParams,
    outcomeIdx: number, shares: number, N = LS_INTEGRATION_STEPS,
  ): number {
    if (shares <= 0) return 0;
    if (params.alpha == null) {
      return this.getCostToBuyN(qVector, params.b, outcomeIdx, shares);
    }
    const step = shares / N;
    let cost = 0;
    const current = [...qVector];
    for (let i = 0; i < N; i++) {
      const cBefore = this.costFunctionLSN(current, params);
      current[outcomeIdx] += step;
      const cAfter = this.costFunctionLSN(current, params);
      cost += cAfter - cBefore;
    }
    return cost;
  }

  getRevenueFromSellLSN(
    qVector: number[], params: LiquidityParams,
    outcomeIdx: number, shares: number, N = LS_INTEGRATION_STEPS,
  ): number {
    if (shares <= 0) return 0;
    const onCurve = qVector[outcomeIdx];
    const effectiveShares = Math.min(shares, Math.max(0, onCurve));
    if (effectiveShares <= 0) return 0;

    if (params.alpha == null) {
      return this.getRevenueFromSellN(qVector, params.b, outcomeIdx, effectiveShares);
    }
    const step = effectiveShares / N;
    let revenue = 0;
    const current = [...qVector];
    for (let i = 0; i < N; i++) {
      const cBefore = this.costFunctionLSN(current, params);
      current[outcomeIdx] -= step;
      const cAfter = this.costFunctionLSN(current, params);
      revenue += cBefore - cAfter;
    }
    return Math.max(0, revenue);
  }

  getSharesToBuyLSN(
    qVector: number[], params: LiquidityParams,
    outcomeIdx: number, amount: number, tolerance = 1e-4,
  ): number {
    if (amount <= 0) return 0;
    if (params.alpha == null) {
      return this.getSharesToBuyN(qVector, params.b, outcomeIdx, amount, tolerance);
    }
    let low = 0;
    let high = amount * 10000;
    for (let i = 0; i < 60; i++) {
      const mid = (low + high) / 2;
      const cost = this.getCostToBuyLSN(qVector, params, outcomeIdx, mid);
      if (Math.abs(cost - amount) < tolerance) return mid;
      if (cost < amount) low = mid;
      else high = mid;
    }
    return (low + high) / 2;
  }

  getCostToReachTargetPriceLSN(
    qVector: number[], params: LiquidityParams,
    outcomeIdx: number, targetPrice: number,
  ): number {
    if (params.alpha == null) {
      return this.getCostToReachTargetPriceN(qVector, params.b, outcomeIdx, targetPrice);
    }
    const prices = this.getPricesLSN(qVector, params);
    if (prices[outcomeIdx] >= targetPrice) return 0;

    const bEff = this.getEffectiveBN(qVector, params);
    let lowShares = 0;
    let highShares = bEff * 20;
    for (let i = 0; i < 60; i++) {
      const midShares = (lowShares + highShares) / 2;
      const qNew = [...qVector];
      qNew[outcomeIdx] += midShares;
      const newPrices = this.getPricesLSN(qNew, params);
      if (newPrices[outcomeIdx] < targetPrice) lowShares = midShares;
      else highShares = midShares;
    }
    const optimalShares = (lowShares + highShares) / 2;
    return this.getCostToBuyLSN(qVector, params, outcomeIdx, optimalShares);
  }

  getMaxAmountForPriceImpactLSN(
    qVector: number[], params: LiquidityParams,
    outcomeIdx: number, maxImpactPercent: number,
  ): number {
    if (params.alpha == null) {
      return this.getMaxAmountForPriceImpactN(qVector, params.b, outcomeIdx, maxImpactPercent);
    }
    const prices = this.getPricesLSN(qVector, params);
    const maxPrice = Math.min(prices[outcomeIdx] + maxImpactPercent / 100, 0.99);

    const bEff = this.getEffectiveBN(qVector, params);
    let low = 0;
    let high = bEff * 20;
    for (let i = 0; i < 60; i++) {
      const mid = (low + high) / 2;
      const qNew = [...qVector];
      qNew[outcomeIdx] += mid;
      const newPrices = this.getPricesLSN(qNew, params);
      if (newPrices[outcomeIdx] < maxPrice) low = mid;
      else high = mid;
    }
    const maxShares = (low + high) / 2;
    return this.getCostToBuyLSN(qVector, params, outcomeIdx, maxShares);
  }

  validateBetAmountLSN(
    amount: number, qVector: number[], params: LiquidityParams,
    outcomeIdx: number, maxBetAmount?: number | null, maxPriceImpact?: number | null,
  ): { allowed: boolean; maxAllowed: number; reason?: string } {
    if (maxBetAmount && amount > maxBetAmount + 0.01) {
      return { allowed: false, maxAllowed: maxBetAmount, reason: `El monto máximo por transacción es $${maxBetAmount}` };
    }
    if (maxPriceImpact) {
      const maxByImpact = this.getMaxAmountForPriceImpactLSN(qVector, params, outcomeIdx, maxPriceImpact);
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

  getSeedCostLSN(params: LiquidityParams, numOutcomes: number): number {
    if (params.alpha == null) return this.getSeedCostN(params.b, numOutcomes);
    const bMin = params.bMin ?? 100;
    return bMin * Math.log(numOutcomes);
  }

  getInitialQValuesLSN(params: LiquidityParams, priors: number[]): number[] {
    const bUsed = params.alpha != null ? (params.bMin ?? 100) : params.b;
    return this.getInitialQValuesN(bUsed, priors);
  }

  // ─── Helpers ───────────────────────────────────────────────────────────────

  /**
   * Build a q-vector from MarketOutcome records (sorted by displayOrder).
   */
  static buildQVector(outcomes: { qOutstanding: number; displayOrder: number }[]): number[] {
    return outcomes.sort((a, b) => a.displayOrder - b.displayOrder).map(o => o.qOutstanding);
  }

  /**
   * Find the index of an outcomeId within sorted outcomes array.
   */
  static outcomeIndex(outcomes: { id: string; displayOrder: number }[], outcomeId: string): number {
    const sorted = [...outcomes].sort((a, b) => a.displayOrder - b.displayOrder);
    const idx = sorted.findIndex(o => o.id === outcomeId);
    if (idx === -1) throw new Error(`Outcome ${outcomeId} not found in market`);
    return idx;
  }

  // ─── Binary backward-compat wrappers ───────────────────────────────────────
  // These delegate to N-outcome methods with qVector = [qYes, qNo].

  costFunction(qYes: number, qNo: number, b: number): number {
    return this.costFunctionN([qYes, qNo], b);
  }

  getPrice(qYes: number, qNo: number, b: number): { pYes: number; pNo: number } {
    const [pYes, pNo] = this.getPricesN([qYes, qNo], b);
    return { pYes, pNo };
  }

  getCostToBuy(qYes: number, qNo: number, b: number, side: "YES" | "NO", deltaShares: number): number {
    return this.getCostToBuyN([qYes, qNo], b, side === "YES" ? 0 : 1, deltaShares);
  }

  getRevenueFromSell(qYes: number, qNo: number, b: number, side: "YES" | "NO", deltaShares: number): number {
    return this.getRevenueFromSellN([qYes, qNo], b, side === "YES" ? 0 : 1, deltaShares);
  }

  getSharesToBuy(qYes: number, qNo: number, b: number, side: "YES" | "NO", amount: number, tolerance = 1e-6): number {
    return this.getSharesToBuyN([qYes, qNo], b, side === "YES" ? 0 : 1, amount, tolerance);
  }

  getMaxLoss(b: number): number {
    return this.getSeedCostN(b, 2);
  }

  getEffectiveB(qYes: number, qNo: number, params: LiquidityParams): number {
    return this.getEffectiveBN([qYes, qNo], params);
  }

  getPriceLS(qYes: number, qNo: number, params: LiquidityParams): { pYes: number; pNo: number } {
    const [pYes, pNo] = this.getPricesLSN([qYes, qNo], params);
    return { pYes, pNo };
  }

  getCostToBuyLS(qYes: number, qNo: number, params: LiquidityParams, side: "YES" | "NO", shares: number, N = LS_INTEGRATION_STEPS): number {
    return this.getCostToBuyLSN([qYes, qNo], params, side === "YES" ? 0 : 1, shares, N);
  }

  getRevenueFromSellLS(qYes: number, qNo: number, params: LiquidityParams, side: "YES" | "NO", shares: number, N = LS_INTEGRATION_STEPS): number {
    return this.getRevenueFromSellLSN([qYes, qNo], params, side === "YES" ? 0 : 1, shares, N);
  }

  getSharesToBuyLS(qYes: number, qNo: number, params: LiquidityParams, side: "YES" | "NO", amount: number, tolerance = 1e-4): number {
    return this.getSharesToBuyLSN([qYes, qNo], params, side === "YES" ? 0 : 1, amount, tolerance);
  }

  getCostToReachTargetPriceLS(qYes: number, qNo: number, params: LiquidityParams, side: "YES" | "NO", targetPrice: number): number {
    return this.getCostToReachTargetPriceLSN([qYes, qNo], params, side === "YES" ? 0 : 1, targetPrice);
  }

  getMaxAmountForPriceImpactLS(qYes: number, qNo: number, params: LiquidityParams, side: "YES" | "NO", maxImpactPercent: number): number {
    return this.getMaxAmountForPriceImpactLSN([qYes, qNo], params, side === "YES" ? 0 : 1, maxImpactPercent);
  }

  getSeedCostLS(params: LiquidityParams): number {
    return this.getSeedCostLSN(params, 2);
  }

  getInitialQValues(b: number, pYes: number): { qYes: number; qNo: number } {
    const qVec = this.getInitialQValuesN(b, [pYes, 1 - pYes]);
    return { qYes: qVec[0], qNo: qVec[1] };
  }

  getInitialQValuesLS(params: LiquidityParams, pYes: number): { qYes: number; qNo: number } {
    const qVec = this.getInitialQValuesLSN(params, [pYes, 1 - pYes]);
    return { qYes: qVec[0], qNo: qVec[1] };
  }

  getMarketState(qYes: number, qNo: number, b: number) {
    const { pYes, pNo } = this.getPrice(qYes, qNo, b);
    const cost = this.costFunction(qYes, qNo, b);
    const maxLoss = this.getMaxLoss(b);
    return {
      qYes, qNo, pYes, pNo,
      costAccumulated: cost,
      maxLoss,
      liquidityRemaining: maxLoss - cost + maxLoss,
      impliedOddsYes: pYes > 0 ? 1 / pYes : 0,
      impliedOddsNo: pNo > 0 ? 1 / pNo : 0,
    };
  }

  costFunctionLS(qYes: number, qNo: number, params: LiquidityParams): number {
    return this.costFunctionLSN([qYes, qNo], params);
  }

  validateBetAmountLS(
    amount: number, qYes: number, qNo: number, params: LiquidityParams,
    side: "YES" | "NO", maxBetAmount?: number | null, maxPriceImpact?: number | null,
  ): { allowed: boolean; maxAllowed: number; reason?: string } {
    return this.validateBetAmountLSN(amount, [qYes, qNo], params, side === "YES" ? 0 : 1, maxBetAmount, maxPriceImpact);
  }

  getCostToReachTargetPrice(qYes: number, qNo: number, b: number, side: "YES" | "NO", targetPrice: number): number {
    return this.getCostToReachTargetPriceN([qYes, qNo], b, side === "YES" ? 0 : 1, targetPrice);
  }

  getMaxAmountForPriceImpact(qYes: number, qNo: number, b: number, side: "YES" | "NO", maxImpactPercent: number): number {
    return this.getMaxAmountForPriceImpactN([qYes, qNo], b, side === "YES" ? 0 : 1, maxImpactPercent);
  }

  validateBetAmount(
    amount: number, qYes: number, qNo: number, b: number,
    side: "YES" | "NO", maxBetAmount?: number | null, maxPriceImpact?: number | null,
  ): { allowed: boolean; maxAllowed: number; reason?: string } {
    return this.validateBetAmountN(amount, [qYes, qNo], b, side === "YES" ? 0 : 1, maxBetAmount, maxPriceImpact);
  }
}
