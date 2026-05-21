'use client'

import Link from 'next/link'
import { getMarketVisual } from '@/lib/market-visual'

const SPORT_ICONS: Record<string, string> = {
  futbol: '⚽',
  copa_mundial: '🏆',
  tenis: '🎾',
  f1: '🏎️',
  nba: '🏀',
  nfl: '🏈',
}

const OUTCOME_COLORS = [
  '#64c883', '#f87171', '#60a5fa', '#fbbf24', '#a78bfa', '#f472b6', '#34d399',
]

const MONTHS_ES = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic']

function daysLeft(dateStr: string) {
  return Math.max(0, Math.ceil((new Date(dateStr).getTime() - Date.now()) / 86400000))
}

function formatPool(val: number) {
  if (val >= 1_000_000) return `$${(val / 1_000_000).toFixed(1)}M`
  if (val >= 1_000)     return `$${(val / 1_000).toFixed(1)}k`
  return `$${val.toFixed(0)}`
}

interface OutcomeData {
  id: string
  name: string
  probability: number
  pool?: number
}

interface MarketCardProps {
  market: {
    id: string
    playerName?: string | null
    question: string
    status: string
    sport?: string | null
    totalPool?: number
    imageUrl?: string | null
    bannerUrl?: string | null
    tags?: string[]
    outcomes?: OutcomeData[]
    odds: { yesOdds: number; noOdds: number }
    resolutionDate: string
  }
}

/** 2×2 collage when the market has multiple outcomes */
function OutcomeCollage({ outcomes, imageUrl, visual }: {
  outcomes: OutcomeData[]
  imageUrl?: string | null
  visual: { gradient: string; emoji: string; to: string }
}) {
  // If there's a single market image, show it full
  if (imageUrl) {
    return (
      <img
        src={imageUrl}
        alt=""
        className="w-full h-full object-cover"
      />
    )
  }

  // Multi-outcome: show up to 4 colored tiles with initials
  const tiles = outcomes.slice(0, 4)
  if (tiles.length === 0) {
    return (
      <div className="w-full h-full flex items-center justify-center" style={{ background: visual.gradient }}>
        <span className="text-3xl">{visual.emoji}</span>
      </div>
    )
  }

  if (tiles.length === 1) {
    return (
      <div className="w-full h-full flex items-center justify-center text-white font-bold text-sm"
        style={{ background: OUTCOME_COLORS[0] }}>
        {tiles[0].name.slice(0, 2).toUpperCase()}
      </div>
    )
  }

  return (
    <div className="w-full h-full grid grid-cols-2 grid-rows-2 gap-[2px]">
      {tiles.map((o, i) => (
        <div
          key={o.id}
          className="flex items-center justify-center text-white font-bold text-[10px] leading-none"
          style={{ background: OUTCOME_COLORS[i % OUTCOME_COLORS.length] }}
        >
          {o.name.slice(0, 3).toUpperCase()}
        </div>
      ))}
    </div>
  )
}

export function MarketCard({ market }: MarketCardProps) {
  const outcomes = market.outcomes ?? []
  const isBinary = outcomes.length === 2 && outcomes[0]?.name === 'YES'
  const topOutcome = outcomes.length > 0
    ? outcomes.reduce((a, b) => a.probability > b.probability ? a : b)
    : null
  const topProb = topOutcome?.probability ?? market.odds.yesOdds
  const totalPool = market.totalPool ?? 0
  const visual = getMarketVisual(market.id, market.question)
  const sport = market.sport ?? 'futbol'
  const days = daysLeft(market.resolutionDate)

  // Probability bar color
  const barColor = isBinary
    ? (topProb > 50 ? '#64c883' : '#f87171')
    : (OUTCOME_COLORS[outcomes.indexOf(topOutcome!)] ?? '#60a5fa')

  return (
    <Link href={`/markets/${market.id}`} className="block group">
      <div className="bg-win-card rounded-2xl border border-white/5 transition-all duration-300 overflow-hidden group-hover:border-white/12 group-hover:shadow-[0_16px_36px_rgba(0,0,0,0.45)] p-4">

        {/* Row: image + main content */}
        <div className="flex items-start gap-4">

          {/* Left — square collage image */}
          <div className="flex-shrink-0 w-[88px] h-[88px] rounded-2xl overflow-hidden border border-white/8">
            <OutcomeCollage outcomes={outcomes} imageUrl={market.imageUrl} visual={visual} />
          </div>

          {/* Right — title + meta */}
          <div className="flex-1 min-w-0">
            {/* Sport tag */}
            <div className="flex items-center gap-1.5 mb-1.5">
              <span className="text-xs">{SPORT_ICONS[sport] ?? '🎯'}</span>
              <span className="text-[9px] font-bold uppercase tracking-widest text-white/40">
                {sport.replace('_', ' ')}
              </span>
            </div>

            {/* Title */}
            <h3 className="text-[15px] font-bold text-white leading-snug mb-2 group-hover:text-primary transition-colors line-clamp-2">
              {market.question}
            </h3>

            {/* Stats row */}
            <div className="flex items-center gap-3 text-[10px] font-bold text-white/40 flex-wrap">
              <span className="flex items-center gap-1">
                <svg className="w-3 h-3 opacity-60" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                </svg>
                {formatPool(totalPool)}
              </span>
              <span className="flex items-center gap-1">
                <svg className="w-3 h-3 opacity-60" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                {days}d restantes
              </span>
              {!isBinary && (
                <span className="flex items-center gap-1 text-blue-400/70">
                  {outcomes.length} opciones
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Probability section */}
        <div className="mt-4">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-[11px] font-semibold text-white/50">
              {isBinary ? 'Chance' : (topOutcome?.name ?? 'Top')}
            </span>
            <span className="text-[18px] font-extrabold text-white leading-none">
              {topProb.toFixed(0)}%
            </span>
          </div>

          {/* Bar */}
          <div className="h-1.5 bg-white/8 rounded-full overflow-hidden">
            <div
              className="h-full rounded-full transition-all duration-700"
              style={{ width: `${topProb}%`, background: barColor }}
            />
          </div>
        </div>

        {/* Bottom: top outcome pill */}
        <div className="mt-3">
          {isBinary ? (
            <div className="flex gap-2">
              <div className="flex-1 bg-emerald-500/10 border border-emerald-500/20 rounded-xl py-2 flex items-center justify-center">
                <span className="text-[12px] font-bold text-emerald-400">
                  Sí — {(outcomes[0]?.probability ?? market.odds.yesOdds).toFixed(0)}%
                </span>
              </div>
              <div className="flex-1 bg-red-500/10 border border-red-500/20 rounded-xl py-2 flex items-center justify-center">
                <span className="text-[12px] font-bold text-red-400">
                  No — {(outcomes[1]?.probability ?? market.odds.noOdds).toFixed(0)}%
                </span>
              </div>
            </div>
          ) : topOutcome ? (
            <div className="flex items-center justify-between bg-white/4 border border-white/8 rounded-xl px-3 py-2">
              <span className="text-[12px] font-semibold text-white">{topOutcome.name}</span>
              <svg className="w-4 h-4 text-white/30" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
              </svg>
            </div>
          ) : null}
        </div>
      </div>
    </Link>
  )
}
