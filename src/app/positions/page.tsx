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
      <div className="min-h-screen bg-[#0a0a0a] flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[#64c883]" />
      </div>
    )
  }

  const filteredPositions = filter === 'ALL' ? positions : positions.filter((p) => p.status === 'ACTIVE')

  const totalInvested = positions.reduce((sum, p) => sum + (p.status === 'ACTIVE' ? p.amount : 0), 0)
  const totalPotential = positions.reduce((sum, p) => sum + (p.status === 'ACTIVE' ? p.potentialReturn : 0), 0)

  return (
    <Shell>
      <div className="max-w-7xl mx-auto px-4 md:px-0">
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-8 mb-12">
          <div>
             <h1 className="text-[32px] md:text-[40px] font-bold text-white leading-tight mb-2">
              Mis Posiciones
            </h1>
            <div className="flex items-center gap-6 text-[10px] font-bold uppercase tracking-[0.1em] text-gray-400">
               <div>
                  Invertido: <span className="text-white ml-1 font-extrabold">$ {totalInvested.toLocaleString()}</span>
               </div>
               <div className="w-[1px] h-3 bg-white/10" />
               <div>
                  Retorno potencial: <span className="text-[#64c883] ml-1 font-extrabold">$ {totalPotential.toLocaleString()}</span>
               </div>
            </div>
          </div>
          
          <div className="flex bg-[#121212] p-1 rounded-xl border border-white/5">
            <button
              onClick={() => setFilter('ACTIVE')}
              className={`px-6 py-2 rounded-lg text-[10px] font-bold uppercase tracking-[0.1em] transition-all ${
                filter === 'ACTIVE' 
                  ? 'bg-[#64c883] text-[#0a0a0a] shadow-lg shadow-[#64c883]/10' 
                  : 'text-gray-400 hover:text-white'
              }`}
            >
              Activas
            </button>
            <button
              onClick={() => setFilter('ALL')}
              className={`px-6 py-2 rounded-lg text-[10px] font-bold uppercase tracking-[0.1em] transition-all ${
                filter === 'ALL' 
                  ? 'bg-[#64c883] text-[#0a0a0a] shadow-lg shadow-[#64c883]/10' 
                  : 'text-gray-400 hover:text-white'
              }`}
            >
              Cerradas
            </button>
          </div>
        </div>

        {loadingPositions ? (
          <div className="flex justify-center py-20">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[#64c883]" />
          </div>
        ) : filteredPositions.length === 0 ? (
          <div className="text-center py-24 bg-[#121212] rounded-3xl border border-white/5">
            <div className="text-gray-400 text-sm font-bold uppercase tracking-wider mb-6">
              No tienes posiciones {filter === 'ACTIVE' ? 'activas' : ''}
            </div>
            <button 
              onClick={() => router.push('/markets')} 
              className="text-[#64c883] text-xs font-bold uppercase tracking-[0.1em] hover:opacity-80 transition-opacity"
            >
              Ver mercados →
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            {filteredPositions.map((position) => (
              <PositionCard key={position.id} position={position} userId={user.id} onSell={handleSell} />
            ))}
          </div>
        )}
      </div>
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
