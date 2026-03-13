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
        let high = amount * 10000; // Heuristic upper bound, assuming lowest possible price is around 0.0001
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
   * Calcula cuánto capital ($) se necesita invertir para llevar el precio marginal
   * (probabilidad instantánea) del LMSR hasta un `targetPrice` específico.
   * Usado por el Router Híbrido para no exceder el precio del Orderbook.
   */ getCostToReachTargetPrice(qYes, qNo, b, side, targetPrice) {
        const { pYes, pNo } = this.getPrice(qYes, qNo, b);
        const currentPrice = side === "YES" ? pYes : pNo;
        // Si el LMSR ya está más caro o igual al Orderbook (targetPrice), cuesta $0 (no minteamos)
        if (currentPrice >= targetPrice) {
            return 0;
        }
        let lowShares = 0;
        let highShares = b * 20;
        // Búsqueda binaria de shares necesarios para alcanzar targetPrice
        for(let i = 0; i < 100; i++){
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
            pYes,
            pNo,
            costAccumulated: cost,
            maxLoss,
            liquidityRemaining: maxLoss - cost + maxLoss,
            impliedOddsYes: pYes > 0 ? 1 / pYes : 0,
            impliedOddsNo: pNo > 0 ? 1 / pNo : 0
        };
    }
}
}),
"[project]/src/services/market.ts [app-route] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "MarketService",
    ()=>MarketService
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$prisma$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/lib/prisma.ts [app-route] (ecmascript)");
var __TURBOPACK__imported__module__$5b$externals$5d2f40$prisma$2f$client$2f$runtime$2f$library__$5b$external$5d$__$2840$prisma$2f$client$2f$runtime$2f$library$2c$__cjs$2c$__$5b$project$5d2f$node_modules$2f40$prisma$2f$client$29$__ = __turbopack_context__.i("[externals]/@prisma/client/runtime/library [external] (@prisma/client/runtime/library, cjs, [project]/node_modules/@prisma/client)");
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$services$2f$lmsr$2e$service$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/services/lmsr.service.ts [app-route] (ecmascript)");
;
;
;
class MarketService {
    static async getAll(status) {
        const markets = await __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$prisma$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__["prisma"].market.findMany({
            where: status ? {
                status
            } : undefined,
            orderBy: {
                createdAt: "desc"
            }
        });
        const lmsrService = new __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$services$2f$lmsr$2e$service$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__["LmsrService"]();
        return markets.map((market)=>{
            const prices = lmsrService.getPrice(market.qYes, market.qNo, market.b);
            return {
                ...market,
                yesPool: market.yesPool.toNumber(),
                noPool: market.noPool.toNumber(),
                odds: {
                    yesOdds: prices.pYes * 100,
                    noOdds: prices.pNo * 100
                }
            };
        });
    }
    static async getById(id) {
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
                    }
                },
                listings: true,
                lmsrSnapshots: {
                    orderBy: {
                        createdAt: "desc"
                    },
                    take: 100
                },
                orders: {
                    where: {
                        status: {
                            in: [
                                "OPEN",
                                "PARTIAL"
                            ]
                        }
                    },
                    orderBy: {
                        pricePerShare: "asc"
                    },
                    include: {
                        user: {
                            select: {
                                id: true,
                                username: true
                            }
                        }
                    }
                }
            }
        });
        if (!market) return null;
        const lmsrService = new __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$services$2f$lmsr$2e$service$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__["LmsrService"]();
        const prices = lmsrService.getPrice(market.qYes, market.qNo, market.b);
        // Calculate legacy-style odds for compatibility if needed, or just use LMSR prices * 100
        const odds = {
            yesOdds: prices.pYes * 100,
            noOdds: prices.pNo * 100
        };
        return {
            ...market,
            yesPool: market.yesPool.toNumber(),
            noPool: market.noPool.toNumber(),
            maxPool: market.maxPool?.toNumber() ?? null,
            orders: market.orders || [],
            odds,
            positions: market.positions.map((p)=>({
                    ...p,
                    amount: p.amount.toNumber(),
                    payout: p.payout?.toNumber(),
                    initialProbability: p.initialProbability.toNumber(),
                    shares: Number(p.shares || 0),
                    purchasePrice: Number(p.purchasePrice || 0),
                    // Calculate current fair value for position
                    fairValue: Number(p.shares || 0) * (p.side === "YES" ? prices.pYes : prices.pNo),
                    currentPrice: p.side === "YES" ? prices.pYes : prices.pNo
                })),
            history: market.lmsrSnapshots.map((s)=>{
                const p = s.pYesAfter > 1 ? s.pYesAfter / 100 : s.pYesAfter;
                return {
                    timestamp: s.createdAt,
                    price: p,
                    volume: s.cost,
                    qYes: s.qYesAfter,
                    qNo: s.qNoAfter
                };
            }).reverse()
        };
    }
    static async create(data) {
        // Default liquidity parameter b = 100 if not provided
        const b = data.b || 100;
        const lmsrService = new __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$services$2f$lmsr$2e$service$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__["LmsrService"]();
        const seedCost = lmsrService.getMaxLoss(b);
        return __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$prisma$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__["prisma"].market.create({
            data: {
                playerName: data.playerName,
                question: data.question,
                description: data.description,
                resolutionDate: data.resolutionDate,
                maxPool: data.maxPool ? new __TURBOPACK__imported__module__$5b$externals$5d2f40$prisma$2f$client$2f$runtime$2f$library__$5b$external$5d$__$2840$prisma$2f$client$2f$runtime$2f$library$2c$__cjs$2c$__$5b$project$5d2f$node_modules$2f40$prisma$2f$client$29$__["Decimal"](data.maxPool) : undefined,
                maxBetAmount: data.maxBetAmount ? Number(data.maxBetAmount) : undefined,
                maxPriceImpact: data.maxPriceImpact ? Number(data.maxPriceImpact) : undefined,
                status: "DRAFT",
                // LMSR Initialization
                b,
                qYes: 0,
                qNo: 0,
                seedCost,
                // Legacy/Audit history
                history: {
                    create: {
                        yesOdds: new __TURBOPACK__imported__module__$5b$externals$5d2f40$prisma$2f$client$2f$runtime$2f$library__$5b$external$5d$__$2840$prisma$2f$client$2f$runtime$2f$library$2c$__cjs$2c$__$5b$project$5d2f$node_modules$2f40$prisma$2f$client$29$__["Decimal"](50),
                        noOdds: new __TURBOPACK__imported__module__$5b$externals$5d2f40$prisma$2f$client$2f$runtime$2f$library__$5b$external$5d$__$2840$prisma$2f$client$2f$runtime$2f$library$2c$__cjs$2c$__$5b$project$5d2f$node_modules$2f40$prisma$2f$client$29$__["Decimal"](50),
                        totalPool: new __TURBOPACK__imported__module__$5b$externals$5d2f40$prisma$2f$client$2f$runtime$2f$library__$5b$external$5d$__$2840$prisma$2f$client$2f$runtime$2f$library$2c$__cjs$2c$__$5b$project$5d2f$node_modules$2f40$prisma$2f$client$29$__["Decimal"](0)
                    }
                },
                lmsrSnapshots: {
                    create: {
                        qYesBefore: 0,
                        qNoBefore: 0,
                        pYesBefore: 0.5,
                        side: "INIT",
                        deltaShares: 0,
                        cost: seedCost,
                        qYesAfter: 0,
                        qNoAfter: 0,
                        pYesAfter: 0.5,
                        triggerType: "INIT",
                        userId: "SYSTEM"
                    }
                }
            }
        });
    }
    static async activate(id) {
        return __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$prisma$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__["prisma"].market.update({
            where: {
                id
            },
            data: {
                status: "ACTIVE"
            }
        });
    }
    static async close(id) {
        return __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$prisma$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__["prisma"].market.update({
            where: {
                id
            },
            data: {
                status: "CLOSED"
            }
        });
    }
}
}),
"[project]/src/app/api/markets/[id]/route.ts [app-route] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "GET",
    ()=>GET,
    "PATCH",
    ()=>PATCH
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$server$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/server.js [app-route] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$services$2f$market$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/services/market.ts [app-route] (ecmascript)");
;
;
async function GET(_, { params }) {
    const { id } = await params;
    const market = await __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$services$2f$market$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__["MarketService"].getById(id);
    if (!market) {
        return __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$server$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__["NextResponse"].json({
            error: 'Market not found'
        }, {
            status: 404
        });
    }
    return __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$server$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__["NextResponse"].json(market);
}
async function PATCH(request, { params }) {
    const { id } = await params;
    const { action } = await request.json();
    if (action === 'activate') {
        const market = await __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$services$2f$market$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__["MarketService"].activate(id);
        return __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$server$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__["NextResponse"].json(market);
    }
    if (action === 'close') {
        const market = await __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$services$2f$market$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__["MarketService"].close(id);
        return __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$server$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__["NextResponse"].json(market);
    }
    return __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$server$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__["NextResponse"].json({
        error: 'Invalid action'
    }, {
        status: 400
    });
}
}),
];

//# sourceMappingURL=%5Broot-of-the-server%5D__20f21647._.js.map