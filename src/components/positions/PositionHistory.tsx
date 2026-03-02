'use client'

import React from 'react'

interface PositionHistoryProps {
  history: Array<{
    id: string
    amount: number
    shares: number
    createdAt: string | Date
    purchasePrice?: number
  }>
}

export function PositionHistory({ history }: PositionHistoryProps) {
  if (!history || history.length <= 1) return null

  return (
    <div className="mt-6 pt-6 border-t border-white/5 space-y-3">
      <h5 className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-4 flex items-center gap-2">
        <div className="w-1 h-3 bg-[#64c883] rounded-full" />
        Historial de Compras
      </h5>
      <div className="space-y-2">
        {history.map((h) => (
          <div key={h.id} className="flex justify-between items-center text-[11px] p-3 rounded-xl bg-white/5 border border-white/5">
            <div className="flex flex-col">
              <span className="text-gray-400 font-bold uppercase tracking-tighter">
                {new Date(h.createdAt).toLocaleDateString()} {new Date(h.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </span>
              <span className="text-[10px] text-gray-500 font-medium">@{h.purchasePrice?.toFixed(3)} / share</span>
            </div>
            <div className="text-right flex flex-col items-end">
              <span className="text-white font-extrabold">$ {h.amount.toFixed(2)}</span>
              <span className="text-[10px] text-[#64c883] font-bold">{h.shares.toFixed(2)} Shares</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
