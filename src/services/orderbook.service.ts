import { prisma } from "@/lib/prisma";
import { OrderType } from "@prisma/client";
import { Decimal } from "@prisma/client/runtime/library";
import { BalanceService } from "./balance";

export class OrderBookService {
  /**
   * Coloca una orden de compra límite en el OrderBook.
   * Cierra/Deduce el balance de inmediato. Las ejecuciones ocurren asíncronamente
   * o al momento (si se cruzan via Router).
   */
  static async createLimitBuy(data: {
    marketId: string;
    userId: string;
    side: "YES" | "NO";
    amount: number; // Monto en $ (USD) a gastar total ("budget")
    pricePerShare: number; // Precio límite máximo a pagar por share (ej: 0.40)
  }) {
    return prisma.$transaction(async (tx) => {
      const user = await tx.user.findUnique({ where: { id: data.userId } });
      if (!user) throw new Error("Usuario no encontrado");

      const market = await tx.market.findUnique({ where: { id: data.marketId } });
      if (!market || market.status !== "ACTIVE") {
        throw new Error("El mercado no está activo");
      }

      if (data.pricePerShare <= 0 || data.pricePerShare >= 1) {
        throw new Error("El precio por share debe estar entre 0 y 1 exclusivo");
      }

      if (data.amount <= 0) {
        throw new Error("El monto de la orden debe ser positivo");
      }

      const totalToLock = new Decimal(data.amount);
      if (new Decimal(user.balance).lessThan(totalToLock)) {
        throw new Error("Balance insuficiente para colocar la orden");
      }

      // El número esperado de shares es el budget dividido por el precio límite
      const expectedShares = data.amount / data.pricePerShare;

      // 1. Deducir balance (bloquear fondos)
      await BalanceService.deduct(
        tx,
        user.id,
        totalToLock,
        "LIMIT_ORDER_PLACED",
        `Limit Buy placed for ${expectedShares.toFixed(2)} ${data.side} @ $${data.pricePerShare}`,
        data.marketId,
      );

      // 2. Crear registro en el OrderBook
      const order = await tx.order.create({
        data: {
          marketId: data.marketId,
          userId: data.userId,
          side: data.side,
          type: OrderType.BUY,
          pricePerShare: data.pricePerShare,
          initialShares: expectedShares,
          remainingShares: expectedShares,
          totalLocked: totalToLock,
          status: "OPEN",
        },
      });

      return order;
    });
  }

  /**
   * Coloca una orden límite de venta.
   * Separa la porción de shares de la posición original y la marca "isForSale".
   */
  static async createLimitSell(data: {
    marketId: string;
    userId: string;
    positionId: string;
    sharesToSell: number;
    pricePerShare: number;
  }) {
    return prisma.$transaction(async (tx) => {
      const position = await tx.position.findUnique({
        where: { id: data.positionId },
        include: { market: true },
      });

      if (!position) throw new Error("Posición no encontrada");
      if (position.currentOwnerId !== data.userId) throw new Error("No es dueño de la posición");
      if (position.market.status !== "ACTIVE") throw new Error("Mercado inactivo");
      if (position.isForSale) throw new Error("Esta posición (o submúltiplo) ya está a la venta");

      if (data.sharesToSell <= 0 || data.sharesToSell > position.shares) {
        throw new Error("Cantidad de shares a vender es inválida o supera el balance");
      }

      if (data.pricePerShare <= 0 || data.pricePerShare >= 1) {
        throw new Error("El precio de venta debe estar entre 0 y 1");
      }

      // Si no va a vender todos sus shares, dividimos la posición
      // La matemática actual divide por "amount", tenemos que hacer split por "shares"
      // Lógica nativa para soportar split por shares:
      let targetPositionId = position.id;

      if (data.sharesToSell < position.shares) {
        // En lugar de usar PositionService.split (que divide por amount $), hacemos manual
        const shareRatio = new Decimal(data.sharesToSell).dividedBy(new Decimal(position.shares));
        const amountToSplitOff = position.amount.times(shareRatio);
        
        // Reducir la original
        await tx.position.update({
          where: { id: position.id },
          data: { 
             shares: position.shares - data.sharesToSell,
             amount: position.amount.minus(amountToSplitOff) 
          },
        });

        // Crear nueva "For Sale"
        const newPos = await tx.position.create({
          data: {
            marketId: position.marketId,
            originalOwnerId: position.originalOwnerId,
            currentOwnerId: position.currentOwnerId,
            side: position.side,
            amount: amountToSplitOff,
            status: "ACTIVE",
            shares: data.sharesToSell,
            purchasePrice: position.purchasePrice,
            isForSale: true,
          }
        });

        targetPositionId = newPos.id;
      } else {
        // Vender el total de la posición
        await tx.position.update({
          where: { id: position.id },
          data: { isForSale: true }
        });
      }

      // Crear la orden en el OB
      const order = await tx.order.create({
        data: {
          marketId: data.marketId,
          userId: data.userId,
          side: position.side,
          type: OrderType.SELL,
          positionId: targetPositionId,
          pricePerShare: data.pricePerShare,
          initialShares: data.sharesToSell,
          remainingShares: data.sharesToSell,
          status: "OPEN",
        },
      });

      return order;
    });
  }

  /**
   * Cancela una orden abierta.
   * Retorna fondos si era BUY, desbloquea posición si era SELL.
   */
  static async cancelOrder(orderId: string, userId: string) {
    return prisma.$transaction(async (tx) => {
      const order = await tx.order.findUnique({ where: { id: orderId } });
      if (!order) throw new Error("Orden no encontrada");
      if (order.userId !== userId) throw new Error("Permiso denegado");
      if (order.status !== "OPEN" && order.status !== "PARTIAL") {
        throw new Error("Solo se pueden cancelar órdenes OPEN o PARTIAL");
      }

      // 1. Marcar cancelar
      await tx.order.update({
        where: { id: orderId },
        data: { status: "CANCELLED" },
      });

      // 2. Rollback bloqueos
      if (order.type === "BUY" && order.totalLocked) {
        // La porción restante de capital bloqueado se devuelve
        const ratio = order.remainingShares / order.initialShares;
        const refundAmount = new Decimal(order.totalLocked.toString()).times(ratio);
        
        await BalanceService.credit(
          tx,
          userId,
          refundAmount,
          "LIMIT_ORDER_CANCELLED",
          `Refund ${refundAmount} from cancelled limit order ${order.id}`,
          order.marketId
        );
      } else if (order.type === "SELL" && order.positionId) {
        // Desbloquear posición (isForSale = false)
        await tx.position.update({
          where: { id: order.positionId },
          data: { isForSale: false },
        });
      }

      return { success: true };
    });
  }
}
