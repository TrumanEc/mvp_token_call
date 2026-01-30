'use client'

import { useState, useEffect, use } from 'react'
import { useRouter } from 'next/navigation'
import { UserProvider, useUser } from '@/contexts/UserContext'
import { Shell } from '@/components/layout/Shell'
import { Card, CardContent, CardHeader } from '@/components/ui/Card'
import { PlaceBetForm } from '@/components/markets/PlaceBetForm'
import { ListingCard } from '@/components/marketplace/ListingCard'

function MarketDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const router = useRouter()
  const { user, loading, refreshBalance } = useUser()
  const [market, setMarket] = useState<any>(null)
  const [activeListings, setActiveListings] = useState<any[]>([])
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

  const fetchListings = () => {
    fetch(`/api/marketplace?marketId=${id}`)
      .then((r) => r.json())
      .then(setActiveListings)
      .catch(() => {})
  }

  useEffect(() => {
    fetchMarket()
    fetchListings()
  }, [id])

  const handleTransactionSuccess = () => {
    fetchMarket()
    fetchListings()
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
                  <div className="text-center p-6 bg-green-50/80 border border-green-100 rounded-xl">
                    <div className="text-4xl font-bold text-green-700">{market.odds.yesOdds.toFixed(1)}%</div>
                    <div className="text-lg text-green-800 font-bold mt-1">YES</div>
                    <div className="text-sm text-green-900/80 mt-2 font-medium">Pool: ${market.yesPool.toFixed(2)}</div>
                    <div className="text-sm text-green-900/80 font-medium">Payout: {market.odds.yesPayout.toFixed(2)}x</div>
                  </div>
                  <div className="text-center p-6 bg-red-50/80 border border-red-100 rounded-xl">
                    <div className="text-4xl font-bold text-red-700">{market.odds.noOdds.toFixed(1)}%</div>
                    <div className="text-lg text-red-800 font-bold mt-1">NO</div>
                    <div className="text-sm text-red-900/80 mt-2 font-medium">Pool: ${market.noPool.toFixed(2)}</div>
                    <div className="text-sm text-red-900/80 font-medium">Payout: {market.odds.noPayout.toFixed(2)}x</div>
                  </div>
                </div>
              </CardContent>
            </Card>

            {activeListings.length > 0 && (
              <div className="space-y-4">
                <h2 className="text-lg font-semibold">Mercado Secundario (Ofertas)</h2>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {activeListings.map((listing) => (
                    <ListingCard
                      key={listing.id}
                      listing={listing}
                      userId={user.id}
                      userBalance={user.balance}
                      onBuy={handleTransactionSuccess}
                    />
                  ))}
                </div>
              </div>
            )}

            {market.positions.length > 0 && (
              <Card>
                <CardHeader>
                  <h2 className="text-lg font-semibold">Posiciones ({market.positions.length})</h2>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    {market.positions.map((pos: any) => (
                      <div key={pos.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg border border-gray-100">
                        <div className="flex items-center gap-3">
                          <span className={`px-2 py-1 text-xs font-bold rounded ${pos.side === 'YES' ? 'bg-green-100 text-green-800 border border-green-200' : 'bg-red-100 text-red-800 border border-red-200'}`}>
                            {pos.side}
                          </span>
                          <span className="text-sm text-gray-600">{pos.currentOwner.username}</span>
                        </div>
                        <div className="text-right">
                          <div className="font-medium">${pos.amount.toFixed(2)}</div>
                          {pos.initialProbability > 0 && (
                            <div className="text-xs text-gray-500">(@ {pos.initialProbability.toFixed(1)}%)</div>
                          )}
                        </div>
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
                    onSuccess={handleTransactionSuccess}
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
