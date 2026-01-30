'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { UserProvider, useUser } from '@/contexts/UserContext'
import { Shell } from '@/components/layout/Shell'
import { PositionCard } from '@/components/positions/PositionCard'

function PositionsPage() {
  const router = useRouter()
  const { user, loading, refreshBalance } = useUser()
  const [positions, setPositions] = useState<any[]>([])
  const [loadingPositions, setLoadingPositions] = useState(true)
  const [filter, setFilter] = useState<'ALL' | 'ACTIVE'>('ACTIVE')

  useEffect(() => {
    if (!loading && !user) {
      router.push('/')
    }
  }, [user, loading, router])

  const fetchPositions = () => {
    if (!user) return
    fetch(`/api/positions?userId=${user.id}`)
      .then((r) => r.json())
      .then(setPositions)
      .catch(() => {})
      .finally(() => setLoadingPositions(false))
  }

  useEffect(() => {
    fetchPositions()
  }, [user])

  const handleSell = () => {
    fetchPositions()
    refreshBalance()
  }

  if (loading || !user) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600" />
      </div>
    )
  }

  const filteredPositions = filter === 'ALL' ? positions : positions.filter((p) => p.status === 'ACTIVE')

  const totalInvested = positions.reduce((sum, p) => sum + (p.status === 'ACTIVE' ? p.amount : 0), 0)
  const totalPotential = positions.reduce((sum, p) => sum + (p.status === 'ACTIVE' ? p.potentialReturn : 0), 0)

  return (
    <Shell>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Mis Posiciones</h1>
          <div className="text-sm text-gray-500 mt-1">
            Invertido: ${totalInvested.toFixed(2)} | Retorno potencial: ${totalPotential.toFixed(2)}
          </div>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setFilter('ACTIVE')}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              filter === 'ACTIVE' ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
          >
            Activas
          </button>
          <button
            onClick={() => setFilter('ALL')}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              filter === 'ALL' ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
          >
            Todas
          </button>
        </div>
      </div>

      {loadingPositions ? (
        <div className="text-center py-12">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto" />
        </div>
      ) : filteredPositions.length === 0 ? (
        <div className="text-center py-12 text-gray-500">
          <p>No tienes posiciones</p>
          <button onClick={() => router.push('/markets')} className="mt-4 text-blue-600 hover:text-blue-800">
            Ver mercados →
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {filteredPositions.map((position) => (
            <PositionCard key={position.id} position={position} userId={user.id} onSell={handleSell} />
          ))}
        </div>
      )}
    </Shell>
  )
}

export default function Page() {
  return (
    <UserProvider>
      <PositionsPage />
    </UserProvider>
  )
}
