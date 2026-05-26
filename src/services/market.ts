import { prisma } from "@/lib/prisma";
import { Decimal } from "@prisma/client/runtime/library";
import { LmsrService } from "./lmsr.service";

export type MarketStatus =
  | "DRAFT"
  | "ACTIVE"
  | "CLOSED"
  | "RESOLVED"
  | "VOIDED";

export class MarketService {
  static async getAll(status?: MarketStatus, hidePaused = true) {
    const now = new Date();

    const markets = await prisma.market.findMany({
      where: {
        ...(status ? { status } : {}),
        // Hide paused markets from public listing
        // A market is "paused" if primaryMarketPaused=true OR scheduledAt already passed
        ...(hidePaused
          ? {
              primaryMarketPaused: false,
              OR: [
                { primaryPauseScheduledAt: null },
                { primaryPauseScheduledAt: { gt: now } },
              ],
            }
          : {}),
      },
      include: {
        outcomes: { orderBy: { displayOrder: "asc" } },
      },
      orderBy: { createdAt: "desc" },
    });

    const lmsrService = new LmsrService();

    return markets.map((market) => {
      const qVector = LmsrService.buildQVector(market.outcomes);
      const params = { b: market.b, alpha: market.alpha, bMin: market.bMin };
      const prices = lmsrService.getPricesLSN(qVector, params);

      const outcomesWithPrices = market.outcomes
        .sort((a, b) => a.displayOrder - b.displayOrder)
        .map((o, i) => ({
          id: o.id,
          name: o.name,
          color: o.color,
          probability: prices[i] * 100,
          pool: o.pool.toNumber(),
        }));

      return {
        ...market,
        totalPool: market.totalPool.toNumber(),
        outcomes: outcomesWithPrices,
        odds: {
          yesOdds: outcomesWithPrices[0]?.probability ?? 50,
          noOdds: outcomesWithPrices[1]?.probability ?? 50,
        },
      };
    });
  }

  static async getById(id: string) {
    const market = await prisma.market.findUnique({
      where: { id },
      include: {
        outcomes: { orderBy: { displayOrder: "asc" } },
        positions: {
          include: {
            currentOwner: { select: { id: true, username: true } },
            outcome: { select: { id: true, name: true } },
          },
        },
        listings: true,
        lmsrSnapshots: {
          orderBy: { createdAt: "desc" },
          take: 100,
        },
        orders: {
          where: { status: { in: ["OPEN", "PARTIAL"] } },
          orderBy: { pricePerShare: "asc" },
          include: {
            user: { select: { id: true, username: true } },
            outcome: { select: { id: true, name: true } },
          },
        },
      },
    });

    if (!market) return null;

    const lmsrService = new LmsrService();
    const qVector = LmsrService.buildQVector(market.outcomes);
    const params = { b: market.b, alpha: market.alpha, bMin: market.bMin };
    const effectiveB = lmsrService.getEffectiveBN(qVector, params);
    const prices = lmsrService.getPricesLSN(qVector, params);

    const outcomesWithPrices = market.outcomes.map((o, i) => ({
      id: o.id,
      name: o.name,
      color: o.color,
      displayOrder: o.displayOrder,
      qOutstanding: o.qOutstanding,
      pool: o.pool.toNumber(),
      probability: prices[i] * 100,
      price: prices[i],
    }));

    const Q = qVector.reduce((s, q) => s + q, 0);

    return {
      ...market,
      totalPool: market.totalPool.toNumber(),
      maxPool: market.maxPool?.toNumber() ?? null,
      outcomes: outcomesWithPrices,
      orders: market.orders,
      odds: {
        yesOdds: outcomesWithPrices[0]?.probability ?? 50,
        noOdds: outcomesWithPrices[1]?.probability ?? 50,
      },
      effectiveB,
      Q,
      isLiquiditySensitive: market.alpha != null,
      positions: market.positions.map((p) => {
        const outcomeIdx = outcomesWithPrices.findIndex(o => o.id === p.outcomeId);
        const outcomePrice = outcomeIdx >= 0 ? prices[outcomeIdx] : 0;
        return {
          ...p,
          amount: p.amount.toNumber(),
          payout: p.payout?.toNumber(),
          initialProbability: p.initialProbability.toNumber(),
          shares: Number(p.shares || 0),
          purchasePrice: Number(p.purchasePrice || 0),
          fairValue: Number(p.shares || 0) * outcomePrice,
          currentPrice: outcomePrice,
        };
      }),
      history: market.lmsrSnapshots
        .map((s: any) => {
          const pAfter = s.pAfter as Record<string, number>;
          const firstOutcome = outcomesWithPrices[0];
          const p = firstOutcome ? (pAfter[firstOutcome.id] ?? 0.5) : 0.5;
          return {
            timestamp: s.createdAt,
            price: p > 1 ? p / 100 : p,
            prices: pAfter,
            volume: s.cost,
            qAfter: s.qAfter,
            pAfter: s.pAfter,
          };
        })
        .reverse(),
    };
  }

