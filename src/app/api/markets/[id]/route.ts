import { NextRequest, NextResponse } from 'next/server'
import { MarketService } from '@/services/market'

export async function GET(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const market = await MarketService.getById(id)
  
  if (!market) {
    return NextResponse.json({ error: 'Market not found' }, { status: 404 })
  }
  
  return NextResponse.json(market)
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const { action } = await request.json()

  if (action === 'activate') {
    const market = await MarketService.activate(id)
    return NextResponse.json(market)
  }

  if (action === 'close') {
    const market = await MarketService.close(id)
    return NextResponse.json(market)
  }

  return NextResponse.json({ error: 'Invalid action' }, { status: 400 })
}
