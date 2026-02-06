'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { UserProvider, useUser } from '@/contexts/UserContext'
import { Shell } from '@/components/layout/Shell'
import { Card, CardContent } from '@/components/ui/Card'
import { PriceChart } from '@/components/markets/PriceChart'
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
  const [activeTab, setActiveTab] = useState<'markets' | 'users' | 'purchases' | 'payments'>('markets')
  const [users, setUsers] = useState<any[]>([])
  const [loadingUsers, setLoadingUsers] = useState(false)
  const [purchases, setPurchases] = useState<any[]>([])
  const [loadingPurchases, setLoadingPurchases] = useState(false)
  const [transactions, setTransactions] = useState<any[]>([])
  const [loadingTransactions, setLoadingTransactions] = useState(false)
  const [showCreateUserModal, setShowCreateUserModal] = useState(false)
  const [newUser, setNewUser] = useState({ username: '', email: '' })
  const [selectedMarketId, setSelectedMarketId] = useState<string>('')
  
  const [selectedUserStats, setSelectedUserStats] = useState<any>(null)
  const [selectedMarketStats, setSelectedMarketStats] = useState<any>(null)
  const [loadingDetails, setLoadingDetails] = useState(false)

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
    setLoadingMarkets(true)
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

  const fetchPurchases = async (marketId?: string) => {
    setLoadingPurchases(true)
    try {
      const url = marketId ? `/api/admin/purchases?marketId=${marketId}` : '/api/admin/purchases'
      const res = await fetch(url)
      const data = await res.json()
      setPurchases(data)
    } finally {
      setLoadingPurchases(false)
    }
  }

  const fetchTransactions = async (marketId?: string) => {
    setLoadingTransactions(true)
    try {
      const url = marketId ? `/api/admin/transactions?marketId=${marketId}` : '/api/admin/transactions'
      const res = await fetch(url)
      const data = await res.json()
      setTransactions(data)
    } finally {
      setLoadingTransactions(false)
    }
  }

  const fetchUserDetails = async (userId: string) => {
    setLoadingDetails(true)
    try {
      const res = await fetch(`/api/admin/users/${userId}/stats`)
      const data = await res.json()
      setSelectedUserStats(data)
    } finally {
      setLoadingDetails(false)
    }
  }

  const fetchMarketDetails = async (marketId: string) => {
    setLoadingDetails(true)
    try {
      const res = await fetch(`/api/admin/markets/${marketId}/stats`)
      const data = await res.json()
      setSelectedMarketStats(data)
    } finally {
      setLoadingDetails(false)
    }
  }

  useEffect(() => {
    fetchMarkets()
    fetchUsers()
  }, [])

  useEffect(() => {
    if (activeTab === 'purchases') fetchPurchases(selectedMarketId)
    if (activeTab === 'payments') fetchTransactions(selectedMarketId)
  }, [activeTab, selectedMarketId])

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
      if (activeTab === 'payments') fetchTransactions(selectedMarketId)
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
      <div className="min-h-screen bg-[#0a0a0a] flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[#64c883]" />
      </div>
    )
  }

  return (
    <Shell>
      <div className="max-w-7xl mx-auto">
        {/* Admin Header */}
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-8 mb-12">
          <div>
             <h1 className="text-[32px] md:text-[40px] font-bold text-white leading-tight mb-2">
              Panel Admin
            </h1>
            <div className="flex items-center gap-4 text-[11px] font-bold uppercase tracking-[0.1em] text-white/40">
               Control de Plataforma
            </div>
          </div>
          
          <div className="flex bg-[#121212] p-1 rounded-xl border border-white/5">
            {[
              { id: 'markets', label: 'Mercados' },
              { id: 'users', label: 'Usuarios' },
              { id: 'purchases', label: 'Compras' },
              { id: 'payments', label: 'Pagos' }
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => { setActiveTab(tab.id as any); setSelectedMarketId(''); }}
                className={`px-5 py-2 rounded-lg text-[10px] font-bold uppercase tracking-[0.1em] transition-all ${
                  activeTab === tab.id 
                    ? 'bg-[#64c883] text-[#0a0a0a] shadow-lg shadow-[#64c883]/10' 
                    : 'text-gray-400 hover:text-white'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        {/* Action Bar */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8 bg-[#121212] p-4 rounded-2xl border border-white/5">
          <h2 className="text-xs font-bold uppercase tracking-[0.15em] text-white">
            {activeTab === 'markets' ? 'Gestión de Mercados' : 
             activeTab === 'users' ? 'Gestión de Usuarios' :
             activeTab === 'purchases' ? 'Historial de Compras' :
             'Historial de Pagos'}
          </h2>
          <div className="flex items-center gap-4">
            {(activeTab === 'purchases' || activeTab === 'payments') && (
              <select 
                className="bg-[#0a0a0a] text-white text-[10px] font-bold uppercase tracking-[0.1em] px-4 py-2 border border-white/5 rounded-xl outline-none focus:border-[#64c883] transition-all"
                value={selectedMarketId}
                onChange={(e) => setSelectedMarketId(e.target.value)}
              >
                <option value="">Filtro: Todos</option>
                {markets.map((m) => (
                  <option key={m.id} value={m.id}>{m.playerName || m.question.substring(0, 20)}</option>
                ))}
              </select>
            )}
            {activeTab === 'markets' && (
              <button 
                onClick={() => setShowCreateModal(true)}
                className="bg-[#64c883] text-[#0a0a0a] text-[10px] font-bold uppercase tracking-[0.1em] px-5 py-2 rounded-xl transition-all hover:scale-[1.02]"
              >
                + Crear Mercado
              </button>
            )}
             {activeTab === 'users' && (
              <button 
                onClick={() => setShowCreateUserModal(true)}
                className="bg-white text-[#0a0a0a] text-[10px] font-bold uppercase tracking-[0.1em] px-5 py-2 rounded-xl transition-all hover:scale-[1.02]"
              >
                + Crear Usuario
              </button>
            )}
          </div>
        </div>

        {/* Content Area */}
        <div className="space-y-6">
          {activeTab === 'markets' && (
            loadingMarkets ? (
              <div className="flex justify-center py-20"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#64c883]" /></div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {markets.map((market) => (
                  <div key={market.id} className="bg-[#121212] border border-white/5 rounded-3xl p-6 hover:border-white/10 transition-all group cursor-pointer" onClick={() => fetchMarketDetails(market.id)}>
                    <div className="flex justify-between items-start mb-6">
                      <div className="space-y-1">
                        <span className={`px-2 py-0.5 text-[9px] font-bold rounded-full uppercase tracking-wider ${
                          market.status === 'ACTIVE' ? 'bg-[#64c883]/10 text-[#64c883]' :
                          market.status === 'DRAFT' ? 'bg-gray-800 text-gray-400' :
                          market.status === 'RESOLVED' ? 'bg-white/10 text-white' :
                          'bg-[#e16464]/10 text-[#e16464]'
                        }`}>
                          {market.status}
                        </span>
                        <h4 className="text-base font-bold text-white group-hover:text-[#64c883] transition-colors">{market.question}</h4>
                      </div>
                      <div className="flex gap-2" onClick={(e) => e.stopPropagation()}>
                        {market.status === 'DRAFT' && (
                          <button onClick={() => handleActivate(market.id)} className="px-3 py-1 bg-[#64c883] text-[#0a0a0a] text-[9px] font-bold rounded-lg uppercase tracking-wider">Activar</button>
                        )}
                        {(market.status === 'ACTIVE' || market.status === 'CLOSED') && (
                          <button onClick={() => setShowResolveModal(market)} className="px-3 py-1 bg-white text-[#0a0a0a] text-[9px] font-bold rounded-lg uppercase tracking-wider">Resolver</button>
                        )}
                      </div>
                    </div>
                    <div className="grid grid-cols-3 gap-2 bg-[#0a0a0a] p-4 rounded-xl border border-white/5">
                      <div>
                        <div className="text-[9px] font-bold text-gray-400 uppercase tracking-wider">YES Pool</div>
                        <div className="text-sm font-extrabold text-[#64c883]">$ {Number(market.yesPool || 0).toFixed(0)}</div>
                      </div>
                      <div>
                        <div className="text-[9px] font-bold text-gray-400 uppercase tracking-wider">NO Pool</div>
                        <div className="text-sm font-extrabold text-[#e16464]">$ {Number(market.noPool || 0).toFixed(0)}</div>
                      </div>
                      <div className="text-right">
                        <div className="text-[9px] font-bold text-gray-400 uppercase tracking-wider">Total</div>
                        <div className="text-sm font-extrabold text-white">$ {(Number(market.yesPool || 0) + Number(market.noPool || 0)).toFixed(0)}</div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )
          )}

          {activeTab === 'users' && (
            loadingUsers ? (
              <div className="flex justify-center py-20"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" /></div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {users.map((u) => (
                  <div key={u.id} className="bg-[#121212] border border-white/5 rounded-3xl p-6 hover:border-white/10 transition-all group cursor-pointer" onClick={() => fetchUserDetails(u.id)}>
                    <div className="flex items-center gap-4 mb-4">
                      <div className="w-12 h-12 rounded-full bg-white/5 flex items-center justify-center font-bold text-gray-400 uppercase text-xs border border-white/5">
                        {u.username[0]}
                      </div>
                      <div>
                        <div className="text-base font-bold text-white group-hover:text-[#64c883] transition-colors">@{u.username}</div>
                        <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full uppercase tracking-wider ${
                          u.role === 'ADMIN' ? 'bg-white/10 text-white' : 'bg-gray-800 text-gray-400'
                        }`}>
                          {u.role}
                        </span>
                      </div>
                    </div>
                    <div className="bg-[#0a0a0a] p-3 rounded-xl border border-white/5 flex justify-between items-center">
                       <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Balance</span>
                       <span className="text-base font-extrabold text-[#64c883]">$ {Number(u.balance || 0).toFixed(2)}</span>
                    </div>
                  </div>
                ))}
              </div>
            )
          )}

          {/* Table-based views for Purchases & Payments updated to Dark Theme */}
          {(activeTab === 'purchases' || activeTab === 'payments') && (
            <div className="bg-[#121212] border border-white/5 rounded-3xl overflow-hidden">
               <div className="overflow-x-auto">
                 <table className="w-full text-left border-collapse">
                   <thead>
                     <tr className="border-b border-white/5 bg-[#171717]">
                       {activeTab === 'purchases' ? (
                         <>
                           <th className="p-4 text-[9px] font-bold text-gray-400 uppercase tracking-[0.1em]">Mercado</th>
                           <th className="p-4 text-[9px] font-bold text-gray-400 uppercase tracking-[0.1em]">Posición</th>
                           <th className="p-4 text-[9px] font-bold text-gray-400 uppercase tracking-[0.1em]">Monto</th>
                           <th className="p-4 text-[9px] font-bold text-gray-400 uppercase tracking-[0.1em]">Usuario</th>
                           <th className="p-4 text-[9px] font-bold text-gray-400 uppercase tracking-[0.1em]">Estado</th>
                         </>
                       ) : (
                         <>
                           <th className="p-4 text-[9px] font-bold text-gray-400 uppercase tracking-[0.1em]">Usuario</th>
                           <th className="p-4 text-[9px] font-bold text-gray-400 uppercase tracking-[0.1em]">Tipo</th>
                           <th className="p-4 text-[9px] font-bold text-gray-400 uppercase tracking-[0.1em]">Monto</th>
                           <th className="p-4 text-[9px] font-bold text-gray-400 uppercase tracking-[0.1em]">Fecha</th>
                         </>
                       )}
                     </tr>
                   </thead>
                   <tbody className="divide-y divide-white/5">
                     {activeTab === 'purchases' ? (
                       purchases.map((p) => (
                         <tr key={p.id} className="hover:bg-white/5 transition-colors">
                           <td className="p-4 text-xs font-bold text-white">{p.market.playerName || 'Mercado'}</td>
                           <td className="p-4">
                              <span className={`px-2 py-0.5 text-[9px] font-bold rounded-full uppercase tracking-wider ${p.side === 'YES' ? 'bg-[#64c883]/10 text-[#64c883]' : 'bg-[#e16464]/10 text-[#e16464]'}`}>
                                {p.side} @ {parseFloat(p.initialProbability).toFixed(0)}%
                              </span>
                           </td>
                           <td className="p-4 text-sm font-extrabold text-white">$ {parseFloat(p.amount).toFixed(2)}</td>
                           <td className="p-4 text-xs font-bold text-white/40">@{p.currentOwner.username}</td>
                           <td className="p-4">
                              <span className="text-[10px] font-bold text-gray-400 uppercase">{p.status}</span>
                           </td>
                         </tr>
                       ))
                     ) : (
                       transactions.map((t) => (
                         <tr key={t.id} className="hover:bg-white/5 transition-colors">
                           <td className="p-4 text-xs font-bold text-white">@{t.user.username}</td>
                           <td className="p-4">
                              <span className="text-[9px] font-bold text-gray-400 uppercase tracking-wider">{t.type}</span>
                           </td>
                           <td className="p-4 text-sm font-extrabold text-[#64c883]">$ {Math.abs(parseFloat(t.amount)).toFixed(2)}</td>
                           <td className="p-4 text-[10px] font-bold text-gray-400">{new Date(t.createdAt).toLocaleDateString()}</td>
                         </tr>
                       ))
                     )}
                   </tbody>
                 </table>
                 {((activeTab === 'purchases' && purchases.length === 0) || (activeTab === 'payments' && transactions.length === 0)) && (
                   <div className="text-center py-20 text-gray-400 text-[10px] font-bold uppercase tracking-wider">No hay datos registrados</div>
                 )}
               </div>
            </div>
          )}
        </div>
      </div>

      {/* Drill-down Modals (Dark Mode Update) */}
      <Modal isOpen={!!selectedUserStats} onClose={() => setSelectedUserStats(null)} title={`Perfil de Trading: @${selectedUserStats?.username}`} size="4xl">
        {loadingDetails ? (
           <div className="py-20 flex justify-center"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#64c883]" /></div>
        ) : selectedUserStats && (
          <div className="space-y-8 pt-4">
            <div className="grid grid-cols-3 gap-6">
              <div className="p-6 bg-[#0a0a0a] rounded-2xl border border-white/5">
                <p className="text-[10px] text-gray-400 font-bold uppercase tracking-wider mb-2">Inversión Total</p>
                <p className="text-2xl font-extrabold text-white">$ {Number(selectedUserStats.stats.totalInvested || 0).toFixed(0)}</p>
              </div>
              <div className="p-6 bg-[#0a0a0a] rounded-2xl border border-[#64c883]/10">
                <p className="text-[10px] text-[#64c883]/60 font-bold uppercase tracking-wider mb-2">Ganancias Reales</p>
                <p className="text-2xl font-extrabold text-[#64c883]">$ {Number(selectedUserStats.stats.realizedGains || 0).toFixed(0)}</p>
              </div>
              <div className="p-6 bg-[#0a0a0a] rounded-2xl border border-white/5">
                <p className="text-[10px] text-gray-400 font-bold uppercase tracking-wider mb-2">Potencial</p>
                <p className="text-2xl font-extrabold text-white">$ {Number(selectedUserStats.stats.potentialFutureGains || 0).toFixed(0)}</p>
              </div>
            </div>

            <div className="space-y-4">
              <h3 className="text-[10px] font-bold text-gray-400 uppercase tracking-[0.1em]">Historial de Compras</h3>
              <div className="max-h-64 overflow-y-auto space-y-3 pr-2">
                {selectedUserStats.positions.map((p: any) => (
                  <div key={p.id} className="flex justify-between items-center p-4 bg-[#121212] border border-white/5 rounded-2xl">
                    <div className="flex items-center gap-4">
                      <div className={`px-2 py-1 text-[9px] font-bold rounded-lg uppercase ${p.side === 'YES' ? 'bg-[#64c883]/10 text-[#64c883]' : 'bg-[#e16464]/10 text-[#e16464]'}`}>{p.side}</div>
                      <span className="text-sm font-bold text-white">{p.marketName}</span>
                    </div>
                    <div className="text-right">
                      <div className="text-sm font-extrabold text-white">$ {Number(p.amount || 0).toFixed(0)} <span className="text-[10px] text-gray-400 ml-2">@{Number(p.initialProbability || 0).toFixed(0)}%</span></div>
                      <div className="text-[9px] font-bold text-white/40 uppercase tracking-wider">{new Date(p.createdAt).toLocaleDateString()}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </Modal>

      <Modal isOpen={!!selectedMarketStats} onClose={() => setSelectedMarketStats(null)} title="Estadísticas de Mercado" size="4xl">
        {loadingDetails ? (
           <div className="py-20 flex justify-center"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#64c883]" /></div>
        ) : selectedMarketStats && (
          <div className="space-y-8 pt-4">
             <div className="bg-[#0a0a0a] p-6 rounded-2xl border border-white/5">
                <div className="text-[10px] font-bold text-gray-400 uppercase tracking-[0.1em] mb-4">Evolución de Probabilidad</div>
                <PriceChart history={selectedMarketStats.priceHistory} height={180} />
             </div>

             <div className="grid grid-cols-2 gap-8">
                <div className="space-y-4">
                   <h3 className="text-[10px] font-bold text-gray-400 uppercase tracking-[0.1em]">Liquidación Proyectada</h3>
                   <div className="bg-[#121212] p-6 rounded-2xl border border-white/5 space-y-4">
                      <div className="flex justify-between items-center bg-[#0a0a0a] p-4 rounded-xl border border-white/5">
                        <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Platform (10%)</span>
                         <span className="text-lg font-extrabold text-white">$ {Number(selectedMarketStats.simulation.platformCommission || 0).toFixed(2)}</span>
                      </div>
                      <div className="grid grid-cols-2 gap-4">
                         <div className="p-4 bg-[#64c883]/5 rounded-xl border border-[#64c883]/10">
                            <div className="text-[9px] font-bold text-[#64c883] uppercase tracking-wider mb-1">Si Gana SÍ</div>
                            <div className="text-lg font-extrabold text-white">x {Number(selectedMarketStats.simulation.ifYesWins.payoutPerDollar || 0).toFixed(2)}</div>
                         </div>
                         <div className="p-4 bg-[#e16464]/5 rounded-xl border border-[#e16464]/10">
                            <div className="text-[9px] font-bold text-[#e16464] uppercase tracking-wider mb-1">Si Gana NO</div>
                            <div className="text-lg font-extrabold text-white">x {Number(selectedMarketStats.simulation.ifNoWins.payoutPerDollar || 0).toFixed(2)}</div>
                         </div>
                      </div>
                   </div>
                </div>

                <div className="space-y-4">
                   <h3 className="text-[10px] font-bold text-gray-400 uppercase tracking-[0.1em]">Distribución del Pool</h3>
                   <div className="grid grid-cols-2 gap-4">
                      <div className="bg-[#121212] p-4 rounded-2xl border border-[#64c883]/10">
                         <div className="text-[9px] font-bold text-[#64c883] uppercase tracking-wider mb-1">YES Pool</div>
                         <div className="text-xl font-extrabold text-[#64c883]">$ {Number(selectedMarketStats.yesPool || 0).toFixed(0)}</div>
                      </div>
                      <div className="bg-[#121212] p-4 rounded-2xl border border-[#e16464]/10">
                         <div className="text-[9px] font-bold text-[#e16464] uppercase tracking-wider mb-1">NO Pool</div>
                         <div className="text-xl font-extrabold text-[#e16464]">$ {Number(selectedMarketStats.noPool || 0).toFixed(0)}</div>
                      </div>
                   </div>
                   <div className="bg-[#64c883] p-6 rounded-2xl text-[#0a0a0a] shadow-xl shadow-[#64c883]/10">
                      <div className="text-[10px] font-bold uppercase tracking-wider mb-1 opacity-70">Volumen Total en Juego</div>
                      <div className="text-3xl font-extrabold">$ {Number(selectedMarketStats.totalPool || 0).toFixed(0)}</div>
                   </div>
                </div>
             </div>

             {/* Purchase History Section */}
             <div className="space-y-4">
                <h3 className="text-[10px] font-bold text-gray-400 uppercase tracking-[0.1em]">Historial de Operaciones</h3>
                <div className="bg-[#121212] border border-white/5 rounded-2xl overflow-hidden">
                   <table className="w-full text-left">
                     <thead>
                       <tr className="bg-[#171717] border-b border-white/5">
                         <th className="p-4 text-[9px] font-bold text-gray-400 uppercase tracking-wider">Usuario</th>
                         <th className="p-4 text-[9px] font-bold text-gray-400 uppercase tracking-wider">Lado</th>
                         <th className="p-4 text-[9px] font-bold text-gray-400 uppercase tracking-wider">Monto</th>
                         <th className="p-4 text-[9px] font-bold text-gray-400 uppercase tracking-wider">Prob.</th>
                         <th className="p-4 text-[9px] font-bold text-gray-400 uppercase tracking-wider">Fecha</th>
                       </tr>
                     </thead>
                     <tbody className="divide-y divide-white/5">
                        {selectedMarketStats.purchases.length === 0 ? (
                          <tr><td colSpan={5} className="p-8 text-center text-[10px] font-bold text-gray-400 uppercase tracking-wider text-white/20">No hay operaciones registradas</td></tr>
                        ) : selectedMarketStats.purchases.map((p: any) => (
                          <tr key={p.id} className="hover:bg-white/5 transition-colors">
                            <td className="p-4 text-xs font-bold text-white">@{p.username}</td>
                            <td className="p-4">
                               <span className={`px-2 py-0.5 text-[9px] font-bold rounded-full uppercase tracking-wider ${p.side === 'YES' ? 'bg-[#64c883]/10 text-[#64c883]' : 'bg-[#e16464]/10 text-[#e16464]'}`}>
                                 {p.side}
                               </span>
                            </td>
                            <td className="p-4 text-sm font-extrabold text-white">$ {Number(p.amount || 0).toFixed(2)}</td>
                            <td className="p-4 text-xs font-bold text-[#64c883]">{Number(p.initialProbability || 0).toFixed(0)}%</td>
                            <td className="p-4 text-[10px] font-bold text-gray-400">{new Date(p.createdAt).toLocaleDateString()}</td>
                          </tr>
                        ))}
                     </tbody>
                   </table>
                </div>
             </div>
          </div>
        )}
      </Modal>

      {/* Form Modals (Simplified Dark Overhaul) */}
      <Modal isOpen={showCreateModal} onClose={() => setShowCreateModal(false)} title="Crear Nuevo Mercado">
        <div className="space-y-6 pt-4">
          <div className="space-y-4">
            <div className="group">
              <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider px-1">Pregunta del Mercado</label>
              <input 
                className="w-full h-14 bg-[#121212] border border-white/5 rounded-2xl px-4 text-white font-bold outline-none focus:border-[#64c883] transition-all"
                value={newMarket.question}
                onChange={(e) => setNewMarket({...newMarket, question: e.target.value})}
                placeholder="¿Ej: Argentina ganará el mundial?"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider px-1">Fecha Resolución</label>
                <input 
                  type="date"
                  className="w-full h-14 bg-[#121212] border border-white/5 rounded-2xl px-4 text-white font-bold outline-none focus:border-[#64c883] transition-all"
                  value={newMarket.resolutionDate}
                  onChange={(e) => setNewMarket({...newMarket, resolutionDate: e.target.value})}
                />
              </div>
              <div>
                <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider px-1">Límite Pool ($)</label>
                <input 
                  type="number"
                  className="w-full h-14 bg-[#121212] border border-white/5 rounded-2xl px-4 text-white font-bold outline-none focus:border-[#64c883] transition-all"
                  value={newMarket.maxPool}
                  onChange={(e) => setNewMarket({...newMarket, maxPool: e.target.value})}
                />
              </div>
            </div>
          </div>
          <button 
            onClick={handleCreate}
            className="w-full h-16 bg-[#64c883] text-[#0a0a0a] text-xs font-bold uppercase tracking-[0.1em] rounded-2xl transition-all hover:scale-[1.02] shadow-xl shadow-[#64c883]/10"
          >
            {creating ? 'Creando...' : 'Lanzar Mercado'}
          </button>
        </div>
      </Modal>

      <Modal isOpen={!!showResolveModal} onClose={() => setShowResolveModal(null)} title="Resolver Resultado Final">
        {showResolveModal && (
          <div className="space-y-8 pt-4">
            <div className="bg-[#121212] p-6 rounded-2xl border border-white/5 text-center">
               <p className="text-lg font-bold text-white mb-4">{showResolveModal.question}</p>
               <div className="flex justify-center gap-6 text-[10px] font-bold uppercase tracking-wider text-gray-400">
                  <span>SÍ: $ {Number(showResolveModal.yesPool || 0).toFixed(0)}</span>
                  <span>NO: $ {Number(showResolveModal.noPool || 0).toFixed(0)}</span>
               </div>
            </div>
            <div className="grid grid-cols-3 gap-4">
              <button 
                onClick={() => handleResolve('YES')} 
                className="h-16 bg-[#64c883] text-[#0a0a0a] text-[10px] font-bold uppercase tracking-wider rounded-2xl transition-all hover:scale-[1.05]"
              >
                SÍ Gana
              </button>
              <button 
                onClick={() => handleResolve('NO')} 
                className="h-16 bg-[#e16464] text-[#0a0a0a] text-[10px] font-bold uppercase tracking-wider rounded-2xl transition-all hover:scale-[1.05]"
              >
                NO Gana
              </button>
              <button 
                onClick={() => handleResolve('VOID')} 
                className="h-16 bg-white/5 text-gray-400 text-[10px] font-bold uppercase tracking-wider rounded-2xl transition-all hover:bg-white/10"
              >
                Anular
              </button>
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
