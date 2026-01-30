import { NextRequest, NextResponse } from 'next/server'
import { PositionService } from '@/services/position'

export async function GET(request: NextRequest) {
  const userId = request.nextUrl.searchParams.get('userId')
  const marketId = request.nextUrl.searchParams.get('marketId')

  if (!userId) {
    return NextResponse.json({ error: 'userId required' }, { status: 400 })
  }

  const positions = await PositionService.getUserPositions(userId, marketId || undefined)
  return NextResponse.json(positions)
}

export async function POST(request: NextRequest) {
  const { marketId, userId, side, amount } = await request.json()

  if (!marketId || !userId || !side || !amount) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
  }

  if (!['YES', 'NO'].includes(side)) {
    return NextResponse.json({ error: 'Invalid side' }, { status: 400 })
  }

  if (amount <= 0) {
    return NextResponse.json({ error: 'Amount must be positive' }, { status: 400 })
  }

  try {
    const position = await PositionService.create({ marketId, userId, side, amount })
    return NextResponse.json(position, { status: 201 })
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Failed to create position'
    return NextResponse.json({ error: message }, { status: 400 })
  }
}
