'use client'

import { useState, useEffect, use } from 'react'
import { useRouter } from 'next/navigation'
import { UserProvider, useUser } from '@/contexts/UserContext'
import { Shell } from '@/components/layout/Shell'
import { PriceChart } from '@/components/markets/PriceChart'
import { PredictionCard } from '@/components/markets/PredictionCard'

function MarketDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const router = useRouter()
  const { user, loading, refreshBalance } = useUser()
  const [market, setMarket] = useState<any>(null)
  const [loadingMarket, setLoadingMarket] = useState(true)

  const fetchMarket = () => {
    fetch(`/api/markets/${id}`)
      .then((r) => r.json())
      .then(setMarket)
      .catch(() => {})
      .finally(() => setLoadingMarket(false))
  }

  useEffect(() => {
    if (!loading && !user) {
      router.push('/')
    }
  }, [user, loading, router])

  useEffect(() => {
    fetchMarket()
  }, [id])

  const handleTransactionSuccess = () => {
    fetchMarket()
    refreshBalance()
  }

  if (loading || !user || loadingMarket) {
    return (
      <div className="min-h-screen bg-[#0a0a0a] flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[#64c883]" />
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

  const totalVolume = market.yesPool + market.noPool

  return (
    <Shell>
      <div className="max-w-[1200px] mx-auto pt-4 px-4">
        {/* Top Header: Question */}
        <div className="mb-12">
          <button 
            onClick={() => router.back()} 
            className="text-gray-400 hover:text-white text-xs font-bold uppercase tracking-wider mb-6 block transition-colors"
          >
            ← Volver
          </button>
          <h1 className="text-[32px] md:text-[40px] font-bold text-white leading-tight lg:max-w-3xl">
            {market.question}
          </h1>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-[1fr_400px] gap-12 items-start">
          {/* Left Column: Chart and Odds */}
          <div className="space-y-16">
            {/* Probability Large Display */}
            <div className="flex items-baseline gap-4">
              <span className="text-[64px] font-extrabold text-white leading-none tracking-tighter">
                {market.odds.yesOdds.toFixed(0)}%
              </span>
              <span className="text-sm font-bold text-gray-400 uppercase tracking-[0.1em]">Chance</span>
            </div>

            {/* Price Chart */}
            <div className="relative pb-8">
              <PriceChart 
                history={market.history} 
                height={350} 
                showNo={false} 
              />
              {/* Bottom Volume Info */}
              <div className="absolute bottom-[-4px] left-0 flex items-center gap-2">
                <span className="text-sm font-bold text-gray-400 capitalize">Vol.:</span>
                <span className="text-xl font-extrabold text-white leading-none">
                  $ {totalVolume.toLocaleString()}
                </span>
              </div>
            </div>

            {/* Active Positions */}
            {market.positions.length > 0 && (
              <div className="space-y-6 pt-8 border-t border-white/5">
                <h2 className="text-[10px] font-bold uppercase tracking-[0.1em] text-gray-400">
                  Posiciones Activas ({market.positions.length})
                </h2>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {market.positions.map((pos: any) => (
                    <div 
                      key={pos.id} 
                      className="bg-[#121212] border border-white/5 rounded-2xl p-4 flex items-center justify-between group hover:border-white/10 transition-all"
                    >
                      <div className="flex items-center gap-4">
                        <div className={`w-10 h-10 rounded-full flex items-center justify-center font-bold text-xs ${
                          pos.side === 'YES' ? 'bg-[#64c883]/10 text-[#64c883]' : 'bg-[#e16464]/10 text-[#e16464]'
                        }`}>
                          {pos.side}
                        </div>
                        <div>
                          <div className="text-sm font-bold text-white group-hover:text-[#64c883] transition-colors">
                            @{pos.currentOwner.username}
                          </div>
                          <div className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mt-0.5">
                            {new Date(pos.createdAt).toLocaleDateString()}
                          </div>
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="text-base font-bold text-white">$ {pos.amount.toLocaleString()}</div>
                        {pos.initialProbability && (
                          <div className="text-[9px] font-bold text-gray-400 uppercase mt-0.5">
                            @ {pos.initialProbability.toFixed(1)}%
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Right Column: Prediction Interaction (Yes/No Buttons + Form) */}
          <div className="sticky top-24">
             <PredictionCard
                market={market}
                userId={user.id}
                userBalance={user.balance}
                onSuccess={handleTransactionSuccess}
              />
              
              <div className="mt-8 space-y-4">
                <div className="flex justify-between items-center text-[10px] font-bold uppercase tracking-wider text-gray-400 border-t border-white/5 pt-6">
                  <span>Resolución</span>
                  <span className="text-gray-300">{new Date(market.resolutionDate).toLocaleDateString()}</span>
                </div>
                <div className="flex justify-between items-center text-[10px] font-bold uppercase tracking-wider text-gray-400">
                  <span>Plataforma</span>
                  <span className="text-gray-300">WIN</span>
                </div>
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
