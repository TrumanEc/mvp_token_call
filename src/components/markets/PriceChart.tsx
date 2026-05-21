'use client'

import React, { useMemo, useState, useRef, useCallback } from 'react'

export interface ChartDataPoint {
  timestamp: string | Date
  price?: number
  prices?: Record<string, number>
  volume?: number
}

interface PriceChartProps {
  data: ChartDataPoint[]
  height?: number
  showNo?: boolean
  outcomes?: { id: string; name: string }[]
}

type TimeRange = '1H' | '3H' | '24H' | '7D' | 'ALL'
const RANGES: TimeRange[] = ['1H', '3H', '24H', '7D', 'ALL']

const RANGE_MS: Record<TimeRange, number> = {
  '1H':  1 * 60 * 60 * 1000,
  '3H':  3 * 60 * 60 * 1000,
  '24H': 24 * 60 * 60 * 1000,
  '7D':  7 * 24 * 60 * 60 * 1000,
  'ALL': Infinity,
}

const COLORS = ['#64c883', '#f87171', '#60a5fa', '#fbbf24', '#a78bfa', '#f472b6', '#34d399'];

function filterByRange(data: ChartDataPoint[], range: TimeRange) {
  if (range === 'ALL') return data
  const cutoff = Date.now() - RANGE_MS[range]
  const filtered = data.filter(d => new Date(d.timestamp).getTime() >= cutoff)
  return filtered.length >= 2 ? filtered : data.slice(-2)
}

function fmtXLabel(ts: number, range: TimeRange) {
  const d = new Date(ts)
  if (range === '1H' || range === '3H' || range === '24H')
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  return d.toLocaleDateString([], { month: 'short', day: 'numeric' })
}

function fmtTooltipDate(ts: number) {
  const d = new Date(ts)
  return (
    d.toLocaleDateString([], { month: 'numeric', day: 'numeric', year: 'numeric' }) +
    ' · ' +
    d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  )
}

// Monotone Cubic Spline (Fritsch-Carlson method)
// Guarantees curves pass through every data point WITHOUT overshooting.
// This prevents lines from going above 100% or below 0%.
function buildSmooth(pts: { x: number; y: number }[], extendTo: number) {
  if (pts.length === 0) return ''
  if (pts.length === 1) return `M ${pts[0].x} ${pts[0].y} H ${extendTo}`

  const extended = [...pts, { x: extendTo, y: pts[pts.length - 1].y }]
  const n = extended.length

  // Step 1: secant slopes between consecutive points
  const secants: number[] = []
  for (let i = 0; i < n - 1; i++) {
    const dx = extended[i + 1].x - extended[i].x
    secants.push(dx === 0 ? 0 : (extended[i + 1].y - extended[i].y) / dx)
  }

  // Step 2: initial tangents (average of adjacent secants)
  const tangents = new Array(n).fill(0)
  tangents[0] = secants[0]
  tangents[n - 1] = secants[n - 2]
  for (let i = 1; i < n - 1; i++) {
    tangents[i] = (secants[i - 1] + secants[i]) / 2
  }

  // Step 3: Fritsch-Carlson monotonicity correction
  for (let i = 0; i < n - 1; i++) {
    if (secants[i] === 0) {
      tangents[i] = 0
      tangents[i + 1] = 0
    } else {
      const alpha = tangents[i] / secants[i]
      const beta  = tangents[i + 1] / secants[i]
      const h = Math.sqrt(alpha * alpha + beta * beta)
      if (h > 3) {
        tangents[i]     = (3 / h) * alpha * secants[i]
        tangents[i + 1] = (3 / h) * beta  * secants[i]
      }
    }
  }

  // Step 4: cubic bezier from Hermite form
  // Factor controls sharpness: /3 = very smooth, /6 = peakier, /10 = near-linear
  const f = 5
  let d = `M ${extended[0].x} ${extended[0].y}`
  for (let i = 0; i < n - 1; i++) {
    const dx   = extended[i + 1].x - extended[i].x
    const cp1x = extended[i].x     + dx / f
    const cp1y = extended[i].y     + (tangents[i]     * dx) / f
    const cp2x = extended[i + 1].x - dx / f
    const cp2y = extended[i + 1].y - (tangents[i + 1] * dx) / f
    d += ` C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${extended[i + 1].x} ${extended[i + 1].y}`
  }

  return d
}

