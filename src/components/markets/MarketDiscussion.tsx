'use client'

import { useState, useEffect, useRef } from 'react'

interface Comment {
  id: string
  content: string
  createdAt: string
  user: { id: string; username: string | null; image: string | null }
}

interface Props {
  marketId: string
  userId: string
  canComment: boolean // true if user has shares in market
}

function timeAgo(date: string) {
  const diff = Date.now() - new Date(date).getTime()
  const m = Math.floor(diff / 60000)
  if (m < 1) return 'ahora'
  if (m < 60) return `${m}m`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h`
  const d = Math.floor(h / 24)
  if (d < 30) return `${d}d`
  return new Date(date).toLocaleDateString('es-ES', { day: '2-digit', month: 'short' })
}

function Avatar({ username }: { username: string | null }) {
  const initial = (username ?? '?')[0].toUpperCase()
  const colors = ['bg-primary/20 text-primary', 'bg-blue-500/20 text-blue-400', 'bg-purple-500/20 text-purple-400', 'bg-orange-500/20 text-orange-400']
  const idx = (username?.charCodeAt(0) ?? 0) % colors.length
  return (
    <div className={`w-8 h-8 rounded-full flex items-center justify-center text-[11px] font-bold shrink-0 ${colors[idx]}`}>
      {initial}
    </div>
  )
}

export function MarketDiscussion({ marketId, userId, canComment }: Props) {
  const [comments, setComments] = useState<Comment[]>([])
  const [loading, setLoading] = useState(true)
  const [text, setText] = useState('')
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const bottomRef = useRef<HTMLDivElement>(null)

  const fetchComments = () => {
    fetch(`/api/markets/${marketId}/comments`)
      .then((r) => r.json())
      .then((data) => setComments(Array.isArray(data) ? data.reverse() : []))
      .catch(() => {})
      .finally(() => setLoading(false))
  }

  useEffect(() => { fetchComments() }, [marketId])

  const submit = async () => {
    if (!text.trim() || sending) return
    setSending(true)
    setError(null)
    try {
      const res = await fetch(`/api/markets/${marketId}/comments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, content: text.trim() }),
      })
      const data = await res.json()
      if (!res.ok) { setError(data.error ?? 'Error al enviar'); return }
      setComments((prev) => [...prev, data])
      setText('')
      setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: 'smooth' }), 50)
    } catch {
      setError('Error de conexión')
    } finally {
      setSending(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Thread */}
      {comments.length === 0 ? (
        <div className="text-center py-10 text-gray-500 text-[12px]">
          {canComment
            ? 'Sé el primero en comentar en este mercado'
            : 'No hay comentarios aún — solo holders con shares pueden comentar'}
        </div>
      ) : (
        <div className="space-y-4">
          {comments.map((c) => (
            <div key={c.id} className="flex gap-3">
              <Avatar username={c.user.username} />
              <div className="flex-1 min-w-0">
                <div className="flex items-baseline gap-2 mb-1">
                  <span className="text-[12px] font-bold text-white">
                    {c.user.username ? `@${c.user.username}` : 'Usuario'}
                  </span>
                  <span className="text-[10px] text-gray-600">{timeAgo(c.createdAt)}</span>
                </div>
                <p className="text-[12px] text-gray-300 leading-relaxed break-words">
                  {c.content}
                </p>
              </div>
            </div>
          ))}
          <div ref={bottomRef} />
        </div>
      )}

      {/* Input */}
      {canComment ? (
        <div className="border-t border-white/5 pt-4 mt-2">
          <div className="flex gap-3">
            <Avatar username={null} />
            <div className="flex-1">
              <textarea
                value={text}
                onChange={(e) => setText(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submit() } }}
                placeholder="Escribe tu análisis o predicción…"
                maxLength={500}
                rows={2}
                className="w-full bg-win-bg border border-white/10 rounded-xl px-3 py-2.5 text-[12px] text-white placeholder-gray-600 resize-none focus:outline-none focus:border-primary/40 transition-colors"
              />
              <div className="flex items-center justify-between mt-2">
                <span className="text-[9px] text-gray-600">{text.length}/500 · Enter para enviar</span>
                {error && <span className="text-[10px] text-red-400">{error}</span>}
                <button
                  onClick={submit}
                  disabled={!text.trim() || sending}
                  className="px-3 py-1.5 rounded-lg bg-primary/20 text-primary border border-primary/30 text-[10px] font-bold uppercase tracking-wider hover:bg-primary/30 transition-all disabled:opacity-30 disabled:cursor-not-allowed"
                >
                  {sending ? '…' : 'Enviar'}
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div className="border-t border-white/5 pt-4 mt-2">
          <p className="text-[11px] text-gray-600 text-center">
            Necesitas tener shares en este mercado para comentar
          </p>
        </div>
      )}
    </div>
  )
}
