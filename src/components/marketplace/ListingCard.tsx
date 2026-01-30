'use client'

import { useState } from 'react'
import { Card, CardContent } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Modal } from '@/components/ui/Modal'

interface ListingCardProps {
  listing: {
    id: string
    askPrice: number
    suggestedPrice: number
    currentPayout: number
    potentialReturn: number
    potentialProfit: number
    roi: number
    position: {
      id: string
      side: 'YES' | 'NO'
      amount: number
      market: {
        id: string
        playerName: string
        question: string
      }
    }
    seller: {
      id: string
      username: string
    }
  }
  userId: string
  userBalance: number
  onBuy: () => void
}

export function ListingCard({ listing, userId, userBalance, onBuy }: ListingCardProps) {
  const [showBuyModal, setShowBuyModal] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const isSeller = listing.seller.id === userId
  const canAfford = userBalance >= listing.askPrice

  const handleBuy = async () => {
    setError('')
    setLoading(true)

    try {
      const res = await fetch(`/api/marketplace/buy/${listing.id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ buyerId: userId }),
      })

      const data = await res.json()

      if (!res.ok) {
        throw new Error(data.error || 'Error al comprar')
      }

      setShowBuyModal(false)
      onBuy()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error desconocido')
    } finally {
      setLoading(false)
    }
  }

  return (
    <>
      <Card className="hover:shadow-lg transition-shadow">
        <CardContent>
          <div className="flex items-start justify-between mb-2">
            <div>
              <span className="text-sm text-gray-500">{listing.position.market.playerName}</span>
              <h4 className="font-medium text-gray-900 line-clamp-2">{listing.position.market.question}</h4>
            </div>
            <span className={`px-2 py-1 text-xs font-medium rounded-full ${listing.position.side === 'YES' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
              {listing.position.side}
            </span>
          </div>

          <div className="grid grid-cols-2 gap-4 my-4">
            <div className="text-center p-2 bg-gray-50 rounded">
              <div className="text-xl font-bold text-gray-900">${listing.askPrice.toFixed(2)}</div>
              <div className="text-xs text-gray-500">Precio</div>
            </div>
            <div className="text-center p-2 bg-gray-50 rounded">
              <div className={`text-xl font-bold ${listing.roi >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                {listing.roi >= 0 ? '+' : ''}{listing.roi.toFixed(1)}%
              </div>
              <div className="text-xs text-gray-500">ROI si gana</div>
            </div>
          </div>

          <div className="text-xs text-gray-500 space-y-1">
            <div className="flex justify-between">
              <span>Retorno potencial:</span>
              <span className="font-medium">${listing.potentialReturn.toFixed(2)}</span>
            </div>
            <div className="flex justify-between">
              <span>Ganancia potencial:</span>
              <span className={`font-medium ${listing.potentialProfit >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                ${listing.potentialProfit.toFixed(2)}
              </span>
            </div>
            <div className="flex justify-between">
              <span>Vendedor:</span>
              <span className="font-medium">{listing.seller.username}</span>
            </div>
          </div>

          {!isSeller && (
            <Button
              variant="primary"
              size="sm"
              className="w-full mt-4"
              onClick={() => setShowBuyModal(true)}
              disabled={!canAfford}
            >
              {canAfford ? `Comprar por $${listing.askPrice.toFixed(2)}` : 'Saldo insuficiente'}
            </Button>
          )}

          {isSeller && (
            <div className="mt-4 text-center text-sm text-blue-600 bg-blue-50 py-2 rounded">
              Tu listing
            </div>
          )}
        </CardContent>
      </Card>

      <Modal isOpen={showBuyModal} onClose={() => setShowBuyModal(false)} title="Confirmar Compra">
        <div className="space-y-4">
          <div className="bg-gray-50 p-4 rounded-lg space-y-2 text-sm">
            <div className="flex justify-between">
              <span>Posición:</span>
              <span className="font-medium">{listing.position.side}</span>
            </div>
            <div className="flex justify-between">
              <span>Precio:</span>
              <span className="font-medium">${listing.askPrice.toFixed(2)}</span>
            </div>
            <div className="flex justify-between">
              <span>Retorno potencial:</span>
              <span className="font-medium text-green-600">${listing.potentialReturn.toFixed(2)}</span>
            </div>
            <div className="flex justify-between">
              <span>Tu saldo después:</span>
              <span className="font-medium">${(userBalance - listing.askPrice).toFixed(2)}</span>
            </div>
          </div>

          {error && <p className="text-red-500 text-sm">{error}</p>}

          <div className="flex gap-3">
            <Button variant="outline" onClick={() => setShowBuyModal(false)} className="flex-1">
              Cancelar
            </Button>
            <Button variant="success" onClick={handleBuy} loading={loading} className="flex-1">
              Confirmar Compra
            </Button>
          </div>
        </div>
      </Modal>
    </>
  )
}
