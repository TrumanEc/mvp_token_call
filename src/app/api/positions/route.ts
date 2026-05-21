import { NextRequest, NextResponse } from 'next/server'
import { PositionService } from '@/services/position'
import { prisma } from '@/lib/prisma'

export async function GET(request: NextRequest) {
  const userId = request.nextUrl.searchParams.get('userId')
  const marketId = request.nextUrl.searchParams.get('marketId')

  if (!userId) {
    return NextResponse.json({ error: 'userId required' }, { status: 400 })
  }

  const positions = await PositionService.getUserConsolidatedPositions(userId, marketId || undefined)
  return NextResponse.json(positions)
}

export async function POST(request: NextRequest) {
  const body = await request.json()
  const { marketId, userId, outcomeId, side, amount } = body

  if (!marketId || !userId || !amount) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
  }

  if (amount <= 0) {
    return NextResponse.json({ error: 'Amount must be positive' }, { status: 400 })
  }

  // Resolve outcomeId: explicit or from legacy `side`
  let resolvedOutcomeId = outcomeId
  if (!resolvedOutcomeId && side) {
    const market = await prisma.market.findUnique({
      where: { id: marketId },
      include: { outcomes: true },
    })
    if (!market) return NextResponse.json({ error: 'Market not found' }, { status: 404 })
    const match = market.outcomes.find(o => o.name === side)
    if (match) resolvedOutcomeId = match.id
  }

  if (!resolvedOutcomeId) {
    return NextResponse.json({ error: 'outcomeId required' }, { status: 400 })
  }

  try {
    const position = await PositionService.create({ marketId, userId, outcomeId: resolvedOutcomeId, amount })
    return NextResponse.json(position, { status: 201 })
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Failed to create position'
    return NextResponse.json({ error: message }, { status: 400 })
  }
}