export function PriceChart({ data: rawData, height = 300, outcomes }: PriceChartProps) {
  const [timeRange, setTimeRange] = useState<TimeRange>('ALL')
  const [hoverIdx, setHoverIdx] = useState<number | null>(null)
  const svgRef = useRef<SVGSVGElement>(null)

  const isMulti = !!outcomes && (outcomes.length > 2 || (outcomes[0] && outcomes[0].name !== 'YES'));

  // ── Layout constants ─────────────────────────────────────────────────────
  const W = 1000
  const PAD_L = 6
  const PAD_R = 50
  const PAD_T = 8
  const X_AXIS_H = 24
  const GAP = 6          // gap between the two panels if binary
  const cW = W - PAD_L - PAD_R

  const totalH = height - PAD_T - X_AXIS_H
  const panelH = Math.floor((totalH - GAP) / 2)

  // Panel Y bounds (only used if binary)
  const yesTop = PAD_T
  const yesBot = PAD_T + panelH
  const noTop  = PAD_T + panelH + GAP
  const noBot  = PAD_T + panelH + GAP + panelH
  const xAxisY = totalH + PAD_T + 18

  const points = useMemo(() => {
    if (!rawData || rawData.length === 0) return []
    const sorted = [...rawData]
      .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime())
    return filterByRange(sorted, timeRange).map(d => {
      const ts = new Date(d.timestamp).getTime()
      if (isMulti && outcomes) {
        const probs: Record<string, number> = {}
        outcomes.forEach(o => {
          probs[o.id] = d.prices && d.prices[o.id] !== undefined ? d.prices[o.id] : 0
        })
        return { ts, probs }
      } else {
        return { ts, yesP: d.price ?? 0.5, noP: 1 - (d.price ?? 0.5) }
      }
    })
  }, [rawData, timeRange, isMulti, outcomes])

  const getX = useCallback((i: number) =>
    PAD_L + (points.length <= 1 ? cW / 2 : (i / (points.length - 1)) * cW),
  [points.length, cW])

  const getYNo  = useCallback((v: number) => noTop  + (1 - v) * panelH, [noTop,  panelH])
  const getYYes = useCallback((v: number) => yesTop + (1 - v) * panelH, [yesTop, panelH])
  const getYMulti = useCallback((v: number) => PAD_T + (1 - v) * totalH, [totalH])

  const handleMouseMove = useCallback((e: React.MouseEvent<SVGSVGElement>) => {
    if (!svgRef.current || points.length < 2) return
    const rect = svgRef.current.getBoundingClientRect()
    const svgX = ((e.clientX - rect.left) / rect.width) * W
    const rel  = (svgX - PAD_L) / cW
    setHoverIdx(Math.min(Math.max(Math.round(rel * (points.length - 1)), 0), points.length - 1))
  }, [points.length, cW])

  const xLabels = useMemo(() => {
    if (points.length < 2) return []
    const n = Math.min(5, points.length)
    return Array.from({ length: n }, (_, i) => {
      const idx = Math.round(i * (points.length - 1) / (n - 1))
      return { idx, label: fmtXLabel(points[idx].ts, timeRange) }
    })
  }, [points, timeRange])

  // ── Empty state ───────────────────────────────────────────────────────────
  if (points.length < 2) {
    return (
      <div className="relative w-full" style={{ height }}>
        <div className="flex justify-end gap-0.5 mb-2">
          {RANGES.map(r => (
            <button key={r} onClick={() => setTimeRange(r)}
              className={`px-2.5 py-1 rounded-lg text-[10px] font-extrabold uppercase tracking-wider transition-all ${
                timeRange === r ? 'bg-white/10 text-white' : 'text-gray-600 hover:text-gray-400'
              }`}
            >{r}</button>
          ))}
        </div>
        <div className="flex items-center justify-center" style={{ height: height - 32 }}>
          <p className="text-gray-600 text-[12px]">Esperando datos del mercado…</p>
        </div>
      </div>
    )
  }

  const extX = PAD_L + cW
  const last = points[points.length - 1] as any
  const hover = (hoverIdx !== null ? points[hoverIdx] : null) as any

  const TW = 160
  const TH = isMulti ? (outcomes ? 32 + outcomes.length * 18 : 80) : 72

  return (
    <div className="relative w-full select-none">
      <div className="flex justify-end gap-0.5 mb-2">
        {RANGES.map(r => (
          <button key={r} onClick={() => setTimeRange(r)}
            className={`px-2.5 py-1 rounded-lg text-[10px] font-extrabold uppercase tracking-wider transition-all ${
              timeRange === r ? 'bg-white/10 text-white' : 'text-gray-600 hover:text-gray-400'
            }`}
          >{r}</button>
        ))}
      </div>

      <svg
        ref={svgRef}
        viewBox={`0 0 ${W} ${height}`}
        className="w-full h-auto cursor-crosshair"
        preserveAspectRatio="xMidYMid meet"
        onMouseMove={handleMouseMove}
        onMouseLeave={() => setHoverIdx(null)}
      >
        <defs>
          <clipPath id="clip-full">
            <rect x={PAD_L} y={PAD_T} width={cW} height={totalH} />
          </clipPath>
          <clipPath id="clip-no">
            <rect x={PAD_L} y={noTop}  width={cW} height={panelH} />
          </clipPath>
          <clipPath id="clip-yes">
            <rect x={PAD_L} y={yesTop} width={cW} height={panelH} />
          </clipPath>
        </defs>

        {!isMulti && (
          <>
            {/* NO panel */}
            <text x={PAD_L + 6} y={noTop + 14} fontSize="10" fontWeight="bold" fill="rgba(248,113,113,0.6)">NO</text>
            {[0, 0.5, 1].map(v => (
              <g key={`no-grid-${v}`}>
                <line x1={PAD_L} y1={getYNo(v)} x2={extX} y2={getYNo(v)} stroke="white" strokeOpacity="0.05" strokeWidth="1" />
                <text x={extX + 6} y={getYNo(v) + 4} fontSize="9" fill="rgba(255,255,255,0.22)" className="font-mono">
                  {`${(v * 100).toFixed(0)}%`}
                </text>
              </g>
            ))}
            <g clipPath="url(#clip-no)">
              <path d={buildSmooth(points.map((p: any, i) => ({ x: getX(i), y: getYNo(p.noP) })), extX)} fill="none" stroke="#f87171" strokeWidth="2.5" />
            </g>
            {!hover && (
              <>
                <circle cx={extX} cy={getYNo(last.noP)} r="4.5" fill="#f87171" />
                <text x={extX + 8} y={getYNo(last.noP) - 4} fontSize="9" fontWeight="bold" fill="#f87171">No</text>
                <text x={extX + 8} y={getYNo(last.noP) + 10} fontSize="13" fontWeight="bold" fill="#f87171">{(last.noP * 100).toFixed(0)}%</text>
              </>
            )}

            <line x1={PAD_L} y1={yesBot + GAP / 2} x2={extX} y2={yesBot + GAP / 2} stroke="white" strokeOpacity="0.08" strokeWidth="1" />

            {/* YES panel */}
            <text x={PAD_L + 6} y={yesTop + 14} fontSize="10" fontWeight="bold" fill="rgba(100,200,131,0.6)">YES</text>
            {[0, 0.5, 1].map(v => (
              <g key={`yes-grid-${v}`}>
                <line x1={PAD_L} y1={getYYes(v)} x2={extX} y2={getYYes(v)} stroke="white" strokeOpacity="0.05" strokeWidth="1" />
                <text x={extX + 6} y={getYYes(v) + 4} fontSize="9" fill="rgba(255,255,255,0.22)" className="font-mono">
                  {`${(v * 100).toFixed(0)}%`}
                </text>
              </g>
            ))}
            <g clipPath="url(#clip-yes)">
              <path d={buildSmooth(points.map((p: any, i) => ({ x: getX(i), y: getYYes(p.yesP) })), extX)} fill="none" stroke="#64c883" strokeWidth="2.5" />
            </g>
            {!hover && (
              <>
                <circle cx={extX} cy={getYYes(last.yesP)} r="4.5" fill="#64c883" />
                <text x={extX + 8} y={getYYes(last.yesP) - 4} fontSize="9" fontWeight="bold" fill="#64c883">Yes</text>
                <text x={extX + 8} y={getYYes(last.yesP) + 10} fontSize="13" fontWeight="bold" fill="#64c883">{(last.yesP * 100).toFixed(0)}%</text>
              </>
            )}
          </>
        )}

        {isMulti && outcomes && (
          <>
            {[0, 0.25, 0.5, 0.75, 1].map(v => (
              <g key={`multi-grid-${v}`}>
                <line x1={PAD_L} y1={getYMulti(v)} x2={extX} y2={getYMulti(v)} stroke="white" strokeOpacity="0.05" strokeWidth="1" />
                <text x={extX + 6} y={getYMulti(v) + 4} fontSize="9" fill="rgba(255,255,255,0.22)" className="font-mono">
                  {`${(v * 100).toFixed(0)}%`}
                </text>
              </g>
            ))}
            <g clipPath="url(#clip-full)">
              {outcomes.map((o, idx) => {
                const color = COLORS[idx % COLORS.length];
                const pts = points.map((p: any, i) => ({ x: getX(i), y: getYMulti(p.probs[o.id]) }));
                return (
                  <path key={o.id} d={buildSmooth(pts, extX)} fill="none" stroke={color} strokeWidth="2.5" />
                )
              })}
            </g>
            {!hover && outcomes.map((o, idx) => {
              const color = COLORS[idx % COLORS.length];
              const pVal = last.probs[o.id];
              const y = getYMulti(pVal);
              return (
                <g key={`end-${o.id}`}>
                  <circle cx={extX} cy={y} r="3" fill={color} />
                </g>
              )
            })}
          </>
        )}

        {hover && hoverIdx !== null && (() => {
          const hx = getX(hoverIdx)
          const tipX = hx + 14 > PAD_L + cW - TW ? hx - TW - 14 : hx + 14
          const tipY = PAD_T + totalH / 2 - TH / 2

          return (
            <>
              <line x1={hx} y1={PAD_T} x2={hx} y2={PAD_T + totalH} stroke="white" strokeOpacity="0.18" strokeWidth="1" strokeDasharray="4 4" />
              
              {!isMulti && (
                <>
                  <circle cx={hx} cy={getYNo(hover.noP)} r="5" fill="#f87171" stroke="#0d1117" strokeWidth="2.5" />
                  <circle cx={hx} cy={getYYes(hover.yesP)} r="5" fill="#64c883" stroke="#0d1117" strokeWidth="2.5" />
                </>
              )}
              {isMulti && outcomes && outcomes.map((o, idx) => (
                <circle key={o.id} cx={hx} cy={getYMulti(hover.probs[o.id])} r="4" fill={COLORS[idx % COLORS.length]} stroke="#0d1117" strokeWidth="2" />
              ))}

              <rect x={tipX} y={tipY} width={TW} height={TH} rx="10" ry="10" fill="#161616" stroke="rgba(255,255,255,0.1)" strokeWidth="1" />
              <text x={tipX + TW / 2} y={tipY + 16} textAnchor="middle" fontSize="9" fill="rgba(255,255,255,0.35)">
                {fmtTooltipDate(hover.ts)}
              </text>
              <line x1={tipX + 10} y1={tipY + 22} x2={tipX + TW - 10} y2={tipY + 22} stroke="rgba(255,255,255,0.06)" strokeWidth="1" />

              {!isMulti && (
                <>
                  <circle cx={tipX + 14} cy={tipY + 37} r="4" fill="#f87171" />
                  <text x={tipX + 24} y={tipY + 42} fontSize="11" fill="rgba(255,255,255,0.5)">No</text>
                  <text x={tipX + TW - 12} y={tipY + 42} textAnchor="end" fontSize="13" fontWeight="bold" fill="#f87171">{(hover.noP * 100).toFixed(0)}%</text>

                  <circle cx={tipX + 14} cy={tipY + 58} r="4" fill="#64c883" />
                  <text x={tipX + 24} y={tipY + 63} fontSize="11" fill="rgba(255,255,255,0.5)">Yes</text>
                  <text x={tipX + TW - 12} y={tipY + 63} textAnchor="end" fontSize="13" fontWeight="bold" fill="#64c883">{(hover.yesP * 100).toFixed(0)}%</text>
                </>
              )}

              {isMulti && outcomes && outcomes.map((o, idx) => {
                const color = COLORS[idx % COLORS.length];
                const yPos = tipY + 37 + idx * 18;
                return (
                  <g key={`tip-${o.id}`}>
                    <circle cx={tipX + 14} cy={yPos - 5} r="4" fill={color} />
                    <text x={tipX + 24} y={yPos} fontSize="11" fill="rgba(255,255,255,0.5)">{o.name.length > 13 ? o.name.substring(0, 11) + '...' : o.name}</text>
                    <text x={tipX + TW - 12} y={yPos} textAnchor="end" fontSize="12" fontWeight="bold" fill={color}>{(hover.probs[o.id] * 100).toFixed(0)}%</text>
                  </g>
                )
              })}
            </>
          )
        })()}

        {/* X-axis labels */}
        {xLabels.map(({ idx, label }) => (
          <text key={idx} x={getX(idx)} y={xAxisY} textAnchor="middle" fontSize="10" fill="rgba(255,255,255,0.22)">
            {label}
          </text>
        ))}
      </svg>
    </div>
  )
}
