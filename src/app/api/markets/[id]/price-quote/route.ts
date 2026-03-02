import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { LmsrService } from '@/services/lmsr.service'

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { searchParams } = new URL(request.url)
  const { id } = await params
  const side = searchParams.get('side') as 'YES' | 'NO'
  const amountStr = searchParams.get('amount')
  const sharesStr = searchParams.get('shares')

  if (!side || (side !== 'YES' && side !== 'NO')) {
    return NextResponse.json({ error: 'Invalid side' }, { status: 400 })
  }

  try {
    const market = await prisma.market.findUnique({
      where: { id },
      select: {
        id: true,
        qYes: true,
        qNo: true,
        b: true,
        maxBetAmount: true,
        maxPriceImpact: true,
      }
    })

    if (!market) {
      return NextResponse.json({ error: 'Market not found' }, { status: 404 })
    }

    const lmsrService = new LmsrService()
    
    let shares = 0
    let totalCost = 0
    
    // Scenario 1: User wants to spend X amount (e.g. $10)
    if (amountStr && !sharesStr) {
      const amount = parseFloat(amountStr)
      if (isNaN(amount) || amount <= 0) {
        return NextResponse.json({ error: 'Invalid amount' }, { status: 400 })
      }
      
      // Calculate shares for amount
      shares = lmsrService.getSharesToBuy(market.qYes, market.qNo, market.b, side, amount)
      totalCost = amount // Approx cost is the input amount (minus dust error)
      // Recalculate exact cost for those shares to be precise
      totalCost = lmsrService.getCostToBuy(market.qYes, market.qNo, market.b, side, shares)
    } 
    // Scenario 2: User wants to buy Y shares (e.g. 10 shares)
    else if (sharesStr) {
      shares = parseFloat(sharesStr)
      if (isNaN(shares) || shares <= 0) {
        return NextResponse.json({ error: 'Invalid shares' }, { status: 400 })
      }
      
      // Calculate cost for shares
      totalCost = lmsrService.getCostToBuy(market.qYes, market.qNo, market.b, side, shares)
    } else {
      return NextResponse.json({ error: 'Must provide either amount or shares' }, { status: 400 })
    }

    const avgPrice = shares > 0 ? totalCost / shares : 0
    
    // Validate bounds for the requested amount
    const config = await prisma.platformConfig.findUnique({ where: { id: 'global' } })
    const defaultMaxBet = config?.defaultMaxBet ?? 500
    const defaultMaxImpact = config?.defaultMaxImpact ?? 5.0

    const maxBetAmount = market.maxBetAmount ?? defaultMaxBet
    const maxPriceImpact = market.maxPriceImpact ?? defaultMaxImpact

    const validation = lmsrService.validateBetAmount(
      totalCost, // Check the actual cost to be precise
      market.qYes,
      market.qNo,
      market.b,
      side,
      maxBetAmount,
      maxPriceImpact
    )
    
    // Calculate new probabilities (post-trade state simulation)
    const newQYes = side === 'YES' ? market.qYes + shares : market.qYes
    const newQNo  = side === 'NO'  ? market.qNo  + shares : market.qNo
    const newPrices = lmsrService.getPrice(newQYes, newQNo, market.b)

    return NextResponse.json({
      side,
      shares,
      totalCost,
      avgPrice,
      newProbabilities: {
        yes: newPrices.pYes,
        no: newPrices.pNo
      },
      priceImpact: 0, // TODO: Calculate price impact %
      maxAllowedAmount: validation.maxAllowed,
      capReason: validation.reason || null,
      wouldExceedCap: !validation.allowed
    })

  } catch (error) {
    console.error('Error calculating price quote:', error)
    return NextResponse.json({ 
      error: 'Internal Server Error', 
      details: error instanceof Error ? error.message : String(error) 
    }, { status: 500 })
  }
}
