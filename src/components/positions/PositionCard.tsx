"use client";

import { useState } from "react";
import { Modal } from "@/components/ui/Modal";

interface PositionCardProps {
  position: any; // Consolidated position object from PositionService
  userId: string;
  onSell: () => void;
}

export function PositionCard({ position, userId, onSell }: PositionCardProps) {
  const [showSellModal, setShowSellModal] = useState(false);

  const {
    yes,
    no,
    market,
    amount: totalInvested,
    fairValue: totalFairValue,
    scenarios,
  } = position;

  // Active positions are consolidated.
  const isActive = position.status === "ACTIVE";

  const renderRow = (label: string, data: any, colorClass: string) => (
    <tr className="border-b border-white/5 last:border-0 h-14 group/row">
      <td
        className={`pl-4 text-[10px] font-bold uppercase tracking-wider ${colorClass}`}
      >
        {label}
      </td>
      <td className="text-center text-xs font-bold text-white">
        {data.shares > 0
          ? data.shares.toLocaleString(undefined, { maximumFractionDigits: 2 })
          : "-"}
      </td>
      <td className="text-center text-xs font-bold text-white/60">
        {data.shares > 0 ? `$${data.avgPrice.toFixed(4)}` : "-"}
      </td>
      <td className="text-center text-xs font-bold text-white">
        {data.invested > 0
          ? `$${data.invested.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
          : "-"}
      </td>
      <td className="text-center text-xs font-bold text-white">
        {data.shares > 0
          ? `$${data.fairValue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
          : "-"}
      </td>
      <td
        className={`text-center text-xs font-bold ${data.pnl >= 0 ? "text-[#64c883]" : "text-[#e16464]"} ${data.shares === 0 ? "opacity-0" : ""}`}
      >
        {data.pnl >= 0 ? "+" : ""}$
        {data.pnl.toLocaleString(undefined, {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        })}
      </td>
      <td
        className={`text-center text-xs font-bold ${data.roi >= 0 ? "text-[#64c883]" : "text-[#e16464]"} ${data.shares === 0 ? "opacity-0" : ""}`}
      >
        {data.roi >= 0 ? "+" : ""}
        {data.roi.toFixed(1)}%
      </td>
      <td className="text-center text-xs font-bold text-white/40">
        {data.shares > 0 ? `$${data.avgPrice.toFixed(4)}` : "-"}
      </td>
      <td className={`pr-4 text-right text-xs font-extrabold ${colorClass}`}>
        {(data.prob * 100).toFixed(1)}%
      </td>
    </tr>
  );

  return (
    <div className="bg-[#121212] border border-white/5 rounded-3xl overflow-hidden transition-all hover:border-white/10 group col-span-1 md:col-span-2 shadow-2xl shadow-black/20">
      {/* Header */}
      <div className="p-6 md:px-8 md:py-7 flex justify-between items-center bg-white/[0.01]">
        <div>
          <div className="flex flex-wrap items-center gap-2 mb-1">
            <h4 className="text-xl md:text-2xl font-bold text-white transition-colors leading-tight">
              {market.question}
            </h4>
            <span className="text-[10px] font-bold text-gray-600 uppercase tracking-widest mt-1">
              {market.playerName}
            </span>
            <span className="text-[10px] font-bold text-gray-500 uppercase tracking-widest mt-1">
              #{market.id.slice(-4)}
            </span>
            <span className="text-[10px] font-bold text-gray-600 uppercase tracking-widest mt-1 ml-2">
              {new Date(position.createdAt).toLocaleDateString()}
            </span>
          </div>
        </div>

        {/* Probability Bar at Top Right */}
        <div className="flex flex-col items-end gap-2 pr-2">
          <div className="flex gap-4 mb-0.5">
            <div className="flex items-center gap-1.5">
              <div className="w-1.5 h-1.5 rounded-full bg-[#64c883]" />
              <span className="text-[10px] font-extrabold text-[#64c883]">
                {(yes.prob * 100).toFixed(1)}%
              </span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="w-1.5 h-1.5 rounded-full bg-[#e16464]" />
              <span className="text-[10px] font-extrabold text-[#e16464]">
                {(no.prob * 100).toFixed(1)}%
              </span>
            </div>
          </div>
          <div className="w-40 h-1.5 bg-white/5 rounded-full overflow-hidden flex">
            <div
              className="h-full bg-[#64c883] transition-all duration-1000"
              style={{ width: `${yes.prob * 100}%` }}
            />
            <div
              className="h-full bg-[#e16464] transition-all duration-1000"
              style={{ width: `${no.prob * 100}%` }}
            />
          </div>
        </div>
      </div>

      {/* Table Content */}
      <div className="px-6 md:px-8 py-4">
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="h-10 text-[9px] font-bold text-gray-500 uppercase tracking-widest">
                <th className="pl-4">LADO</th>
                <th className="text-center">ACCIONES</th>
                <th className="text-center">PRECIO PROM.</th>
                <th className="text-center">INVERSIÓN</th>
                <th className="text-center">VALOR MKT</th>
                <th className="text-center">P&L</th>
                <th className="text-center">ROI</th>
                <th className="text-center">BREAKEVEN</th>
                <th className="pr-4 text-right">PROB.</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5 bg-[#0a0a0a]/40 rounded-2xl overflow-hidden border border-white/5">
              {renderRow("YES", yes, "text-[#64c883]")}
              {renderRow("NO", no, "text-[#e16464]")}

              {/* TOTAL ROW */}
              <tr className="h-14 bg-white/[0.03]">
                <td className="pl-4 text-[10px] font-extrabold text-white uppercase tracking-wider">
                  TOTAL
                </td>
                <td></td>
                <td></td>
                <td className="text-center text-xs font-extrabold text-white">
                  $
                  {totalInvested.toLocaleString(undefined, {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2,
                  })}
                </td>
                <td className="text-center text-xs font-extrabold text-white">
                  $
                  {totalFairValue.toLocaleString(undefined, {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2,
                  })}
                </td>
                <td
                  className={`text-center text-xs font-extrabold ${position.totalPnL >= 0 ? "text-[#64c883]" : "text-[#e16464]"}`}
                >
                  {position.totalPnL >= 0 ? "+" : ""}$
                  {position.totalPnL.toLocaleString(undefined, {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2,
                  })}
                </td>
                <td
                  className={`text-center text-xs font-extrabold ${position.totalROI >= 0 ? "text-[#64c883]" : "text-[#e16464]"}`}
                >
                  {position.totalROI >= 0 ? "+" : ""}
                  {position.totalROI.toFixed(1)}%
                </td>
                <td></td>
                <td></td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* Footer Scenarios & Actions */}
      <div className="px-8 md:px-10 py-6 flex flex-wrap gap-4 items-center justify-between border-t border-white/5 bg-white/[0.01]">
        <div className="flex flex-col md:flex-row gap-4 md:gap-8">
          <div className="flex items-center gap-3">
            <span className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">
              Si gana YES:
            </span>
            <span className="text-sm font-extrabold text-white">
              $
              {scenarios.ifYesWins.payout.toLocaleString(undefined, {
                minimumFractionDigits: 2,
              })}
            </span>
            <span
              className={`text-[11px] font-extrabold px-1.5 py-0.5 rounded-md ${scenarios.ifYesWins.net >= 0 ? "text-[#64c883] bg-[#64c883]/10" : "text-[#e16464] bg-[#e16464]/10"}`}
            >
              {scenarios.ifYesWins.net >= 0 ? "+" : ""}$
              {scenarios.ifYesWins.net.toLocaleString(undefined, {
                minimumFractionDigits: 2,
              })}
            </span>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">
              Si gana NO:
            </span>
            <span className="text-sm font-extrabold text-white">
              $
              {scenarios.ifNoWins.payout.toLocaleString(undefined, {
                minimumFractionDigits: 2,
              })}
            </span>
            <span
              className={`text-[11px] font-extrabold px-1.5 py-0.5 rounded-md ${scenarios.ifNoWins.net >= 0 ? "text-[#64c883] bg-[#64c883]/10" : "text-[#e16464] bg-[#e16464]/10"}`}
            >
              {scenarios.ifNoWins.net >= 0 ? "+" : ""}$
              {scenarios.ifNoWins.net.toLocaleString(undefined, {
                minimumFractionDigits: 2,
              })}
            </span>
          </div>
        </div>

        <button
          onClick={() => {}}
          className="px-8 py-3 rounded-xl bg-white/5 border border-white/10 text-[10px] font-extrabold text-white/40 uppercase tracking-widest hover:bg-white/10 hover:text-white transition-all disabled:opacity-50"
          disabled
        >
          VENDER
        </button>
      </div>
    </div>
  );
}