  static async updateMeta(id: string, data: {
    question?: string;
    description?: string | null;
    resolutionDate?: Date;
    sport?: string | null;
    imageUrl?: string | null;
    bannerUrl?: string | null;
    isFeatured?: boolean;
    rules?: string | null;
    criterio?: string | null;
    tags?: string[];
  }) {
    return prisma.market.update({ where: { id }, data });
  }

  static async deleteMarket(id: string) {
    return prisma.$transaction(async (tx) => {
      // Manual cascade delete for relations missing onDelete: Cascade
      await tx.order.deleteMany({ where: { marketId: id } });
      await tx.marketRouterAuditLog.deleteMany({ where: { marketId: id } });
      
      // The rest are handled by onDelete: Cascade in prisma schema
      return tx.market.delete({ where: { id } });
    });
  }

  static async create(data: {
    playerName?: string;
    question: string;
    description?: string;
    resolutionDate: Date;
    maxPool?: number;
    b?: number;
    alpha?: number;
    bMin?: number;
    maxBetAmount?: number;
    maxPriceImpact?: number;
    outcomes: { name: string; initialProbability?: number; color?: string }[];
    sport?: string;
    imageUrl?: string;
    bannerUrl?: string;
    isFeatured?: boolean;
    rules?: string;
    criterio?: string;
    tags?: string[];
  }) {
    const lmsrService = new LmsrService();
    const useLS = data.alpha != null;
    const bMin = data.bMin ?? 100;
    const b = data.b ?? 100;
    const params = { b, alpha: data.alpha ?? null, bMin: useLS ? bMin : null };

    const outcomeNames = data.outcomes.map(o => o.name);
    const numOutcomes = outcomeNames.length;
    if (numOutcomes < 2) throw new Error("At least 2 outcomes required");

    const priors = data.outcomes.map(o => o.initialProbability ?? 1 / numOutcomes);
    const priorSum = priors.reduce((s, p) => s + p, 0);
    const normalizedPriors = priors.map(p => p / priorSum);

    const seedCost = lmsrService.getSeedCostLSN(params, numOutcomes);
    const qValues = lmsrService.getInitialQValuesLSN(params, normalizedPriors);

    const initialPrices = lmsrService.getPricesLSN(qValues, params);
    const oddsMap: Record<string, number> = {};
    outcomeNames.forEach((name, i) => {
      oddsMap[name] = initialPrices[i] * 100;
    });

    return prisma.market.create({
      data: {
        playerName: data.playerName,
        question: data.question,
        description: data.description,
        resolutionDate: data.resolutionDate,
        maxPool: data.maxPool ? new Decimal(data.maxPool) : undefined,
        maxBetAmount: data.maxBetAmount ? Number(data.maxBetAmount) : undefined,
        maxPriceImpact: data.maxPriceImpact ? Number(data.maxPriceImpact) : undefined,
        sport: data.sport,
        imageUrl: data.imageUrl,
        bannerUrl: data.bannerUrl,
        isFeatured: data.isFeatured ?? false,
        rules: data.rules,
        criterio: data.criterio,
        tags: data.tags ?? [],
        status: "DRAFT",
        b,
        alpha: useLS ? data.alpha : null,
        bMin: useLS ? bMin : null,
        seedCost,
        outcomes: {
          create: data.outcomes.map((o, i) => ({
            name: o.name,
            color: o.color || null,
            qOutstanding: qValues[i],
            displayOrder: i,
          })),
        },
        history: {
          create: {
            odds: oddsMap,
            totalPool: new Decimal(0),
          },
        },
      },
      include: {
        outcomes: { orderBy: { displayOrder: "asc" } },
      },
    });
  }

