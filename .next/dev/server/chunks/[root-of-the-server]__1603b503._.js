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
"[project]/src/services/odds-calculator.ts [app-route] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "OddsCalculator",
    ()=>OddsCalculator
]);
var __TURBOPACK__imported__module__$5b$externals$5d2f40$prisma$2f$client$2f$runtime$2f$library__$5b$external$5d$__$2840$prisma$2f$client$2f$runtime$2f$library$2c$__cjs$2c$__$5b$project$5d2f$node_modules$2f40$prisma$2f$client$29$__ = __turbopack_context__.i("[externals]/@prisma/client/runtime/library [external] (@prisma/client/runtime/library, cjs, [project]/node_modules/@prisma/client)");
;
class OddsCalculator {
    static calculateOdds(yesPool, noPool) {
        const yes = new __TURBOPACK__imported__module__$5b$externals$5d2f40$prisma$2f$client$2f$runtime$2f$library__$5b$external$5d$__$2840$prisma$2f$client$2f$runtime$2f$library$2c$__cjs$2c$__$5b$project$5d2f$node_modules$2f40$prisma$2f$client$29$__["Decimal"](yesPool);
        const no = new __TURBOPACK__imported__module__$5b$externals$5d2f40$prisma$2f$client$2f$runtime$2f$library__$5b$external$5d$__$2840$prisma$2f$client$2f$runtime$2f$library$2c$__cjs$2c$__$5b$project$5d2f$node_modules$2f40$prisma$2f$client$29$__["Decimal"](noPool);
        const total = yes.plus(no);
        if (total.isZero()) {
            return {
                yesOdds: 50,
                noOdds: 50,
                yesPayout: 2,
                noPayout: 2
            };
        }
        const yesOdds = yes.dividedBy(total).times(100);
        const noOdds = no.dividedBy(total).times(100);
        return {
            yesOdds: yesOdds.toNumber(),
            noOdds: noOdds.toNumber(),
            yesPayout: this.calculatePayout(yes, total, 0.1).toNumber(),
            noPayout: this.calculatePayout(no, total, 0.1).toNumber()
        };
    }
    static calculatePayout(sidePool, totalPool, fee) {
        if (sidePool.isZero()) return new __TURBOPACK__imported__module__$5b$externals$5d2f40$prisma$2f$client$2f$runtime$2f$library__$5b$external$5d$__$2840$prisma$2f$client$2f$runtime$2f$library$2c$__cjs$2c$__$5b$project$5d2f$node_modules$2f40$prisma$2f$client$29$__["Decimal"](0);
        const netPool = totalPool.times(1 - fee);
        return netPool.dividedBy(sidePool);
    }
    static calculateFairValue(position, market) {
        const odds = this.calculateOdds(market.yesPool, market.noPool);
        const payout = position.side === 'YES' ? odds.yesPayout : odds.noPayout;
        const potentialReturn = new __TURBOPACK__imported__module__$5b$externals$5d2f40$prisma$2f$client$2f$runtime$2f$library__$5b$external$5d$__$2840$prisma$2f$client$2f$runtime$2f$library$2c$__cjs$2c$__$5b$project$5d2f$node_modules$2f40$prisma$2f$client$29$__["Decimal"](position.amount).times(payout);
        return potentialReturn.times(0.95);
    }
}
}),
"[project]/src/services/balance.ts [app-route] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "BalanceService",
    ()=>BalanceService
]);
var __TURBOPACK__imported__module__$5b$externals$5d2f40$prisma$2f$client$2f$runtime$2f$library__$5b$external$5d$__$2840$prisma$2f$client$2f$runtime$2f$library$2c$__cjs$2c$__$5b$project$5d2f$node_modules$2f40$prisma$2f$client$29$__ = __turbopack_context__.i("[externals]/@prisma/client/runtime/library [external] (@prisma/client/runtime/library, cjs, [project]/node_modules/@prisma/client)");
;
class BalanceService {
    static async deduct(tx, userId, amount, type, description, reference) {
        const user = await tx.user.findUniqueOrThrow({
            where: {
                id: userId
            }
        });
        const amountDec = new __TURBOPACK__imported__module__$5b$externals$5d2f40$prisma$2f$client$2f$runtime$2f$library__$5b$external$5d$__$2840$prisma$2f$client$2f$runtime$2f$library$2c$__cjs$2c$__$5b$project$5d2f$node_modules$2f40$prisma$2f$client$29$__["Decimal"](amount);
        const balanceBefore = new __TURBOPACK__imported__module__$5b$externals$5d2f40$prisma$2f$client$2f$runtime$2f$library__$5b$external$5d$__$2840$prisma$2f$client$2f$runtime$2f$library$2c$__cjs$2c$__$5b$project$5d2f$node_modules$2f40$prisma$2f$client$29$__["Decimal"](user.balance);
        const balanceAfter = balanceBefore.minus(amountDec);
        if (balanceAfter.lessThan(0)) {
            throw new Error('Insufficient balance');
        }
        await tx.user.update({
            where: {
                id: userId
            },
            data: {
                balance: balanceAfter
            }
        });
        await tx.transaction.create({
            data: {
                userId,
                type,
                amount: amountDec.negated(),
                balanceBefore,
                balanceAfter,
                reference,
                description
            }
        });
        return balanceAfter;
    }
    static async credit(tx, userId, amount, type, description, reference) {
        const user = await tx.user.findUniqueOrThrow({
            where: {
                id: userId
            }
        });
        const amountDec = new __TURBOPACK__imported__module__$5b$externals$5d2f40$prisma$2f$client$2f$runtime$2f$library__$5b$external$5d$__$2840$prisma$2f$client$2f$runtime$2f$library$2c$__cjs$2c$__$5b$project$5d2f$node_modules$2f40$prisma$2f$client$29$__["Decimal"](amount);
        const balanceBefore = new __TURBOPACK__imported__module__$5b$externals$5d2f40$prisma$2f$client$2f$runtime$2f$library__$5b$external$5d$__$2840$prisma$2f$client$2f$runtime$2f$library$2c$__cjs$2c$__$5b$project$5d2f$node_modules$2f40$prisma$2f$client$29$__["Decimal"](user.balance);
        const balanceAfter = balanceBefore.plus(amountDec);
        await tx.user.update({
            where: {
                id: userId
            },
            data: {
                balance: balanceAfter
            }
        });
        await tx.transaction.create({
            data: {
                userId,
                type,
                amount: amountDec,
                balanceBefore,
                balanceAfter,
                reference,
                description
            }
        });
        return balanceAfter;
    }
}
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
"[project]/src/services/position.ts [app-route] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "PositionService",
    ()=>PositionService
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$prisma$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/lib/prisma.ts [app-route] (ecmascript)");
var __TURBOPACK__imported__module__$5b$externals$5d2f40$prisma$2f$client$2f$runtime$2f$library__$5b$external$5d$__$2840$prisma$2f$client$2f$runtime$2f$library$2c$__cjs$2c$__$5b$project$5d2f$node_modules$2f40$prisma$2f$client$29$__ = __turbopack_context__.i("[externals]/@prisma/client/runtime/library [external] (@prisma/client/runtime/library, cjs, [project]/node_modules/@prisma/client)");
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$services$2f$odds$2d$calculator$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/services/odds-calculator.ts [app-route] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$services$2f$balance$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/services/balance.ts [app-route] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$services$2f$lmsr$2e$service$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/services/lmsr.service.ts [app-route] (ecmascript)");
;
;
;
;
;
class PositionService {
    static async create(data) {
        return __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$prisma$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__["prisma"].$transaction(async (tx)=>{
            const market = await tx.market.findUnique({
                where: {
                    id: data.marketId
                }
            });
            if (!market || market.status !== "ACTIVE") {
                throw new Error("Market is not active");
            }
            const user = await tx.user.findUnique({
                where: {
                    id: data.userId
                }
            });
            if (!user) throw new Error("User not found");
            const amount = new __TURBOPACK__imported__module__$5b$externals$5d2f40$prisma$2f$client$2f$runtime$2f$library__$5b$external$5d$__$2840$prisma$2f$client$2f$runtime$2f$library$2c$__cjs$2c$__$5b$project$5d2f$node_modules$2f40$prisma$2f$client$29$__["Decimal"](data.amount);
            if (new __TURBOPACK__imported__module__$5b$externals$5d2f40$prisma$2f$client$2f$runtime$2f$library__$5b$external$5d$__$2840$prisma$2f$client$2f$runtime$2f$library$2c$__cjs$2c$__$5b$project$5d2f$node_modules$2f40$prisma$2f$client$29$__["Decimal"](user.balance).lessThan(amount)) {
                throw new Error("Insufficient balance");
            }
            // LMSR Logic
            const lmsrService = new __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$services$2f$lmsr$2e$service$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__["LmsrService"]();
            // Market specific configs (no global fallbacks - explicit limits only)
            const maxBetAmount = market.maxBetAmount ?? null;
            const maxPriceImpact = market.maxPriceImpact ?? null;
            const validation = lmsrService.validateBetAmount(data.amount, market.qYes, market.qNo, market.b, data.side, maxBetAmount, maxPriceImpact);
            if (!validation.allowed) {
                throw new Error(validation.reason || "Monto excede los límites permitidos");
            }
            // State before
            const stateBefore = lmsrService.getMarketState(market.qYes, market.qNo, market.b);
            // Apply platform fee from market config
            const platformFeeRate = market.platformFee ? Number(market.platformFee) : 0.1;
            const feeAmount = amount.toNumber() * platformFeeRate;
            const netAmount = amount.toNumber() - feeAmount;
            // Calculate shares to buy
            const shares = lmsrService.getSharesToBuy(market.qYes, market.qNo, market.b, data.side, netAmount);
            const cost = lmsrService.getCostToBuy(market.qYes, market.qNo, market.b, data.side, shares);
            const avgCostPerShare = shares > 0 ? cost / shares : 0;
            // Update Market State
            const newQYes = data.side === "YES" ? market.qYes + shares : market.qYes;
            const newQNo = data.side === "NO" ? market.qNo + shares : market.qNo;
            const stateAfter = lmsrService.getMarketState(newQYes, newQNo, market.b);
            // Deduct balance
            await __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$services$2f$balance$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__["BalanceService"].deduct(tx, user.id, amount, "BET_PLACED", `Bet ${data.amount} on ${data.side}`, data.marketId);
            // Create Position
            const position = await tx.position.create({
                data: {
                    marketId: data.marketId,
                    originalOwnerId: data.userId,
                    currentOwnerId: data.userId,
                    side: data.side,
                    amount,
                    status: "ACTIVE",
                    shares,
                    avgCostPerShare,
                    totalCost: cost
                },
                include: {
                    market: true,
                    currentOwner: true
                }
            });
            // Update Market
            await tx.market.update({
                where: {
                    id: data.marketId
                },
                data: {
                    qYes: newQYes,
                    qNo: newQNo,
                    // Update legacy pools for audit/volume tracking
                    yesPool: data.side === "YES" ? {
                        increment: amount
                    } : undefined,
                    noPool: data.side === "NO" ? {
                        increment: amount
                    } : undefined
                }
            });
            // Create LMSR Snapshot
            await tx.lmsrSnapshot.create({
                data: {
                    marketId: data.marketId,
                    userId: data.userId,
                    side: data.side,
                    deltaShares: shares,
                    cost,
                    qYesBefore: stateBefore.qYes,
                    qNoBefore: stateBefore.qNo,
                    pYesBefore: stateBefore.pYes,
                    qYesAfter: stateAfter.qYes,
                    qNoAfter: stateAfter.qNo,
                    pYesAfter: stateAfter.pYes,
                    triggerType: "BUY"
                }
            });
            return {
                ...position,
                amount: position.amount.toNumber(),
                initialProbability: stateAfter.pYes
            };
        });
    }
    static async getUserPositions(userId, marketId) {
        const positions = await __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$prisma$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__["prisma"].position.findMany({
            where: {
                currentOwnerId: userId,
                ...marketId && {
                    marketId
                }
            },
            include: {
                market: true,
                listing: true
            },
            orderBy: {
                createdAt: "desc"
            }
        });
        return positions.map((p)=>{
            const odds = __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$services$2f$odds$2d$calculator$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__["OddsCalculator"].calculateOdds(p.market.yesPool, p.market.noPool);
            const currentPrice = new __TURBOPACK__imported__module__$5b$externals$5d2f40$prisma$2f$client$2f$runtime$2f$library__$5b$external$5d$__$2840$prisma$2f$client$2f$runtime$2f$library$2c$__cjs$2c$__$5b$project$5d2f$node_modules$2f40$prisma$2f$client$29$__["Decimal"](p.side === "YES" ? odds.yesOdds : odds.noOdds).dividedBy(100);
            // Fallback for legacy positions: derive shares from initialProbability
            const initialProb = p.initialProbability?.toNumber() || 50;
            const legacyPrice = new __TURBOPACK__imported__module__$5b$externals$5d2f40$prisma$2f$client$2f$runtime$2f$library__$5b$external$5d$__$2840$prisma$2f$client$2f$runtime$2f$library$2c$__cjs$2c$__$5b$project$5d2f$node_modules$2f40$prisma$2f$client$29$__["Decimal"](initialProb).dividedBy(100);
            const purchasePrice = p.purchasePrice && !p.purchasePrice.isZero() ? new __TURBOPACK__imported__module__$5b$externals$5d2f40$prisma$2f$client$2f$runtime$2f$library__$5b$external$5d$__$2840$prisma$2f$client$2f$runtime$2f$library$2c$__cjs$2c$__$5b$project$5d2f$node_modules$2f40$prisma$2f$client$29$__["Decimal"](p.purchasePrice) : legacyPrice;
            const shares = p.shares && !p.shares.isZero() ? new __TURBOPACK__imported__module__$5b$externals$5d2f40$prisma$2f$client$2f$runtime$2f$library__$5b$external$5d$__$2840$prisma$2f$client$2f$runtime$2f$library$2c$__cjs$2c$__$5b$project$5d2f$node_modules$2f40$prisma$2f$client$29$__["Decimal"](p.shares) : p.amount.dividedBy(legacyPrice);
            // Total current value if sold (shares * currentPrice)
            const fairValue = shares.times(currentPrice);
            // Total potential return if wins (shares * $1)
            const potentialReturn = shares.toNumber();
            return {
                ...p,
                amount: p.amount.toNumber(),
                payout: p.payout?.toNumber(),
                initialProbability: initialProb,
                shares: shares.toNumber(),
                purchasePrice: purchasePrice.toNumber(),
                currentPrice: currentPrice.toNumber(),
                fairValue: fairValue.toNumber(),
                currentPayout: p.side === "YES" ? odds.yesPayout : odds.noPayout,
                potentialReturn,
                market: {
                    ...p.market,
                    yesPool: p.market.yesPool.toNumber(),
                    noPool: p.market.noPool.toNumber(),
                    maxPool: p.market.maxPool?.toNumber(),
                    platformFee: p.market.platformFee?.toNumber()
                },
                listing: p.listing ? {
                    ...p.listing,
                    askPrice: p.listing.askPrice.toNumber(),
                    suggestedPrice: p.listing.suggestedPrice.toNumber(),
                    platformFee: p.listing.platformFee.toNumber()
                } : null
            };
        });
    }
    static async getUserConsolidatedPositions(userId, marketId) {
        const rawPositions = await __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$prisma$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__["prisma"].position.findMany({
            where: {
                currentOwnerId: userId,
                marketId: marketId || undefined
            },
            include: {
                market: true,
                listing: true
            },
            orderBy: {
                createdAt: "desc"
            }
        });
        const groups = {};
        for (const p of rawPositions){
            // Group active positions by market and side
            // Keep inactive (RESOLVED) positions separate to show history correctly
            const key = p.status === "ACTIVE" ? `${p.marketId}-${p.side}` : `resolved-${p.id}`;
            if (!groups[key]) {
                groups[key] = {
                    id: p.id,
                    marketId: p.marketId,
                    market: {
                        id: p.market.id,
                        playerName: p.market.playerName,
                        question: p.market.question,
                        status: p.market.status,
                        yesPool: p.market.yesPool.toNumber(),
                        noPool: p.market.noPool.toNumber()
                    },
                    side: p.side,
                    shares: new __TURBOPACK__imported__module__$5b$externals$5d2f40$prisma$2f$client$2f$runtime$2f$library__$5b$external$5d$__$2840$prisma$2f$client$2f$runtime$2f$library$2c$__cjs$2c$__$5b$project$5d2f$node_modules$2f40$prisma$2f$client$29$__["Decimal"](0),
                    amount: new __TURBOPACK__imported__module__$5b$externals$5d2f40$prisma$2f$client$2f$runtime$2f$library__$5b$external$5d$__$2840$prisma$2f$client$2f$runtime$2f$library$2c$__cjs$2c$__$5b$project$5d2f$node_modules$2f40$prisma$2f$client$29$__["Decimal"](0),
                    totalFees: new __TURBOPACK__imported__module__$5b$externals$5d2f40$prisma$2f$client$2f$runtime$2f$library__$5b$external$5d$__$2840$prisma$2f$client$2f$runtime$2f$library$2c$__cjs$2c$__$5b$project$5d2f$node_modules$2f40$prisma$2f$client$29$__["Decimal"](0),
                    status: p.status,
                    isForSale: false,
                    createdAt: p.createdAt,
                    history: []
                };
            }
            const pShares = new __TURBOPACK__imported__module__$5b$externals$5d2f40$prisma$2f$client$2f$runtime$2f$library__$5b$external$5d$__$2840$prisma$2f$client$2f$runtime$2f$library$2c$__cjs$2c$__$5b$project$5d2f$node_modules$2f40$prisma$2f$client$29$__["Decimal"](p.shares || 0);
            const feeAmount = p.amount.minus(new __TURBOPACK__imported__module__$5b$externals$5d2f40$prisma$2f$client$2f$runtime$2f$library__$5b$external$5d$__$2840$prisma$2f$client$2f$runtime$2f$library$2c$__cjs$2c$__$5b$project$5d2f$node_modules$2f40$prisma$2f$client$29$__["Decimal"](p.totalCost || 0));
            groups[key].shares = groups[key].shares.plus(pShares);
            groups[key].amount = groups[key].amount.plus(p.amount);
            groups[key].totalFees = groups[key].totalFees.plus(feeAmount);
            groups[key].history.push({
                id: p.id,
                amount: p.amount.toNumber(),
                shares: pShares.toNumber(),
                createdAt: p.createdAt,
                purchasePrice: p.purchasePrice?.toNumber()
            });
            if (p.isForSale) groups[key].isForSale = true;
        }
        return Object.values(groups).map((g)=>{
            const odds = __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$services$2f$odds$2d$calculator$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__["OddsCalculator"].calculateOdds(new __TURBOPACK__imported__module__$5b$externals$5d2f40$prisma$2f$client$2f$runtime$2f$library__$5b$external$5d$__$2840$prisma$2f$client$2f$runtime$2f$library$2c$__cjs$2c$__$5b$project$5d2f$node_modules$2f40$prisma$2f$client$29$__["Decimal"](g.market.yesPool), new __TURBOPACK__imported__module__$5b$externals$5d2f40$prisma$2f$client$2f$runtime$2f$library__$5b$external$5d$__$2840$prisma$2f$client$2f$runtime$2f$library$2c$__cjs$2c$__$5b$project$5d2f$node_modules$2f40$prisma$2f$client$29$__["Decimal"](g.market.noPool));
            const currentPrice = new __TURBOPACK__imported__module__$5b$externals$5d2f40$prisma$2f$client$2f$runtime$2f$library__$5b$external$5d$__$2840$prisma$2f$client$2f$runtime$2f$library$2c$__cjs$2c$__$5b$project$5d2f$node_modules$2f40$prisma$2f$client$29$__["Decimal"](g.side === "YES" ? odds.yesOdds : odds.noOdds).dividedBy(100);
            const sharesNum = g.shares.toNumber();
            const amountNum = g.amount.toNumber();
            const avgPrice = sharesNum > 0 ? amountNum / sharesNum : 0;
            const fairValue = sharesNum * currentPrice.toNumber();
            const potentialReturn = sharesNum; // wins $1 per share
            return {
                ...g,
                shares: sharesNum,
                amount: amountNum,
                totalFees: g.totalFees.toNumber(),
                purchasePrice: avgPrice,
                currentPrice: currentPrice.toNumber(),
                fairValue,
                potentialReturn,
                currentPayout: g.side === "YES" ? odds.yesPayout : odds.noPayout,
                breakEvenPrice: avgPrice
            };
        });
    }
    static async getById(id) {
        const position = await __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$prisma$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__["prisma"].position.findUnique({
            where: {
                id
            },
            include: {
                market: true,
                currentOwner: true,
                listing: true
            }
        });
        if (!position) return null;
        const odds = __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$services$2f$odds$2d$calculator$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__["OddsCalculator"].calculateOdds(position.market.yesPool, position.market.noPool);
        const currentPrice = new __TURBOPACK__imported__module__$5b$externals$5d2f40$prisma$2f$client$2f$runtime$2f$library__$5b$external$5d$__$2840$prisma$2f$client$2f$runtime$2f$library$2c$__cjs$2c$__$5b$project$5d2f$node_modules$2f40$prisma$2f$client$29$__["Decimal"](position.side === "YES" ? odds.yesOdds : odds.noOdds).dividedBy(100);
        // Fallback for legacy
        const initialProb = position.initialProbability?.toNumber() || 50;
        const legacyPrice = new __TURBOPACK__imported__module__$5b$externals$5d2f40$prisma$2f$client$2f$runtime$2f$library__$5b$external$5d$__$2840$prisma$2f$client$2f$runtime$2f$library$2c$__cjs$2c$__$5b$project$5d2f$node_modules$2f40$prisma$2f$client$29$__["Decimal"](initialProb).dividedBy(100);
        const shares = position.shares && !position.shares.isZero() ? new __TURBOPACK__imported__module__$5b$externals$5d2f40$prisma$2f$client$2f$runtime$2f$library__$5b$external$5d$__$2840$prisma$2f$client$2f$runtime$2f$library$2c$__cjs$2c$__$5b$project$5d2f$node_modules$2f40$prisma$2f$client$29$__["Decimal"](position.shares) : position.amount.dividedBy(legacyPrice);
        const purchasePrice = position.purchasePrice && !position.purchasePrice.isZero() ? new __TURBOPACK__imported__module__$5b$externals$5d2f40$prisma$2f$client$2f$runtime$2f$library__$5b$external$5d$__$2840$prisma$2f$client$2f$runtime$2f$library$2c$__cjs$2c$__$5b$project$5d2f$node_modules$2f40$prisma$2f$client$29$__["Decimal"](position.purchasePrice) : legacyPrice;
        const fairValue = shares.times(currentPrice);
        return {
            ...position,
            amount: position.amount.toNumber(),
            payout: position.payout?.toNumber(),
            initialProbability: initialProb,
            shares: shares.toNumber(),
            purchasePrice: purchasePrice.toNumber(),
            currentPrice: currentPrice.toNumber(),
            fairValue: fairValue.toNumber(),
            currentPayout: position.side === "YES" ? odds.yesPayout : odds.noPayout,
            potentialReturn: shares.toNumber(),
            market: {
                ...position.market,
                yesPool: position.market.yesPool.toNumber(),
                noPool: position.market.noPool.toNumber(),
                maxPool: position.market.maxPool?.toNumber(),
                platformFee: position.market.platformFee?.toNumber()
            }
        };
    }
    /**
   * Split a position into two parts for fractional selling.
   * @param tx - Prisma transaction client
   * @param positionId - The position to split
   * @param userId - The current owner (for validation)
   * @param splitAmount - The amount to split off (for listing)
   * @returns The new position created from the split
   */ static async split(tx, positionId, userId, splitAmount) {
        const position = await tx.position.findUnique({
            where: {
                id: positionId
            },
            include: {
                market: true
            }
        });
        if (!position) throw new Error("Position not found");
        if (position.currentOwnerId !== userId) throw new Error("Not position owner");
        if (position.isForSale) throw new Error("Position already listed");
        if (position.market.status !== "ACTIVE") throw new Error("Market not active");
        const splitDecimal = new __TURBOPACK__imported__module__$5b$externals$5d2f40$prisma$2f$client$2f$runtime$2f$library__$5b$external$5d$__$2840$prisma$2f$client$2f$runtime$2f$library$2c$__cjs$2c$__$5b$project$5d2f$node_modules$2f40$prisma$2f$client$29$__["Decimal"](splitAmount);
        if (splitDecimal.lessThanOrEqualTo(0)) {
            throw new Error("Split amount must be positive");
        }
        if (splitDecimal.greaterThanOrEqualTo(position.amount)) {
            throw new Error("Split amount must be less than position amount");
        }
        // Reduce the original position amount
        await tx.position.update({
            where: {
                id: positionId
            },
            data: {
                amount: position.amount.minus(splitDecimal)
            }
        });
        // Create a new position with the split amount
        const newPosition = await tx.position.create({
            data: {
                marketId: position.marketId,
                originalOwnerId: position.originalOwnerId,
                currentOwnerId: position.currentOwnerId,
                side: position.side,
                amount: splitDecimal,
                status: "ACTIVE",
                shares: position.shares.times(splitDecimal.dividedBy(position.amount)),
                purchasePrice: position.purchasePrice,
                isForSale: true
            },
            include: {
                market: true
            }
        });
        return newPosition;
    }
}
}),
"[project]/src/app/api/positions/route.ts [app-route] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "GET",
    ()=>GET,
    "POST",
    ()=>POST
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$server$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/server.js [app-route] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$services$2f$position$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/services/position.ts [app-route] (ecmascript)");
;
;
async function GET(request) {
    const userId = request.nextUrl.searchParams.get('userId');
    const marketId = request.nextUrl.searchParams.get('marketId');
    if (!userId) {
        return __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$server$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__["NextResponse"].json({
            error: 'userId required'
        }, {
            status: 400
        });
    }
    const positions = await __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$services$2f$position$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__["PositionService"].getUserConsolidatedPositions(userId, marketId || undefined);
    return __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$server$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__["NextResponse"].json(positions);
}
async function POST(request) {
    const { marketId, userId, side, amount } = await request.json();
    if (!marketId || !userId || !side || !amount) {
        return __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$server$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__["NextResponse"].json({
            error: 'Missing required fields'
        }, {
            status: 400
        });
    }
    if (![
        'YES',
        'NO'
    ].includes(side)) {
        return __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$server$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__["NextResponse"].json({
            error: 'Invalid side'
        }, {
            status: 400
        });
    }
    if (amount <= 0) {
        return __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$server$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__["NextResponse"].json({
            error: 'Amount must be positive'
        }, {
            status: 400
        });
    }
    try {
        const position = await __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$services$2f$position$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__["PositionService"].create({
            marketId,
            userId,
            side,
            amount
        });
        return __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$server$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__["NextResponse"].json(position, {
            status: 201
        });
    } catch (e) {
        const message = e instanceof Error ? e.message : 'Failed to create position';
        return __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$server$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__["NextResponse"].json({
            error: message
        }, {
            status: 400
        });
    }
}
}),
];

//# sourceMappingURL=%5Broot-of-the-server%5D__1603b503._.js.map