import { prisma } from "@/lib/prisma";
import { Decimal } from "@prisma/client/runtime/library";
import { OddsCalculator } from "./odds-calculator";
import { BalanceService } from "./balance";
import { LmsrService } from "./lmsr.service";

export type Side = "YES" | "NO";

export class PositionService {
  static async create(data: {
    marketId: string;
    userId: string;
    side: Side;
    amount: number;
  }) {
    return prisma.$transaction(async (tx) => {
      const market = await tx.market.findUnique({
        where: { id: data.marketId },
      });
      if (!market || market.status !== "ACTIVE") {
        throw new Error("Market is not active");
      }

      const user = await tx.user.findUnique({ where: { id: data.userId } });
      if (!user) throw new Error("User not found");

      const amount = new Decimal(data.amount);
      if (new Decimal(user.balance).lessThan(amount)) {
        throw new Error("Insufficient balance");
      }

      // LMSR Logic
      const lmsrService = new LmsrService();

      // Market specific configs (no global fallbacks - explicit limits only)
      const maxBetAmount = market.maxBetAmount ?? null;
      const maxPriceImpact = market.maxPriceImpact ?? null;

      const validation = lmsrService.validateBetAmount(
        data.amount,
        market.qYes,
        market.qNo,
        market.b,
        data.side,
        maxBetAmount,
        maxPriceImpact,
      );

      if (!validation.allowed) {
        throw new Error(
          validation.reason || "Monto excede los límites permitidos",
        );
      }

      // State before
      const stateBefore = lmsrService.getMarketState(
        market.qYes,
        market.qNo,
        market.b,
      );

      const platformFeeRate = market.platformFee
        ? Number(market.platformFee)
        : 0.1;
      // Inclusive fee calculation: Total = Net * (1 + platformFeeRate)
      // Net = Total / (1 + platformFeeRate)
      const netAmount = amount.toNumber() / (1 + platformFeeRate);
      const feeAmount = amount.toNumber() - netAmount;

      // Calculate shares to buy
      const shares = lmsrService.getSharesToBuy(
        market.qYes,
        market.qNo,
        market.b,
        data.side,
        netAmount,
      );
      const cost = lmsrService.getCostToBuy(
        market.qYes,
        market.qNo,
        market.b,
        data.side,
        shares,
      );
      const avgCostPerShare = shares > 0 ? cost / shares : 0;

      // Update Market State
      const newQYes = data.side === "YES" ? market.qYes + shares : market.qYes;
      const newQNo = data.side === "NO" ? market.qNo + shares : market.qNo;
      const stateAfter = lmsrService.getMarketState(newQYes, newQNo, market.b);

      // Deduct balance
      await BalanceService.deduct(
        tx,
        user.id,
        amount,
        "BET_PLACED",
        `Bet ${data.amount} on ${data.side}`,
        data.marketId,
      );

      // Create Position
      const position = await tx.position.create({
        data: {
          marketId: data.marketId,
          originalOwnerId: data.userId,
          currentOwnerId: data.userId,
          side: data.side,
          amount, // Total amount paid by user including fee
          status: "ACTIVE",
          shares,
          avgCostPerShare,
          totalCost: cost, // Net cost applied to reserves
        },
        include: { market: true, currentOwner: true },
      });

      // Update Market
      await tx.market.update({
        where: { id: data.marketId },
        data: {
          qYes: newQYes,
          qNo: newQNo,
          // Update legacy pools for audit/volume tracking
          yesPool: data.side === "YES" ? { increment: amount } : undefined,
          noPool: data.side === "NO" ? { increment: amount } : undefined,
        },
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
          triggerType: "BUY",
        },
      });

      return {
        ...position,
        amount: position.amount.toNumber(),
        initialProbability: stateAfter.pYes, // Return current prob as ref
      };
    });
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

    const groups: Record<string, any> = {};

    for (const p of rawPositions) {
      // Group active positions by market and side
      // Keep inactive (RESOLVED) positions separate to show history correctly
      const key =
        p.status === "ACTIVE" ? `${p.marketId}-${p.side}` : `resolved-${p.id}`;

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
            noPool: p.market.noPool.toNumber(),
          },
          side: p.side,
          shares: new Decimal(0),
          amount: new Decimal(0),
          totalFees: new Decimal(0),
          status: p.status,
          isForSale: false,
          createdAt: p.createdAt,
          history: [],
        };
      }

      const pShares = new Decimal((p as any).shares || 0);
      const feeAmount = p.amount.minus(new Decimal((p as any).totalCost || 0));
      groups[key].shares = groups[key].shares.plus(pShares);
      groups[key].amount = groups[key].amount.plus(p.amount);
      groups[key].totalFees = groups[key].totalFees.plus(feeAmount);
      groups[key].history.push({
        id: p.id,
        amount: p.amount.toNumber(),
        shares: pShares.toNumber(),
        createdAt: p.createdAt,
        purchasePrice: (p as any).purchasePrice?.toNumber(),
      });

      if (p.isForSale) groups[key].isForSale = true;
    }

    return Object.values(groups).map((g: any) => {
      const odds = OddsCalculator.calculateOdds(
        new Decimal(g.market.yesPool),
        new Decimal(g.market.noPool),
      );

      const currentPrice = new Decimal(
        g.side === "YES" ? odds.yesOdds : odds.noOdds,
      ).dividedBy(100);
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
        purchasePrice: avgPrice, // Weighted avg
        currentPrice: currentPrice.toNumber(),
        fairValue,
        potentialReturn,
        currentPayout: g.side === "YES" ? odds.yesPayout : odds.noPayout,
        breakEvenPrice: avgPrice,
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