  static async activate(id: string) {
    return prisma.market.update({
      where: { id },
      data: { status: "ACTIVE" },
    });
  }

  static async close(id: string) {
    return prisma.market.update({
      where: { id },
      data: { status: "CLOSED" },
    });
  }

  static isPrimaryPaused(market: {
    primaryMarketPaused: boolean;
    primaryPauseScheduledAt: Date | null;
  }): boolean {
    if (market.primaryMarketPaused) return true;
    if (
      market.primaryPauseScheduledAt &&
      new Date(market.primaryPauseScheduledAt) <= new Date()
    )
      return true;
    return false;
  }

  static async pausePrimary(id: string, opts: { scheduledAt?: Date } = {}) {
    if (opts.scheduledAt) {
      return prisma.market.update({
        where: { id },
        data: {
          primaryPauseScheduledAt: opts.scheduledAt,
          primaryMarketPaused: false,
        },
      });
    }
    return prisma.market.update({
      where: { id },
      data: { primaryMarketPaused: true, primaryPauseScheduledAt: null },
    });
  }

  static async unpausePrimary(id: string) {
    return prisma.market.update({
      where: { id },
      data: { primaryMarketPaused: false, primaryPauseScheduledAt: null },
    });
  }

  static async recoverInactiveSeed(id: string, options: { minDaysOpen?: number } = {}) {
    const minDaysOpen = options.minDaysOpen ?? 0;

    return prisma.$transaction(async (tx) => {
      const market = await tx.market.findUnique({
        where: { id },
        include: { positions: { select: { id: true }, take: 1 } },
      });

      if (!market) throw new Error("Market not found");
      if (!["DRAFT", "ACTIVE"].includes(market.status)) {
        throw new Error("Only DRAFT or ACTIVE markets can be recovered");
      }
      if (market.positions.length > 0) {
        throw new Error("Market has trading activity — use resolve/void instead");
      }

      const daysSinceCreation = (Date.now() - market.createdAt.getTime()) / (1000 * 60 * 60 * 24);
      if (daysSinceCreation < minDaysOpen) {
        throw new Error(`Market must be open at least ${minDaysOpen} days before seed recovery (currently ${daysSinceCreation.toFixed(1)} days)`);
      }

      await tx.order.updateMany({
        where: { marketId: id, status: { in: ["OPEN", "PARTIAL"] } },
        data: { status: "CANCELLED" },
      });

      await tx.market.update({
        where: { id },
        data: { status: "VOIDED", resolvedAt: new Date() },
      });

      return {
        marketId: id,
        seedRecovered: market.seedCost,
        daysSinceCreation: parseFloat(daysSinceCreation.toFixed(1)),
        message: `Seed of $${market.seedCost.toFixed(2)} recovered from inactive market`,
      };
    });
  }

  static async getInactiveMarkets(minDaysOpen = 7) {
    const cutoffDate = new Date(Date.now() - minDaysOpen * 24 * 60 * 60 * 1000);

    const markets = await prisma.market.findMany({
      where: {
        status: { in: ["DRAFT", "ACTIVE"] },
        createdAt: { lte: cutoffDate },
      },
      include: { _count: { select: { positions: true } } },
      orderBy: { createdAt: "asc" },
    });

    return markets
      .filter((m) => m._count.positions === 0)
      .map((m) => ({
        id: m.id,
        playerName: m.playerName,
        question: m.question,
        status: m.status,
        createdAt: m.createdAt,
        seedCost: m.seedCost,
        daysSinceCreation: parseFloat(
          ((Date.now() - m.createdAt.getTime()) / (1000 * 60 * 60 * 24)).toFixed(1),
        ),
      }));
  }
}
