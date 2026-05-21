'use client'

import { useState, useEffect, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { UserProvider, useUser } from '@/contexts/UserContext'
import { Shell } from '@/components/layout/Shell'
import { MarketCard } from '@/components/markets/MarketCard'
import { FeaturedMarketsSlider } from '@/components/markets/FeaturedMarketsSlider'

type ActivityFilter = 'TODOS' | 'TENDENCIA' | 'NUEVOS' | 'POR_CERRAR'
type SportFilter = 'TODOS' | 'futbol' | 'copa_mundial' | 'tenis' | 'f1' | 'nba' | 'nfl'

const ACTIVITY_LABELS: Record<ActivityFilter, string> = {
  TODOS: 'Todos',
  TENDENCIA: 'Tendencia',
  NUEVOS: 'Nuevos',
  POR_CERRAR: 'Por Cerrar',
}

const SPORT_LABELS: Record<SportFilter, string> = {
  TODOS: 'Todos',
  futbol: 'Fútbol',
  copa_mundial: 'Copa del Mundo',
  tenis: 'Tenis',
  f1: 'F1',
  nba: 'NBA',
  nfl: 'NFL',
}

const SPORT_ICONS: Record<SportFilter, string> = {
  TODOS: '🌐',
  futbol: '⚽',
  copa_mundial: '🏆',
  tenis: '🎾',
  f1: '🏎️',
  nba: '🏀',
  nfl: '🏈',
}

const ALL_SPORTS: SportFilter[] = ['futbol', 'copa_mundial', 'tenis', 'f1', 'nba', 'nfl']

function classifyActivity(market: any): ActivityFilter {
  const outcomes = market.outcomes ?? []
  const totalPool = market.totalPool ?? 0
  const daysLeft = Math.ceil((new Date(market.resolutionDate).getTime() - Date.now()) / 86400000)
  const topProb = outcomes.length > 0
    ? Math.max(...outcomes.map((o: any) => o.probability ?? 0))
    : (market.odds?.yesOdds ?? 50)
  const isBinary = outcomes.length === 2 && outcomes[0]?.name === 'YES'
  const heavyTrend = isBinary && (topProb >= 70 || topProb <= 30)

  if (heavyTrend) return 'TENDENCIA'
  if (daysLeft <= 14) return 'POR_CERRAR'
  if (totalPool < 200) return 'NUEVOS'
  return 'TODOS'
}

function MarketsPage() {
  const router = useRouter()
  const { user, loading } = useUser()
  const [markets, setMarkets] = useState<any[]>([])
  const [loadingMarkets, setLoadingMarkets] = useState(true)
  const [activityFilter, setActivityFilter] = useState<ActivityFilter>('TODOS')
  const [sportFilter, setSportFilter] = useState<SportFilter>('TODOS')

  useEffect(() => {
    if (!loading && !user) router.push('/')
  }, [user, loading, router])

  useEffect(() => {
    fetch('/api/markets?status=ACTIVE')
      .then((r) => r.json())
      .then(setMarkets)
      .catch(() => {})
      .finally(() => setLoadingMarkets(false))
  }, [])

  const filteredMarkets = useMemo(() => {
    return markets.filter((m) => {
      if (sportFilter !== 'TODOS' && m.sport !== sportFilter) return false
      if (activityFilter !== 'TODOS' && classifyActivity(m) !== activityFilter) return false
      return true
    })
  }, [markets, activityFilter, sportFilter])

  const handleSportClick = (sport: SportFilter) => {
    setSportFilter((prev) => (prev === sport ? 'TODOS' : sport))
  }

  const handleActivityClick = (activity: ActivityFilter) => {
    setActivityFilter((prev) => (prev === activity ? 'TODOS' : activity))
  }

  const handleTodosClick = () => {
    setActivityFilter('TODOS')
    setSportFilter('TODOS')
  }

  const isAllActive = activityFilter === 'TODOS' && sportFilter === 'TODOS'

  if (loading || !user) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600" />
      </div>
    )
  }

  return (
    <Shell>
      <h1 className="text-2xl font-bold text-white tracking-tight mb-6">
        Mercados Disponibles
      </h1>

      {/* Featured slider */}
      {!loadingMarkets && markets.length > 0 && (
        <FeaturedMarketsSlider markets={markets} />
      )}

      {/* ── Filters — single scrollable row ──────────────────────────────────── */}
      {!loadingMarkets && (
        <div className="flex items-center gap-2 flex-wrap mb-8 mt-2 overflow-x-auto pb-1">

          {/* Todos */}
          <button
            onClick={handleTodosClick}
            className={`flex-shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[11px] font-bold uppercase tracking-wider transition-all border ${
              isAllActive
                ? 'bg-primary text-win-bg border-primary shadow-lg shadow-primary/20'
                : 'bg-win-card text-gray-400 border-white/5 hover:text-white hover:border-white/15'
            }`}
          >
            Todos
          </button>

          {/* Activity filters */}
          {(['TENDENCIA', 'NUEVOS', 'POR_CERRAR'] as ActivityFilter[]).map((activity) => (
            <button
              key={activity}
              onClick={() => handleActivityClick(activity)}
              className={`flex-shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[11px] font-bold uppercase tracking-wider transition-all border ${
                activityFilter === activity
                  ? 'bg-win-card border-primary/40 text-primary shadow-lg shadow-primary/10'
                  : 'bg-win-card text-gray-400 border-white/5 hover:text-white hover:border-white/15'
              }`}
            >
              {ACTIVITY_LABELS[activity]}
            </button>
          ))}

          {/* Divider */}
          <div className="flex-shrink-0 w-px h-5 bg-white/10 mx-1" />

          {/* Sport filters — always show all */}
          {ALL_SPORTS.map((sport) => (
            <button
              key={sport}
              onClick={() => handleSportClick(sport)}
              className={`flex-shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[11px] font-bold uppercase tracking-wider transition-all border ${
                sportFilter === sport
                  ? 'bg-primary text-win-bg border-primary shadow-lg shadow-primary/20'
                  : 'bg-win-card text-gray-400 border-white/5 hover:text-white hover:border-white/15'
              }`}
            >
              <span>{SPORT_ICONS[sport]}</span>
              {SPORT_LABELS[sport]}
            </button>
          ))}
        </div>
      )}

      {/* Markets grid */}
      {loadingMarkets ? (
        <div className="text-center py-12">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto" />
        </div>
      ) : filteredMarkets.length === 0 ? (
        <div className="text-center py-12 text-gray-400">
          <p className="text-sm">No hay mercados para estos filtros</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredMarkets.map((market) => (
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
