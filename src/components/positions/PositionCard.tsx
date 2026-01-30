'use client'

import { useState } from 'react'
import { Card, CardContent } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
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
  const [askPrice, setAskPrice] = useState(position.fairValue.toFixed(2))
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const profit = position.potentialReturn - position.amount
  const profitPct = ((profit / position.amount) * 100).toFixed(1)

  const handleSell = async () => {
    setError('')
    setLoading(true)

    try {
      const res = await fetch(`/api/positions/${position.id}/list`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, askPrice: parseFloat(askPrice) }),
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

  const statusColors = {
    ACTIVE: 'bg-blue-100 text-blue-800',
    WON: 'bg-green-100 text-green-800',
    LOST: 'bg-red-100 text-red-800',
    REFUNDED: 'bg-yellow-100 text-yellow-800',
  }

  return (
    <>
      <Card>
        <CardContent>
          <div className="flex items-start justify-between mb-2">
            <div>
              <span className="text-sm text-gray-500">{position.market.playerName}</span>
              <h4 className="font-medium text-gray-900">{position.market.question}</h4>
            </div>
            <div className="flex gap-2">
              <span className={`px-2 py-1 text-xs font-medium rounded-full ${position.side === 'YES' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
                {position.side}
              </span>
              <span className={`px-2 py-1 text-xs font-medium rounded-full ${statusColors[position.status as keyof typeof statusColors]}`}>
                {position.status}
              </span>
            </div>
          </div>

          <div className="grid grid-cols-4 gap-4 mt-4 text-center">
            <div>
              <div className="text-lg font-bold">${position.amount.toFixed(2)}</div>
              <div className="text-xs text-gray-500">Invertido</div>
            </div>
            <div>
              <div className="text-lg font-bold">${position.fairValue.toFixed(2)}</div>
              <div className="text-xs text-gray-500">Valor Fair</div>
            </div>
            <div>
              <div className="text-lg font-bold">${position.potentialReturn.toFixed(2)}</div>
              <div className="text-xs text-gray-500">Retorno</div>
            </div>
            <div>
              <div className={`text-lg font-bold ${profit >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                {profit >= 0 ? '+' : ''}{profitPct}%
              </div>
              <div className="text-xs text-gray-500">P&L</div>
            </div>
          </div>

          {position.status === 'ACTIVE' && position.market.status === 'ACTIVE' && !position.isForSale && (
            <div className="mt-4">
              <Button variant="outline" size="sm" onClick={() => setShowSellModal(true)} className="w-full">
                Vender en Marketplace
              </Button>
            </div>
          )}

          {position.isForSale && (
            <div className="mt-4 text-center text-sm text-yellow-600 bg-yellow-50 py-2 rounded">
              📢 En venta en el marketplace
            </div>
          )}
        </CardContent>
      </Card>

      <Modal isOpen={showSellModal} onClose={() => setShowSellModal(false)} title="Vender Posición">
        <div className="space-y-4">
          <div className="text-sm text-gray-600">
            <p>Valor sugerido: <strong>${position.fairValue.toFixed(2)}</strong></p>
            <p className="text-xs mt-1">Máximo permitido: ${(position.fairValue * 1.2).toFixed(2)} (120%)</p>
          </div>

          <Input
            type="number"
            label="Precio de venta"
            value={askPrice}
            onChange={(e) => setAskPrice(e.target.value)}
            step="0.01"
          />

          {error && <p className="text-red-500 text-sm">{error}</p>}

          <div className="flex gap-3">
            <Button variant="outline" onClick={() => setShowSellModal(false)} className="flex-1">
              Cancelar
            </Button>
            <Button variant="success" onClick={handleSell} loading={loading} className="flex-1">
              Listar por ${parseFloat(askPrice).toFixed(2)}
            </Button>
          </div>
        </div>
      </Modal>
    </>
  )
}
