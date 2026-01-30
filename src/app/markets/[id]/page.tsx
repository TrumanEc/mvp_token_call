'use client'

import { useState, useEffect, use } from 'react'
import { useRouter } from 'next/navigation'
import { UserProvider, useUser } from '@/contexts/UserContext'
import { Shell } from '@/components/layout/Shell'
import { Card, CardContent, CardHeader } from '@/components/ui/Card'
import { PlaceBetForm } from '@/components/markets/PlaceBetForm'

function MarketDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const router = useRouter()
  const { user, loading, refreshBalance } = useUser()
  const [market, setMarket] = useState<any>(null)
  const [loadingMarket, setLoadingMarket] = useState(true)

  useEffect(() => {
    if (!loading && !user) {
      router.push('/')
    }
  }, [user, loading, router])

  const fetchMarket = () => {
    fetch(`/api/markets/${id}`)
      .then((r) => r.json())
      .then(setMarket)
      .catch(() => {})
      .finally(() => setLoadingMarket(false))
  }

  useEffect(() => {
    fetchMarket()
  }, [id])

  const handleBetSuccess = () => {
    fetchMarket()
    refreshBalance()
  }

  if (loading || !user || loadingMarket) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600" />
      </div>
    )
  }

  if (!market) {
    return (
      <Shell>
        <div className="text-center py-12 text-gray-500">Mercado no encontrado</div>
      </Shell>
    )
  }

  const statusColors = {
    ACTIVE: 'bg-green-100 text-green-800',
    DRAFT: 'bg-gray-100 text-gray-800',
    CLOSED: 'bg-yellow-100 text-yellow-800',
    RESOLVED: 'bg-blue-100 text-blue-800',
    VOIDED: 'bg-red-100 text-red-800',
  }

  return (
    <Shell>
      <div className="max-w-4xl mx-auto">
        <div className="mb-6">
          <button onClick={() => router.back()} className="text-blue-600 hover:text-blue-800 text-sm mb-2">
            ← Volver a Mercados
          </button>
          <div className="flex items-start justify-between">
            <div>
              <span className="text-sm font-medium text-blue-600">{market.playerName}</span>
              <h1 className="text-2xl font-bold text-gray-900 mt-1">{market.question}</h1>
              {market.description && <p className="text-gray-600 mt-2">{market.description}</p>}
            </div>
            <span className={`px-3 py-1 text-sm font-medium rounded-full ${statusColors[market.status as keyof typeof statusColors]}`}>
              {market.status}
            </span>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-6">
            <Card>
              <CardHeader>
                <h2 className="text-lg font-semibold">Odds Actuales</h2>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 gap-6">
                  <div className="text-center p-6 bg-green-50 rounded-xl">
                    <div className="text-4xl font-bold text-green-600">{market.odds.yesOdds.toFixed(1)}%</div>
                    <div className="text-lg text-green-700 font-medium mt-1">YES</div>
                    <div className="text-sm text-gray-500 mt-2">Pool: ${market.yesPool.toFixed(2)}</div>
                    <div className="text-sm text-gray-500">Payout: {market.odds.yesPayout.toFixed(2)}x</div>
                  </div>
                  <div className="text-center p-6 bg-red-50 rounded-xl">
                    <div className="text-4xl font-bold text-red-600">{market.odds.noOdds.toFixed(1)}%</div>
                    <div className="text-lg text-red-700 font-medium mt-1">NO</div>
                    <div className="text-sm text-gray-500 mt-2">Pool: ${market.noPool.toFixed(2)}</div>
                    <div className="text-sm text-gray-500">Payout: {market.odds.noPayout.toFixed(2)}x</div>
                  </div>
                </div>
              </CardContent>
            </Card>

            {market.positions.length > 0 && (
              <Card>
                <CardHeader>
                  <h2 className="text-lg font-semibold">Posiciones ({market.positions.length})</h2>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    {market.positions.map((pos: any) => (
                      <div key={pos.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                        <div className="flex items-center gap-3">
                          <span className={`px-2 py-1 text-xs font-medium rounded ${pos.side === 'YES' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
                            {pos.side}
                          </span>
                          <span className="text-sm text-gray-600">{pos.currentOwner.username}</span>
                        </div>
                        <span className="font-medium">${pos.amount.toFixed(2)}</span>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}
          </div>

          <div>
            {market.status === 'ACTIVE' ? (
              <Card>
                <CardHeader>
                  <h2 className="text-lg font-semibold">Crear Posición</h2>
                </CardHeader>
                <CardContent>
                  <PlaceBetForm
                    marketId={market.id}
                    userId={user.id}
                    userBalance={user.balance}
                    odds={{
                      yesOdds: market.odds.yesOdds,
                      noOdds: market.odds.noOdds,
                      yesPayout: market.odds.yesPayout,
                      noPayout: market.odds.noPayout,
                    }}
                    onSuccess={handleBetSuccess}
                  />
                </CardContent>
              </Card>
            ) : (
              <Card>
                <CardContent className="py-8 text-center text-gray-500">
                  {market.status === 'RESOLVED' && (
                    <div>
                      <div className="text-2xl mb-2">🏆</div>
                      <div className="font-medium">Resultado: {market.outcome}</div>
                    </div>
                  )}
                  {market.status === 'CLOSED' && <div>Mercado cerrado para apuestas</div>}
                  {market.status === 'DRAFT' && <div>Mercado aún no activo</div>}
                  {market.status === 'VOIDED' && <div>Mercado anulado</div>}
                </CardContent>
              </Card>
            )}

            <div className="mt-4 text-sm text-gray-500">
              <div>Resolución: {new Date(market.resolutionDate).toLocaleDateString()}</div>
              <div>Fee plataforma: {(market.platformFee * 100).toFixed(0)}%</div>
            </div>
          </div>
        </div>
      </div>
    </Shell>
  )
}

export default function Page({ params }: { params: Promise<{ id: string }> }) {
  return (
    <UserProvider>
      <MarketDetailPage params={params} />
    </UserProvider>
  )
}
