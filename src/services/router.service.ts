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
    budget: number; // Monto total $
  }) {
    return prisma.$transaction(async (tx) => {
      const startTimestamp = new Date();
      const budgetNum = data.budget;

      if (budgetNum <= 0) throw new Error("Monto a comprar debe ser positivo.");

      const market = await tx.market.findUnique({
        where: { id: data.marketId },
        select: { id: true, qYes: true, qNo: true, b: true, status: true, yesPool: true, noPool: true },
        // En un entorno de altísima concurrencia, esto debería llevar un lock de fila,
        // pero para MVP usamos transacciones serializables o lectura normal.
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
      let remainingBudget = budgetNum;

      // Variables de tracking
      let lmsrSharesCollected = 0;
      let lmsrBudgetSpent = 0;
      let obSharesCollected = 0;
      let obBudgetSpent = 0;
      
      // Estado mutado del LMSR en memoria
      let currentQYes = market.qYes;
      let currentQNo = market.qNo;

      // Log de ejecución (Debugging & Admin Tracking)
      const executionPath: Array<{ fuente: string; invertido: number; shares: number; precioPromedio: number }> = [];

      // 1. Extraer todas las Limit Sells relevantes del lado que queremos comprar (ordenadas de más baratas a más caras)
      // Nota: Si compramos YES, buscamos Sellers de YES (isForSale = true, OrderType = SELL, side = YES)
      const asks = await tx.order.findMany({
        where: {
          marketId: data.marketId,
          type: OrderType.SELL,
          side: data.side,
          status: { in: ["OPEN", "PARTIAL"] } // Abiertas
        },
        orderBy: { pricePerShare: "asc" },
        include: { user: true, position: true }
      });

      let askIndex = 0;

      // START ROUTING LOOP
      while (remainingBudget > 0.0001) { // Límite de flotantes
        // Obtener precio marginal P_LMSR
        const { pYes, pNo } = lmsrService.getPrice(currentQYes, currentQNo, market.b);
        const lmsrSpotPrice = data.side === "YES" ? pYes : pNo;

        let bestAsk = askIndex < asks.length ? asks[askIndex] : null;

        // Caso A: El LMSR está por debajo o igual al precio del OrderBook (O no hay Asks)
        // Usamos una tolerancia de 0.0001 para evitar loops infinitos por precisión flotante
        if (!bestAsk || lmsrSpotPrice < bestAsk.pricePerShare - 0.0001) {
          // Si el LMSR es más barato, averiguamos cuánto podemos bombearle de liquidez
          // antes de que su precio iguale el precio del orderbook (o si ya nos gastamos el balance restante).
          let safeBudgetToLMSR = remainingBudget;
          
          if (bestAsk) {
            const budgetToReachTarget = lmsrService.getCostToReachTargetPrice(
              currentQYes, currentQNo, market.b, data.side, bestAsk.pricePerShare
            );
            
            // Si el costo de igualar el OB es menor a nuestro presupuesto, invertimos solo eso
            // para que en el siguiente iter (loop) nos pasemos orgánicamente al OrderBook.
            if (budgetToReachTarget > 0 && budgetToReachTarget <= remainingBudget) {
              safeBudgetToLMSR = budgetToReachTarget;
            }
          }

          // Mintear los shares en memoria
          const sharesGenerados = lmsrService.getSharesToBuy(currentQYes, currentQNo, market.b, data.side, safeBudgetToLMSR);
          
          if (sharesGenerados > 0 && safeBudgetToLMSR > 0) {
             lmsrSharesCollected += sharesGenerados;
             lmsrBudgetSpent += safeBudgetToLMSR;
             remainingBudget -= safeBudgetToLMSR;
             
             // Actualizar "Q" (Liquidez Virtual del LMSR) para el siguiente step
             if (data.side === "YES") currentQYes += sharesGenerados;
             else currentQNo += sharesGenerados;

             executionPath.push({
               fuente: "LMSR",
               invertido: safeBudgetToLMSR,
               shares: sharesGenerados,
               precioPromedio: safeBudgetToLMSR / sharesGenerados
             });
          } else {
             // Salvoconducto anti-infinte loops por flotantes ultrabajos
             break;
          }
        } 
        // Caso B: El OrderBook ofrece mejor precio (o empatado y priorizamos dar salida a P2P)
        else {
          const costToClearAsk = bestAsk.remainingShares * bestAsk.pricePerShare;
          
          let spentOnAsk = 0;
          let sharesBought = 0;
          let newStatus = bestAsk.status;

          if (remainingBudget >= costToClearAsk) {
            // El usuario absorbe la orden completa
            spentOnAsk = costToClearAsk;
            sharesBought = bestAsk.remainingShares;
            bestAsk.remainingShares = 0;
            newStatus = "FILLED";
            askIndex++; // Pasamos a la siguiente orden límite en el próximo loop
          } else {
            // El usuario solo puede comprar una fracción de la orden
            spentOnAsk = remainingBudget;
            sharesBought = remainingBudget / bestAsk.pricePerShare;
            bestAsk.remainingShares -= sharesBought;
            newStatus = "PARTIAL";
          }

          // Tracking para comprador
          obBudgetSpent += spentOnAsk;
          obSharesCollected += sharesBought;
          remainingBudget -= spentOnAsk;

          executionPath.push({
             fuente: "OrderBook",
             invertido: spentOnAsk,
             shares: sharesBought,
             precioPromedio: bestAsk.pricePerShare
          });

          // == ACCIONES DE BASE DE DATOS P2P ==
          
          // 1. Actualizar entidad [Order] del seller
          await tx.order.update({
             where: { id: bestAsk.id },
             data: { 
               remainingShares: bestAsk.remainingShares,
               status: newStatus 
             }
          });

          // 2. Descontar shares y bloquear [Position] original del seller
          // También verificamos si la posición del seller llega a cero para des-listarla.
          if (bestAsk.positionId) {
             const posBefore = await tx.position.findUnique({ where: { id: bestAsk.positionId }});
             if (posBefore) {
               const posSharesLeft = posBefore.shares - sharesBought;
               await tx.position.update({
                 where: { id: bestAsk.positionId },
                 data: {
                   shares: Math.max(0, posSharesLeft),
                   isForSale: posSharesLeft > 0 
                 }
               });
             }
          }

          // 3. Pagar al Seller  (Comisión P2P podría aplicarse aquí en un futuro, 
          // pero el usuario especificó en el plan no alterar el flujo core primero, solo transar)
          await BalanceService.credit(
            tx, bestAsk.userId, spentOnAsk, "POSITION_SOLD", 
            `Sold ${sharesBought.toFixed(2)} ${data.side} shares via Limit Order`, data.marketId
          );

          // 4. Trace the transfer (Opcional pero útil)
          if (bestAsk.positionId) {
             await tx.positionTransfer.create({
               data: {
                 positionId: bestAsk.positionId,
                 fromUserId: bestAsk.userId,
                 toUserId: data.userId,
                 price: new Decimal(spentOnAsk),
                 listingId: bestAsk.id
               }
             });
          }
        }
      }

      // == CONSOLIDAR Y ACTUALIZAR ENTIDADES DEL USUARIO Y MERCADO ==
      
      const realSpentBudget = budgetNum - remainingBudget;
      const totalSharesCollected = lmsrSharesCollected + obSharesCollected;
      const avgPriceOverall = realSpentBudget > 0 ? (realSpentBudget / totalSharesCollected) : 0;

      // A. Deducir el monto del comprador (Se pagó una vez en conjunto)
      await BalanceService.deduct(
        tx,
        data.userId,
        new Decimal(realSpentBudget),
        "BET_PLACED",
        `Market Buy: ${totalSharesCollected.toFixed(2)} ${data.side} for $${realSpentBudget.toFixed(2)}`,
        data.marketId
      );

      // B. Crear la POSICIÓN consolidada para el Comprador
      const userPosition = await tx.position.create({
        data: {
          marketId: data.marketId,
          originalOwnerId: data.userId,
          currentOwnerId: data.userId,
          side: data.side,
          amount: new Decimal(realSpentBudget), // Costo total ("Invested")
          status: "ACTIVE",
          shares: totalSharesCollected,
          purchasePrice: new Decimal(avgPriceOverall),
          totalCost: realSpentBudget,
          avgCostPerShare: avgPriceOverall
        }
      });

      // C. Actualizar LMSR (sólo si se minteó)
      if (lmsrBudgetSpent > 0 || lmsrSharesCollected > 0) {
         // Update params
         await tx.market.update({
           where: { id: data.marketId },
           data: {
             qYes: currentQYes,
             qNo: currentQNo,
             yesPool: data.side === "YES" ? { increment: lmsrBudgetSpent } : undefined,
             noPool:  data.side === "NO"  ? { increment: lmsrBudgetSpent } : undefined,
           }
         });

         // Guardar LMSR Snapshot (Para no romper historial de V1)
         const stateBefore = lmsrService.getMarketState(market.qYes, market.qNo, market.b);
         const stateAfter = lmsrService.getMarketState(currentQYes, currentQNo, market.b);
         await tx.lmsrSnapshot.create({
            data: {
              marketId: data.marketId,
              userId: data.userId,
              side: data.side,
              triggerType: "ROUTED_BUY",
              cost: lmsrBudgetSpent,
              deltaShares: lmsrSharesCollected,
              qYesBefore: stateBefore.qYes, qNoBefore: stateBefore.qNo, pYesBefore: stateBefore.pYes,
              qYesAfter: stateAfter.qYes, qNoAfter: stateAfter.qNo, pYesAfter: stateAfter.pYes
            }
         });
      }

      // D. Auditar la ejecución para el Dashboard del Admin (Beta Tracker / Fase 5)
      await tx.marketRouterAuditLog.create({
         data: {
           marketId: data.marketId,
           userId: data.userId,
           requestAmount: new Decimal(budgetNum),
           side: data.side,
           executionType: "BEST_BUY",

           lmsrAllocated: new Decimal(lmsrBudgetSpent),
           lmsrSharesGenerated: lmsrSharesCollected,
           obAllocated: new Decimal(obBudgetSpent),
           obSharesBought: obSharesCollected,

           lmsrAveragePrice: lmsrSharesCollected > 0 ? (lmsrBudgetSpent / lmsrSharesCollected) : 0,
           obAveragePrice: obSharesCollected > 0 ? (obBudgetSpent / obSharesCollected) : 0,
           finalAveragePricePaid: avgPriceOverall,
           timestamp: startTimestamp
         }
      });

      return {
         position: userPosition,
         executionSummary: {
            spent: realSpentBudget,
            sharesCollected: totalSharesCollected,
            averagePrice: avgPriceOverall,
            lmsrShares: lmsrSharesCollected,
            obShares: obSharesCollected,
            path: executionPath
        }
      };
    }, { maxWait: 15000, timeout: 30000 });
  }
}
