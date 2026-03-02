import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { Decimal } from '@prisma/client/runtime/library'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: userId } = await params
    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: {
        currentPositions: { include: { market: true } },
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

    const potentialFutureGains = user.currentPositions
      .filter(p => p.status === 'ACTIVE')
      .reduce((sum, p) => {
        const yes = new Decimal(p.market.yesPool)
        const no = new Decimal(p.market.noPool)
        const total = yes.plus(no)
        const fee = new Decimal(p.market.platformFee || 0.1)
        const netPool = total.times(new Decimal(1).minus(fee))
        
        let payout = new Decimal(0)
        if (p.side === 'YES' && !yes.isZero()) {
          payout = new Decimal(p.amount).dividedBy(yes).times(netPool)
        } else if (p.side === 'NO' && !no.isZero()) {
          payout = new Decimal(p.amount).dividedBy(no).times(netPool)
        }
        return sum.plus(payout)
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
        side: p.side,
        amount: p.amount.toNumber(),
        initialProbability: p.initialProbability.toNumber(),
        marketName: p.market.playerName || 'Evento / Partido',
        createdAt: p.createdAt
      }))
    })
  } catch (error: any) {
    console.error('User stats error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
