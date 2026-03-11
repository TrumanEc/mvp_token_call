import { NextRequest, NextResponse } from 'next/server'
import { RouterService } from '@/services/router.service'
import { OrderBookService } from '@/services/orderbook.service'

export async function POST(request: NextRequest) {
  try {
    const { 
      marketId, 
      userId, 
      side, 
      amount,       // Para MARKET o LIMIT_BUY ($ a gastar)
      shares,       // Para LIMIT_SELL (cantidad de shares a vender)
      pricePerShare, // Requerido para LIMIT
      executionType, // 'MARKET' | 'LIMIT_BUY' | 'LIMIT_SELL'
      positionId    // Requerido para LIMIT_SELL
    } = await request.json()

    if (!marketId || !userId || !executionType) {
      return NextResponse.json({ error: 'Faltan campos requeridos principales' }, { status: 400 })
    }

    if (executionType !== 'LIMIT_SELL' && (!side || !['YES', 'NO'].includes(side))) {
         return NextResponse.json({ error: 'Lado de la operación inválido' }, { status: 400 })
    }

    // -- 1. COMPRA AL MERCADO (Best Buy)
    if (executionType === 'MARKET') {
      if (!amount || amount <= 0) {
        return NextResponse.json({ error: 'El monto para comprar a mercado debe ser positivo' }, { status: 400 })
      }
      
      const result = await RouterService.executeMarketBuy({
        marketId,
        userId,
        side,
        budget: amount
      });
      return NextResponse.json(result, { status: 201 });
    }

    // -- 2. COMPRA LÍMITE (Limit Buy)
    if (executionType === 'LIMIT_BUY') {
      if (!amount || amount <= 0) return NextResponse.json({ error: 'Amount inválido' }, { status: 400 })
      if (!pricePerShare || pricePerShare <= 0 || pricePerShare >= 1) return NextResponse.json({ error: 'Precio límite inválido' }, { status: 400 })
      
      const order = await OrderBookService.createLimitBuy({
        marketId,
        userId,
        side,
        amount,
        pricePerShare
      });
      return NextResponse.json({ order, message: "Order Placed" }, { status: 201 });
    }

    // -- 3. VENTA LÍMITE (Limit Sell)
    if (executionType === 'LIMIT_SELL') {
      if (!positionId) return NextResponse.json({ error: 'positionId es requerido para vender' }, { status: 400 });
      if (!shares || shares <= 0) return NextResponse.json({ error: 'Cantidad de shares inválida' }, { status: 400 });
      if (!pricePerShare || pricePerShare <= 0 || pricePerShare >= 1) return NextResponse.json({ error: 'Precio límite inválido' }, { status: 400 })

      const order = await OrderBookService.createLimitSell({
        marketId,
        userId,
        positionId,
        sharesToSell: shares,
        pricePerShare
      });
      return NextResponse.json({ order, message: "Position listed on Orderbook" }, { status: 201 });
    }

    return NextResponse.json({ error: 'executionType inválido' }, { status: 400 })

  } catch (e) {
    const message = e instanceof Error ? e.message : 'Error interno al procesar orden'
    return NextResponse.json({ error: message }, { status: 400 })
  }
}
