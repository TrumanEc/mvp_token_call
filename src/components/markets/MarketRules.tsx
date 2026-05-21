'use client'

import { useState } from 'react'

interface Props {
  market: {
    question: string
    description?: string | null
    rules?: string | null
    criterio?: string | null
    tags?: string[]
    createdAt: string
    resolutionDate: string
    platformFee: number
    status: string
  }
}

function ChevronIcon({ open }: { open: boolean }) {
  return (
    <svg
      className={`w-4 h-4 text-gray-400 transition-transform duration-200 ${open ? 'rotate-180' : ''}`}
      fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
    >
      <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
    </svg>
  )
}

function Dropdown({ title, icon, children, defaultOpen = false }: {
  title: string
  icon: React.ReactNode
  children: React.ReactNode
  defaultOpen?: boolean
}) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div className="bg-win-card rounded-2xl border border-white/5 overflow-hidden">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-5 py-4 hover:bg-white/3 transition-colors"
      >
        <div className="flex items-center gap-2.5">
          {icon}
          <span className="text-[13px] font-bold text-white tracking-tight">{title}</span>
        </div>
        <ChevronIcon open={open} />
      </button>
      {open && (
        <div className="px-5 pb-5 border-t border-white/5">
          {children}
        </div>
      )}
    </div>
  )
}

/** Kalshi-style timeline step */
function TimelineStep({
  label,
  sub,
  done = true,
  last = false,
}: {
  label: string
  sub: string
  done?: boolean
  last?: boolean
}) {
  return (
    <div className="flex gap-4">
      {/* Dot + line */}
      <div className="flex flex-col items-center">
        <div className={`w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5 ${
          done ? 'bg-primary/20 border border-primary' : 'bg-white/5 border border-white/15'
        }`}>
          {done && (
            <svg className="w-3.5 h-3.5 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
          )}
        </div>
        {!last && <div className="w-px flex-1 bg-primary/20 mt-1 mb-1 min-h-[28px]" />}
      </div>
      {/* Text */}
      <div className={`pb-6 ${last ? '' : ''}`}>
        <p className="text-[13px] font-semibold text-white leading-snug">{label}</p>
        <p className="text-[11px] text-gray-500 mt-0.5">{sub}</p>
      </div>
    </div>
  )
}

export function MarketRules({ market }: Props) {
  const openDate  = new Date(market.createdAt)
  const closeDate = new Date(market.resolutionDate)
  const fee       = (market.platformFee * 100).toFixed(1)
  const isActive  = market.status === 'ACTIVE'

  const fmtDate = (d: Date) =>
    d.toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' }) +
    ' · ' +
    d.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })

  const descText = market.description ||
    `Este mercado evalúa si "${market.question}". La resolución se basa en fuentes oficiales y el resultado se determina una vez que el evento concluya o la fecha de cierre sea alcanzada.`

  const criterioText = market.criterio ||
    'Resuelve YES si el evento ocurre antes de la fecha de cierre; NO en caso contrario.'

  const rulesText = market.rules

  return (
    <div className="space-y-3">

      {/* ── Dropdown 1: Reglas ─────────────────────────────────────────── */}
      <Dropdown
        title="Reglas del mercado"
        defaultOpen
        icon={
          <svg className="w-4 h-4 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
        }
      >
        <div className="pt-4 space-y-4">
          {/* Description paragraph */}
          <p className="text-[13px] text-gray-300 leading-relaxed">
            {descText}
          </p>

          {/* Criterio info box */}
          <div className="bg-white/4 border border-white/8 rounded-xl px-4 py-3 flex gap-3">
            <svg className="w-4 h-4 text-primary/70 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <p className="text-[12px] text-gray-400 leading-relaxed">
              {criterioText}
            </p>
          </div>

          {/* Extra rules if any */}
          {rulesText && (
            <div className="bg-yellow-500/5 border border-yellow-500/15 rounded-xl px-4 py-3">
              <p className="text-[11px] font-bold uppercase tracking-widest text-yellow-400/70 mb-1">Condiciones adicionales</p>
              <p className="text-[12px] text-gray-400 leading-relaxed whitespace-pre-line">{rulesText}</p>
            </div>
          )}

          {/* Tags */}
          {market.tags && market.tags.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {market.tags.map((tag) => (
                <span key={tag} className="text-[9px] font-bold px-2 py-0.5 rounded-full bg-white/5 text-gray-400 border border-white/8">
                  {tag}
                </span>
              ))}
            </div>
          )}

          {/* Resolution source */}
          <div className="flex items-start gap-2 pt-1 border-t border-white/5">
            <svg className="w-3.5 h-3.5 text-gray-600 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
            </svg>
            <p className="text-[11px] text-gray-500 leading-relaxed">
              <span className="text-gray-400 font-semibold">Fuente de resolución:</span>{' '}
              Equipo WIN · Medios oficiales de las federaciones y ligas correspondientes. En caso de disputa, la decisión final es del equipo WIN.
            </p>
          </div>
        </div>
      </Dropdown>

      {/* ── Dropdown 2: Calendario y Pagos ────────────────────────────── */}
      <Dropdown
        title="Calendario y Pagos"
        icon={
          <svg className="w-4 h-4 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
          </svg>
        }
      >
        <div className="pt-5">
          <TimelineStep
            label="Mercado abierto"
            sub={fmtDate(openDate)}
          />
          <TimelineStep
            label="Mercado cerrado"
            sub={
              isActive
                ? `${fmtDate(closeDate)} · Las posiciones quedan bloqueadas`
                : `${fmtDate(closeDate)} · Cerrado`
            }
          />
          <TimelineStep
            label="Ganadores pagados"
            sub={`Inmediato tras la resolución · Fee: ${fee}% sobre el pool ganador`}
            last
          />
        </div>
      </Dropdown>

    </div>
  )
}
