'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { UserProvider, useUser } from '@/contexts/UserContext'
import { Shell } from '@/components/layout/Shell'
import { MarketCard } from '@/components/markets/MarketCard'

function MarketsPage() {
  const router = useRouter()
  const { user, loading } = useUser()
  const [markets, setMarkets] = useState<any[]>([])
  const [loadingMarkets, setLoadingMarkets] = useState(true)
  const [filter, setFilter] = useState<'ALL' | 'ACTIVE'>('ACTIVE')

  useEffect(() => {
    if (!loading && !user) {
      router.push('/')
    }
  }, [user, loading, router])

  useEffect(() => {
    const params = filter === 'ALL' ? '' : '?status=ACTIVE'
    fetch(`/api/markets${params}`)
      .then((r) => r.json())
      .then(setMarkets)
      .catch(() => {})
      .finally(() => setLoadingMarkets(false))
  }, [filter])

  if (loading || !user) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600" />
      </div>
    )
  }

  return (
    <Shell>
      <div className="flex items-center justify-between mb-8">
        <h1 className="text-2xl font-bold text-white tracking-tight">Mercados Disponibles</h1>
        <div className="flex bg-[#171717] p-1 rounded-xl border border-white/5">
          <button
            onClick={() => setFilter('ACTIVE')}
            className={`px-4 py-2 rounded-lg text-xs font-bold uppercase tracking-wider transition-all ${
              filter === 'ACTIVE' 
                ? 'bg-[#64c883] text-[#0a0a0a] shadow-lg shadow-[#64c883]/20' 
                : 'text-gray-400 hover:text-white'
            }`}
          >
            Activos
          </button>
          <button
            onClick={() => setFilter('ALL')}
            className={`px-4 py-2 rounded-lg text-xs font-bold uppercase tracking-wider transition-all ${
              filter === 'ALL' 
                ? 'bg-[#64c883] text-[#0a0a0a] shadow-lg shadow-[#64c883]/20' 
                : 'text-gray-400 hover:text-white'
            }`}
          >
            Todos
          </button>
        </div>
      </div>

      {loadingMarkets ? (
        <div className="text-center py-12">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto" />
        </div>
      ) : markets.length === 0 ? (
        <div className="text-center py-12 text-gray-400">
          <p>No hay mercados disponibles</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {markets.map((market) => (
            <MarketCard key={market.id} market={market} />
          ))}
        </div>
      )}
    </Shell>
  )
}

export default function Page() {
  return (
    <UserProvider>
      <MarketsPage />
    </UserProvider>
  )
}
