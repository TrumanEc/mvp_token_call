import { prisma } from "@/lib/prisma";
import { Decimal } from "@prisma/client/runtime/library";
import { BalanceService } from "./balance";

export type Outcome = "YES" | "NO";

export class SettlementService {
  static async resolve(marketId: string, outcome: Outcome | "VOID") {
    return prisma.$transaction(async (tx) => {
      const market = await tx.market.findUnique({
        where: { id: marketId },
        include: {
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

      const activePositions = market.positions.filter(p => p.status === "ACTIVE");

      // Handle VOID
      if (outcome === "VOID") {
        for (const position of activePositions) {
          await BalanceService.credit(
            tx,
            position.currentOwnerId,
            new Decimal(position.totalCost),
            "BET_REFUNDED",
            "Refund for voided market",
            marketId,
          );
          await tx.position.update({
            where: { id: position.id },
            data: {
              status: "REFUNDED",
              payout: new Decimal(position.totalCost),
            },
          });
        }
        await tx.market.update({
          where: { id: marketId },
          data: { status: "VOIDED", resolvedAt: new Date() },
        });
        return { type: "VOID" as const, refunded: activePositions.length };
      }

      // Option B: Proportional Payout
      // Winners share the full user pool (yesPool + noPool) proportionally by shares.
      // Seed cost always returns to WIN — only user money is distributed.
      let winnersCount = 0;
      let losersCount = 0;
      let totalPaidOut = new Decimal(0);

      const winningPositions = activePositions.filter(p => p.side === outcome);
      const losingPositions = activePositions.filter(p => p.side !== outcome);

      // Total user pool (net amounts contributed by traders, excluding seed)
      const totalPool = new Decimal(market.yesPool).plus(market.noPool);

      // Total winning shares across all winning positions
      const totalWinningShares = winningPositions.reduce(
        (sum, p) => sum + p.shares,
        0,
      );

      // Payout per winning share = totalPool / totalWinningShares
      const payoutPerShare = totalWinningShares > 0
        ? totalPool.dividedBy(totalWinningShares)
        : new Decimal(0);

      // 1. Batch Update Losers
      if (losingPositions.length > 0) {
        await tx.position.updateMany({
          where: { id: { in: losingPositions.map(p => p.id) } },
          data: { status: "LOST", payout: new Decimal(0) },
        });
        losersCount = losingPositions.length;
      }

      // 2. Process Winners — each winner receives shares × payoutPerShare
      for (const position of winningPositions) {
        const payout = payoutPerShare.times(position.shares);

        await BalanceService.credit(
          tx,
          position.currentOwnerId,
          payout,
          "PAYOUT_RECEIVED",
          "Winnings from market resolution (proportional payout)",
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
        data: { status: "RESOLVED", outcome, resolvedAt: new Date() },
      });

      return {
        type: "RESOLVED" as const,
        outcome,
        winnersCount,
        losersCount,
        totalPaidOut: totalPaidOut.toNumber(),
        payoutPerShare: payoutPerShare.toNumber(),
        totalPool: totalPool.toNumber(),
        // WIN revenue = accumulated fees (seed always recovered separately)
        platformFee: 0,
        payoutMultiplier: payoutPerShare.toNumber(),
      };
    }, {
      timeout: 60000,
    });
  }

  static async getReport(marketId: string) {
    const market = await prisma.market.findUnique({
      where: { id: marketId },
      include: {
        positions: {
          include: {
            currentOwner: { select: { id: true, username: true } },
            originalOwner: { select: { id: true, username: true } },
            transfers: true,
          },
        },
      },
    });

    if (!market) throw new Error("Market not found");

    const winners = market.positions.filter((p) => p.status === "WON");
    const losers = market.positions.filter((p) => p.status === "LOST");
    const refunded = market.positions.filter((p) => p.status === "REFUNDED");

    const totalWinnings = winners.reduce(
      (sum, p) => sum.plus(p.payout || 0),
      new Decimal(0),
    );
    const totalLosses = losers.reduce(
      (sum, p) => sum.plus(p.amount),
      new Decimal(0),
    );
    const totalPool = new Decimal(market.yesPool).plus(market.noPool);

    const allTransfers = market.positions.flatMap((p) => p.transfers);
    const secondaryVolume = allTransfers.reduce(
      (sum, t) => sum.plus(t.price),
      new Decimal(0),
    );
    // P2P fee: 2% on secondary volume
    const secondaryFees = secondaryVolume.times(0.02);

    // Option B: WIN revenue = accumulated fees only (seed always returned to WIN)
    // Primary market fees are embedded in the LMSR spread (platformFee rate × volume)
    const totalWinningShares = winners.reduce((sum, p) => sum + Number(p.shares || 0), 0);
    const payoutPerShare = totalWinningShares > 0
      ? totalPool.dividedBy(totalWinningShares)
      : new Decimal(0);

    return {
      market: {
        id: market.id,
        question: market.question,
        playerName: market.playerName,
        status: market.status,
        outcome: market.outcome,
        resolvedAt: market.resolvedAt,
        seedCost: market.seedCost,
      },
      pools: {
        yes: market.yesPool.toNumber(),
        no: market.noPool.toNumber(),
        total: totalPool.toNumber(),
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
        // Under Option B, primary market revenue = fees collected during trading (implicit in pool)
        // Secondary market fees are explicit
        primaryMarket: 0,
        secondaryMarket: secondaryFees.toNumber(),
        total: secondaryFees.toNumber(),
      },
      liquidity: {
        b: market.b,
        initialSeed: market.seedCost,
        seedRecovered: true, // Option B always recovers seed (never distributed to users)
        netInvestments: totalPool.toNumber(),
        totalPayouts: totalWinnings.toNumber(),
        // Under Option B, WIN net P&L = totalPool - totalWinnings (should be ~0 since all pool goes to winners)
        // Real WIN profit = fees accumulated during trading
        netProfitLoss: totalPool.minus(totalWinnings).toNumber(),
      },
      secondaryMarket: {
        transfers: allTransfers.length,
        volume: secondaryVolume.toNumber(),
      },
      positions: market.positions.map((p) => ({
        id: p.id,
        originalOwner: p.originalOwner.username,
        currentOwner: p.currentOwner.username,
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
        positions: {
          select: {
            amount: true,
            payout: true,
            status: true,
          },
        },
      },
    });

    if (!market) throw new Error("Market not found");

    const totalPool = new Decimal(market.yesPool).plus(market.noPool);
    const totalPayouts = market.positions.reduce(
      (sum, p) => sum.plus(p.payout || 0),
      new Decimal(0),
    );

    return {
      b: market.b,
      initialSeed: market.seedCost,
      netInvestments: totalPool.toNumber(),
      totalPayouts: totalPayouts.toNumber(),
      netProfitLoss: totalPool
        .minus(totalPayouts)
        .minus(market.seedCost)
        .toNumber(),
    };
  }
}
