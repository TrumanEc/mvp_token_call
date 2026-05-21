import { NextRequest, NextResponse } from 'next/server'
import { ListingService } from '@/services/listing'

export async function GET(request: NextRequest) {
  const marketId = request.nextUrl.searchParams.get('marketId')
  const outcomeId = request.nextUrl.searchParams.get('outcomeId')
  // Legacy: still accept 'side' param and pass it as side filter
  const side = request.nextUrl.searchParams.get('side') as string | null

  const history = request.nextUrl.searchParams.get('history') === 'true'

  if (history) {
    const listings = await ListingService.getHistory(marketId || undefined)
    return NextResponse.json(listings)
  }

  const listings = await ListingService.getActive(marketId || undefined, outcomeId || side || undefined)
  return NextResponse.json(listings)
}
