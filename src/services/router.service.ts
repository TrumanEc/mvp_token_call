import { prisma } from "@/lib/prisma";
import { Decimal } from "@prisma/client/runtime/library";
import { LmsrService } from "./lmsr.service";
import { BalanceService } from "./balance";
import { OrderType } from "@prisma/client";

export class RouterService {
  /**
   * "Best Buy": Ejecuta una compra al mercado (Market Buy),
   * enrutando los fondos entre el OrderBook (órdenes de limit sell) y el LMSR.
   * Garantiza algorítmicamente el precio más bajo posible por share.
   */
  static async executeMarketBuy(data: {
    marketId: string;
    userId: string;
    side: "YES" | "NO";
    budget: number; // Monto BRUTO total a gastar (incluyendo comisiones)
  }) {
    return prisma.$transaction(async (tx) => {
      const budgetNum = data.budget;

      if (budgetNum <= 0) throw new Error("Monto a comprar debe ser positivo.");

      const market = await tx.market.findUnique({
        where: { id: data.marketId },
        select: { id: true, qYes: true, qNo: true, b: true, status: true, yesPool: true, noPool: true, platformFee: true },
      });

      if (!market || market.status !== "ACTIVE") {
        throw new Error("El mercado no está activo");
      }

      const user = await tx.user.findUnique({ where: { id: data.userId } });
      if (!user) throw new Error("Usuario no encontrado");

      const totalDeductDec = new Decimal(budgetNum);
      if (new Decimal(user.balance).lessThan(totalDeductDec)) {
        throw new Error("Balance insuficiente");
      }

      const lmsrService = new LmsrService();
      let remainingGross = budgetNum;

      // Variables de tracking
      let lmsrSharesCollected = 0;
      let lmsrNetSpent = 0;
      let obSharesCollected = 0;
      let obNetSpent = 0;
      let lmsrFeeAmount = 0;
      let obFeeAmount = 0;
      let selfMatchSpentNet = 0; // Tracks the net proceeds paid to the user themselves during wash trades
      
      const lmsrFeeRate = market.platformFee ? Number(market.platformFee) : 0.1;
      const obFeeRate = 0.02; // 2% P2P

      // Estado mutado del LMSR en memoria
      let currentQYes = market.qYes;
      let currentQNo = market.qNo;

      const executionPath: Array<{ fuente: string; invertidoBruto: number; invertidoNeto: number; shares: number; precioPromedio: number }> = [];

      // 1. Extraer todas las Limit Sells relevantes
      const asks = await tx.order.findMany({
        where: {
          marketId: data.marketId,
          type: OrderType.SELL,
          side: data.side,
          status: { in: ["OPEN", "PARTIAL"] }
        },
        orderBy: { pricePerShare: "asc" },
        include: { user: true, position: true }
      });

      let askIndex = 0;

      // START ROUTING LOOP
      while (remainingGross > 0.0001) {
        const { pYes, pNo } = lmsrService.getPrice(currentQYes, currentQNo, market.b);
        const lmsrSpotPrice = data.side === "YES" ? pYes : pNo;

        let bestAsk = askIndex < asks.length ? asks[askIndex] : null;

        // Caso A: El LMSR está por debajo o igual al precio del OrderBook
        if (!bestAsk || lmsrSpotPrice < bestAsk.pricePerShare - 0.0001) {
          let safeNetToLMSR = remainingGross * (1 - lmsrFeeRate);
          
          if (bestAsk) {
            const netToReachTarget = lmsrService.getCostToReachTargetPrice(
              currentQYes, currentQNo, market.b, data.side, bestAsk.pricePerShare
            );
            if (netToReachTarget > 0 && netToReachTarget <= safeNetToLMSR) {
               safeNetToLMSR = netToReachTarget;
            }
          }

          const sharesGenerados = lmsrService.getSharesToBuy(currentQYes, currentQNo, market.b, data.side, safeNetToLMSR);
          
          if (sharesGenerados > 0 && safeNetToLMSR > 0) {
             const stepGross = safeNetToLMSR / (1 - lmsrFeeRate);
             const stepFee = stepGross - safeNetToLMSR;

             lmsrSharesCollected += sharesGenerados;
             lmsrNetSpent += safeNetToLMSR;
             lmsrFeeAmount += stepFee;
             remainingGross -= stepGross;
             
             if (data.side === "YES") currentQYes += sharesGenerados;
             else currentQNo += sharesGenerados;

             executionPath.push({
               fuente: "LMSR",
               invertidoBruto: stepGross,
               invertidoNeto: safeNetToLMSR,
               shares: sharesGenerados,
               precioPromedio: safeNetToLMSR / sharesGenerados
             });
          } else {
             break;
          }
        } 
        // Caso B: El OrderBook ofrece mejor precio
        else {
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
             precioPromedio: bestAsk.pricePerShare
          });

          await tx.order.update({
             where: { id: bestAsk.id },
             data: { remainingShares: bestAsk.remainingShares, status: newStatus }
          });

          if (bestAsk.positionId) {
             const posBefore = await tx.position.findUnique({ where: { id: bestAsk.positionId }});
             if (posBefore) {
               const posSharesLeft = posBefore.shares - sharesBought;
               await tx.position.update({
                 where: { id: bestAsk.positionId },
                 data: { shares: Math.max(0, posSharesLeft), isForSale: posSharesLeft > 0 }
               });
             }
          }

          if (bestAsk.userId === data.userId) {
             selfMatchSpentNet += spentNet;
          }

          await BalanceService.credit(
            tx, bestAsk.userId, spentNet, "POSITION_SOLD", 
            `Sold ${sharesBought.toFixed(2)} ${data.side} shares via Limit Order`, data.marketId
          );

          if (bestAsk.positionId) {
             await tx.positionTransfer.create({
               data: {
                 positionId: bestAsk.positionId, fromUserId: bestAsk.userId, toUserId: data.userId,
                 price: new Decimal(spentNet), listingId: bestAsk.id
               }
             });
          }
        }
      }

      const realSpentGross = budgetNum - remainingGross;
      const totalSharesCollected = lmsrSharesCollected + obSharesCollected;
      const avgPriceOverall = realSpentGross > 0 ? (realSpentGross / totalSharesCollected) : 0;

      await BalanceService.deduct(
        tx, data.userId, new Decimal(realSpentGross), "BET_PLACED",
        `Market Buy: ${totalSharesCollected.toFixed(2)} ${data.side} for $${realSpentGross.toFixed(2)}`,
        data.marketId
      );

      const netAmountForPosition = realSpentGross - selfMatchSpentNet;
      const netTotalCostForPosition = lmsrNetSpent + obNetSpent - selfMatchSpentNet;

      const userPosition = await tx.position.create({
        data: {
          marketId: data.marketId,
          originalOwnerId: data.userId,
          currentOwnerId: data.userId,
          side: data.side,
          amount: new Decimal(netAmountForPosition),
          status: "ACTIVE",
          shares: totalSharesCollected,
          purchasePrice: new Decimal(avgPriceOverall),
          totalCost: netTotalCostForPosition,
          avgCostPerShare: totalSharesCollected > 0 ? netTotalCostForPosition / totalSharesCollected : 0
        },
        include: { market: true, currentOwner: true }
      });

      if (lmsrNetSpent > 0) {
         const stateBefore = lmsrService.getMarketState(market.qYes, market.qNo, market.b);
         await tx.market.update({
           where: { id: data.marketId },
           data: {
             qYes: currentQYes,
             qNo: currentQNo,
             yesPool: data.side === "YES" ? { increment: lmsrNetSpent } : undefined,
             noPool:  data.side === "NO"  ? { increment: lmsrNetSpent } : undefined,
           }
         });
         const stateAfter = lmsrService.getMarketState(currentQYes, currentQNo, market.b);
         await tx.lmsrSnapshot.create({
            data: {
              marketId: data.marketId,
              userId: data.userId,
              side: data.side,
              triggerType: "ROUTED_BUY",
              cost: lmsrNetSpent,
              deltaShares: lmsrSharesCollected,
              qYesBefore: stateBefore.qYes, qNoBefore: stateBefore.qNo, pYesBefore: stateBefore.pYes,
              qYesAfter: stateAfter.qYes, qNoAfter: stateAfter.qNo, pYesAfter: stateAfter.pYes
            }
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
            path: executionPath
        }
      };
    }, { maxWait: 15000, timeout: 30000 });
  }

  static async simulateMarketBuy(data: {
    marketId: string;
    side: "YES" | "NO";
    budget: number; // Monto BRUTO total
  }) {
    const budgetNum = data.budget;
    if (budgetNum <= 0) throw new Error("Monto a comprar debe ser positivo.");

    const market = await prisma.market.findUnique({
      where: { id: data.marketId },
      select: { id: true, qYes: true, qNo: true, b: true, status: true, platformFee: true },
    });

    if (!market || market.status !== "ACTIVE") {
      throw new Error("El mercado no está activo");
    }

    const lmsrService = new LmsrService();
    let remainingGross = budgetNum;
    
    const lmsrFeeRate = market.platformFee ? Number(market.platformFee) : 0.1;
    const obFeeRate = 0.02;

    let lmsrSharesCollected = 0;
    let lmsrNetSpent = 0;
    let obSharesCollected = 0;
    let obNetSpent = 0;
    let lmsrFeeAmount = 0;
    let obFeeAmount = 0;
    
    let currentQYes = market.qYes;
    let currentQNo = market.qNo;

    const asks = await prisma.order.findMany({
      where: {
        marketId: data.marketId,
        type: OrderType.SELL,
        side: data.side,
        status: { in: ["OPEN", "PARTIAL"] }
      },
      orderBy: { pricePerShare: "asc" }
    });

    const clonedAsks = asks.map(a => ({ ...a }));
    let askIndex = 0;

    while (remainingGross > 0.0001) {
      const { pYes, pNo } = lmsrService.getPrice(currentQYes, currentQNo, market.b);
      const lmsrSpotPrice = data.side === "YES" ? pYes : pNo;

      let bestAsk = askIndex < clonedAsks.length ? clonedAsks[askIndex] : null;

      if (!bestAsk || lmsrSpotPrice < bestAsk.pricePerShare - 0.0001) {
        let safeNetToLMSR = remainingGross * (1 - lmsrFeeRate);
        if (bestAsk) {
          const netToReachTarget = lmsrService.getCostToReachTargetPrice(currentQYes, currentQNo, market.b, data.side, bestAsk.pricePerShare);
          if (netToReachTarget > 0 && netToReachTarget <= safeNetToLMSR) safeNetToLMSR = netToReachTarget;
        }

        const sharesGenerados = lmsrService.getSharesToBuy(currentQYes, currentQNo, market.b, data.side, safeNetToLMSR);
        if (sharesGenerados > 0 && safeNetToLMSR > 0.0001) {
           const stepGross = safeNetToLMSR / (1 - lmsrFeeRate);
           lmsrSharesCollected += sharesGenerados;
           lmsrNetSpent += safeNetToLMSR;
           lmsrFeeAmount += (stepGross - safeNetToLMSR);
           remainingGross -= stepGross;
           if (data.side === "YES") currentQYes += sharesGenerados;
           else currentQNo += sharesGenerados;
        } else break;
      } else {
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
      }
    }

    const realSpentGross = budgetNum - remainingGross;
    const totalSharesCollected = lmsrSharesCollected + obSharesCollected;
    const avgPriceOverall = realSpentGross > 0 ? (realSpentGross / totalSharesCollected) : 0;
    const newPrices = lmsrService.getPrice(currentQYes, currentQNo, market.b);

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
       newProbabilities: { yes: newPrices.pYes, no: newPrices.pNo }
    };
  }
}
