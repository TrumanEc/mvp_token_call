"use client";

import { useState } from "react";
import Link from "next/link";
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

  const ob = { yes: yes.openOrders || { pendingShares: 0, expectedRevenue: 0, avgListPrice: 0 }, no: no.openOrders || { pendingShares: 0, expectedRevenue: 0, avgListPrice: 0 } };
  const totalObRevenue = ob.yes.expectedRevenue + ob.no.expectedRevenue;
  const totalObShares = ob.yes.pendingShares + ob.no.pendingShares;

  const renderRow = (label: string, data: any, colorClass: string, obData: { pendingShares: number; expectedRevenue: number; avgListPrice: number }, scenario: any, isActive: boolean) => (
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
        {data.shares > 0 ? (
          <div className="flex flex-col items-center gap-0.5">
            <span>${data.avgPrice.toFixed(4)}</span>
            {data.avgPriceNet != null && data.avgPriceNet !== data.avgPrice && (
              <span className="text-[9px] text-gray-600 font-normal">
                neto ${data.avgPriceNet.toFixed(4)}
              </span>
            )}
          </div>
        ) : "-"}
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
      {isActive && (
        <>
          {/* OB Pending */}
          <td className="text-center">
            {obData.pendingShares > 0 ? (
              <div className="flex flex-col items-center">
                <span className="text-xs font-bold text-blue-400">
                  {obData.pendingShares.toLocaleString(undefined, { maximumFractionDigits: 2 })} sh
                </span>
                <span className="text-[9px] text-blue-300/60">
                  +${obData.expectedRevenue.toFixed(2)}
                </span>
              </div>
            ) : (
              <span className="text-white/20 text-xs">-</span>
            )}
          </td>
          {/* Potential Payout */}
          <td className="text-center">
            {data.shares > 0 ? (
              <div className="flex flex-col items-center">
                <span className="text-xs font-extrabold text-white">
                  ${scenario.payout.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                </span>
                <span className={`text-[9px] font-bold ${scenario.net >= 0 ? "text-[#64c883]" : "text-[#e16464]"}`}>
                  {scenario.net >= 0 ? "+" : ""}${scenario.net.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                </span>
              </div>
            ) : (
               <span className="text-white/20 text-xs">-</span>
            )}
          </td>
        </>
      )}
      <td className={`pr-4 text-right text-xs font-extrabold ${colorClass}`}>
        {(data.prob * 100).toFixed(0)}%
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
            {!isActive && (
              <span className={`text-[10px] font-black uppercase tracking-[0.2em] px-3 py-1 rounded-lg ml-2 ${position.totalPnL >= 0 ? "bg-[#64c883]/20 text-[#64c883]" : "bg-[#e16464]/20 text-[#e16464]"}`}>
                {position.totalPnL >= 0 ? "WIN" : "LOSS"}
              </span>
            )}
          </div>
        </div>

        {/* Probability Bar at Top Right (only if active or show final result) */}
        {!isActive ? (
          <div className="flex flex-col items-end gap-1">
             <span className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">RESULTADO FINAL</span>
             <span className="text-xl font-black text-white">{market.outcome}</span>
          </div>
        ) : (
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
        )}
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
                <th className="text-center">{isActive ? "VALOR MKT" : "PAGO FINAL"}</th>
                <th className="text-center">P&L</th>
                <th className="text-center">ROI</th>
                {isActive && (
                  <>
                    <th className="text-center">
                      <span className="text-blue-400">EN OB</span>
                    </th>
                    <th className="text-center">POTENCIAL</th>
                  </>
                )}
                <th className="pr-4 text-right">{isActive ? "PROB." : "FINAL"}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5 bg-[#0a0a0a]/40 rounded-2xl overflow-hidden border border-white/5">
              {renderRow("YES", yes, "text-[#64c883]", ob.yes, scenarios.ifYesWins, isActive)}
              {renderRow("NO", no, "text-[#e16464]", ob.no, scenarios.ifNoWins, isActive)}

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
                {isActive && (
                  <>
                     <td className="text-center">
                      {totalObShares > 0 ? (
                        <div className="flex flex-col items-center">
                          <span className="text-xs font-bold text-blue-400">
                            {totalObShares.toLocaleString(undefined, { maximumFractionDigits: 2 })} sh
                          </span>
                          <span className="text-[9px] text-blue-300/60">+${totalObRevenue.toFixed(2)}</span>
                        </div>
                      ) : null}
                    </td>
                    <td></td>
                  </>
                )}
                <td></td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* OB Pending Banner */}
      {isActive && totalObShares > 0 && (
        <div className="mx-6 md:mx-8 mb-4 flex items-center justify-between gap-4 rounded-xl bg-blue-500/10 border border-blue-500/20 px-4 py-3">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-blue-400 animate-pulse" />
            <span className="text-[10px] font-bold text-blue-400 uppercase tracking-widest">
              Órdenes Pendientes en Order Book
            </span>
            <span className="text-[10px] text-gray-500">
              — si alguien compra tus shares recibirás:
            </span>
          </div>
          <div className="flex items-center gap-4">
            {ob.yes.pendingShares > 0 && (
              <div className="text-right">
                <span className="text-[9px] text-gray-500 uppercase">YES</span>
                <div className="text-sm font-extrabold text-blue-300">
                  +${ob.yes.expectedRevenue.toFixed(2)}
                </div>
                <div className="text-[9px] text-gray-500">
                  {ob.yes.pendingShares.toFixed(2)} sh @ ${ob.yes.avgListPrice.toFixed(4)}
                </div>
              </div>
            )}
            {ob.no.pendingShares > 0 && (
              <div className="text-right">
                <span className="text-[9px] text-gray-500 uppercase">NO</span>
                <div className="text-sm font-extrabold text-blue-300">
                  +${ob.no.expectedRevenue.toFixed(2)}
                </div>
                <div className="text-[9px] text-gray-500">
                  {ob.no.pendingShares.toFixed(2)} sh @ ${ob.no.avgListPrice.toFixed(4)}
                </div>
              </div>
            )}
            <div className="text-right border-l border-blue-500/20 pl-4">
              <span className="text-[9px] text-gray-500 uppercase">Total</span>
              <div className="text-sm font-extrabold text-blue-300">
                +${totalObRevenue.toFixed(2)}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Footer Scenarios & Actions */}

      <div className="px-8 md:px-10 py-6 flex flex-wrap gap-4 items-center justify-between border-t border-white/5 bg-white/[0.01]">
        <div className="flex flex-col md:flex-row gap-4 md:gap-8">
           <div className="flex items-center gap-3">
            <span className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">
              Análisis de Riesgo WIN:
            </span>
            <span className="text-[10px] text-gray-600">
              Exposición neta consolidada por mercado
            </span>
          </div>
        </div>

        {!isActive ? (
          <div className="px-8 py-3 rounded-xl bg-white/5 border border-white/10 text-[10px] font-extrabold text-[#64c883] uppercase tracking-widest">
            {position.payout > 0 ? "PAGADO" : "CERRADO"}
          </div>
        ) : (
          <Link
            href={`/markets/${position.marketId}?tab=sell`}
            className="px-8 py-3 rounded-xl bg-orange-500/10 border border-orange-500/30 text-[10px] font-extrabold text-orange-400 uppercase tracking-widest hover:bg-orange-500/20 hover:border-orange-500/50 hover:text-orange-300 transition-all"
          >
            VENDER
          </Link>
        )}
      </div>
    </div>
  );
}
