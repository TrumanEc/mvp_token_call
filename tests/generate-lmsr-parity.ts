/**
 * Genera fixtures JSON de paridad LMSR para validar el backend.
 *
 * Uso:
 *   npx tsx tests/generate-lmsr-parity.ts > tests/lmsr-parity.fixtures.json
 *
 * Después en el backend (api.win.investments) corré un .spec.ts que
 * cargue ese JSON y compare cada output con LmsrService del backend usando
 * `toBeCloseTo(expected, 6)`. Si los 50 casos pasan, la math del LMSR está
 * idéntica al MVP validado.
 */
import { LmsrService } from "../apps/prediction-app/src/lmsr/lmsr.service";

interface Case {
    name: string;
    q: number[];
    params: { b: number; alpha: number; bMin: number };
    outcomeIdx: number;
    shares?: number;
    amount?: number;
    targetPrice?: number;
    maxImpact?: number;
    priors?: number[];
}

// Cases que cubren los hot paths del modelo
const cases: Case[] = [
    // Defaults del modelo final
    { name: "binary uniform Q=0",       q: [0, 0],        params: { b: 1000, alpha: 0.15, bMin: 1000 }, outcomeIdx: 0, shares: 100 },
    { name: "binary uniform Q=0 sell",  q: [0, 0],        params: { b: 1000, alpha: 0.15, bMin: 1000 }, outcomeIdx: 1, shares: 50 },
    { name: "binary skewed YES",        q: [100, -100],   params: { b: 1000, alpha: 0.15, bMin: 1000 }, outcomeIdx: 0, shares: 75 },
    { name: "binary skewed NO",         q: [-100, 100],   params: { b: 1000, alpha: 0.15, bMin: 1000 }, outcomeIdx: 1, shares: 75 },
    { name: "binary large Q triggering effectiveB > bMin",
                                        q: [10000, -100], params: { b: 1000, alpha: 0.15, bMin: 1000 }, outcomeIdx: 0, shares: 500 },
    { name: "binary extreme skew",      q: [5000, -5000], params: { b: 1000, alpha: 0.15, bMin: 1000 }, outcomeIdx: 1, shares: 100 },
    { name: "binary negative priors q",
                                        q: [-200, 200],   params: { b: 1000, alpha: 0.15, bMin: 1000 }, outcomeIdx: 0, shares: 60 },

    // Multi-outcome (3 opciones)
    { name: "3-outcome uniform",        q: [0, 0, 0],     params: { b: 1000, alpha: 0.15, bMin: 1000 }, outcomeIdx: 1, shares: 50 },
    { name: "3-outcome skewed",         q: [200, -100, -100], params: { b: 1000, alpha: 0.15, bMin: 1000 }, outcomeIdx: 2, shares: 100 },
    { name: "3-outcome with negatives", q: [-300, 200, 100],  params: { b: 1000, alpha: 0.15, bMin: 1000 }, outcomeIdx: 0, shares: 80 },

    // Multi-outcome (4 opciones — Copa del Mundo style)
    { name: "4-outcome uniform",        q: [0, 0, 0, 0],  params: { b: 1000, alpha: 0.15, bMin: 1000 }, outcomeIdx: 2, shares: 40 },
    { name: "4-outcome favorito claro", q: [500, -150, -150, -200], params: { b: 1000, alpha: 0.15, bMin: 1000 }, outcomeIdx: 0, shares: 100 },
    { name: "4-outcome favorito + venta", q: [800, -200, -300, -300], params: { b: 1000, alpha: 0.15, bMin: 1000 }, outcomeIdx: 0, shares: 150 },

    // Edge cases LS-LMSR: alpha y bMin distintos
    { name: "alpha=0.05 conservador",   q: [100, -100],   params: { b: 1000, alpha: 0.05, bMin: 1000 }, outcomeIdx: 0, shares: 50 },
    { name: "alpha=0.10 medio",         q: [100, -100],   params: { b: 1000, alpha: 0.10, bMin: 1000 }, outcomeIdx: 0, shares: 50 },
    { name: "alpha=0.20 agresivo",      q: [100, -100],   params: { b: 1000, alpha: 0.20, bMin: 1000 }, outcomeIdx: 0, shares: 50 },
    { name: "bMin pequeño 100",         q: [0, 0],        params: { b: 100, alpha: 0.15, bMin: 100 },    outcomeIdx: 0, shares: 50 },
    { name: "bMin grande 5000",         q: [0, 0],        params: { b: 5000, alpha: 0.15, bMin: 5000 }, outcomeIdx: 0, shares: 100 },

    // Hot path: getSharesToBuy con amount fijo
    { name: "buy con amount=100",       q: [0, 0],        params: { b: 1000, alpha: 0.15, bMin: 1000 }, outcomeIdx: 0, amount: 100 },
    { name: "buy con amount=10",        q: [0, 0],        params: { b: 1000, alpha: 0.15, bMin: 1000 }, outcomeIdx: 0, amount: 10 },
    { name: "buy con amount=1000",      q: [0, 0],        params: { b: 1000, alpha: 0.15, bMin: 1000 }, outcomeIdx: 0, amount: 1000 },
    { name: "buy con amount en mercado profundo",
                                        q: [3000, -2000], params: { b: 1000, alpha: 0.15, bMin: 1000 }, outcomeIdx: 0, amount: 500 },

    // Target price
    { name: "target price 0.60",        q: [0, 0],        params: { b: 1000, alpha: 0.15, bMin: 1000 }, outcomeIdx: 0, targetPrice: 0.60 },
    { name: "target price 0.80",        q: [0, 0],        params: { b: 1000, alpha: 0.15, bMin: 1000 }, outcomeIdx: 0, targetPrice: 0.80 },
    { name: "target price 0.55 desde skew",
                                        q: [200, -100],   params: { b: 1000, alpha: 0.15, bMin: 1000 }, outcomeIdx: 1, targetPrice: 0.55 },

    // Price impact caps
    { name: "max impact 5%",            q: [0, 0],        params: { b: 1000, alpha: 0.15, bMin: 1000 }, outcomeIdx: 0, maxImpact: 5 },
    { name: "max impact 10%",           q: [0, 0],        params: { b: 1000, alpha: 0.15, bMin: 1000 }, outcomeIdx: 0, maxImpact: 10 },
    { name: "max impact 20% en skew",   q: [500, -500],   params: { b: 1000, alpha: 0.15, bMin: 1000 }, outcomeIdx: 0, maxImpact: 20 },

    // Initial Q values desde priors
    { name: "priors uniformes 2-outcome",   q: [],         params: { b: 1000, alpha: 0.15, bMin: 1000 }, outcomeIdx: -1, priors: [0.5, 0.5] },
    { name: "priors no-uniformes 2-outcome",q: [],         params: { b: 1000, alpha: 0.15, bMin: 1000 }, outcomeIdx: -1, priors: [0.7, 0.3] },
    { name: "priors 3-outcome",             q: [],         params: { b: 1000, alpha: 0.15, bMin: 1000 }, outcomeIdx: -1, priors: [0.5, 0.3, 0.2] },
    { name: "priors 4-outcome con favorito",q: [],         params: { b: 1000, alpha: 0.15, bMin: 1000 }, outcomeIdx: -1, priors: [0.55, 0.20, 0.15, 0.10] },
];

