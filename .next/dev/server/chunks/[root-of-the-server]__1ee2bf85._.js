module.exports = [
"[externals]/next/dist/compiled/next-server/app-route-turbo.runtime.dev.js [external] (next/dist/compiled/next-server/app-route-turbo.runtime.dev.js, cjs)", ((__turbopack_context__, module, exports) => {

const mod = __turbopack_context__.x("next/dist/compiled/next-server/app-route-turbo.runtime.dev.js", () => require("next/dist/compiled/next-server/app-route-turbo.runtime.dev.js"));

module.exports = mod;
}),
"[externals]/next/dist/compiled/@opentelemetry/api [external] (next/dist/compiled/@opentelemetry/api, cjs)", ((__turbopack_context__, module, exports) => {

const mod = __turbopack_context__.x("next/dist/compiled/@opentelemetry/api", () => require("next/dist/compiled/@opentelemetry/api"));

module.exports = mod;
}),
"[externals]/next/dist/compiled/next-server/app-page-turbo.runtime.dev.js [external] (next/dist/compiled/next-server/app-page-turbo.runtime.dev.js, cjs)", ((__turbopack_context__, module, exports) => {

const mod = __turbopack_context__.x("next/dist/compiled/next-server/app-page-turbo.runtime.dev.js", () => require("next/dist/compiled/next-server/app-page-turbo.runtime.dev.js"));

module.exports = mod;
}),
"[externals]/next/dist/server/app-render/work-unit-async-storage.external.js [external] (next/dist/server/app-render/work-unit-async-storage.external.js, cjs)", ((__turbopack_context__, module, exports) => {

const mod = __turbopack_context__.x("next/dist/server/app-render/work-unit-async-storage.external.js", () => require("next/dist/server/app-render/work-unit-async-storage.external.js"));

module.exports = mod;
}),
"[externals]/next/dist/server/app-render/work-async-storage.external.js [external] (next/dist/server/app-render/work-async-storage.external.js, cjs)", ((__turbopack_context__, module, exports) => {

const mod = __turbopack_context__.x("next/dist/server/app-render/work-async-storage.external.js", () => require("next/dist/server/app-render/work-async-storage.external.js"));

module.exports = mod;
}),
"[externals]/next/dist/shared/lib/no-fallback-error.external.js [external] (next/dist/shared/lib/no-fallback-error.external.js, cjs)", ((__turbopack_context__, module, exports) => {

const mod = __turbopack_context__.x("next/dist/shared/lib/no-fallback-error.external.js", () => require("next/dist/shared/lib/no-fallback-error.external.js"));

module.exports = mod;
}),
"[externals]/next/dist/server/app-render/after-task-async-storage.external.js [external] (next/dist/server/app-render/after-task-async-storage.external.js, cjs)", ((__turbopack_context__, module, exports) => {

const mod = __turbopack_context__.x("next/dist/server/app-render/after-task-async-storage.external.js", () => require("next/dist/server/app-render/after-task-async-storage.external.js"));

module.exports = mod;
}),
"[project]/src/lib/prisma.ts [app-route] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "prisma",
    ()=>prisma
]);
var __TURBOPACK__imported__module__$5b$externals$5d2f40$prisma$2f$client__$5b$external$5d$__$2840$prisma$2f$client$2c$__cjs$2c$__$5b$project$5d2f$node_modules$2f40$prisma$2f$client$29$__ = __turbopack_context__.i("[externals]/@prisma/client [external] (@prisma/client, cjs, [project]/node_modules/@prisma/client)");
;
const globalForPrisma = globalThis;
const prisma = globalForPrisma.prisma || new __TURBOPACK__imported__module__$5b$externals$5d2f40$prisma$2f$client__$5b$external$5d$__$2840$prisma$2f$client$2c$__cjs$2c$__$5b$project$5d2f$node_modules$2f40$prisma$2f$client$29$__["PrismaClient"]();
if ("TURBOPACK compile-time truthy", 1) globalForPrisma.prisma = prisma;
}),
"[project]/src/services/lmsr.service.ts [app-route] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "LmsrService",
    ()=>LmsrService
]);
class LmsrService {
    /**
   * Cost function C(q) = b * ln(e^(qYes/b) + e^(qNo/b))
   * Uses log-sum-exp trick for numerical stability
   */ costFunction(qYes, qNo, b) {
        const maxQ = Math.max(qYes / b, qNo / b);
        return b * (maxQ + Math.log(Math.exp(qYes / b - maxQ) + Math.exp(qNo / b - maxQ)));
    }
    /**
   * Instantaneous price (probability) of an outcome
   * P_yes = e^(qYes/b) / (e^(qYes/b) + e^(qNo/b))
   */ getPrice(qYes, qNo, b) {
        const expYes = Math.exp(qYes / b);
        const expNo = Math.exp(qNo / b);
        const sum = expYes + expNo;
        // Handle potential overflow/underflow if b is very small or q is very large
        if (!isFinite(expYes) || !isFinite(expNo) || !isFinite(sum)) {
            // Fallback: if qYes >>> qNo, pYes -> 1
            if (qYes > qNo) return {
                pYes: 1,
                pNo: 0
            };
            else return {
                pYes: 0,
                pNo: 1
            };
        }
        return {
            pYes: expYes / sum,
            pNo: expNo / sum
        };
    }
    /**
   * Cost to buy deltaShares of a specific side
   * Cost = C(new) - C(old)
   */ getCostToBuy(qYes, qNo, b, side, deltaShares) {
        const before = this.costFunction(qYes, qNo, b);
        const after = side === "YES" ? this.costFunction(qYes + deltaShares, qNo, b) : this.costFunction(qYes, qNo + deltaShares, b);
        return after - before;
    }
    /**
   * Calculate how many shares can be bought for a fixed amount of money
   * Uses binary search as the inverse of costFunction is not easily solvable analytically for delta
   */ getSharesToBuy(qYes, qNo, b, side, amount, tolerance = 1e-6) {
        let low = 0;
        let high = amount * 10; // Heuristic upper bound, usually price < 1 so shares > amount
        // Binary search for 100 iterations (sufficient precision)
        for(let i = 0; i < 100; i++){
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
   * Calcula el monto máximo permitido para una transacción
   * dado un límite de price impact en porcentaje
   */ getMaxAmountForPriceImpact(qYes, qNo, b, side, maxImpactPercent) {
        const { pYes, pNo } = this.getPrice(qYes, qNo, b);
        const currentPrice = side === "YES" ? pYes : pNo;
        const maxPrice = Math.min(currentPrice + maxImpactPercent / 100, 0.99);
        // Buscar binariamente cuántos shares llevan el precio hasta maxPrice
        let low = 0;
        let high = b * 20;
        for(let i = 0; i < 100; i++){
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
   */ validateBetAmount(amount, qYes, qNo, b, side, maxBetAmount, maxPriceImpact) {
        // 1. CAP fijo (Add 1 cent tolerance for float precision)
        if (maxBetAmount && amount > maxBetAmount + 0.01) {
            return {
                allowed: false,
                maxAllowed: maxBetAmount,
                reason: `El monto máximo por transacción es $${maxBetAmount}`
            };
        }
        // 2. CAP dinámico por price impact (si está configurado)
        if (maxPriceImpact) {
            const maxByImpact = this.getMaxAmountForPriceImpact(qYes, qNo, b, side, maxPriceImpact);
            if (amount > maxByImpact + 0.01) {
                return {
                    allowed: false,
                    maxAllowed: maxBetAmount ? Math.min(maxBetAmount, maxByImpact) : maxByImpact,
                    reason: `Esta compra movería el precio más del ${maxPriceImpact}% permitido`
                };
            }
        }
        return {
            allowed: true,
            maxAllowed: amount
        };
    }
    /**
   * Max loss (initial funding required) for the market maker
   * Max Loss = b * ln(2) for binary market
   */ getMaxLoss(b) {
        return b * Math.log(2);
    }
    /**
   * Market snapshot state
   */ getMarketState(qYes, qNo, b) {
        const { pYes, pNo } = this.getPrice(qYes, qNo, b);
        const cost = this.costFunction(qYes, qNo, b);
        const maxLoss = this.getMaxLoss(b);
        return {
            qYes,
            qNo,
            pYes: parseFloat((pYes * 100).toFixed(4)),
            pNo: parseFloat((pNo * 100).toFixed(4)),
            costAccumulated: cost,
            maxLoss,
            liquidityRemaining: maxLoss - cost + maxLoss,
            impliedOddsYes: pYes > 0 ? 1 / pYes : 0,
            impliedOddsNo: pNo > 0 ? 1 / pNo : 0
        };
    }
}
}),
"[project]/src/app/api/admin/markets/[id]/stats/route.ts [app-route] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "GET",
    ()=>GET,
    "dynamic",
    ()=>dynamic
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$server$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/server.js [app-route] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$prisma$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/lib/prisma.ts [app-route] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$services$2f$lmsr$2e$service$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/services/lmsr.service.ts [app-route] (ecmascript)");
;
;
;
const dynamic = "force-dynamic";
async function GET(request, { params }) {
    const { id } = await params;
    try {
        const market = await __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$prisma$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__["prisma"].market.findUnique({
            where: {
                id
            },
            include: {
                positions: {
                    include: {
                        currentOwner: {
                            select: {
                                id: true,
                                username: true
                            }
                        }
                    },
                    orderBy: {
                        createdAt: "desc"
                    }
                },
                lmsrSnapshots: {
                    orderBy: {
                        createdAt: "asc"
                    }
                }
            }
        });
        if (!market) {
            return __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$server$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__["NextResponse"].json({
                error: "Market not found"
            }, {
                status: 404
            });
        }
        const lmsrService = new __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$services$2f$lmsr$2e$service$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__["LmsrService"]();
        const prices = lmsrService.getPrice(market.qYes, market.qNo, market.b);
        // Stats Logic
        const purchases = market.positions.map((p)=>({
                id: p.id,
                username: p.currentOwner.username,
                side: p.side,
                amount: p.amount,
                initialProbability: p.initialProbability,
                createdAt: p.createdAt
            }));
        const priceHistory = market.lmsrSnapshots.map((s)=>({
                timestamp: s.createdAt,
                price: s.pYesAfter,
                yesOdds: s.pYesAfter * 100,
                noOdds: (1 - s.pYesAfter) * 100,
                totalPool: s.cost
            }));
        // Simulation
        // Payout per dollar invested NOW at current odds:
        // If I buy YES at 0.60, payout is $1. So multiplier is 1 / 0.60 = 1.66x
        const payoutYes = prices.pYes > 0 ? 1 / prices.pYes : 0;
        const payoutNo = prices.pNo > 0 ? 1 / prices.pNo : 0;
        // Commission Calculation
        const platformFeeRate = market.platformFee ? Number(market.platformFee) : 0.1;
        const platformCommission = market.positions.reduce((acc, p)=>{
            // Calculate fee based on the currently set platform fee rate
            const fee = p.amount.toNumber() * platformFeeRate;
            return acc + fee;
        }, 0);
        const stats = {
            // Basic Info
            id: market.id,
            question: market.question,
            status: market.status,
            // Pools (Legacy + LMSR)
            yesPool: market.yesPool,
            noPool: market.noPool,
            totalPool: market.yesPool.toNumber() + market.noPool.toNumber(),
            // LMSR Specifics
            b: market.b,
            qYes: market.qYes,
            qNo: market.qNo,
            seedCost: market.seedCost,
            currentPrices: prices,
            platformFee: market.platformFee,
            // Lists
            purchases,
            priceHistory,
            // Simulation
            simulation: {
                platformCommission,
                ifYesWins: {
                    payoutPerDollar: payoutYes
                },
                ifNoWins: {
                    payoutPerDollar: payoutNo
                }
            }
        };
        return __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$server$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__["NextResponse"].json(stats);
    } catch (error) {
        console.error("Error fetching admin market stats:", error);
        return __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$server$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__["NextResponse"].json({
            error: "Internal Server Error"
        }, {
            status: 500
        });
    }
}
}),
];

//# sourceMappingURL=%5Broot-of-the-server%5D__1ee2bf85._.js.map