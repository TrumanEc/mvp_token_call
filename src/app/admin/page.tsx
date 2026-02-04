'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { UserProvider, useUser } from '@/contexts/UserContext'
import { Shell } from '@/components/layout/Shell'
import { Card, CardContent, CardHeader } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Modal } from '@/components/ui/Modal'

function AdminPage() {
  const router = useRouter()
  const { user, loading } = useUser()
  const [markets, setMarkets] = useState<any[]>([])
  const [loadingMarkets, setLoadingMarkets] = useState(true)
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [showResolveModal, setShowResolveModal] = useState<any>(null)
  const [creating, setCreating] = useState(false)
  const [resolving, setResolving] = useState(false)
  const [activeTab, setActiveTab] = useState<'markets' | 'users'>('markets')
  const [users, setUsers] = useState<any[]>([])
  const [loadingUsers, setLoadingUsers] = useState(false)
  const [showCreateUserModal, setShowCreateUserModal] = useState(false)
  const [newUser, setNewUser] = useState({ username: '', email: '' })

  const [newMarket, setNewMarket] = useState({
    playerName: '',
    question: '',
    description: '',
    resolutionDate: '',
    maxPool: '20000',
  })

  useEffect(() => {
    if (!loading && (!user || user.role !== 'ADMIN')) {
      router.push('/')
    }
  }, [user, loading, router])

  const fetchMarkets = () => {
    fetch('/api/markets')
      .then((r) => r.json())
      .then(setMarkets)
      .catch(() => {})
      .finally(() => setLoadingMarkets(false))
  }

  const fetchUsers = async () => {
    setLoadingUsers(true)
    try {
      const res = await fetch('/api/users')
      const data = await res.json()
      setUsers(data)
    } finally {
      setLoadingUsers(false)
    }
  }

  useEffect(() => {
    fetchMarkets()
    fetchUsers()
  }, [])

  const handleCreate = async () => {
    setCreating(true)
    try {
      const res = await fetch('/api/markets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...newMarket,
          maxPool: parseFloat(newMarket.maxPool) || 20000,
        }),
      })
      if (res.ok) {
        setShowCreateModal(false)
        setNewMarket({ playerName: '', question: '', description: '', resolutionDate: '', maxPool: '20000' })
        fetchMarkets()
      }
    } finally {
      setCreating(false)
    }
  }

  const handleActivate = async (id: string) => {
    await fetch(`/api/markets/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'activate' }),
    })
    fetchMarkets()
  }

  const handleResolve = async (outcome: 'YES' | 'NO' | 'VOID') => {
    setResolving(true)
    try {
      await fetch(`/api/markets/${showResolveModal.id}/resolve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ outcome }),
      })
      setShowResolveModal(null)
      fetchMarkets()
    } finally {
      setResolving(false)
    }
  }

  const handleCreateUser = async () => {
    setCreating(true)
    try {
      const res = await fetch('/api/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newUser),
      })
      if (res.ok) {
        setShowCreateUserModal(false)
        setNewUser({ username: '', email: '' })
        fetchUsers()
      }
    } finally {
      setCreating(false)
    }
  }

  if (loading || !user || user.role !== 'ADMIN') {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600" />
      </div>
    )
  }

  return (
    <Shell>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Admin Panel</h1>
        <div className="flex gap-2">
          <Button variant={activeTab === 'markets' ? 'primary' : 'outline'} onClick={() => setActiveTab('markets')}>
            Mercados
          </Button>
          <Button variant={activeTab === 'users' ? 'primary' : 'outline'} onClick={() => setActiveTab('users')}>
            Usuarios
          </Button>
        </div>
      </div>

      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xl font-semibold text-gray-800">
          {activeTab === 'markets' ? 'Mercados' : 'Usuarios'}
        </h2>
        {activeTab === 'markets' ? (
          <Button onClick={() => setShowCreateModal(true)}>+ Crear Mercado</Button>
        ) : (
          <Button onClick={() => setShowCreateUserModal(true)}>+ Crear Usuario</Button>
        )}
      </div>

      {activeTab === 'markets' ? (
        loadingMarkets ? (
          <div className="text-center py-12">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto" />
          </div>
        ) : (
          <div className="space-y-4">
            {markets.map((market) => (
              <Card key={market.id}>
                <CardContent className="flex items-center justify-between py-4">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{market.playerName}</span>
                      <span className={`px-2 py-0.5 text-xs rounded-full ${
                        market.status === 'ACTIVE' ? 'bg-green-100 text-green-800' :
                        market.status === 'DRAFT' ? 'bg-gray-100 text-gray-800' :
                        market.status === 'RESOLVED' ? 'bg-blue-100 text-blue-800' :
                        'bg-yellow-100 text-yellow-800'
                      }`}>
                        {market.status}
                      </span>
                    </div>
                    <p className="text-sm text-gray-600">{market.question}</p>
                    <div className="text-xs text-gray-400 mt-1">
                      Pool: ${(market.yesPool + market.noPool).toFixed(2)} | Res: {new Date(market.resolutionDate).toLocaleDateString()}
                    </div>
                  </div>
                  <div className="flex gap-2">
                    {market.status === 'DRAFT' && (
                      <Button size="sm" variant="success" onClick={() => handleActivate(market.id)}>
                        Activar
                      </Button>
                    )}
                    {(market.status === 'ACTIVE' || market.status === 'CLOSED') && (
                      <Button size="sm" variant="primary" onClick={() => setShowResolveModal(market)}>
                        Resolver
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )
      ) : (
        loadingUsers ? (
          <div className="text-center py-12">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto" />
          </div>
        ) : (
          <div className="space-y-4">
            {users.map((u) => (
              <Card key={u.id}>
                <CardContent className="flex items-center justify-between py-4">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{u.username}</span>
                      <span className={`px-2 py-0.5 text-xs rounded-full ${
                        u.role === 'ADMIN' ? 'bg-purple-100 text-purple-800' : 'bg-gray-100 text-gray-800'
                      }`}>
                        {u.role}
                      </span>
                    </div>
                    <p className="text-sm text-gray-600">{u.email || 'Sin email'}</p>
                  </div>
                  <div className="text-right font-semibold text-green-600">
                    ${u.balance.toFixed(2)}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )
      )}

      <Modal isOpen={showCreateModal} onClose={() => setShowCreateModal(false)} title="Crear Mercado">
        <div className="space-y-4">
          <Input
            label="Jugador"
            value={newMarket.playerName}
            onChange={(e) => setNewMarket({ ...newMarket, playerName: e.target.value })}
            placeholder="Ej: Lionel Messi"
          />
          <Input
            label="Pregunta"
            value={newMarket.question}
            onChange={(e) => setNewMarket({ ...newMarket, question: e.target.value })}
            placeholder="¿Será transferido antes del cierre?"
          />
          <Input
            label="Descripción (opcional)"
            value={newMarket.description}
            onChange={(e) => setNewMarket({ ...newMarket, description: e.target.value })}
          />
          <Input
            type="date"
            label="Fecha de Resolución"
            value={newMarket.resolutionDate}
            onChange={(e) => setNewMarket({ ...newMarket, resolutionDate: e.target.value })}
          />
          <Input
            type="number"
            label="Límite de Pool ($)"
            value={newMarket.maxPool}
            onChange={(e) => setNewMarket({ ...newMarket, maxPool: e.target.value })}
            placeholder="20000"
          />
          <p className="text-xs text-gray-500">Cuando el pool total alcance este límite, solo se podrá comprar en el mercado secundario.</p>
          <div className="flex gap-3">
            <Button variant="outline" onClick={() => setShowCreateModal(false)} className="flex-1">
              Cancelar
            </Button>
            <Button onClick={handleCreate} loading={creating} className="flex-1">
              Crear
            </Button>
          </div>
        </div>
      </Modal>

      <Modal isOpen={showCreateUserModal} onClose={() => setShowCreateUserModal(false)} title="Crear Usuario">
        <div className="space-y-4">
          <Input
            label="Username"
            value={newUser.username}
            onChange={(e) => setNewUser({ ...newUser, username: e.target.value })}
            placeholder="Ej: messi10"
          />
          <Input
            label="Email (opcional)"
            value={newUser.email}
            onChange={(e) => setNewUser({ ...newUser, email: e.target.value })}
            placeholder="messi@example.com"
          />
          <div className="flex gap-3">
            <Button variant="outline" onClick={() => setShowCreateUserModal(false)} className="flex-1">
              Cancelar
            </Button>
            <Button onClick={handleCreateUser} loading={creating} className="flex-1">
              Crear
            </Button>
          </div>
        </div>
      </Modal>

      <Modal isOpen={!!showResolveModal} onClose={() => setShowResolveModal(null)} title="Resolver Mercado">
        {showResolveModal && (
          <div className="space-y-4">
            <p className="text-gray-600">{showResolveModal.question}</p>
            <div className="text-sm text-gray-500">
              Pool YES: ${showResolveModal.yesPool.toFixed(2)} | Pool NO: ${showResolveModal.noPool.toFixed(2)}
            </div>
            <div className="grid grid-cols-3 gap-3">
              <Button variant="success" onClick={() => handleResolve('YES')} loading={resolving}>
                YES Gana
              </Button>
              <Button variant="danger" onClick={() => handleResolve('NO')} loading={resolving}>
                NO Gana
              </Button>
              <Button variant="secondary" onClick={() => handleResolve('VOID')} loading={resolving}>
                Anular
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </Shell>
  )
}

export default function Page() {
  return (
    <UserProvider>
      <AdminPage />
    </UserProvider>
  )
}
