'use client'

import { useState, useEffect } from 'react'

type EventType = 'BUY' | 'SELL' | 'PAYOUT'

interface BaseEvent {
  id: string
  type: EventType
  side: string
  shares: number
  user: { id: string; username: string | null }
  createdAt: string
}
interface BuyEvent  extends BaseEvent { type: 'BUY';    cost: number }
interface SellEvent extends BaseEvent { type: 'SELL';   proceeds: number; fee: number }
interface PayoutEvent extends BaseEvent { type: 'PAYOUT'; payout: number }
type Event = BuyEvent | SellEvent | PayoutEvent

interface Props { marketId: string; userId?: string }

function timeAgo(date: string) {
  const diff = Date.now() - new Date(date).getTime()
  const m = Math.floor(diff / 60000)
  if (m < 1) return 'ahora'
  if (m < 60) return `${m}m`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h`
  const d = Math.floor(h / 24)
  return d < 30 ? `${d}d` : new Date(date).toLocaleDateString('es-ES', { day: '2-digit', month: 'short' })
}

function EventRow({ ev }: { ev: Event }) {
  const isYes   = ev.side === 'YES'
  const isSell  = ev.type === 'SELL'
  const isPayout = ev.type === 'PAYOUT'
  const username = ev.user?.username ? `@${ev.user.username}` : 'Usuario'

  return (
    <div className="flex items-center gap-3 py-3 border-b border-white/5 last:border-0">
      {/* Side pill */}
      {!isPayout ? (
        <div className={`w-8 h-8 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0 ${
          ev.side === 'YES' ? 'bg-primary/15 text-primary' : ev.side === 'NO' ? 'bg-win-error/15 text-win-error' : 'bg-white/10 text-white'
        }`}>
          {ev.side.length > 3 ? ev.side.substring(0, 3).toUpperCase() : ev.side}
        </div>
      ) : (
        <div className="w-8 h-8 rounded-full flex items-center justify-center text-base shrink-0 bg-yellow-500/10">
          ★
        </div>
      )}

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="text-[12px] font-semibold text-white truncate max-w-[130px]">{username}</span>

          {ev.type === 'BUY' && (
            <>
              <span className="text-[10px] text-gray-500">compró</span>
              <span className={`text-[11px] font-bold ${ev.side === 'YES' ? 'text-primary' : ev.side === 'NO' ? 'text-win-error' : 'text-white'}`}>
                {ev.shares.toFixed(2)} sh {ev.side}
              </span>
              <span className="text-[10px] text-gray-500">por</span>
              <span className="text-[11px] font-bold text-white">${ev.cost.toFixed(2)}</span>
            </>
          )}

          {ev.type === 'SELL' && (
            <>
              <span className="text-[10px] text-orange-400 font-bold">vendió</span>
              <span className={`text-[11px] font-bold ${ev.side === 'YES' ? 'text-primary' : ev.side === 'NO' ? 'text-win-error' : 'text-white'}`}>
                {ev.shares.toFixed(2)} sh {ev.side}
              </span>
              <span className="text-[10px] text-gray-500">→</span>
              <span className="text-[11px] font-bold text-orange-300">+${ev.proceeds.toFixed(2)}</span>
            </>
          )}

          {ev.type === 'PAYOUT' && (
            <>
              <span className="text-[10px] text-yellow-400 font-bold">cobró ganancia</span>
              <span className="text-[11px] font-bold text-yellow-300">+${ev.payout.toFixed(2)}</span>
            </>
          )}
        </div>

        {/* Sub-line */}
        <div className="text-[9px] text-gray-600 mt-0.5">
          {ev.type === 'BUY'  && ev.shares > 0 && `$${(ev.cost / ev.shares).toFixed(4)}/sh`}
          {ev.type === 'SELL' && ev.fee > 0    && `fee $${ev.fee.toFixed(2)}`}
        </div>
      </div>

      <span className="text-[10px] text-gray-600 shrink-0 tabular-nums">{timeAgo(ev.createdAt)}</span>
    </div>
  )
}

export function MarketActivity({ marketId, userId }: Props) {
  const [events, setEvents] = useState<Event[]>([])
  const [total, setTotal]   = useState(0)
  const [loading, setLoading] = useState(true)
  const [showAll, setShowAll] = useState(false)

  useEffect(() => {
    setLoading(true)
    const params = new URLSearchParams()
    if (showAll) params.set('all', '1')
    if (userId)  params.set('userId', userId)
    const qs = params.toString() ? `?${params.toString()}` : ''
    fetch(`/api/markets/${marketId}/activity${qs}`)
      .then((r) => r.json())
      .then((d) => { setEvents(d.events ?? []); setTotal(d.total ?? 0) })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [marketId, showAll, userId])

  if (loading) return (
    <div className="flex items-center justify-center py-12">
      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
    </div>
  )

  if (events.length === 0) return (
    <div className="text-center py-12">
      <p className="text-[13px] text-gray-500">{userId ? 'No tienes operaciones en este mercado' : 'No hay actividad aún'}</p>
      <p className="text-[11px] text-gray-600 mt-1">{userId ? 'Tus compras y ventas aparecerán aquí' : 'Las operaciones aparecerán aquí en tiempo real'}</p>
    </div>
  )

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <span className="text-[10px] font-bold uppercase tracking-widest text-gray-500">
          {total} operación{total !== 1 ? 'es' : ''}
        </span>
        {!showAll && events.length < total && (
          <span className="text-[10px] text-gray-600">Últimas {events.length}</span>
        )}
      </div>

      <div>
        {events.map((ev) => <EventRow key={ev.id} ev={ev} />)}
      </div>

      {!showAll && events.length < total && (
        <button
          onClick={() => setShowAll(true)}
          className="mt-4 w-full py-2.5 rounded-xl border border-white/10 text-[11px] font-bold uppercase tracking-wider text-gray-400 hover:text-white hover:border-white/20 transition-all"
        >
          Ver las {total} operaciones
        </button>
      )}
    </div>
  )
}
