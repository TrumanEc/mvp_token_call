import { prisma } from "@/lib/prisma";
import { Decimal } from "@prisma/client/runtime/library";
import { LmsrService } from "./lmsr.service";
import { BalanceService } from "./balance";
import { OrderType } from "@prisma/client";

export class RouterService {
  /**
   * Execute a market buy for a specific outcome, routing between LMSR and OrderBook.
   */
  static async executeMarketBuy(data: {
    marketId: string;
    userId: string;
    outcomeId: string;
    budget: number;
  }) {
    return prisma.$transaction(async (tx) => {
      const budgetNum = data.budget;
      if (budgetNum <= 0) throw new Error("Monto a comprar debe ser positivo.");

      const market = await tx.market.findUnique({
        where: { id: data.marketId },
        include: { outcomes: { orderBy: { displayOrder: "asc" } } },
      });

      if (!market || market.status !== "ACTIVE") {
        throw new Error("El mercado no está activo");
      }

      const outcomeRecord = market.outcomes.find(o => o.id === data.outcomeId);
      if (!outcomeRecord) throw new Error("Outcome no encontrado en este mercado");

      const isPrimaryPaused =
        market.primaryMarketPaused ||
        (market.primaryPauseScheduledAt &&
          new Date(market.primaryPauseScheduledAt) <= new Date());

      const user = await tx.user.findUnique({ where: { id: data.userId } });
      if (!user) throw new Error("Usuario no encontrado");

      if (new Decimal(user.balance).lessThan(new Decimal(budgetNum))) {
        throw new Error("Balance insuficiente");
      }

      const lmsrService = new LmsrService();
      const params = { b: market.b, alpha: market.alpha, bMin: market.bMin };

      // Build mutable q-vector from outcomes
      const sortedOutcomes = [...market.outcomes].sort((a, b) => a.displayOrder - b.displayOrder);
      const currentQ = sortedOutcomes.map(o => o.qOutstanding);
      const outcomeIdx = sortedOutcomes.findIndex(o => o.id === data.outcomeId);

      let remainingGross = budgetNum;
      let lmsrSharesCollected = 0;
      let lmsrNetSpent = 0;
      let obSharesCollected = 0;
      let obNetSpent = 0;
      let lmsrFeeAmount = 0;
      let obFeeAmount = 0;
      let selfMatchSpentNet = 0;

      const lmsrFeeRate = market.platformFee ? Number(market.platformFee) : 0.015;
      const obFeeRate = 0.02;

      const executionPath: Array<{
        fuente: string; invertidoBruto: number; invertidoNeto: number;
        shares: number; precioPromedio: number;
      }> = [];

      // Fetch limit sells for this outcome
      const asks = await tx.order.findMany({
        where: {
          marketId: data.marketId,
          outcomeId: data.outcomeId,
          type: OrderType.SELL,
          status: { in: ["OPEN", "PARTIAL"] },
        },
        orderBy: { pricePerShare: "asc" },
        include: { user: true, position: true },
      });

      let askIndex = 0;

      // Snapshot q before
      const qBefore = [...currentQ];

      while (remainingGross > 0.0001) {
        const prices = lmsrService.getPricesLSN(currentQ, params);
        const lmsrSpotPrice = prices[outcomeIdx];

        let bestAsk = askIndex < asks.length ? asks[askIndex] : null;

        if (isPrimaryPaused && !bestAsk) break;
        if (!isPrimaryPaused && (!bestAsk || lmsrSpotPrice < bestAsk.pricePerShare - 0.0001)) {
          let safeNetToLMSR = remainingGross * (1 - lmsrFeeRate);

          if (bestAsk) {
            const netToReachTarget = lmsrService.getCostToReachTargetPriceLSN(
              currentQ, params, outcomeIdx, bestAsk.pricePerShare,
            );
            if (netToReachTarget > 0 && netToReachTarget <= safeNetToLMSR) {
              safeNetToLMSR = netToReachTarget;
            }
          }

          const sharesGenerados = lmsrService.getSharesToBuyLSN(
            currentQ, params, outcomeIdx, safeNetToLMSR,
          );

          if (sharesGenerados > 0 && safeNetToLMSR > 0) {
            const stepGross = safeNetToLMSR / (1 - lmsrFeeRate);
            const stepFee = stepGross - safeNetToLMSR;

            lmsrSharesCollected += sharesGenerados;
            lmsrNetSpent += safeNetToLMSR;
            lmsrFeeAmount += stepFee;
            remainingGross -= stepGross;

            currentQ[outcomeIdx] += sharesGenerados;

            executionPath.push({
              fuente: "LMSR",
              invertidoBruto: stepGross,
              invertidoNeto: safeNetToLMSR,
              shares: sharesGenerados,
              precioPromedio: safeNetToLMSR / sharesGenerados,
            });
          } else {
            break;
          }
        } else if (bestAsk) {
          const netToClearAsk = bestAsk.remainingShares * bestAsk.pricePerShare;
          const grossToClearAsk = netToClearAsk / (1 - obFeeRate);

          let spentGross = 0;
          let spentNet = 0;
          let sharesBought = 0;
          let newStatus = bestAsk.status;

          if (remainingGross >= grossToClearAsk) {
            spentGross = grossToClearAsk;
            spentNet = netToClearAsk;
            sharesBought = bestAsk.remainingShares;
            bestAsk.remainingShares = 0;
            newStatus = "FILLED";
            askIndex++;
          } else {
            spentGross = remainingGross;
            spentNet = spentGross * (1 - obFeeRate);
            sharesBought = spentNet / bestAsk.pricePerShare;
            bestAsk.remainingShares -= sharesBought;
            newStatus = "PARTIAL";
          }

          const stepFee = spentGross - spentNet;
          obNetSpent += spentNet;
          obSharesCollected += sharesBought;
          obFeeAmount += stepFee;
          remainingGross -= spentGross;

          executionPath.push({
            fuente: "OrderBook",
            invertidoBruto: spentGross,
            invertidoNeto: spentNet,
            shares: sharesBought,
            precioPromedio: bestAsk.pricePerShare,
          });

          await tx.order.update({
            where: { id: bestAsk.id },
            data: { remainingShares: bestAsk.remainingShares, status: newStatus },
          });

          if (bestAsk.positionId) {
            const posBefore = await tx.position.findUnique({ where: { id: bestAsk.positionId } });
            if (posBefore) {
              const posSharesLeft = posBefore.shares - sharesBought;
              await tx.position.update({
                where: { id: bestAsk.positionId },
                data: { shares: Math.max(0, posSharesLeft), isForSale: posSharesLeft > 0 },
              });
            }
          }

          if (bestAsk.userId === data.userId) {
            selfMatchSpentNet += spentNet;
          }

          await BalanceService.credit(
            tx, bestAsk.userId, spentNet, "POSITION_SOLD",
            `Sold ${sharesBought.toFixed(2)} ${outcomeRecord.name} shares via Limit Order`,
            data.marketId,
          );

          if (bestAsk.positionId) {
            await tx.positionTransfer.create({
              data: {
                positionId: bestAsk.positionId,
                fromUserId: bestAsk.userId,
                toUserId: data.userId,
                price: new Decimal(spentNet),
                listingId: bestAsk.id,
              },
            });
          }
        } else {
          break;
        }
      }

      const realSpentGross = budgetNum - remainingGross;
      const totalSharesCollected = lmsrSharesCollected + obSharesCollected;

      if (totalSharesCollected <= 0) {
        if (isPrimaryPaused) {
          throw new Error("No hay órdenes P2P disponibles. El mercado primario está pausado.");
        }
        throw new Error("No se pudieron adquirir shares. Intenta con un monto mayor.");
      }

      const avgPriceOverall = realSpentGross > 0 ? realSpentGross / totalSharesCollected : 0;

      await BalanceService.deduct(
        tx, data.userId, new Decimal(realSpentGross), "BET_PLACED",
        `Market Buy: ${totalSharesCollected.toFixed(2)} ${outcomeRecord.name} for $${realSpentGross.toFixed(2)}`,
        data.marketId,
      );

      const netAmountForPosition = realSpentGross - selfMatchSpentNet;
      const netTotalCostForPosition = lmsrNetSpent + obNetSpent - selfMatchSpentNet;

      const userPosition = await tx.position.create({
        data: {
          marketId: data.marketId,
          outcomeId: data.outcomeId,
          originalOwnerId: data.userId,
          currentOwnerId: data.userId,
          side: outcomeRecord.name,
          amount: new Decimal(netAmountForPosition),
          status: "ACTIVE",
          shares: totalSharesCollected,
          purchasePrice: new Decimal(avgPriceOverall),
          totalCost: netTotalCostForPosition,
          avgCostPerShare: totalSharesCollected > 0 ? netTotalCostForPosition / totalSharesCollected : 0,
        },
        include: { market: true, currentOwner: true, outcome: true },
      });

      if (lmsrNetSpent > 0) {
        // Update the outcome's qOutstanding
        await tx.marketOutcome.update({
          where: { id: data.outcomeId },
          data: {
            qOutstanding: currentQ[outcomeIdx],
            pool: { increment: lmsrNetSpent },
          },
        });

        // Update market totalPool
        await tx.market.update({
          where: { id: data.marketId },
          data: { totalPool: { increment: lmsrNetSpent } },
        });

        // Build snapshot
        const pBefore = lmsrService.getPricesLSN(qBefore, params);
        const pAfter = lmsrService.getPricesLSN(currentQ, params);

        const qBeforeMap: Record<string, number> = {};
        const qAfterMap: Record<string, number> = {};
        const pBeforeMap: Record<string, number> = {};
        const pAfterMap: Record<string, number> = {};
        sortedOutcomes.forEach((o, i) => {
          qBeforeMap[o.id] = qBefore[i];
          qAfterMap[o.id] = currentQ[i];
          pBeforeMap[o.id] = pBefore[i];
          pAfterMap[o.id] = pAfter[i];
        });

        await tx.lmsrSnapshot.create({
          data: {
            marketId: data.marketId,
            outcomeId: data.outcomeId,
            userId: data.userId,
            side: outcomeRecord.name,
            triggerType: "ROUTED_BUY",
            cost: lmsrNetSpent,
            deltaShares: lmsrSharesCollected,
            qBefore: qBeforeMap,
            pBefore: pBeforeMap,
            qAfter: qAfterMap,
            pAfter: pAfterMap,
          },
        });
      }

      return {
        position: userPosition,
        executionSummary: {
          spentGross: realSpentGross,
          spentNet: lmsrNetSpent + obNetSpent,
          fee: lmsrFeeAmount + obFeeAmount,
          lmsrFee: lmsrFeeAmount,
          obFee: obFeeAmount,
          sharesCollected: totalSharesCollected,
          averagePrice: avgPriceOverall,
          lmsrShares: lmsrSharesCollected,
          obShares: obSharesCollected,
          path: executionPath,
        },
      };
    }, { maxWait: 15000, timeout: 30000 });
  }

