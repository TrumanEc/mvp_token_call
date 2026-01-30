import { NextRequest, NextResponse } from 'next/server'
import { ListingService } from '@/services/listing'

export async function GET(request: NextRequest) {
  const marketId = request.nextUrl.searchParams.get('marketId')
  const side = request.nextUrl.searchParams.get('side') as 'YES' | 'NO' | null

  const listings = await ListingService.getActive(marketId || undefined, side || undefined)
  return NextResponse.json(listings)
}
