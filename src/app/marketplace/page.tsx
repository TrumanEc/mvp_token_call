'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { UserProvider, useUser } from '@/contexts/UserContext'
import { Shell } from '@/components/layout/Shell'
import { ListingCard } from '@/components/marketplace/ListingCard'

function MarketplacePage() {
  const router = useRouter()
  const { user, loading, refreshBalance } = useUser()
  const [listings, setListings] = useState<any[]>([])
  const [loadingListings, setLoadingListings] = useState(true)
  const [sideFilter, setSideFilter] = useState<'ALL' | 'YES' | 'NO'>('ALL')

  useEffect(() => {
    if (!loading && !user) {
      router.push('/')
    }
  }, [user, loading, router])

  const fetchListings = () => {
    const params = sideFilter !== 'ALL' ? `?side=${sideFilter}` : ''
    fetch(`/api/marketplace${params}`)
      .then((r) => r.json())
      .then(setListings)
      .catch(() => {})
      .finally(() => setLoadingListings(false))
  }

  useEffect(() => {
    fetchListings()
  }, [sideFilter])

  const handleBuy = () => {
    fetchListings()
    refreshBalance()
  }

  if (loading || !user) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600" />
      </div>
    )
  }

  return (
    <Shell>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Marketplace</h1>
          <p className="text-sm text-gray-500">Compra y vende posiciones de otros usuarios</p>
        </div>
        <div className="flex gap-2">
          {(['ALL', 'YES', 'NO'] as const).map((filter) => (
            <button
              key={filter}
              onClick={() => setSideFilter(filter)}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                sideFilter === filter
                  ? filter === 'YES'
                    ? 'bg-green-600 text-white'
                    : filter === 'NO'
                    ? 'bg-red-600 text-white'
                    : 'bg-blue-600 text-white'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              {filter === 'ALL' ? 'Todos' : filter}
            </button>
          ))}
        </div>
      </div>

      {loadingListings ? (
        <div className="text-center py-12">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto" />
        </div>
      ) : listings.length === 0 ? (
        <div className="text-center py-12 text-gray-500">
          <p>No hay listings activos</p>
          <p className="text-sm mt-2">Ve a tus posiciones para listar una venta</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {listings.map((listing) => (
            <ListingCard
              key={listing.id}
              listing={listing}
              userId={user.id}
              userBalance={user.balance}
              onBuy={handleBuy}
            />
          ))}
        </div>
      )}
    </Shell>
  )
}

export default function Page() {
  return (
    <UserProvider>
      <MarketplacePage />
    </UserProvider>
  )
}