  static async simulateMarketBuy(data: {
    marketId: string;
    outcomeId: string;
    budget: number;
  }) {
    const budgetNum = data.budget;
    if (budgetNum <= 0) throw new Error("Monto a comprar debe ser positivo.");

    const market = await prisma.market.findUnique({
      where: { id: data.marketId },
      include: { outcomes: { orderBy: { displayOrder: "asc" } } },
    });

    if (!market || market.status !== "ACTIVE") {
      throw new Error("El mercado no está activo");
    }

    const outcomeRecord = market.outcomes.find(o => o.id === data.outcomeId);
    if (!outcomeRecord) throw new Error("Outcome no encontrado");

    const simIsPrimaryPaused =
      market.primaryMarketPaused ||
      (market.primaryPauseScheduledAt &&
        new Date(market.primaryPauseScheduledAt) <= new Date());

    const lmsrService = new LmsrService();
    const params = { b: market.b, alpha: market.alpha, bMin: market.bMin };

    const sortedOutcomes = [...market.outcomes].sort((a, b) => a.displayOrder - b.displayOrder);
    const currentQ = sortedOutcomes.map(o => o.qOutstanding);
    const outcomeIdx = sortedOutcomes.findIndex(o => o.id === data.outcomeId);

    let remainingGross = budgetNum;
    const lmsrFeeRate = market.platformFee ? Number(market.platformFee) : 0.015;
    const obFeeRate = 0.02;

    let lmsrSharesCollected = 0;
    let lmsrNetSpent = 0;
    let obSharesCollected = 0;
    let obNetSpent = 0;
    let lmsrFeeAmount = 0;
    let obFeeAmount = 0;

    const asks = await prisma.order.findMany({
      where: {
        marketId: data.marketId,
        outcomeId: data.outcomeId,
        type: OrderType.SELL,
        status: { in: ["OPEN", "PARTIAL"] },
      },
      orderBy: { pricePerShare: "asc" },
    });

    const clonedAsks = asks.map(a => ({ ...a }));
    let askIndex = 0;

    while (remainingGross > 0.0001) {
      const prices = lmsrService.getPricesLSN(currentQ, params);
      const lmsrSpotPrice = prices[outcomeIdx];
      let bestAsk = askIndex < clonedAsks.length ? clonedAsks[askIndex] : null;

      if (simIsPrimaryPaused && !bestAsk) break;
      if (!simIsPrimaryPaused && (!bestAsk || lmsrSpotPrice < bestAsk.pricePerShare - 0.0001)) {
        let safeNetToLMSR = remainingGross * (1 - lmsrFeeRate);
        if (bestAsk) {
          const netToReachTarget = lmsrService.getCostToReachTargetPriceLSN(
            currentQ, params, outcomeIdx, bestAsk.pricePerShare,
          );
          if (netToReachTarget > 0 && netToReachTarget <= safeNetToLMSR) safeNetToLMSR = netToReachTarget;
        }

        const sharesGenerados = lmsrService.getSharesToBuyLSN(
          currentQ, params, outcomeIdx, safeNetToLMSR,
        );
        if (sharesGenerados > 0 && safeNetToLMSR > 0.0001) {
          const stepGross = safeNetToLMSR / (1 - lmsrFeeRate);
          lmsrSharesCollected += sharesGenerados;
          lmsrNetSpent += safeNetToLMSR;
          lmsrFeeAmount += (stepGross - safeNetToLMSR);
          remainingGross -= stepGross;
          currentQ[outcomeIdx] += sharesGenerados;
        } else break;
      } else if (bestAsk) {
        const netToClearAsk = bestAsk.remainingShares * bestAsk.pricePerShare;
        const grossToClearAsk = netToClearAsk / (1 - obFeeRate);

        if (remainingGross >= grossToClearAsk) {
          obNetSpent += netToClearAsk;
          obSharesCollected += bestAsk.remainingShares;
          obFeeAmount += (grossToClearAsk - netToClearAsk);
          remainingGross -= grossToClearAsk;
          bestAsk.remainingShares = 0;
          askIndex++;
        } else {
          const spentGross = remainingGross;
          const spentNet = spentGross * (1 - obFeeRate);
          const sharesBought = spentNet / bestAsk.pricePerShare;
          obNetSpent += spentNet;
          obSharesCollected += sharesBought;
          obFeeAmount += (spentGross - spentNet);
          remainingGross = 0;
        }
      } else {
        break;
      }
    }

    const realSpentGross = budgetNum - remainingGross;
    const totalSharesCollected = lmsrSharesCollected + obSharesCollected;
    const avgPriceOverall = realSpentGross > 0 ? realSpentGross / totalSharesCollected : 0;
    const newPrices = lmsrService.getPricesLSN(currentQ, params);

    const probabilitiesMap: Record<string, number> = {};
    sortedOutcomes.forEach((o, i) => {
      probabilitiesMap[o.id] = newPrices[i];
    });

    return {
      spentGross: realSpentGross,
      spentNet: lmsrNetSpent + obNetSpent,
      fee: lmsrFeeAmount + obFeeAmount,
      lmsrFee: lmsrFeeAmount,
      obFee: obFeeAmount,
      sharesCollected: totalSharesCollected,
      averagePrice: avgPriceOverall,
      lmsrShares: lmsrSharesCollected,
      obShares: obSharesCollected,
      newProbabilities: probabilitiesMap,
    };
  }
}
