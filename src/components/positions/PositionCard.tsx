'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/Button'
import { Modal } from '@/components/ui/Modal'
import { PositionHistory } from './PositionHistory'


interface PositionCardProps {
  position: {
    id: string
    side: 'YES' | 'NO'
    amount: number // Total Cost
    status: string
    shares: number
    currentPrice: number // Current Market Price per Share
    fairValue: number // Total Fair Value
    currentPayout: number
    potentialReturn: number
    isForSale: boolean
    createdAt: string | Date
    purchasePrice: number // Weighted Avg Cost (avg price per share)
    breakEvenPrice: number
    history: any[]
    market: {
      id: string
      playerName: string
      question: string
      status: string
    }
  }
  userId: string
  onSell: () => void
}

export function PositionCard({ position, userId, onSell }: PositionCardProps) {
  const [showSellModal, setShowSellModal] = useState(false)
  const [sellShares, setSellShares] = useState(position.shares.toFixed(2))
  const [askPrice, setAskPrice] = useState(position.fairValue.toFixed(2))
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const profit = position.fairValue - position.amount
  const profitPct = position.amount > 0 ? (((position.fairValue - position.amount) / position.amount) * 100).toFixed(1) : '0.0'

  const sellSharesNum = parseFloat(sellShares) || 0
  // Proportional Fair Value based on shares being sold
  const proportionalFairValue = (sellSharesNum / position.shares) * position.fairValue

  const handleSell = async () => {
    setError('')
    setLoading(true)

    try {
      const sharesToSell = parseFloat(sellShares)
      const priceToAsk = parseFloat(askPrice)

      if (sharesToSell <= 0 || sharesToSell > position.shares) {
        throw new Error('Cantidad de acciones inválida')
      }

      // Check if selling full position (approx)
      const isFull = Math.abs(sharesToSell - position.shares) < 0.01
      
      const res = await fetch(`/api/positions/${position.id}/list`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          userId, 
          askPrice: priceToAsk,
          amount: isFull ? undefined : sharesToSell // Backend expects 'amount' as shares for partial
        }),
      })

      const data = await res.json()

      if (!res.ok) {
        throw new Error(data.error || 'Error al listar posición')
      }

      setShowSellModal(false)
      onSell()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error desconocido')
    } finally {
      setLoading(false)
    }
  }

  const handleSellSharesChange = (value: string) => {
    setSellShares(value)
    const newShares = parseFloat(value) || 0
    // Suggest price proportional to fair value
    const newFairValue = (newShares / position.shares) * position.fairValue
    setAskPrice(newFairValue.toFixed(2))
  }

  return (
    <>
      <div className="bg-[#121212] border border-white/5 rounded-3xl p-6 transition-all hover:border-white/10 group">
        <div className="flex items-start justify-between mb-8">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">
                {new Date(position.createdAt).toLocaleDateString()}
              </span>
              <div className="w-1 h-1 rounded-full bg-white/10" />
              <div className="flex gap-1">
                 <span className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">
                   Avg Cost:
                 </span>
                 <span className="text-[10px] font-bold text-[#64c883] uppercase tracking-wider">
                   ${position.purchasePrice.toFixed(3)}
                 </span>
              </div>
            </div>
            <h4 className="text-xl font-bold text-white group-hover:text-[#64c883] transition-colors leading-tight">
              {position.market.question}
            </h4>
          </div>
          <div className="flex gap-2 shrink-0">
            <span className={`px-3 py-1 text-[10px] font-bold rounded-full uppercase tracking-wider ${
              position.side === 'YES' ? 'bg-[#64c883]/10 text-[#64c883]' : 'bg-[#e16464]/10 text-[#e16464]'
            }`}>
              {position.side}
            </span>
          </div>
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-6 bg-[#0a0a0a]/50 p-5 rounded-2xl border border-white/5">
          <div className="space-y-1">
            <div className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Acciones</div>
            <div className="text-xl font-extrabold text-white">{position.shares.toFixed(2)}</div>
            <div className="text-[9px] font-bold text-gray-500 uppercase">Tokens Acumulados</div>
          </div>
          <div className="space-y-1">
            <div className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Valor de Mercado</div>
            <div className="text-xl font-extrabold text-white">$ {position.fairValue.toFixed(2)}</div>
            <div className="text-[9px] font-bold text-[#64c883] uppercase flex items-center gap-1">
               <div className="w-1.5 h-1.5 rounded-full bg-[#64c883] animate-pulse" />
               @{position.currentPrice.toFixed(3)}
            </div>
          </div>
          <div className="space-y-1">
             <div className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Costo Ponderado</div>
             <div className="text-xl font-extrabold text-white">$ {position.amount.toFixed(2)}</div>
             <div className="text-[9px] font-bold text-gray-500 uppercase">Avg: ${position.purchasePrice.toFixed(3)}</div>
          </div>
          <div className="space-y-1 text-right lg:text-left">
            <div className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Resultado P&L</div>
            <div className={`text-xl font-extrabold ${parseFloat(profitPct) >= 0 ? 'text-[#64c883]' : 'text-[#e16464]'}`}>
              {parseFloat(profitPct) >= 0 ? '+' : ''}{profitPct}%
            </div>
            <div className={`text-[9px] font-bold uppercase ${parseFloat(profitPct) >= 0 ? 'text-[#64c883]/60' : 'text-[#e16464]/60'}`}>
              $ {profit.toFixed(2)}
            </div>
          </div>
        </div>

        {/* Break-even & Probability Bar */}
        <div className="mt-8 space-y-4">
           <div className="flex justify-between items-center px-1">
              <div className="flex flex-col">
                 <span className="text-[9px] font-bold text-gray-500 uppercase tracking-widest">Punto de Equilibrio</span>
                 <span className="text-[11px] font-bold text-white">${position.breakEvenPrice.toFixed(3)} <span className="text-gray-500 font-medium ml-1">/ share</span></span>
              </div>
              <div className="text-right flex flex-col">
                 <span className="text-[9px] font-bold text-gray-500 uppercase tracking-widest">Probabilidad Actual</span>
                 <span className="text-[11px] font-bold text-[#64c883]">{(position.currentPrice * 100).toFixed(1)}%</span>
              </div>
           </div>
           
           <div className="h-1.5 w-full bg-white/5 rounded-full overflow-hidden flex">
              <div 
                className={`h-full transition-all duration-1000 ${position.side === 'YES' ? 'bg-[#64c883]' : 'bg-[#e16464]'}`}
                style={{ width: `${position.currentPrice * 100}%` }}
              />
           </div>
        </div>

        {/* History Component */}
        <PositionHistory history={position.history} />


        {position.status === 'ACTIVE' && position.market.status === 'ACTIVE' && !position.isForSale && (
          <div className="mt-8">
            <button
              onClick={() => setShowSellModal(true)}
              className="w-full h-12 rounded-xl flex items-center justify-center text-[10px] font-bold uppercase tracking-[0.1em] bg-white/5 text-white/60 hover:bg-white/10 hover:text-white transition-all border border-white/5"
            >
              Vender en Marketplace
            </button>
          </div>
        )}

        {position.isForSale && (
          <div className="mt-8 h-12 flex items-center justify-center rounded-xl bg-white/5 border border-white/10">
            <span className="text-[10px] font-bold text-white/60 uppercase tracking-[0.1em]">En venta en Marketplace</span>
          </div>
        )}
      </div>

      <Modal isOpen={showSellModal} onClose={() => setShowSellModal(false)} title="Vender Posición">
        <div className="space-y-6 pt-4">
          <div className="grid grid-cols-2 gap-4 bg-[#0a0a0a] p-4 rounded-xl border border-white/5">
            <div>
              <div className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">Acciones Disp.</div>
              <div className="text-xl font-extrabold text-white">{position.shares.toFixed(2)}</div>
            </div>
            <div className="text-right">
              <div className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">Fair Value</div>
              <div className="text-xl font-extrabold text-[#64c883]">$ {position.fairValue.toFixed(2)}</div>
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-[11px] font-bold text-gray-400 uppercase tracking-wider px-1">Acciones a vender</label>
            <div className="relative group">
              <input
                type="number"
                value={sellShares}
                onChange={(e) => handleSellSharesChange(e.target.value)}
                className="w-full h-14 bg-[#0a0a0a] border border-[#272727] rounded-xl px-4 text-white font-bold text-lg outline-none transition-all focus:border-[#64c883] focus:ring-1 focus:ring-[#64c883]/20"
              />
              <div className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 font-bold">Shares</div>
            </div>
          </div>

          <div className="flex gap-2">
            {[25, 50, 75, 100].map((pct) => (
              <button
                key={pct}
                onClick={() => handleSellSharesChange((position.shares * pct / 100).toFixed(2))}
                className="flex-1 h-10 rounded-lg bg-white/5 text-[10px] font-bold uppercase tracking-wider text-gray-400 hover:bg-white/10 hover:text-white transition-all"
              >
                {pct}%
              </button>
            ))}
          </div>

          <div className="space-y-2">
            <label className="text-[11px] font-bold text-gray-400 uppercase tracking-wider px-1">Precio Total de Venta ($)</label>
            <div className="relative group">
              <input
                type="number"
                value={askPrice}
                onChange={(e) => setAskPrice(e.target.value)}
                className="w-full h-14 bg-[#121212] border border-[#272727] rounded-xl px-4 text-white font-bold text-lg outline-none transition-all focus:border-[#64c883] focus:ring-1 focus:ring-[#64c883]/20"
              />
              <div className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 font-bold">$</div>
            </div>
            <p className="text-[9px] font-bold text-gray-600 uppercase tracking-wider text-center">
               Fair Value Sugerido: $ {proportionalFairValue.toFixed(2)}
            </p>
          </div>

          <div className="bg-[#64c883]/5 p-4 rounded-xl border border-[#64c883]/10">
            <div className="flex justify-between items-center">
               {/* 
                  Projected P&L for this specific sale: 
                  (Ask Price - Cost Basis of sold shares) 
                  Cost Basis of sold shares = (Sold Shares / Total Shares) * Total Cost
               */}
               <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Ganancia/Pérdida (Est.)</span>
               <span className={`text-base font-extrabold ${parseFloat(askPrice || '0') - (sellSharesNum/position.shares * position.amount) >= 0 ? 'text-[#64c883]' : 'text-[#e16464]'}`}>
                {parseFloat(askPrice || '0') - (sellSharesNum/position.shares * position.amount) >= 0 ? '+' : ''}
                $ {(parseFloat(askPrice || '0') - (sellSharesNum/position.shares * position.amount)).toFixed(2)}
              </span>
            </div>
          </div>

          {error && <p className="text-[#e16464] text-center text-xs font-bold uppercase">{error}</p>}

          <div className="flex gap-3 pt-2">
            <button 
              onClick={() => setShowSellModal(false)} 
              className="flex-1 h-16 rounded-2xl bg-white/5 text-white/40 text-[11px] font-bold uppercase tracking-wider hover:bg-white/10 transition-all"
            >
              Cancelar
            </button>
            <button 
              onClick={handleSell} 
              disabled={loading}
              className="flex-1 h-16 rounded-2xl bg-[#64c883] text-[#0a0a0a] text-[11px] font-bold uppercase tracking-wider transition-all hover:scale-[1.02] shadow-xl shadow-[#64c883]/10"
            >
              {loading ? 'Procesando...' : `Listar Venta`}
            </button>
          </div>
        </div>
      </Modal>
    </>
  )
}
