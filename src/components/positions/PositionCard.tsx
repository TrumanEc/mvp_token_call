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
  const [sellAmount, setSellAmount] = useState(position.amount.toFixed(2))
  const [askPrice, setAskPrice] = useState(position.fairValue.toFixed(2))
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const profit = position.potentialReturn - position.amount
  const profitPct = ((profit / position.amount) * 100).toFixed(1)

  // Calculate proportional fair value based on sell amount
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

  // Update ask price when sell amount changes
  const handleSellAmountChange = (value: string) => {
    setSellAmount(value)
    const newAmount = parseFloat(value) || 0
    const newFairValue = (newAmount / position.amount) * position.fairValue
    setAskPrice(newFairValue.toFixed(2))
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
            <p>Posición total disponible: <strong>${position.amount.toFixed(2)}</strong></p>
            <p className="text-xs mt-1">Puedes vender toda o una parte de tu posición.</p>
          </div>

          <Input
            type="number"
            label="Cantidad a vender ($)"
            value={sellAmount}
            onChange={(e) => handleSellAmountChange(e.target.value)}
            step="0.01"
            min="0.01"
            max={position.amount.toString()}
          />

          <div className="flex gap-2">
            <Button 
              variant="outline" 
              size="sm" 
              onClick={() => handleSellAmountChange((position.amount * 0.25).toFixed(2))}
            >
              25%
            </Button>
            <Button 
              variant="outline" 
              size="sm" 
              onClick={() => handleSellAmountChange((position.amount * 0.5).toFixed(2))}
            >
              50%
            </Button>
            <Button 
              variant="outline" 
              size="sm" 
              onClick={() => handleSellAmountChange((position.amount * 0.75).toFixed(2))}
            >
              75%
            </Button>
            <Button 
              variant="outline" 
              size="sm" 
              onClick={() => handleSellAmountChange(position.amount.toFixed(2))}
            >
              100%
            </Button>
          </div>

          <div className="text-sm text-gray-600">
            <p>Valor sugerido: <strong>${proportionalFairValue.toFixed(2)}</strong></p>
            <p className="text-xs mt-1">Precio sugerido basado en la probabilidad actual.</p>
          </div>

          <Input
            type="number"
            label="Precio de venta ($)"
            value={askPrice}
            onChange={(e) => setAskPrice(e.target.value)}
            step="0.01"
          />

          <div className="bg-gray-50 p-3 rounded-lg text-sm">
            <div className="flex justify-between mb-1">
              <span className="text-gray-600">Cantidad a vender:</span>
              <span className="font-medium">${sellAmountNum.toFixed(2)}</span>
            </div>
            <div className="flex justify-between mb-1">
              <span className="text-gray-600">Inversión proporcional:</span>
              <span className="font-medium">${sellAmountNum.toFixed(2)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-600">Ganancia/Pérdida proyectada:</span>
              <span className={`font-bold ${parseFloat(askPrice || '0') - sellAmountNum >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                {parseFloat(askPrice || '0') - sellAmountNum >= 0 ? '+' : ''}
                ${(parseFloat(askPrice || '0') - sellAmountNum).toFixed(2)}
                {' '}
                ({sellAmountNum > 0 ? ((parseFloat(askPrice || '0') - sellAmountNum) / sellAmountNum * 100).toFixed(1) : 0}%)
              </span>
            </div>
          </div>

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
