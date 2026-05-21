import { prisma } from "@/lib/prisma";
import { Decimal } from "@prisma/client/runtime/library";
import { BalanceService } from "./balance";

export class SettlementService {
  /**
   * Resolve a market. `winningOutcomeId` is the ID of the winning MarketOutcome,
   * or "VOID" to refund all participants.
   */
  static async resolve(marketId: string, winningOutcomeId: string | "VOID") {
    return prisma.$transaction(async (tx) => {
      const market = await tx.market.findUnique({
        where: { id: marketId },
        include: {
          outcomes: { orderBy: { displayOrder: "asc" } },
          positions: true,
          listings: { where: { status: "ACTIVE" } },
        },
      });

      if (!market) throw new Error("Market not found");
      if (market.status !== "ACTIVE" && market.status !== "CLOSED") {
        throw new Error("Market cannot be resolved");
      }

      // Cancel active listings
      if (market.listings.length > 0) {
        await tx.marketplaceListing.updateMany({
          where: { marketId, status: "ACTIVE" },
          data: { status: "CANCELLED", cancelledAt: new Date() },
        });
        await tx.position.updateMany({
          where: { marketId, isForSale: true },
          data: { isForSale: false },
        });
      }

      // Cancel open orders
      await tx.order.updateMany({
        where: { marketId, status: { in: ["OPEN", "PARTIAL"] } },
        data: { status: "CANCELLED" },
      });

      const activePositions = market.positions.filter(p => p.status === "ACTIVE");

      // Handle VOID
      if (winningOutcomeId === "VOID") {
        for (const position of activePositions) {
          await BalanceService.credit(
            tx, position.currentOwnerId,
            new Decimal(position.totalCost),
            "BET_REFUNDED", "Refund for voided market", marketId,
          );
          await tx.position.update({
            where: { id: position.id },
            data: { status: "REFUNDED", payout: new Decimal(position.totalCost) },
          });
        }
        await tx.market.update({
          where: { id: marketId },
          data: { status: "VOIDED", resolvedAt: new Date() },
        });
        return { type: "VOID" as const, refunded: activePositions.length };
      }

      // Validate winning outcome belongs to this market
      const winningOutcome = market.outcomes.find(o => o.id === winningOutcomeId);
      if (!winningOutcome) throw new Error("Invalid winning outcome ID");

      // Proportional Payout (Option B)
      let winnersCount = 0;
      let losersCount = 0;
      let totalPaidOut = new Decimal(0);

      const winningPositions = activePositions.filter(p => p.outcomeId === winningOutcomeId);
      const losingPositions = activePositions.filter(p => p.outcomeId !== winningOutcomeId);

      const totalPool = market.totalPool;
      const totalWinningShares = winningPositions.reduce((sum, p) => sum + p.shares, 0);
      const payoutPerShare = totalWinningShares > 0
        ? new Decimal(totalPool).dividedBy(totalWinningShares)
        : new Decimal(0);

      // Batch update losers
      if (losingPositions.length > 0) {
        await tx.position.updateMany({
          where: { id: { in: losingPositions.map(p => p.id) } },
          data: { status: "LOST", payout: new Decimal(0) },
        });
        losersCount = losingPositions.length;
      }

      // Process winners
      for (const position of winningPositions) {
        const payout = payoutPerShare.times(position.shares);
        await BalanceService.credit(
          tx, position.currentOwnerId, payout,
          "PAYOUT_RECEIVED",
          `Winnings: ${winningOutcome.name} wins (proportional payout)`,
          marketId,
        );
        await tx.position.update({
          where: { id: position.id },
          data: { status: "WON", payout },
        });
        totalPaidOut = totalPaidOut.plus(payout);
        winnersCount++;
      }

      await tx.market.update({
        where: { id: marketId },
        data: {
          status: "RESOLVED",
          winningOutcomeId,
          resolvedAt: new Date(),
        },
      });

      return {
        type: "RESOLVED" as const,
        outcome: winningOutcome.name,
        winningOutcomeId,
        winnersCount,
        losersCount,
        totalPaidOut: totalPaidOut.toNumber(),
        payoutPerShare: payoutPerShare.toNumber(),
        totalPool: totalPool.toNumber(),
        platformFee: 0,
        payoutMultiplier: payoutPerShare.toNumber(),
      };
    }, { timeout: 60000 });
  }

