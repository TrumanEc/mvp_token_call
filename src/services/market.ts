import { prisma } from "@/lib/prisma";
import { Decimal } from "@prisma/client/runtime/library";
import { OddsCalculator } from "./odds-calculator";
import { LmsrService } from "./lmsr.service";

export type MarketStatus =
  | "DRAFT"
  | "ACTIVE"
  | "CLOSED"
  | "RESOLVED"
  | "VOIDED";

export class MarketService {
  static async getAll(status?: MarketStatus) {
    const markets = await prisma.market.findMany({
      where: status ? { status } : undefined,
      orderBy: { createdAt: "desc" },
    });

    const lmsrService = new LmsrService();

    return markets.map((market) => {
      const prices = lmsrService.getPrice(market.qYes, market.qNo, market.b);
      return {
        ...market,
        yesPool: market.yesPool.toNumber(),
        noPool: market.noPool.toNumber(),
        odds: {
          yesOdds: prices.pYes * 100,
          noOdds: prices.pNo * 100,
        },
      };
    });
  }

  static async getById(id: string) {
    const market = await prisma.market.findUnique({
      where: { id },
      include: {
        positions: {
          include: {
            currentOwner: { select: { id: true, username: true } },
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
          include: { user: { select: { id: true, username: true } } }
        }
      },
    });

    if (!market) return null;

    const lmsrService = new LmsrService();
    const prices = lmsrService.getPrice(market.qYes, market.qNo, market.b);

    // Calculate legacy-style odds for compatibility if needed, or just use LMSR prices * 100
    const odds = {
      yesOdds: prices.pYes * 100,
      noOdds: prices.pNo * 100,
    };
    return {
      ...market,
      yesPool: market.yesPool.toNumber(),
      noPool: market.noPool.toNumber(),
      maxPool: market.maxPool?.toNumber() ?? null,
      orders: (market as any).orders || [],
      odds, // Overwrite legacy odds with LMSR odds
      positions: (market as any).positions.map((p: any) => ({
        ...p,
        amount: p.amount.toNumber(),
        payout: p.payout?.toNumber(),
        initialProbability: p.initialProbability.toNumber(),
        shares: Number(p.shares || 0),
        purchasePrice: Number(p.purchasePrice || 0),
        // Calculate current fair value for position
        fairValue:
          Number(p.shares || 0) * (p.side === "YES" ? prices.pYes : prices.pNo),
        currentPrice: p.side === "YES" ? prices.pYes : prices.pNo,
      })),
      history: (market as any).lmsrSnapshots
        .map((s: any) => {
          const p = s.pYesAfter > 1 ? s.pYesAfter / 100 : s.pYesAfter;
          return {
            timestamp: s.createdAt,
            price: p, // Chart expects 0-1 price
            volume: s.cost,
            qYes: s.qYesAfter,
            qNo: s.qNoAfter,
          };
        })
        .reverse(), // Oldest first for chart
    };
  }

  static async create(data: {
    playerName?: string;
    question: string;
    description?: string;
    resolutionDate: Date;
    maxPool?: number;
    b?: number;
    maxBetAmount?: number;
    maxPriceImpact?: number;
    initialProbabilityYes?: number; // 0.01–0.99, defaults to 0.5
  }) {
    const b = data.b || 100;
    const lmsrService = new LmsrService();
    const seedCost = lmsrService.getMaxLoss(b);

    // Compute starting q values from target probability (defaults to 50/50)
    const pYesInit = data.initialProbabilityYes ?? 0.5;
    const { qYes: initQYes, qNo: initQNo } = lmsrService.getInitialQValues(b, pYesInit);
    const pNoInit = 1 - pYesInit;

    return prisma.market.create({
      data: {
        playerName: data.playerName,
        question: data.question,
        description: data.description,
        resolutionDate: data.resolutionDate,
        maxPool: data.maxPool ? new Decimal(data.maxPool) : undefined,
        maxBetAmount: data.maxBetAmount ? Number(data.maxBetAmount) : undefined,
        maxPriceImpact: data.maxPriceImpact
          ? Number(data.maxPriceImpact)
          : undefined,
        status: "DRAFT",
        // LMSR Initialization at target probability
        b,
        qYes: initQYes,
        qNo: initQNo,
        seedCost,
        history: {
          create: {
            yesOdds: new Decimal(pYesInit * 100),
            noOdds: new Decimal(pNoInit * 100),
            totalPool: new Decimal(0),
          },
        },
        lmsrSnapshots: {
          create: {
            qYesBefore: 0,
            qNoBefore: 0,
            pYesBefore: 0.5,
            side: "INIT",
            deltaShares: 0,
            cost: seedCost,
            qYesAfter: initQYes,
            qNoAfter: initQNo,
            pYesAfter: pYesInit,
            triggerType: "INIT",
            userId: "SYSTEM",
          },
        },
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

  /** Returns true if the primary market is paused (manual or scheduled). */
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

  /** Pause the primary market immediately (manual) or schedule an auto-pause. */
  static async pausePrimary(
    id: string,
    opts: { scheduledAt?: Date } = {},
  ) {
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

  /** Resume the primary market (removes manual flag and any schedule). */
  static async unpausePrimary(id: string) {
    return prisma.market.update({
      where: { id },
      data: { primaryMarketPaused: false, primaryPauseScheduledAt: null },
    });
  }

  /**
   * Recover seed from an inactive market (no trades since creation).
   * Voids the market and returns the seed cost to a designated admin wallet / reserve.
   * Only allowed when:
   *   - Market is DRAFT or ACTIVE
   *   - No positions have been created (zero trading activity)
   *   - Market has been open for at least `minDaysOpen` days without trades
   */
  static async recoverInactiveSeed(
    id: string,
    options: { minDaysOpen?: number } = {},
  ) {
    const minDaysOpen = options.minDaysOpen ?? 0;

    return prisma.$transaction(async (tx) => {
      const market = await tx.market.findUnique({
        where: { id },
        include: {
          positions: { select: { id: true }, take: 1 },
        },
      });

      if (!market) throw new Error("Market not found");

      if (!["DRAFT", "ACTIVE"].includes(market.status)) {
        throw new Error("Only DRAFT or ACTIVE markets can be recovered");
      }

      if (market.positions.length > 0) {
        throw new Error(
          "Market has trading activity — use resolve/void instead",
        );
      }

      const daysSinceCreation =
        (Date.now() - market.createdAt.getTime()) / (1000 * 60 * 60 * 24);

      if (daysSinceCreation < minDaysOpen) {
        throw new Error(
          `Market must be open at least ${minDaysOpen} days before seed recovery (currently ${daysSinceCreation.toFixed(1)} days)`,
        );
      }

      // Cancel any open orders (safety check)
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

  /**
   * Find all markets eligible for seed recovery:
   * ACTIVE markets with zero positions older than minDaysOpen.
   */
  static async getInactiveMarkets(minDaysOpen: number = 7) {
    const cutoffDate = new Date(
      Date.now() - minDaysOpen * 24 * 60 * 60 * 1000,
    );

    const markets = await prisma.market.findMany({
      where: {
        status: { in: ["DRAFT", "ACTIVE"] },
        createdAt: { lte: cutoffDate },
      },
      include: {
        _count: { select: { positions: true } },
      },
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
          (
            (Date.now() - m.createdAt.getTime()) /
            (1000 * 60 * 60 * 24)
          ).toFixed(1),
        ),
      }));
  }
}
