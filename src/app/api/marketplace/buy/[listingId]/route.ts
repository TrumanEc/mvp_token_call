import { NextRequest, NextResponse } from 'next/server'
import { ListingService } from '@/services/listing'

export async function POST(request: NextRequest, { params }: { params: Promise<{ listingId: string }> }) {
  const { listingId } = await params
  const { buyerId } = await request.json()

  if (!buyerId) {
    return NextResponse.json({ error: 'buyerId required' }, { status: 400 })
  }

  try {
    const listing = await ListingService.buy({ listingId, buyerId })
    return NextResponse.json(listing)
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Purchase failed'
    return NextResponse.json({ error: message }, { status: 400 })
  }
}
