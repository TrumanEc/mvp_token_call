'use client'

import Link from 'next/link'
import { getMarketVisual } from '@/lib/market-visual'

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
  const yesOdds = market.odds.yesOdds
  const totalVolume = market.yesPool + market.noPool
  const visual = getMarketVisual(market.id, market.question)

  const formatVolume = (val: number) => {
    if (val >= 1000) return `$${(val / 1000).toFixed(1)}k`
    return `$${val.toFixed(0)}`
  }

  // Gauge constants
  const radius = 45
  const stroke = 8
  const normalizedRadius = radius - stroke
  const circumference = normalizedRadius * 2 * Math.PI
  const semiCircumference = circumference / 2
  const strokeDashoffset = semiCircumference - (yesOdds / 100) * semiCircumference

  return (
    <Link href={`/markets/${market.id}`} className="block group">
      <div className="bg-[#171717] rounded-[32px] border border-white/5 transition-all duration-300 overflow-hidden group-hover:border-white/10 group-hover:shadow-[0_20px_40px_rgba(0,0,0,0.4)]">

        {/* Banner image */}
        <div
          className="relative h-28 w-full flex items-center justify-center overflow-hidden"
          style={{ background: visual.gradient }}
        >
          {/* Decorative blobs */}
          <div
            className="absolute -top-8 -right-8 w-32 h-32 rounded-full opacity-20 blur-2xl"
            style={{ background: visual.to }}
          />
          <div
            className="absolute -bottom-4 -left-4 w-24 h-24 rounded-full opacity-15 blur-xl"
            style={{ background: visual.to }}
          />
          {/* Big emoji */}
          <span className="text-5xl select-none drop-shadow-lg relative z-10" aria-hidden>
            {visual.emoji}
          </span>
          {/* Status badge */}
          <div className="absolute top-3 right-3">
            <span className={`text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full ${
              market.status === 'ACTIVE'
                ? 'bg-[#64c883]/20 text-[#64c883] border border-[#64c883]/30'
                : 'bg-white/10 text-gray-400 border border-white/10'
            }`}>
              {market.status}
            </span>
          </div>
        </div>

        {/* Card body */}
        <div className="p-6">
          {/* Top: Question & Gauge */}
          <div className="flex justify-between items-start gap-4 mb-6">
            <h3 className="text-base font-bold text-white leading-tight">
              {market.question}
            </h3>

            <div className="relative flex flex-col items-center flex-shrink-0 w-[90px]">
              <svg height={radius + stroke} width={radius * 2} className="absolute block overflow-visible">
                <circle
                  stroke="#2a2a2a"
                  fill="transparent"
                  strokeWidth={stroke}
                  strokeDasharray={`${semiCircumference} ${circumference}`}
                  style={{ strokeDashoffset: 0 }}
                  r={normalizedRadius}
                  cx={radius}
                  cy={radius}
                  strokeLinecap="round"
                  className="transform -rotate-180 origin-center"
                />
                <circle
                  stroke="#64c883"
                  fill="transparent"
                  strokeWidth={stroke}
                  strokeDasharray={`${semiCircumference} ${circumference}`}
                  style={{ strokeDashoffset, transition: 'stroke-dashoffset 0.8s ease-out' }}
                  r={normalizedRadius}
                  cx={radius}
                  cy={radius}
                  strokeLinecap="round"
                  className="transform -rotate-180 origin-center"
                />
              </svg>
              <div className="absolute top-[-10px] inset-x-0 text-center">
                <span className="block font-extrabold text-white leading-none tracking-tighter">{yesOdds.toFixed(0)}%</span>
                <span className="text-[9px] font-bold text-gray-400 uppercase tracking-[0.1em] mt-1 block">Chance</span>
              </div>
            </div>
          </div>

          {/* Middle: YES / NO buttons (visual) */}
          <div className="grid grid-cols-2 gap-3 mb-6">
            <div className="bg-[#1a2e21]/40 border border-[#64c883]/20 py-3 rounded-2xl flex items-center justify-center transition-all group-hover:bg-[#1a2e21]/60">
              <span className="text-base font-bold text-[#64c883]/80">Yes</span>
            </div>
            <div className="bg-[#2e1a1a]/40 border border-[#e16464]/20 py-3 rounded-2xl flex items-center justify-center transition-all group-hover:bg-[#2e1a1a]/60">
              <span className="text-base font-bold text-[#e16464]/80">No</span>
            </div>
          </div>

          {/* Bottom: Volume */}
          <div className="flex justify-between items-center text-[11px] font-bold uppercase tracking-[0.1em]">
            <span className="text-gray-400">{formatVolume(totalVolume)} Vol.</span>
            <span className="text-gray-600 text-[10px]">
              Res. {new Date(market.resolutionDate).toLocaleDateString()}
            </span>
          </div>
        </div>
      </div>
    </Link>
  )
}
