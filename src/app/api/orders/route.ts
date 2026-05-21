import { NextRequest, NextResponse } from 'next/server'
import { RouterService } from '@/services/router.service'
import { OrderBookService } from '@/services/orderbook.service'
import { prisma } from '@/lib/prisma'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const {
      marketId, userId, outcomeId, side,
      amount, shares, pricePerShare, executionType, positionId,
    } = body

    if (!marketId || !userId || !executionType) {
      return NextResponse.json({ error: 'Faltan campos requeridos principales' }, { status: 400 })
    }

    // Resolve outcomeId from side if needed
    let resolvedOutcomeId = outcomeId
    if (!resolvedOutcomeId && side) {
      const market = await prisma.market.findUnique({
        where: { id: marketId },
        include: { outcomes: true },
      })
      if (market) {
        const match = market.outcomes.find(o => o.name === side)
        if (match) resolvedOutcomeId = match.id
      }
    }

    if (executionType === 'MARKET') {
      if (!resolvedOutcomeId) return NextResponse.json({ error: 'outcomeId required' }, { status: 400 })
      if (!amount || amount <= 0) return NextResponse.json({ error: 'El monto debe ser positivo' }, { status: 400 })

      const result = await RouterService.executeMarketBuy({
        marketId, userId, outcomeId: resolvedOutcomeId, budget: amount,
      })
      return NextResponse.json(result, { status: 201 })
    }

    if (executionType === 'LIMIT_BUY') {
      if (!resolvedOutcomeId) return NextResponse.json({ error: 'outcomeId required' }, { status: 400 })
      if (!amount || amount <= 0) return NextResponse.json({ error: 'Amount inválido' }, { status: 400 })
      if (!pricePerShare || pricePerShare <= 0 || pricePerShare >= 1) return NextResponse.json({ error: 'Precio límite inválido' }, { status: 400 })

      // Get outcome name for display
      const outcomeRecord = await prisma.marketOutcome.findUnique({ where: { id: resolvedOutcomeId } })
      const outcomeName = outcomeRecord?.name || side || 'UNKNOWN'

      const order = await OrderBookService.createLimitBuy({
        marketId, userId, outcomeId: resolvedOutcomeId,
        side: outcomeName, amount, pricePerShare,
      })
      return NextResponse.json({ order, message: "Order Placed" }, { status: 201 })
    }

    if (executionType === 'LIMIT_SELL') {
      if (!positionId) return NextResponse.json({ error: 'positionId es requerido para vender' }, { status: 400 })
      if (!shares || shares <= 0) return NextResponse.json({ error: 'Cantidad de shares inválida' }, { status: 400 })
      if (!pricePerShare || pricePerShare <= 0 || pricePerShare >= 1) return NextResponse.json({ error: 'Precio límite inválido' }, { status: 400 })

      const order = await OrderBookService.createLimitSell({
        marketId, userId, positionId, sharesToSell: shares, pricePerShare,
      })
      return NextResponse.json({ order, message: "Position listed on Orderbook" }, { status: 201 })
    }

    return NextResponse.json({ error: 'executionType inválido' }, { status: 400 })
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Error interno al procesar orden'
    return NextResponse.json({ error: message }, { status: 400 })
  }
}
