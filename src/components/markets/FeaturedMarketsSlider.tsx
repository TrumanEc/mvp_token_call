'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { getMarketVisual } from '@/lib/market-visual'

const SPORT_LABELS: Record<string, string> = {
  futbol: 'Fútbol',
  copa_mundial: 'Copa Mundial',
  tenis: 'Tenis',
  f1: 'F1',
  nba: 'NBA',
  nfl: 'NFL',
}

const SPORT_ICONS: Record<string, string> = {
  futbol: '⚽',
  copa_mundial: '🏆',
  tenis: '🎾',
  f1: '🏎️',
  nba: '🏀',
  nfl: '🏈',
}

const MONTHS_ES = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic']

function formatCloseDate(dateStr: string) {
  const d = new Date(dateStr)
  return `${d.getDate()} ${MONTHS_ES[d.getMonth()]} ${d.getFullYear()}`
}

function formatPool(val: number) {
  if (val >= 1000000) return `$${(val / 1000000).toFixed(1)}M`
  if (val >= 1000) return `$${(val / 1000).toFixed(1)}k`
  return `$${val.toFixed(0)}`
}

interface FeaturedMarket {
  id: string
  question: string
  playerName?: string | null
  sport?: string | null
  totalPool?: number
  imageUrl?: string | null
  bannerUrl?: string | null
  isFeatured?: boolean
  outcomes?: { id: string; name: string; probability: number; pool?: number }[]
  resolutionDate: string
  odds: { yesOdds: number; noOdds: number }
}

