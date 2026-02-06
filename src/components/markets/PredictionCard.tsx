'use client'

import React, { useState } from 'react'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'

interface PredictionCardProps {
  market: any
  userId: string
  userBalance: number
  onSuccess: () => void
}

export function PredictionCard({ market, userId, userBalance, onSuccess }: PredictionCardProps) {
  const [side, setSide] = useState<'YES' | 'NO'>('YES')
  const [amount, setAmount] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const yesOdds = market.odds.yesOdds
  const totalVolume = market.yesPool + market.noPool
  
  const formatVolume = (val: number) => {
    if (val >= 1000) return `$${(val / 1000).toFixed(1)}k`
    return `$${val.toFixed(0)}`
  }

  const amountNum = parseFloat(amount) || 0
  const currentPrice = (side === 'YES' ? market.odds.yesOdds : market.odds.noOdds) / 100
  const estimatedShares = amountNum / currentPrice
  const potentialReturn = estimatedShares // Each share pays $1

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')

    if (amountNum <= 0) {
      setError('Ingresa un monto válido')
      return
    }

    if (amountNum > userBalance) {
      setError('Saldo insuficiente')
      return
    }

    setLoading(true)

    try {
      const res = await fetch('/api/positions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          marketId: market.id, 
          userId, 
          side, 
          amount: amountNum 
        }),
      })

      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Error al crear posición')

      setAmount('')
      onSuccess()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error desconocido')
    } finally {
      setLoading(false)
    }
  }

  // Gauge constants
  const radius = 45
  const stroke = 8
  const normalizedRadius = radius - stroke
  const circumference = normalizedRadius * 2 * Math.PI
  const semiCircumference = circumference / 2
  const strokeDashoffset = semiCircumference - (yesOdds / 100) * semiCircumference

  return (
    <div className="bg-[#171717] rounded-3xl p-6 shadow-2xl border border-white/5 space-y-6">
      {/* Header with Gauge */}
      <div className="flex justify-between items-center">
        <h3 className="text-xl font-semibold text-white max-w-[60%] leading-tight">
          {market.question}
        </h3>
        
        <div className="relative flex flex-col items-center flex-shrink-0 w-[90px]">
          <svg height={radius + stroke} width={radius * 2} className="absolute block overflow-visible">
            {/* Background Arch */}
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
            {/* Progress Arch */}
            <circle
              stroke="#64c883"
              fill="transparent"
              strokeWidth={stroke}
              strokeDasharray={`${semiCircumference} ${circumference}`}
              style={{ strokeDashoffset, transition: 'stroke-dashoffset 0.5s ease-in-out' }}
              r={normalizedRadius}
              cx={radius}
              cy={radius}
              strokeLinecap="round"
              className="transform -rotate-180 origin-center"
            />
          </svg>
          <div className="absolute top-[-10px] inset-x-0 text-center">
            <span className="block text-xl font-extrabold text-white leading-none tracking-tighter">{yesOdds.toFixed(0)}%</span>
            <span className="text-[10px] font-bold text-gray-400 uppercase tracking-[0.1em] mt-2 block">Chance</span>
          </div>
        </div>
      </div>

      {/* Selection Buttons */}
      <div className="grid grid-cols-2 gap-4">
        <button
          onClick={() => setSide('YES')}
          className={`h-16 rounded-2xl flex flex-col items-center justify-center transition-all duration-300 transform hover:scale-[1.02] active:scale-[0.98] ${
            side === 'YES' 
              ? 'bg-[#64c883] text-[#0a0a0a] shadow-lg shadow-[#64c883]/20' 
              : 'bg-[#1a2e21]/40 text-[#64c883]/60 border border-[#64c883]/10'
          }`}
        >
          <span className="text-xl font-bold">Yes</span>
          <span className="text-[10px] font-bold opacity-70 mt-0.5">${(market.odds.yesOdds / 100).toFixed(2)}</span>
        </button>
        <button
          onClick={() => setSide('NO')}
          className={`h-16 rounded-2xl flex flex-col items-center justify-center transition-all duration-300 transform hover:scale-[1.02] active:scale-[0.98] ${
            side === 'NO' 
              ? 'bg-[#e16464] text-[#0a0a0a] shadow-lg shadow-[#e16464]/20' 
              : 'bg-[#2e1a1a]/40 text-[#e16464]/60 border border-[#e16464]/10'
          }`}
        >
          <span className="text-xl font-bold">No</span>
          <span className="text-[10px] font-bold opacity-70 mt-0.5">${(market.odds.noOdds / 100).toFixed(2)}</span>
        </button>
      </div>

      {/* Betting Form Elements (Integrated) */}
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="space-y-2">
          <div className="flex justify-between text-[11px] font-bold text-gray-500 uppercase tracking-wider px-1">
             <span>Monto a invertir</span>
             <span>Saldo: ${userBalance.toFixed(2)}</span>
          </div>
          <div className="relative group">
            <input
              type="number"
              placeholder="0.00"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="w-full bg-[#0d0d0d] border border-[#272727] rounded-xl px-4 py-3 text-white font-bold text-lg outline-none transition-all group-focus-within:border-[#64c883] group-focus-within:ring-1 group-focus-within:ring-[#64c883]/20"
            />
            <div className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-500 font-bold">$</div>
          </div>
        </div>

        {amountNum > 0 && (
          <div className="space-y-2">
            <div className="flex justify-between items-center px-4 py-3 bg-[#0d0d0d]/50 rounded-xl border border-white/5">
               <span className="text-xs text-gray-400">Acciones Proyectadas</span>
               <span className="text-sm font-bold text-white">{estimatedShares.toFixed(2)}</span>
            </div>
            <div className="flex justify-between items-center px-4 py-4 bg-[#64c883]/5 rounded-xl border border-[#64c883]/10">
               <span className="text-xs text-[#64c883]">Retorno si Gana</span>
               <span className="text-base font-extrabold text-[#64c883]">${potentialReturn.toFixed(2)}</span>
            </div>
          </div>
        )}

        {error && <p className="text-[#e16464] text-xs text-center font-medium">{error}</p>}

        <Button
          type="submit"
          disabled={!amount || loading}
          loading={loading}
          className={`w-full py-6 rounded-2xl text-lg font-bold transition-all shadow-xl ${
            side === 'YES' 
            ? 'bg-[#64c883] text-[#0a0a0a] hover:bg-[#74db93] shadow-[#64c883]/20' 
            : 'bg-[#e16464] text-white hover:bg-[#ef7a7a] shadow-[#e16464]/20'
          }`}
        >
          Confirmar {side}
        </Button>
      </form>

      {/* Footer Stats */}
      <div className="text-center pt-2">
        <span className="text-sm font-bold text-gray-500">{formatVolume(totalVolume)} Vol.</span>
      </div>
    </div>
  )
}
