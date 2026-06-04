import { prisma } from "@/lib/prisma";
import { Decimal } from "@prisma/client/runtime/library";
import { LmsrService } from "@apps/prediction-app/src/lmsr/lmsr.service";
import { BalanceService } from "@apps/wallet-user-app/src/balance/balance.service";

export class PositionService {
  static async create(data: {
    marketId: string;
    userId: string;
    outcomeId: string;
    amount: number;
  }) {
    if (data.amount <= 0) throw new Error("Monto debe ser positivo");
    return prisma.$transaction(async (tx) => {
      const market = await tx.market.findUnique({
        where: { id: data.marketId },
        include: { outcomes: { orderBy: { displayOrder: "asc" } } },
      });
      if (!market || market.status !== "ACTIVE") throw new Error("El mercado no está activo");

      const isPrimaryPaused =
        market.primaryMarketPaused ||
        (market.primaryPauseScheduledAt &&
          new Date(market.primaryPauseScheduledAt) <= new Date());
      if (isPrimaryPaused) throw new Error("El mercado primario está pausado");

      const sortedOutcomes = [...market.outcomes].sort((a, b) => a.displayOrder - b.displayOrder);
      const outcomeIdx = sortedOutcomes.findIndex((o) => o.id === data.outcomeId);
      if (outcomeIdx < 0) throw new Error("Outcome no encontrado en este mercado");
      const outcomeRecord = sortedOutcomes[outcomeIdx];

      const user = await tx.user.findUnique({ where: { id: data.userId } });
      if (!user) throw new Error("Usuario no encontrado");
      if (new Decimal(user.balance).lessThan(new Decimal(data.amount))) {
        throw new Error("Balance insuficiente");
      }

      const platformFeeRate = market.platformFee ? Number(market.platformFee) : 0.015;
      const grossAmount = data.amount;
      const feeAmount = grossAmount * platformFeeRate;
      const netInvestment = grossAmount - feeAmount;

      const qVector = sortedOutcomes.map((o) => o.qOutstanding);
      const params = { b: market.b, alpha: market.alpha, bMin: market.bMin };
      const lmsr = new LmsrService();
      const sharesCollected = lmsr.getSharesToBuyLSN(qVector, params, outcomeIdx, netInvestment);
      if (sharesCollected <= 0) throw new Error("La compra no genera shares al precio actual");

      const oldPrices = lmsr.getPricesLSN(qVector, params);
      const newQVector = [...qVector];
      newQVector[outcomeIdx] += sharesCollected;
      const newPrices = lmsr.getPricesLSN(newQVector, params);

      await tx.marketOutcome.update({
        where: { id: data.outcomeId },
        data: {
          qOutstanding: outcomeRecord.qOutstanding + sharesCollected,
          pool: { increment: new Decimal(netInvestment) },
        },
      });

      await tx.market.update({
        where: { id: data.marketId },
        data: { totalPool: { increment: new Decimal(netInvestment) } },
      });

      await BalanceService.deduct(
        tx,
        data.userId,
        new Decimal(grossAmount),
        "BET_PLACED",
        `Market Buy: ${sharesCollected.toFixed(2)} ${outcomeRecord.name} for $${grossAmount.toFixed(2)}`,
        data.marketId,
      );

      const avgPrice = grossAmount / sharesCollected;
      const initialProb = newPrices[outcomeIdx];
      const position = await tx.position.create({
        data: {
          marketId: data.marketId,
          outcomeId: data.outcomeId,
          originalOwnerId: data.userId,
          currentOwnerId: data.userId,
          side: outcomeRecord.name,
          amount: new Decimal(grossAmount),
          shares: sharesCollected,
          avgCostPerShare: avgPrice,
          totalCost: netInvestment,
          purchasePrice: new Decimal(avgPrice),
          initialProbability: new Decimal(initialProb),
        },
      });

      const pBefore: Record<string, number> = {};
      const pAfter: Record<string, number> = {};
      const qBefore: Record<string, number> = {};
      const qAfter: Record<string, number> = {};
      sortedOutcomes.forEach((o, i) => {
        pBefore[o.id] = oldPrices[i];
        pAfter[o.id] = newPrices[i];
        qBefore[o.id] = qVector[i];
        qAfter[o.id] = newQVector[i];
      });
      await tx.lmsrSnapshot.create({
        data: {
          marketId: data.marketId,
          outcomeId: data.outcomeId,
          qBefore,
          pBefore,
          qAfter,
          pAfter,
          side: outcomeRecord.name,
          deltaShares: sharesCollected,
          cost: netInvestment,
          triggerType: "MARKET_BUY",
          userId: data.userId,
        },
      });

      return position;
    });
  }