export function FeaturedMarketsSlider({ markets }: { markets: FeaturedMarket[] }) {
  const [active, setActive] = useState(0)
  const [paused, setPaused] = useState(false)

  const getVolume = (m: FeaturedMarket) => m.totalPool ?? 0

  // isFeatured markets first; fallback to top 3 by volume
  const featured = markets.filter((m) => m.isFeatured)
  const top3 = (featured.length > 0
    ? featured
    : [...markets].sort((a, b) => getVolume(b) - getVolume(a))
  ).slice(0, 3)

  const next = useCallback(() => setActive((a) => (a + 1) % top3.length), [top3.length])
  const prev = () => setActive((a) => (a - 1 + top3.length) % top3.length)

  useEffect(() => {
    if (paused || top3.length <= 1) return
    const id = setInterval(next, 5000)
    return () => clearInterval(id)
  }, [paused, next, top3.length])

  if (top3.length === 0) return null

  const market = top3[active]
  const visual = getMarketVisual(market.id, market.question)
  const totalPool = market.totalPool ?? 0
  const outcomes = market.outcomes ?? []
  const isBinary = outcomes.length === 2 && outcomes[0]?.name === 'YES'
  const topOutcome = outcomes.length > 0
    ? outcomes.reduce((a, b) => a.probability > b.probability ? a : b)
    : null
  const yesOdds = isBinary
    ? (outcomes[0]?.probability ?? market.odds.yesOdds)
    : (topOutcome?.probability ?? market.odds.yesOdds)
  const noOdds = isBinary ? (outcomes[1]?.probability ?? market.odds.noOdds) : 0
  const sport = market.sport ?? 'futbol'

  // Arc gauge constants
  const arcR = 52
  const arcSW = 8
  const arcNR = arcR - arcSW
  const arcCirc = arcNR * 2 * Math.PI
  const arcSemi = arcCirc / 2
  const arcOffset = arcSemi - (yesOdds / 100) * arcSemi
  const arcColor = isBinary ? '#64c883' : '#60a5fa'

  const hasBanner = !!market.bannerUrl
  const hasImage = !!market.imageUrl

  return (
    <div
      className="relative mb-6"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
    >
      <Link href={`/markets/${market.id}`}>
        <div
          className="relative rounded-xl overflow-hidden h-[300px] md:h-[320px] cursor-pointer group"
          style={hasBanner
            ? { backgroundImage: `url(${market.bannerUrl})`, backgroundSize: 'cover', backgroundPosition: 'center' }
            : { background: visual.gradient }
          }
        >
          {/* Overlay — multi-directional gradients for text readability */}
          {hasBanner ? (
            <>
              {/* Bottom-to-top: where the title lives */}
              <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/50 to-transparent" />
              {/* Left-to-right: darkens the text area on the left */}
              <div className="absolute inset-0 bg-gradient-to-r from-black/70 via-black/20 to-transparent" />
              {/* Top strip: for the stats row */}
              <div className="absolute inset-x-0 top-0 h-20 bg-gradient-to-b from-black/60 to-transparent" />
            </>
          ) : (
            <>
              <div className="absolute inset-0 bg-black/20" />
              <div className="absolute -top-16 -right-16 w-80 h-80 rounded-full opacity-20 blur-3xl" style={{ background: visual.to }} />
              <div className="absolute -bottom-10 -left-10 w-60 h-60 rounded-full opacity-15 blur-2xl" style={{ background: visual.to }} />
              {/* Fallback big emoji */}
              <span className="absolute top-1/2 right-10 -translate-y-1/2 text-[120px] opacity-20 select-none drop-shadow-2xl">
                {visual.emoji}
              </span>
            </>
          )}

          {/* Content */}
          <div className="relative z-10 h-full flex flex-col justify-between p-7 md:p-8">

            {/* Top row: sport badge | Volumen + Cierra */}
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-1.5">
                <span className="text-sm">{SPORT_ICONS[sport] ?? '🎯'}</span>
                <span className="text-[10px] font-bold uppercase tracking-widest text-white/70 bg-black/30 px-2 py-0.5 rounded-full border border-white/15">
                  {SPORT_LABELS[sport] ?? sport}
                </span>
              </div>

              <div className="flex items-center gap-2">
                {/* Volumen */}
                <div className="flex items-center gap-1.5 bg-black/40 backdrop-blur-sm rounded-lg px-2.5 py-1 border border-white/10">
                  <span className="text-[9px] font-bold uppercase tracking-widest text-white/40">Volumen</span>
                  <span className="text-[12px] font-extrabold text-white leading-none">{formatPool(totalPool)}</span>
                </div>
                {/* Cierra */}
                <div className="flex items-center gap-1 bg-black/40 backdrop-blur-sm px-2.5 py-1 rounded-lg border border-white/10 text-[10px] font-bold uppercase tracking-widest text-white/50">
                  <span className="opacity-60">Cierra</span>
                  <span>{formatCloseDate(market.resolutionDate)}</span>
                </div>
              </div>
            </div>

            {/* Middle: label + title | arc gauge */}
            <div className="flex items-start justify-between gap-6">
              <div className="flex-1 max-w-[55%]">
                <p className="text-white/50 text-[10px] font-bold uppercase tracking-widest mb-2">
                  Predicción destacada
                </p>
                {/* Title row: imageUrl as icon + question */}
                <div className="flex items-start gap-3">
                  {hasImage && (
                    <img
                      src={market.imageUrl!}
                      alt={market.playerName ?? ''}
                      className="w-12 h-12 rounded-xl object-cover flex-shrink-0 mt-1 border border-white/20 shadow-lg"
                    />
                  )}
                  <h2 className="text-[36px] font-extrabold text-white leading-tight group-hover:text-primary transition-colors drop-shadow-sm">
                    {market.question}
                  </h2>
                </div>
              </div>

              {/* Arc gauge */}
              <div className="flex-shrink-0 flex flex-col items-center pt-2">
                <svg width={arcR * 2} height={arcR + arcSW / 2} className="overflow-visible block drop-shadow-lg">
                  <circle
                    stroke="rgba(255,255,255,0.12)"
                    fill="transparent"
                    strokeWidth={arcSW}
                    strokeDasharray={`${arcSemi} ${arcCirc}`}
                    strokeDashoffset={0}
                    r={arcNR}
                    cx={arcR}
                    cy={arcR}
                    strokeLinecap="round"
                    style={{ transform: `rotate(-180deg)`, transformOrigin: `${arcR}px ${arcR}px` }}
                  />
                  <circle
                    stroke={arcColor}
                    fill="transparent"
                    strokeWidth={arcSW}
                    strokeDasharray={`${arcSemi} ${arcCirc}`}
                    strokeDashoffset={arcOffset}
                    r={arcNR}
                    cx={arcR}
                    cy={arcR}
                    strokeLinecap="round"
                    style={{
                      transform: `rotate(-180deg)`,
                      transformOrigin: `${arcR}px ${arcR}px`,
                      transition: 'stroke-dashoffset 0.8s ease-out',
                      filter: `drop-shadow(0 0 6px ${arcColor}80)`,
                    }}
                  />
                </svg>
                <div className="text-center -mt-2">
                  <div className="text-[36px] font-extrabold text-white leading-none tracking-tighter drop-shadow">
                    {yesOdds.toFixed(0)}%
                  </div>
                  <div className="text-[9px] font-bold uppercase tracking-widest text-white/50 mt-1">
                    {isBinary ? 'Chance YES' : topOutcome?.name ?? 'Top'}
                  </div>
                </div>
              </div>
            </div>

            {/* Bottom: slim probability bar */}
            <div className="flex items-center">
              <div className="w-1/4 max-w-[120px]">
                {isBinary ? (
                  <>
                    <div className="flex justify-between text-[9px] font-bold uppercase tracking-widest text-white/35 mb-1">
                      <span>YES {yesOdds.toFixed(0)}%</span>
                      <span>NO {noOdds.toFixed(0)}%</span>
                    </div>
                    <div className="h-0.5 bg-white/10 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-gradient-to-r from-emerald-400 to-primary rounded-full transition-all duration-700"
                        style={{ width: `${yesOdds}%` }}
                      />
                    </div>
                  </>
                ) : (
                  <>
                    <div className="flex justify-between text-[9px] font-bold uppercase tracking-widest text-white/35 mb-1">
                      <span>{topOutcome?.name} {yesOdds.toFixed(0)}%</span>
                    </div>
                    <div className="h-0.5 bg-white/10 rounded-full overflow-hidden flex">
                      {outcomes.map((o, i) => {
                        const colors = ['#64c883', '#f87171', '#60a5fa', '#fbbf24', '#a78bfa', '#f472b6', '#34d399']
                        return (
                          <div
                            key={o.id}
                            className="h-full transition-all duration-700"
                            style={{ width: `${o.probability}%`, background: colors[i % colors.length] }}
                          />
                        )
                      })}
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>
      </Link>

      {/* Dots + arrows */}
      {top3.length > 1 && (
        <div className="flex items-center justify-center gap-3 mt-4">
          <button
            onClick={(e) => { e.preventDefault(); prev() }}
            className="text-white/30 hover:text-white transition-colors text-xs font-bold px-2"
          >
            ‹
          </button>
          {top3.map((_, i) => (
            <button
              key={i}
              onClick={() => setActive(i)}
              className={`transition-all duration-300 rounded-full ${
                i === active
                  ? 'w-6 h-2 bg-primary'
                  : 'w-2 h-2 bg-white/20 hover:bg-white/40'
              }`}
            />
          ))}
          <button
            onClick={(e) => { e.preventDefault(); next() }}
            className="text-white/30 hover:text-white transition-colors text-xs font-bold px-2"
          >
            ›
          </button>
        </div>
      )}
    </div>
  )
}