  static async getReport(marketId: string) {
    const market = await prisma.market.findUnique({
      where: { id: marketId },
      include: {
        outcomes: { orderBy: { displayOrder: "asc" } },
        positions: {
          include: {
            currentOwner: { select: { id: true, username: true } },
            originalOwner: { select: { id: true, username: true } },
            outcome: { select: { id: true, name: true } },
            transfers: true,
          },
        },
      },
    });

    if (!market) throw new Error("Market not found");

    const winners = market.positions.filter(p => p.status === "WON");
    const losers = market.positions.filter(p => p.status === "LOST");
    const refunded = market.positions.filter(p => p.status === "REFUNDED");

    const totalWinnings = winners.reduce((sum, p) => sum.plus(p.payout || 0), new Decimal(0));
    const totalLosses = losers.reduce((sum, p) => sum.plus(p.amount), new Decimal(0));
    const totalPool = market.totalPool;

    const allTransfers = market.positions.flatMap(p => p.transfers);
    const secondaryVolume = allTransfers.reduce((sum, t) => sum.plus(t.price), new Decimal(0));
    const secondaryFees = secondaryVolume.times(0.02);

    const totalWinningShares = winners.reduce((sum, p) => sum + Number(p.shares || 0), 0);
    const payoutPerShare = totalWinningShares > 0
      ? new Decimal(totalPool).dividedBy(totalWinningShares)
      : new Decimal(0);

    const winningOutcome = market.outcomes.find(o => o.id === market.winningOutcomeId);

    return {
      market: {
        id: market.id,
        question: market.question,
        playerName: market.playerName,
        status: market.status,
        winningOutcome: winningOutcome?.name ?? null,
        winningOutcomeId: market.winningOutcomeId,
        resolvedAt: market.resolvedAt,
        seedCost: market.seedCost,
        numOutcomes: market.outcomes.length,
      },
      outcomes: market.outcomes.map(o => ({
        id: o.id,
        name: o.name,
        pool: o.pool.toNumber(),
        qOutstanding: o.qOutstanding,
      })),
      pools: {
        total: totalPool.toNumber(),
        byOutcome: Object.fromEntries(
          market.outcomes.map(o => [o.name, o.pool.toNumber()]),
        ),
      },
      results: {
        winners: winners.length,
        losers: losers.length,
        refunded: refunded.length,
        totalWinnings: totalWinnings.toNumber(),
        totalLosses: totalLosses.toNumber(),
        payoutPerShare: payoutPerShare.toNumber(),
      },
      fees: {
        primaryMarket: 0,
        secondaryMarket: secondaryFees.toNumber(),
        total: secondaryFees.toNumber(),
      },
      liquidity: {
        b: market.b,
        initialSeed: market.seedCost,
        seedRecovered: true,
        netInvestments: totalPool.toNumber(),
        totalPayouts: totalWinnings.toNumber(),
        netProfitLoss: new Decimal(totalPool).minus(totalWinnings).toNumber(),
      },
      secondaryMarket: {
        transfers: allTransfers.length,
        volume: secondaryVolume.toNumber(),
      },
      positions: market.positions.map(p => ({
        id: p.id,
        originalOwner: p.originalOwner.username,
        currentOwner: p.currentOwner.username,
        outcome: p.outcome.name,
        outcomeId: p.outcomeId,
        side: p.side,
        amount: p.amount.toNumber(),
        status: p.status,
        payout: p.payout?.toNumber() || 0,
        wasTraded: p.transfers.length > 0,
        transferCount: p.transfers.length,
      })),
    };
  }

  static async getLiquidityStats(marketId: string) {
    const market = await prisma.market.findUnique({
      where: { id: marketId },
      include: {
        positions: { select: { amount: true, payout: true, status: true } },
      },
    });

    if (!market) throw new Error("Market not found");

    const totalPayouts = market.positions.reduce(
      (sum, p) => sum.plus(p.payout || 0),
      new Decimal(0),
    );

    return {
      b: market.b,
      initialSeed: market.seedCost,
      netInvestments: market.totalPool.toNumber(),
      totalPayouts: totalPayouts.toNumber(),
      netProfitLoss: new Decimal(market.totalPool)
        .minus(totalPayouts)
        .minus(market.seedCost)
        .toNumber(),
    };
  }
}
