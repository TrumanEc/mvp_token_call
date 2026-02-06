'use client'

import React, { useMemo, useState, useRef } from 'react'

interface HistoryItem {
  id: string
  yesOdds: number
  noOdds: number
  totalPool: number
  createdAt: string | Date
}

interface PriceChartProps {
  history: HistoryItem[]
  height?: number
  showNo?: boolean
}

export function PriceChart({ history, height = 300, showNo = false }: PriceChartProps) {
  const [hoverIdx, setHoverIdx] = useState<number | null>(null)
  const [timeRange, setTimeRange] = useState('MAX')
  const svgRef = useRef<SVGSVGElement>(null)

  const data = useMemo(() => {
    if (!history || history.length === 0) return []
    return [...history].sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())
  }, [history])

  if (data.length < 2) {
    return (
      <div className="flex items-center justify-center bg-[#0d0d0d] rounded-2xl border border-white/5" style={{ height }}>
        <p className="text-gray-500 text-sm font-medium">Esperando más datos para graficar...</p>
      </div>
    )
  }

  const padding = { top: 20, right: 50, bottom: 40, left: 10 }
  const width = 1000

  const getX = (index: number) => {
    return padding.left + (index / (data.length - 1)) * (width - padding.left - padding.right)
  }

  const getY = (value: number) => {
    return height - padding.bottom - (value / 100) * (height - padding.top - padding.bottom)
  }

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!svgRef.current) return
    const rect = svgRef.current.getBoundingClientRect()
    const x = ((e.clientX - rect.left) / rect.width) * width
    const relativeX = (x - padding.left) / (width - padding.left - padding.right)
    const idx = Math.min(Math.max(Math.round(relativeX * (data.length - 1)), 0), data.length - 1)
    setHoverIdx(idx)
  }

  const generatePath = (values: number[]) => {
    const points = values.map((val, i) => ({ x: getX(i), y: getY(val) }))
    let path = `M ${points[0].x},${points[0].y}`
    for (let i = 0; i < points.length - 1; i++) {
        const curr = points[i]
        const next = points[i + 1]
        const cp1x = curr.x + (next.x - curr.x) / 2
        const cp1y = curr.y
        const cp2x = curr.x + (next.x - curr.x) / 2
        const cp2y = next.y
        path += ` C ${cp1x},${cp1y} ${cp2x},${cp2y} ${next.x},${next.y}`
    }
    return path
  }

  const yesPath = generatePath(data.map(d => d.yesOdds))

  return (
    <div className="relative w-full group">
      {/* Time Range Selectors */}
      <div className="absolute bottom-[-32px] right-0 flex items-center gap-4 z-10">
        {['1H', '1D', '1W', '1M', 'MAX'].map(range => (
          <button
            key={range}
            onClick={() => setTimeRange(range)}
            className={`text-xs font-bold transition-all ${
              timeRange === range ? 'text-white' : 'text-gray-400 hover:text-gray-300'
            }`}
          >
            {range}
          </button>
        ))}
      </div>

      <svg
        ref={svgRef}
        viewBox={`0 0 ${width} ${height}`}
        className="w-full h-auto cursor-crosshair overflow-visible"
        preserveAspectRatio="none"
        onMouseMove={handleMouseMove}
        onMouseLeave={() => setHoverIdx(null)}
      >
        <defs>
          <linearGradient id="gradient-yes-v2" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#64c883" stopOpacity="0.1" />
            <stop offset="100%" stopColor="#64c883" stopOpacity="0" />
          </linearGradient>
        </defs>

        {/* Dash Grid Lines */}
        {[25, 50, 75, 100].map((level) => (
          <g key={level}>
            <line
              x1={padding.left}
              y1={getY(level)}
              x2={width - padding.right}
              y2={getY(level)}
              stroke="white"
              strokeWidth="0.5"
              strokeOpacity="0.1"
              strokeDasharray="4 4"
            />
            <text x={padding.left - 5} y={getY(level) + 4} fontSize="11" fill="white" fillOpacity="0.3" className="select-none font-bold text-right" textAnchor="end">
              {level} %
            </text>
          </g>
        ))}

        {/* Lines */}
        <path d={yesPath} fill="none" stroke="#64c883" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />

        {/* Hover Interaction Vertical Line */}
        {hoverIdx !== null && (
          <line
            x1={getX(hoverIdx)}
            y1={padding.top}
            x2={getX(hoverIdx)}
            y2={height - padding.bottom}
            stroke="white"
            strokeWidth="0.5"
            strokeOpacity="0.2"
            strokeDasharray="4 4"
          />
        )}

        {/* Month Labels */}
        <g>
          {['Apr', 'May', 'Jun', 'Jul', 'Aug'].map((month, i) => (
            <text
              key={month}
              x={padding.left + (i * (width - padding.left - padding.right) / 4)}
              y={height - 10}
              fontSize="12"
              fill="white"
              fillOpacity="0.2"
              className="select-none font-bold"
              textAnchor="middle"
            >
              {month}
            </text>
          ))}
        </g>
      </svg>

      {/* Tooltip (Simplified and styled for dark theme) */}
      {hoverIdx !== null && (
        <div 
          className="absolute top-0 pointer-events-none bg-[#171717] border border-white/10 rounded-xl shadow-2xl p-3 z-50 transition-all duration-75"
          style={{ 
            left: `${(getX(hoverIdx) / width) * 100}%`,
            transform: `translateX(${getX(hoverIdx) > width * 0.8 ? '-100%' : '10px'})`,
          }}
        >
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-[#64c883]" />
            <span className="text-sm font-extrabold text-white">{data[hoverIdx].yesOdds.toFixed(1)}%</span>
          </div>
          <p className="text-[10px] font-bold text-gray-400 mt-1">
            {new Date(data[hoverIdx].createdAt).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit' })}
          </p>
        </div>
      )}
    </div>
  )
}
