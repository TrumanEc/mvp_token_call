'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/Button'
import { Modal } from '@/components/ui/Modal'

interface PositionCardProps {
  position: {
    id: string
    side: 'YES' | 'NO'
    amount: number
    status: string
    fairValue: number
    currentPayout: number
    potentialReturn: number
    isForSale: boolean
    createdAt: string | Date
    initialProbability: number
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
  const [sellAmount, setSellAmount] = useState(position.amount.toFixed(2))
  const [askPrice, setAskPrice] = useState(position.fairValue.toFixed(2))
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const profit = position.potentialReturn - position.amount
  const profitPct = ((profit / position.amount) * 100).toFixed(1)

  const sellAmountNum = parseFloat(sellAmount) || 0
  const proportionalFairValue = (sellAmountNum / position.amount) * position.fairValue

  const handleSell = async () => {
    setError('')
    setLoading(true)

    try {
      const amountToSell = parseFloat(sellAmount)
      const priceToAsk = parseFloat(askPrice)

      if (amountToSell <= 0 || amountToSell > position.amount) {
        throw new Error('Cantidad inválida')
      }

      const res = await fetch(`/api/positions/${position.id}/list`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          userId, 
          askPrice: priceToAsk,
          amount: amountToSell < position.amount ? amountToSell : undefined 
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

  const handleSellAmountChange = (value: string) => {
    setSellAmount(value)
    const newAmount = parseFloat(value) || 0
    const newFairValue = (newAmount / position.amount) * position.fairValue
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
              <span className="text-[10px] font-bold text-[#64c883] uppercase tracking-wider">
                @{Number(position.initialProbability || 0).toFixed(1)}% ENTRY
              </span>
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
            <div className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Invertido</div>
            <div className="text-xl font-extrabold text-white">$ {position.amount.toFixed(0)}</div>
          </div>
          <div className="space-y-1">
            <div className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Fair Value</div>
            <div className="text-xl font-extrabold text-white">$ {position.fairValue.toFixed(0)}</div>
          </div>
          <div className="space-y-1">
            <div className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Retorno</div>
            <div className="text-xl font-extrabold text-white">$ {position.potentialReturn.toFixed(0)}</div>
          </div>
          <div className="space-y-1 text-right lg:text-left">
            <div className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">P&L</div>
            <div className={`text-xl font-extrabold ${parseFloat(profitPct) >= 0 ? 'text-[#64c883]' : 'text-[#e16464]'}`}>
              {parseFloat(profitPct) >= 0 ? '+' : ''}{profitPct}%
            </div>
          </div>
        </div>

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
              <div className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">Disponible</div>
              <div className="text-xl font-extrabold text-white">$ {position.amount.toFixed(2)}</div>
            </div>
            <div className="text-right">
              <div className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">Fair Value</div>
              <div className="text-xl font-extrabold text-[#64c883]">$ {position.fairValue.toFixed(2)}</div>
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-[11px] font-bold text-gray-400 uppercase tracking-wider px-1">Monto a vender</label>
            <div className="relative group">
              <input
                type="number"
                value={sellAmount}
                onChange={(e) => handleSellAmountChange(e.target.value)}
                className="w-full h-14 bg-[#0a0a0a] border border-[#272727] rounded-xl px-4 text-white font-bold text-lg outline-none transition-all focus:border-[#64c883] focus:ring-1 focus:ring-[#64c883]/20"
              />
              <div className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 font-bold">$</div>
            </div>
          </div>

          <div className="flex gap-2">
            {[25, 50, 75, 100].map((pct) => (
              <button
                key={pct}
                onClick={() => handleSellAmountChange((position.amount * pct / 100).toFixed(2))}
                className="flex-1 h-10 rounded-lg bg-white/5 text-[10px] font-bold uppercase tracking-wider text-gray-400 hover:bg-white/10 hover:text-white transition-all"
              >
                {pct}%
              </button>
            ))}
          </div>

          <div className="space-y-2">
            <label className="text-[11px] font-bold text-gray-400 uppercase tracking-wider px-1">Precio de venta</label>
            <div className="relative group">
              <input
                type="number"
                value={askPrice}
                onChange={(e) => setAskPrice(e.target.value)}
                className="w-full h-14 bg-[#121212] border border-[#272727] rounded-xl px-4 text-white font-bold text-lg outline-none transition-all focus:border-[#64c883] focus:ring-1 focus:ring-[#64c883]/20"
              />
              <div className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 font-bold">$</div>
            </div>
            <p className="text-[9px] font-bold text-gray-600 uppercase tracking-wider text-center">Sugerido: $ {proportionalFairValue.toFixed(2)}</p>
          </div>

          <div className="bg-[#64c883]/5 p-4 rounded-xl border border-[#64c883]/10">
            <div className="flex justify-between items-center">
              <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Ganancia/Pérdida proyectada</span>
              <span className={`text-base font-extrabold ${parseFloat(askPrice || '0') - sellAmountNum >= 0 ? 'text-[#64c883]' : 'text-[#e16464]'}`}>
                {parseFloat(askPrice || '0') - sellAmountNum >= 0 ? '+' : ''}
                $ {(parseFloat(askPrice || '0') - sellAmountNum).toFixed(2)}
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
              {loading ? 'Procesando...' : `Confirmar Venta`}
            </button>
          </div>
        </div>
      </Modal>
    </>
  )
}
