import { NextRequest, NextResponse } from 'next/server'
import { MarketService, MarketStatus } from '@/services/market'

export async function GET(request: NextRequest) {
  const status = request.nextUrl.searchParams.get('status') as MarketStatus | null
  const markets = await MarketService.getAll(status || undefined)
  return NextResponse.json(markets)
}

export async function POST(request: NextRequest) {
  const body = await request.json()
  const { playerName, question, description, resolutionDate, maxPool } = body

  if (!playerName || !question || !resolutionDate) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
  }

  const market = await MarketService.create({
    playerName,
    question,
    description,
    resolutionDate: new Date(resolutionDate),
    maxPool,
  })

  return NextResponse.json(market, { status: 201 })
}
