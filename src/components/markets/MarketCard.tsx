'use client'

import Link from 'next/link'
import { Card, CardContent } from '@/components/ui/Card'

interface MarketCardProps {
  market: {
    id: string
    playerName: string
    question: string
    status: string
    yesPool: number
    noPool: number
    odds: {
      yesOdds: number
      noOdds: number
    }
    resolutionDate: string
  }
}

export function MarketCard({ market }: MarketCardProps) {
  const statusColors = {
    ACTIVE: 'bg-green-100 text-green-800',
    DRAFT: 'bg-gray-100 text-gray-800',
    CLOSED: 'bg-yellow-100 text-yellow-800',
    RESOLVED: 'bg-blue-100 text-blue-800',
    VOIDED: 'bg-red-100 text-red-800',
  }

  return (
    <Link href={`/markets/${market.id}`}>
      <Card className="hover:shadow-xl transition-shadow cursor-pointer">
        <CardContent>
          <div className="flex items-start justify-between mb-3">
            <span className="text-sm font-medium text-blue-600">{market.playerName}</span>
            <span className={`px-2 py-1 text-xs font-medium rounded-full ${statusColors[market.status as keyof typeof statusColors]}`}>
              {market.status}
            </span>
          </div>

          <h3 className="text-lg font-semibold text-gray-900 mb-4">{market.question}</h3>

          <div className="grid grid-cols-2 gap-4 mb-4">
            <div className="text-center p-3 bg-green-50 rounded-lg">
              <div className="text-2xl font-bold text-green-600">{market.odds.yesOdds.toFixed(1)}%</div>
              <div className="text-sm text-green-700">YES</div>
              <div className="text-xs text-gray-500">${market.yesPool.toFixed(0)}</div>
            </div>
            <div className="text-center p-3 bg-red-50 rounded-lg">
              <div className="text-2xl font-bold text-red-600">{market.odds.noOdds.toFixed(1)}%</div>
              <div className="text-sm text-red-700">NO</div>
              <div className="text-xs text-gray-500">${market.noPool.toFixed(0)}</div>
            </div>
          </div>

          <div className="text-xs text-gray-500 text-right">
            Resuelve: {new Date(market.resolutionDate).toLocaleDateString()}
          </div>
        </CardContent>
      </Card>
    </Link>
  )
}
