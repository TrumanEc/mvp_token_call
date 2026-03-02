import { NextRequest, NextResponse } from 'next/server'
import { ListingService } from '@/services/listing'

export async function GET(request: NextRequest) {
  const marketId = request.nextUrl.searchParams.get('marketId')
  const side = request.nextUrl.searchParams.get('side') as 'YES' | 'NO' | null

  const history = request.nextUrl.searchParams.get('history') === 'true'

  if (history) {
    const listings = await ListingService.getHistory(marketId || undefined)
    return NextResponse.json(listings)
  }

  const listings = await ListingService.getActive(marketId || undefined, side || undefined)
  return NextResponse.json(listings)
}
