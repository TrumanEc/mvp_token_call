import { prisma } from "@/lib/prisma";
import { Decimal } from "@prisma/client/runtime/library";
import { OddsCalculator } from "./odds-calculator";
import { BalanceService } from "./balance";
import { LmsrService } from "./lmsr.service";
import { RouterService } from "./router.service";

export type Side = "YES" | "NO";

export class PositionService {
  static async create(data: {
    marketId: string;
    userId: string;
    side: Side;
    amount: number;
  }) {
    // We now delegate to RouterService which handles LMSR + OrderBook + Smart Fees
    const result = await RouterService.executeMarketBuy({
      marketId: data.marketId,
      userId: data.userId,
      side: data.side,
      budget: data.amount // This is the gross budget
    });

    return result.position;
  }

  static async getUserPositions(userId: string, marketId?: string) {
    const positions = await prisma.position.findMany({
      where: {
        currentOwnerId: userId,
        ...(marketId && { marketId }),
      },
      include: {
        market: true,
        listing: true,
      },
      orderBy: { createdAt: "desc" },
    });

    return positions.map((p: any) => {
      const odds = OddsCalculator.calculateOdds(
        p.market.yesPool,
        p.market.noPool,
      );
      const currentPrice = new Decimal(
        p.side === "YES" ? odds.yesOdds : odds.noOdds,
      ).dividedBy(100);

      // Fallback for legacy positions: derive shares from initialProbability
      const initialProb = p.initialProbability?.toNumber() || 50;
      const legacyPrice = new Decimal(initialProb).dividedBy(100);

      const purchasePrice =
        p.purchasePrice && !p.purchasePrice.isZero()
          ? new Decimal(p.purchasePrice)
          : legacyPrice;

      const shares =
        p.shares && !p.shares.isZero()
          ? new Decimal(p.shares)
          : p.amount.dividedBy(legacyPrice);

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
          platformFee: p.market.platformFee?.toNumber(),
        },
        listing: p.listing
          ? {
              ...p.listing,
              askPrice: p.listing.askPrice.toNumber(),
              suggestedPrice: p.listing.suggestedPrice.toNumber(),
              platformFee: p.listing.platformFee.toNumber(),
            }
          : null,
      };
    });
  }

  static async getUserConsolidatedPositions(userId: string, marketId?: string) {
    const rawPositions = await prisma.position.findMany({
      where: {
        currentOwnerId: userId,
        marketId: marketId || undefined,
      },
      include: { market: true, listing: true },
      orderBy: { createdAt: "desc" },
    });

    // Fetch open/partial sell orders the user has in the orderbook
    const openSellOrders = await prisma.order.findMany({
      where: {
        userId,
        type: "SELL",
        status: { in: ["OPEN", "PARTIAL"] },
        ...(marketId && { marketId }),
      },
    });

    // Index by marketId + side for quick lookup
    const obMap: Record<string, { shares: number; revenue: number; avgPrice: number }> = {};
    for (const o of openSellOrders) {
      const k = `${o.marketId}__${o.side}`;
      if (!obMap[k]) obMap[k] = { shares: 0, revenue: 0, avgPrice: 0 };
      obMap[k].shares += o.remainingShares;
      obMap[k].revenue += o.remainingShares * o.pricePerShare;
    }
    for (const k of Object.keys(obMap)) {
      const e = obMap[k];
      e.avgPrice = e.shares > 0 ? e.revenue / e.shares : 0;
    }

    const groups: Record<string, any> = {};


    for (const p of rawPositions) {
      // Group active positions by marketId only. Resolved remain separate.
      const key = p.status === "ACTIVE" ? p.marketId : `resolved-${p.id}`;

      if (!groups[key]) {
        groups[key] = {
          id: p.id,
          marketId: p.marketId,
          market: {
            id: p.market.id,
            playerName: p.market.playerName,
            question: p.market.question,
            status: p.market.status,
            outcome: p.market.outcome,
            yesPool: p.market.yesPool.toNumber(),
            noPool: p.market.noPool.toNumber(),
          },
          // Store LMSR state parameters for price calculation
          _b: p.market.b,
          _qYes: p.market.qYes,
          _qNo: p.market.qNo,
          yes: {
            shares: new Decimal(0),
            invested: new Decimal(0),
            netCost: new Decimal(0),
            fees: new Decimal(0),
            payout: new Decimal(0),
            history: [],
          },
          no: {
            shares: new Decimal(0),
            invested: new Decimal(0),
            netCost: new Decimal(0),
            fees: new Decimal(0),
            payout: new Decimal(0),
            history: [],
          },
          shares: new Decimal(0), // Total legacy sum (ref only)
          amount: new Decimal(0), // Total amount (invested)
          totalFees: new Decimal(0),
          payout: new Decimal(0),
          status: p.status,
          isForSale: false,
          createdAt: p.createdAt,
          history: [], // Global history
        };
      }

      const pShares = new Decimal((p as any).shares || 0);
      const feeAmount = p.amount.minus(new Decimal((p as any).totalCost || 0));
      const sideKey = p.side.toLowerCase() as "yes" | "no";

      // We populate side-specific data for ALL statuses now, so the UI can show history
      groups[key][sideKey].shares = groups[key][sideKey].shares.plus(pShares);
      groups[key][sideKey].invested = groups[key][sideKey].invested.plus(p.amount);
      groups[key][sideKey].netCost = groups[key][sideKey].netCost.plus(
        new Decimal((p as any).totalCost || 0),
      );
      groups[key][sideKey].fees = groups[key][sideKey].fees.plus(feeAmount);
      
      if (p.payout) {
        groups[key][sideKey].payout = groups[key][sideKey].payout.plus(p.payout);
        groups[key].payout = groups[key].payout.plus(p.payout);
      }

      groups[key].history.push({
        id: p.id,
        amount: p.amount.toNumber(),
        shares: pShares.toNumber(),
        createdAt: p.createdAt,
        purchasePrice: (p as any).purchasePrice?.toNumber(),
        side: p.side,
        status: p.status,
        payout: p.payout?.toNumber(),
      });

      // Legacy support/Global aggregates
      groups[key].shares = groups[key].shares.plus(pShares);
      groups[key].amount = groups[key].amount.plus(p.amount);
      groups[key].totalFees = groups[key].totalFees.plus(feeAmount);

      if (p.isForSale) groups[key].isForSale = true;
    }

    return Object.values(groups).map((g: any) => {
      // Use real LMSR price (NOT pool ratio)
      const lmsrService = new LmsrService();
      const marketB = (g as any)._b || 1000;
      const marketQYes = (g as any)._qYes || 0;
      const marketQNo = (g as any)._qNo || 0;
      const lmsrReal = lmsrService.getPrice(marketQYes, marketQNo, marketB);
      const marketOutcome = (g as any).market.outcome;
      const isResolved = (g as any).market.status === "RESOLVED";

      let probYes = new Decimal(lmsrReal.pYes);
      let probNo = new Decimal(lmsrReal.pNo);

      if (isResolved) {
        probYes = new Decimal(marketOutcome === "YES" ? 1 : 0);
        probNo = new Decimal(marketOutcome === "NO" ? 1 : 0);
      }

      const yesShares = g.yes.shares.toNumber();
      const yesInvested = g.yes.invested.toNumber();           // bruto (con fee)
      const yesNetCost = g.yes.netCost.toNumber();             // neto (sin fee, lo que fue al LMSR)
      const yesAvgPrice    = yesShares > 0 ? yesInvested / yesShares : 0;  // bruto/share
      const yesAvgPriceNet = yesShares > 0 ? yesNetCost  / yesShares : 0;  // neto/share
      
      // If resolved, fair value is what was actually paid out (or what will be: shares * prob)
      const yesFairValue = isResolved ? Math.max(g.yes.payout.toNumber(), yesShares * probYes.toNumber()) : (yesShares * probYes.toNumber());
      const yesPnL = yesFairValue - yesInvested;
      const yesROI = yesInvested > 0 ? (yesPnL / yesInvested) * 100 : 0;

      // Calculations for NO
      const noShares = g.no.shares.toNumber();
      const noInvested = g.no.invested.toNumber();             // bruto (con fee)
      const noNetCost = g.no.netCost.toNumber();               // neto (sin fee)
      const noAvgPrice    = noShares > 0 ? noInvested / noShares : 0;  // bruto/share
      const noAvgPriceNet = noShares > 0 ? noNetCost  / noShares : 0;  // neto/share
      
      const noFairValue = isResolved ? Math.max(g.no.payout.toNumber(), noShares * probNo.toNumber()) : (noShares * probNo.toNumber());
      const noPnL = noFairValue - noInvested;
      const noROI = noInvested > 0 ? (noPnL / noInvested) * 100 : 0;

      // Market Totals
      const totalInvested = yesInvested + noInvested;
      const totalFairValue = yesFairValue + noFairValue;
      const totalPnL = totalFairValue - totalInvested;
      const totalROI = totalInvested > 0 ? (totalPnL / totalInvested) * 100 : 0;

      // Settlement Scenarios — USER perspective:
      // If YES wins: user collects yesShares × $1, net = payout - what they paid for YES only
      // If NO wins:  user collects noShares × $1,  net = payout - what they paid for NO only
      const ifYesWinsPayout = yesShares;
      const ifNoWinsPayout  = noShares;
      const ifYesWinsPnL = ifYesWinsPayout - yesInvested;
      const ifNoWinsPnL  = ifNoWinsPayout  - noInvested;

      const obYes = obMap[`${g.marketId}__YES`] || { shares: 0, revenue: 0, avgPrice: 0 };
      const obNo  = obMap[`${g.marketId}__NO`]  || { shares: 0, revenue: 0, avgPrice: 0 };

      return {
        ...g,
        yes: {
          ...g.yes,
          shares: yesShares,
          invested: yesInvested,
          fees: g.yes.fees.toNumber(),
          avgPrice: yesAvgPrice,        // bruto: totalPagado / shares
          avgPriceNet: yesAvgPriceNet,  // neto: sinFee / shares
          fairValue: yesFairValue,
          pnl: yesPnL,
          roi: yesROI,
          prob: probYes.toNumber(),
          openOrders: {
            pendingShares: obYes.shares,
            expectedRevenue: obYes.revenue,
            avgListPrice: obYes.avgPrice,
          },
        },
        no: {
          ...g.no,
          shares: noShares,
          invested: noInvested,
          fees: g.no.fees.toNumber(),
          avgPrice: noAvgPrice,        // bruto: totalPagado / shares
          avgPriceNet: noAvgPriceNet,  // neto: sinFee / shares
          fairValue: noFairValue,
          pnl: noPnL,
          roi: noROI,
          prob: probNo.toNumber(),
          openOrders: {
            pendingShares: obNo.shares,
            expectedRevenue: obNo.revenue,
            avgListPrice: obNo.avgPrice,
          },
        },

        amount: totalInvested,
        fairValue: totalFairValue,
        payout: isResolved ? totalFairValue : 0, // In resolved mode, payout is the total fair value
        totalPnL,
        totalROI,
        scenarios: {
          ifYesWins: { payout: ifYesWinsPayout, net: ifYesWinsPnL },
          ifNoWins: { payout: ifNoWinsPayout, net: ifNoWinsPnL },
        },
        // Legacy fields for backward compat
        shares: g.shares.toNumber(),
        totalFees: g.totalFees.toNumber(),
        currentPrice: probYes.toNumber(),
        potentialReturn: Math.max(ifYesWinsPayout, ifNoWinsPayout),
      };
    });
  }

  static async getById(id: string) {
    const position = await prisma.position.findUnique({
      where: { id },
      include: { market: true, currentOwner: true, listing: true },
    });

    if (!position) return null;

    const odds = OddsCalculator.calculateOdds(
      position.market.yesPool,
      position.market.noPool,
    );
    const currentPrice = new Decimal(
      position.side === "YES" ? odds.yesOdds : odds.noOdds,
    ).dividedBy(100);

    // Fallback for legacy
    const initialProb = position.initialProbability?.toNumber() || 50;
    const legacyPrice = new Decimal(initialProb).dividedBy(100);

    const shares =
      (position as any).shares && !(position as any).shares.isZero()
        ? new Decimal((position as any).shares)
        : position.amount.dividedBy(legacyPrice);

    const purchasePrice =
      (position as any).purchasePrice &&
      !(position as any).purchasePrice.isZero()
        ? new Decimal((position as any).purchasePrice)
        : legacyPrice;

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
        platformFee: position.market.platformFee?.toNumber(),
      },
    };
  }

  /**
   * Split a position into two parts for fractional selling.
   * @param tx - Prisma transaction client
   * @param positionId - The position to split
   * @param userId - The current owner (for validation)
   * @param splitAmount - The amount to split off (for listing)
   * @returns The new position created from the split
   */
  static async split(
    tx: Parameters<Parameters<typeof prisma.$transaction>[0]>[0],
    positionId: string,
    userId: string,
    splitAmount: number,
  ) {
    const position = await tx.position.findUnique({
      where: { id: positionId },
      include: { market: true },
    });

    if (!position) throw new Error("Position not found");
    if (position.currentOwnerId !== userId)
      throw new Error("Not position owner");
    if (position.isForSale) throw new Error("Position already listed");
    if (position.market.status !== "ACTIVE")
      throw new Error("Market not active");

    const splitDecimal = new Decimal(splitAmount);
    if (splitDecimal.lessThanOrEqualTo(0)) {
      throw new Error("Split amount must be positive");
    }
    if (splitDecimal.greaterThanOrEqualTo(position.amount)) {
      throw new Error("Split amount must be less than position amount");
    }

    // Reduce the original position amount
    await tx.position.update({
      where: { id: positionId },
      data: { amount: position.amount.minus(splitDecimal) },
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
        shares: (position as any).shares.times(
          splitDecimal.dividedBy(position.amount),
        ),
        purchasePrice: (position as any).purchasePrice,
        isForSale: true, // Mark for sale immediately
      },
      include: { market: true },
    });

    return newPosition;
  }
}
