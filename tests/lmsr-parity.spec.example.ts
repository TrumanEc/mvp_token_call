/**
 * COPIAR A: api.win.investments/apps/prediction-app/src/lmsr/lmsr.parity.spec.ts
 *
 * Junto con: tests/lmsr-parity.fixtures.json del MVP →
 *            api.win.investments/apps/prediction-app/test/fixtures/lmsr-parity.fixtures.json
 *
 * Si los 32 casos pasan, la math LMSR del backend es IDÉNTICA a la del MVP
 * validado. Cualquier falla indica una regresión matemática.
 */

import { LmsrService } from './lmsr.service';
import * as fixtures from '../test/fixtures/lmsr-parity.fixtures.json';

const PRECISION = 6; // 6 decimales — más estricto que cualquier UI tolera

describe('LmsrService — paridad con MVP', () => {
    const lmsr = new LmsrService();

    fixtures.fixtures.forEach((tc: any) => {
        describe(tc.name, () => {
            const { input, expected } = tc;

            // Priors-based cases (initialQValues + seedCost)
            if (input.priors && input.priors.length > 0) {
                it('getInitialQValuesLSN match', () => {
                    const result = lmsr.getInitialQValuesLSN(input.params, input.priors);
                    expected.initialQValues.forEach((q: number, i: number) => {
                        expect(result[i]).toBeCloseTo(q, PRECISION);
                    });
                });
                it('getSeedCostLSN match', () => {
                    expect(lmsr.getSeedCostLSN(input.params, input.priors.length))
                        .toBeCloseTo(expected.seedCost, PRECISION);
                });
                return;
            }

            // Common assertions (todos los casos los tienen)
            it('getPricesLSN match', () => {
                const result = lmsr.getPricesLSN(input.q, input.params);
                expected.prices.forEach((p: number, i: number) => {
                    expect(result[i]).toBeCloseTo(p, PRECISION + 2);
                });
            });

            it('getEffectiveBN match', () => {
                expect(lmsr.getEffectiveBN(input.q, input.params))
                    .toBeCloseTo(expected.effectiveB, PRECISION);
            });

            // Conditional assertions
            if (input.shares !== undefined) {
                it('getCostToBuyLSN match', () => {
                    expect(lmsr.getCostToBuyLSN(input.q, input.params, input.outcomeIdx, input.shares))
                        .toBeCloseTo(expected.costToBuy, PRECISION);
                });

                it('getRevenueFromSellLSN match', () => {
                    expect(lmsr.getRevenueFromSellLSN(input.q, input.params, input.outcomeIdx, input.shares))
                        .toBeCloseTo(expected.revenueFromSell, PRECISION);
                });
            }

            if (input.amount !== undefined) {
                it('getSharesToBuyLSN match', () => {
                    expect(lmsr.getSharesToBuyLSN(input.q, input.params, input.outcomeIdx, input.amount))
                        .toBeCloseTo(expected.sharesToBuy, PRECISION - 2);
                    // sharesToBuy usa binary search con tolerance 1e-4 → 4 decimales OK
                });
            }

            if (input.targetPrice !== undefined) {
                it('getCostToReachTargetPriceLSN match', () => {
                    expect(lmsr.getCostToReachTargetPriceLSN(
                        input.q, input.params, input.outcomeIdx, input.targetPrice,
                    )).toBeCloseTo(expected.costToReachTargetPrice, PRECISION - 1);
                });
            }

            if (input.maxImpact !== undefined) {
                it('getMaxAmountForPriceImpactLSN match', () => {
                    expect(lmsr.getMaxAmountForPriceImpactLSN(
                        input.q, input.params, input.outcomeIdx, input.maxImpact,
                    )).toBeCloseTo(expected.maxAmountForPriceImpact, PRECISION - 1);
                });
            }
        });
    });

    // Smoke test: el archivo de fixtures debe tener al menos 30 casos
    it('fixtures file está sano', () => {
        expect(fixtures.count).toBeGreaterThanOrEqual(30);
        expect(fixtures.source).toBe('mvp_token_call');
        expect(fixtures.fixtures.length).toBe(fixtures.count);
    });
});
