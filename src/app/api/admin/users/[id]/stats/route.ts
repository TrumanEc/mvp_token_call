import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { Decimal } from '@prisma/client/runtime/library'
import { LmsrService } from '@/services/lmsr.service'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: userId } = await params
    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: {
        currentPositions: {
          include: {
            market: {
              include: {
                outcomes: { orderBy: { displayOrder: 'asc' } },
              },
            },
            outcome: { select: { id: true, name: true } },
          },
        },
        transactions: true
      }
    })

    if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 })

    const totalInvested = user.transactions
      .filter(t => t.type === 'BET_PLACED' || t.type === 'POSITION_PURCHASED')
      .reduce((sum, t) => sum.plus(new Decimal(t.amount).abs()), new Decimal(0))

    const realizedGains = user.transactions
      .filter(t => t.type === 'PAYOUT_RECEIVED' || t.type === 'POSITION_SOLD')
      .reduce((sum, t) => sum.plus(new Decimal(t.amount)), new Decimal(0))

    const lmsrService = new LmsrService()

    const potentialFutureGains = user.currentPositions
      .filter(p => p.status === 'ACTIVE')
      .reduce((sum, p) => {
        // Use LMSR N-outcome pricing to estimate potential payout
        const outcomes = p.market.outcomes
        const qVector = LmsrService.buildQVector(outcomes)
        const lmsrParams = { b: p.market.b, alpha: p.market.alpha, bMin: p.market.bMin }
        const prices = lmsrService.getPricesLSN(qVector, lmsrParams)
        const outcomeIdx = LmsrService.outcomeIndex(outcomes, p.outcomeId)
        const price = prices[outcomeIdx]

        // If this outcome wins, payout = shares * 1 (normalized).
        // Potential value = shares * price (expected value)
        // But for "potential future gains" we show payout IF this outcome wins:
        // payout = shares (each share pays $1 on win)
        const potentialPayout = new Decimal(p.shares)
        return sum.plus(potentialPayout)
      }, new Decimal(0))

    return NextResponse.json({
      username: user.username,
      balance: new Decimal(user.balance).toNumber(),
      stats: {
        totalInvested: totalInvested.toNumber(),
        realizedGains: realizedGains.toNumber(),
        activePositions: user.currentPositions.filter(p => p.status === 'ACTIVE').length,
        potentialFutureGains: potentialFutureGains.toNumber()
      },
      positions: user.currentPositions.map(p => ({
        id: p.id,
        outcome: p.outcome.name,
        outcomeId: p.outcomeId,
        side: p.side,
        amount: p.amount.toNumber(),
        shares: p.shares,
        initialProbability: p.initialProbability.toNumber(),
        marketName: p.market.playerName || p.market.question,
        createdAt: p.createdAt
      }))
    })
  } catch (error: any) {
    console.error('User stats error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
