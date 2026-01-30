'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'

interface PlaceBetFormProps {
  marketId: string
  userId: string
  userBalance: number
  odds: {
    yesOdds: number
    noOdds: number
    yesPayout: number
    noPayout: number
  }
  onSuccess: () => void
}

export function PlaceBetForm({ marketId, userId, userBalance, odds, onSuccess }: PlaceBetFormProps) {
  const [side, setSide] = useState<'YES' | 'NO'>('YES')
  const [amount, setAmount] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const amountNum = parseFloat(amount) || 0
  const payout = side === 'YES' ? odds.yesPayout : odds.noPayout
  const potentialReturn = amountNum * payout

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
        body: JSON.stringify({ marketId, userId, side, amount: amountNum }),
      })

      const data = await res.json()

      if (!res.ok) {
        throw new Error(data.error || 'Error al crear posición')
      }

      setAmount('')
      onSuccess()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error desconocido')
    } finally {
      setLoading(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <button
          type="button"
          onClick={() => setSide('YES')}
          className={`p-4 rounded-lg border-2 transition-all ${
            side === 'YES'
              ? 'border-green-500 bg-green-50 text-green-700'
              : 'border-gray-200 hover:border-green-300'
          }`}
        >
          <div className="text-2xl font-bold">{odds.yesOdds.toFixed(1)}%</div>
          <div className="text-sm font-medium">YES</div>
          <div className="text-xs opacity-75">Payout: {payout.toFixed(2)}x</div>
        </button>

        <button
          type="button"
          onClick={() => setSide('NO')}
          className={`p-4 rounded-lg border-2 transition-all ${
            side === 'NO'
              ? 'border-red-500 bg-red-50 text-red-700'
              : 'border-gray-200 hover:border-red-300'
          }`}
        >
          <div className="text-2xl font-bold">{odds.noOdds.toFixed(1)}%</div>
          <div className="text-sm font-medium">NO</div>
          <div className="text-xs opacity-75">Payout: {(side === 'NO' ? payout : odds.noPayout).toFixed(2)}x</div>
        </button>
      </div>

      <Input
        type="number"
        label="Monto"
        placeholder="100"
        value={amount}
        onChange={(e) => setAmount(e.target.value)}
        min="1"
        max={userBalance}
      />

      <div className="flex justify-between text-sm text-gray-600">
        <span>Tu saldo: ${userBalance.toFixed(2)}</span>
        <span>Retorno potencial: ${potentialReturn.toFixed(2)}</span>
      </div>

      {error && <p className="text-red-500 text-sm">{error}</p>}

      <Button
        type="submit"
        variant={side === 'YES' ? 'success' : 'danger'}
        className="w-full"
        loading={loading}
      >
        Apostar {side} - ${amountNum.toFixed(2)}
      </Button>
    </form>
  )
}