const lmsr = new LmsrService();
const fixtures = cases.map((c) => {
    const out: any = { name: c.name, input: c };

    if (c.priors && c.priors.length > 0) {
        out.expected = {
            initialQValues: lmsr.getInitialQValuesLSN(c.params, c.priors),
            seedCost: lmsr.getSeedCostLSN(c.params, c.priors.length),
        };
        return out;
    }

    out.expected = {
        prices: lmsr.getPricesLSN(c.q, c.params),
        effectiveB: lmsr.getEffectiveBN(c.q, c.params),
    };

    if (c.shares !== undefined) {
        out.expected.costToBuy = lmsr.getCostToBuyLSN(c.q, c.params, c.outcomeIdx, c.shares);
        out.expected.revenueFromSell = lmsr.getRevenueFromSellLSN(c.q, c.params, c.outcomeIdx, c.shares);
    }
    if (c.amount !== undefined) {
        out.expected.sharesToBuy = lmsr.getSharesToBuyLSN(c.q, c.params, c.outcomeIdx, c.amount);
    }
    if (c.targetPrice !== undefined) {
        out.expected.costToReachTargetPrice = lmsr.getCostToReachTargetPriceLSN(
            c.q, c.params, c.outcomeIdx, c.targetPrice,
        );
    }
    if (c.maxImpact !== undefined) {
        out.expected.maxAmountForPriceImpact = lmsr.getMaxAmountForPriceImpactLSN(
            c.q, c.params, c.outcomeIdx, c.maxImpact,
        );
    }
    return out;
});

console.log(JSON.stringify({ generatedAt: new Date().toISOString(), source: "mvp_token_call", count: fixtures.length, fixtures }, null, 2));