  static async getUserPositions(userId: string, marketId?: string) {
    const positions = await prisma.position.findMany({
      where: {
        currentOwnerId: userId,
        ...(marketId && { marketId }),
      },
      include: {
        market: { include: { outcomes: { orderBy: { displayOrder: "asc" } } } },
        outcome: true,
      },
      orderBy: { createdAt: "desc" },
    });

    const lmsrService = new LmsrService();

    return positions.map((p) => {
      const qVector = LmsrService.buildQVector(p.market.outcomes);
      const params = { b: p.market.b, alpha: (p.market as any).alpha, bMin: (p.market as any).bMin };
      const prices = lmsrService.getPricesLSN(qVector, params);
      const outcomeIdx = p.market.outcomes
        .sort((a, b) => a.displayOrder - b.displayOrder)
        .findIndex(o => o.id === p.outcomeId);
      const currentPrice = outcomeIdx >= 0 ? prices[outcomeIdx] : 0;

      const shares = p.shares || 0;
      const fairValue = shares * currentPrice;

      return {
        ...p,
        amount: p.amount.toNumber(),
        payout: p.payout?.toNumber(),
        initialProbability: p.initialProbability?.toNumber() || 0,
        shares,
        purchasePrice: Number(p.purchasePrice || 0),
        currentPrice,
        fairValue,
        potentialReturn: shares,
        outcomeName: p.outcome.name,
        market: {
          ...p.market,
          totalPool: p.market.totalPool.toNumber(),
          maxPool: p.market.maxPool?.toNumber(),
          platformFee: p.market.platformFee?.toNumber(),
        },
      };
    });
  }

