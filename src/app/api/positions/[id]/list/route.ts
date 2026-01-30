import { NextRequest, NextResponse } from 'next/server'
import { ListingService } from '@/services/listing'

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: positionId } = await params
  const { userId, askPrice } = await request.json()

  if (!userId || askPrice === undefined) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
  }

  try {
    const listing = await ListingService.create({ positionId, userId, askPrice })
    return NextResponse.json(listing, { status: 201 })
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Failed to list position'
    return NextResponse.json({ error: message }, { status: 400 })
  }
}