  static async getUserConsolidatedPositions(userId: string, marketId?: string) {
    const rawPositions = await prisma.position.findMany({
      where: {
        currentOwnerId: userId,
        marketId: marketId || undefined,
      },
      include: {
        market: { include: { outcomes: { orderBy: { displayOrder: "asc" } } } },
        outcome: true,
      },
      orderBy: { createdAt: "desc" },
    });

    const groups: Record<string, any> = {};

    for (const p of rawPositions) {
      const key = p.marketId;

      if (!groups[key]) {
        const lmsrService = new LmsrService();
        const qVector = LmsrService.buildQVector(p.market.outcomes);
        const params = { b: p.market.b, alpha: (p.market as any).alpha, bMin: (p.market as any).bMin };
        const prices = lmsrService.getPricesLSN(qVector, params);
        const sortedOutcomes = [...p.market.outcomes].sort((a, b) => a.displayOrder - b.displayOrder);

        const isResolved = p.market.status === "RESOLVED";

        const outcomesData: Record<string, any> = {};
        sortedOutcomes.forEach((o, i) => {
          const prob = isResolved
            ? (o.id === p.market.winningOutcomeId ? 1 : 0)
            : prices[i];
          outcomesData[o.id] = {
            id: o.id,
            name: o.name,
            shares: 0,
            invested: 0,
            netCost: 0,
            fees: 0,
            payout: 0,
            prob,
            history: [],
          };
        });

        groups[key] = {
          id: p.id,
          marketId: p.marketId,
          market: {
            id: p.market.id,
            playerName: p.market.playerName,
            question: p.market.question,
            status: p.market.status,
            imageUrl: (p.market as any).imageUrl ?? null,
            winningOutcomeId: p.market.winningOutcomeId,
            winningOutcomeName: sortedOutcomes.find(o => o.id === p.market.winningOutcomeId)?.name || null,
            totalPool: p.market.totalPool.toNumber(),
            outcomes: sortedOutcomes.map((o, i) => ({
              id: o.id,
              name: o.name,
              qOutstanding: o.qOutstanding,
              pool: o.pool.toNumber(),
              probability: (isResolved ? (o.id === p.market.winningOutcomeId ? 100 : 0) : prices[i] * 100),
              color: (o as any).color,
            })),
          },
          _params: params,
          _qVector: qVector,
          _sortedOutcomes: sortedOutcomes,
          _prices: prices,
          _isResolved: isResolved,
          outcomesData,
          amount: 0,
          totalFees: 0,
          payout: 0,
          status: p.status,
          createdAt: p.createdAt,
          history: [],
        };
      }

      const g = groups[key];
      const od = g.outcomesData[p.outcomeId];
      if (od) {
        const pShares = p.shares || 0;
        const feeAmount = p.amount.toNumber() - (p.totalCost || 0);
        od.shares += pShares;
        od.invested += p.amount.toNumber();
        od.netCost += (p.totalCost || 0);
        od.fees += feeAmount;
        if (p.payout) od.payout += p.payout.toNumber();
      }

      g.history.push({
        id: p.id,
        amount: p.amount.toNumber(),
        shares: p.shares || 0,
        createdAt: p.createdAt,
        purchasePrice: Number(p.purchasePrice || 0),
        side: p.side,
        outcomeId: p.outcomeId,
        outcomeName: p.outcome.name,
        status: p.status,
        payout: p.payout?.toNumber(),
      });

      g.amount += p.amount.toNumber();
      g.totalFees += (p.amount.toNumber() - (p.totalCost || 0));
      if (p.payout) g.payout += p.payout.toNumber();
    }

    return Object.values(groups).map((g: any) => {
      const totalPool = g.market.totalPool;
      let totalInvested = 0;
      let totalFairValue = 0;

      const outcomesResult: Record<string, any> = {};
      for (const [outcomeId, od] of Object.entries(g.outcomesData) as any) {
        const shares = od.shares;
        const invested = od.invested;
        const avgPrice = shares > 0 ? invested / shares : 0;
        // Option B: under resolved markets, fairValue is the EXACT proportional payout
        // (pool repartible / winning shares × user shares), NOT shares × $1.
        // The Math.max() fallback was Option A behavior and would falsely show $1/share.
        const fairValue = g._isResolved
          ? od.payout
          : shares * od.prob;
        const pnl = fairValue - invested;
        const roi = invested > 0 ? (pnl / invested) * 100 : 0;

        outcomesResult[outcomeId] = {
          ...od,
          avgPrice,
          fairValue,
          pnl,
          roi,
        };

        totalInvested += invested;
        totalFairValue += fairValue;
      }

      const totalPnL = totalFairValue - totalInvested;
      const totalROI = totalInvested > 0 ? (totalPnL / totalInvested) * 100 : 0;

      // Settlement scenarios per outcome
      const scenarios: Record<string, { payout: number; net: number }> = {};
      for (const outcome of g.market.outcomes) {
        const qWinner = outcome.qOutstanding;
        const payoutPerShare = qWinner > 0 ? totalPool / qWinner : 0;
        const od = outcomesResult[outcome.id];
        const userShares = od?.shares || 0;
        const payout = userShares * payoutPerShare;
        scenarios[outcome.id] = { payout, net: payout - (od?.invested || 0) };
      }

      // Binary compat: yes/no wrappers
      const sortedOutcomes = g._sortedOutcomes as any[];
      const firstOutcome = sortedOutcomes[0];
      const secondOutcome = sortedOutcomes[1];

      return {
        ...g,
        outcomesData: outcomesResult,
        yes: firstOutcome ? outcomesResult[firstOutcome.id] || {} : {},
        no: secondOutcome ? outcomesResult[secondOutcome.id] || {} : {},
        amount: totalInvested,
        fairValue: totalFairValue,
        payout: g._isResolved ? totalFairValue : 0,
        totalPnL,
        totalROI,
        scenarios,
        shares: Object.values(outcomesResult).reduce((s: number, o: any) => s + o.shares, 0),
        totalFees: g.totalFees,
        currentPrice: firstOutcome ? (outcomesResult[firstOutcome.id]?.prob ?? 0) : 0,
        potentialReturn: Math.max(...Object.values(scenarios).map((s: any) => s.payout)),
      };
    });
  }

  static async getById(id: string) {
    const position = await prisma.position.findUnique({
      where: { id },
      include: {
        market: { include: { outcomes: { orderBy: { displayOrder: "asc" } } } },
        outcome: true,
        currentOwner: true,
      },
    });

    if (!position) return null;

    const lmsrService = new LmsrService();
    const qVector = LmsrService.buildQVector(position.market.outcomes);
    const params = { b: position.market.b, alpha: (position.market as any).alpha, bMin: (position.market as any).bMin };
    const prices = lmsrService.getPricesLSN(qVector, params);
    const outcomeIdx = position.market.outcomes
      .sort((a, b) => a.displayOrder - b.displayOrder)
      .findIndex(o => o.id === position.outcomeId);
    const currentPrice = outcomeIdx >= 0 ? prices[outcomeIdx] : 0;

    const shares = position.shares || 0;
    const fairValue = shares * currentPrice;

    return {
      ...position,
      amount: position.amount.toNumber(),
      payout: position.payout?.toNumber(),
      initialProbability: position.initialProbability?.toNumber() || 0,
      shares,
      purchasePrice: Number(position.purchasePrice || 0),
      currentPrice,
      fairValue,
      potentialReturn: shares,
      outcomeName: position.outcome.name,
      market: {
        ...position.market,
        totalPool: position.market.totalPool.toNumber(),
        maxPool: position.market.maxPool?.toNumber(),
        platformFee: position.market.platformFee?.toNumber(),
      },
    };
  }

}
