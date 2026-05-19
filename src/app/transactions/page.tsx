"use client";

import { useState, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { UserProvider, useUser } from "@/contexts/UserContext";
import { Shell } from "@/components/layout/Shell";

type TxType =
  | "BET_PLACED"
  | "BET_REFUNDED"
  | "PAYOUT_RECEIVED"
  | "POSITION_PURCHASED"
  | "POSITION_SOLD"
  | "DEPOSIT"
  | "WITHDRAWAL"
  | "LIMIT_ORDER_PLACED"
  | "LIMIT_ORDER_CANCELLED"
  | "INITIAL_BALANCE";

interface Tx {
  id: string;
  type: TxType;
  amount: number;
  balanceBefore: number;
  balanceAfter: number;
  reference: string | null;
  description: string;
  createdAt: string;
  market: {
    id: string;
    playerName: string | null;
    question: string;
    status: string;
    outcome: string | null;
  } | null;
}

interface Stats {
  totalBet: number;
  totalSold: number;
  totalBought: number;
  totalPayouts: number;
  totalRefunded: number;
  count: number;
}

const TX_META: Record<
  string,
  { label: string; icon: string; color: string; bg: string; group: "BUY" | "SELL" | "PAYOUT" | "ORDER" | "OTHER" }
> = {
  BET_PLACED: { label: "Compra al mercado", icon: "🟢", color: "text-primary", bg: "bg-primary/10 border-primary/20", group: "BUY" },
  POSITION_PURCHASED: { label: "Compra P2P", icon: "🔵", color: "text-blue-400", bg: "bg-blue-500/10 border-blue-500/20", group: "BUY" },
  POSITION_SOLD: { label: "Venta", icon: "🟣", color: "text-purple-400", bg: "bg-purple-500/10 border-purple-500/20", group: "SELL" },
  PAYOUT_RECEIVED: { label: "Payout (ganancia)", icon: "🏆", color: "text-yellow-300", bg: "bg-yellow-500/10 border-yellow-500/20", group: "PAYOUT" },
  BET_REFUNDED: { label: "Reembolso", icon: "↩️", color: "text-gray-300", bg: "bg-white/5 border-white/10", group: "PAYOUT" },
  LIMIT_ORDER_PLACED: { label: "Orden P2P creada", icon: "📋", color: "text-orange-400", bg: "bg-orange-500/10 border-orange-500/20", group: "ORDER" },
  LIMIT_ORDER_CANCELLED: { label: "Orden P2P cancelada", icon: "❌", color: "text-gray-500", bg: "bg-white/5 border-white/10", group: "ORDER" },
  DEPOSIT: { label: "Depósito", icon: "⬇️", color: "text-primary", bg: "bg-primary/10 border-primary/20", group: "OTHER" },
  WITHDRAWAL: { label: "Retiro", icon: "⬆️", color: "text-win-error", bg: "bg-win-error/10 border-win-error/20", group: "OTHER" },
  INITIAL_BALANCE: { label: "Saldo inicial", icon: "✨", color: "text-gray-400", bg: "bg-white/5 border-white/10", group: "OTHER" },
};

type FilterTab = "ALL" | "BUY" | "SELL" | "PAYOUT" | "ORDER";

function TransactionsPage() {
  const router = useRouter();
  const { user, loading } = useUser();
  const [txs, setTxs] = useState<Tx[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [loadingTxs, setLoadingTxs] = useState(true);
  const [filter, setFilter] = useState<FilterTab>("ALL");

  useEffect(() => {
    if (!loading && !user) router.push("/");
  }, [user, loading, router]);

  useEffect(() => {
    if (!user) return;
    setLoadingTxs(true);
    fetch(`/api/users/${user.id}/transactions`)
      .then((r) => r.json())
      .then((data) => {
        setTxs(data.transactions || []);
        setStats(data.stats || null);
      })
      .catch(() => {})
      .finally(() => setLoadingTxs(false));
  }, [user]);

  const filtered = useMemo(() => {
    if (filter === "ALL") return txs;
    return txs.filter((t) => TX_META[t.type]?.group === filter);
  }, [txs, filter]);

  // Group transactions by date for the timeline
  const grouped = useMemo(() => {
    const result: Record<string, Tx[]> = {};
    filtered.forEach((t) => {
      const day = new Date(t.createdAt).toLocaleDateString("es-CO", {
        weekday: "long",
        day: "2-digit",
        month: "long",
        year: "numeric",
      });
      if (!result[day]) result[day] = [];
      result[day].push(t);
    });
    return result;
  }, [filtered]);

  if (loading || !user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-win-bg">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  const netResult = stats
    ? stats.totalSold + stats.totalPayouts + stats.totalRefunded -
      stats.totalBet - stats.totalBought
    : 0;

  return (
    <Shell>
      <div className="px-4 py-6 space-y-6">
        {/* Header */}
        <div className="space-y-2">
          <h1 className="text-2xl font-extrabold text-white tracking-tight">
            Historial de Transacciones
          </h1>
          <p className="text-[11px] text-gray-500">
            Todas tus operaciones: compras, ventas, payouts y órdenes P2P.
          </p>
        </div>

        {/* Stats cards */}
        {stats && (
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            <div className="p-4 bg-[#121212] border border-white/5 rounded-2xl">
              <p className="text-[9px] font-bold text-gray-400 uppercase tracking-wider mb-1">Total invertido</p>
              <p className="text-lg font-extrabold text-white">${stats.totalBet.toFixed(2)}</p>
              <p className="text-[9px] text-gray-500 mt-0.5">Compras al mercado</p>
            </div>
            <div className="p-4 bg-[#121212] border border-white/5 rounded-2xl">
              <p className="text-[9px] font-bold text-gray-400 uppercase tracking-wider mb-1">Comprado P2P</p>
              <p className="text-lg font-extrabold text-blue-400">${stats.totalBought.toFixed(2)}</p>
              <p className="text-[9px] text-gray-500 mt-0.5">De otros usuarios</p>
            </div>
            <div className="p-4 bg-[#121212] border border-white/5 rounded-2xl">
              <p className="text-[9px] font-bold text-gray-400 uppercase tracking-wider mb-1">Vendido</p>
              <p className="text-lg font-extrabold text-purple-400">${stats.totalSold.toFixed(2)}</p>
              <p className="text-[9px] text-gray-500 mt-0.5">LMSR + P2P</p>
            </div>
            <div className="p-4 bg-[#121212] border border-white/5 rounded-2xl">
              <p className="text-[9px] font-bold text-gray-400 uppercase tracking-wider mb-1">Payouts</p>
              <p className="text-lg font-extrabold text-yellow-300">${stats.totalPayouts.toFixed(2)}</p>
              <p className="text-[9px] text-gray-500 mt-0.5">Mercados ganados</p>
            </div>
            <div className={`p-4 rounded-2xl border ${netResult >= 0 ? "bg-primary/5 border-primary/20" : "bg-win-error/5 border-win-error/20"}`}>
              <p className={`text-[9px] font-bold uppercase tracking-wider mb-1 ${netResult >= 0 ? "text-primary" : "text-win-error"}`}>
                P&L Neto
              </p>
              <p className={`text-lg font-extrabold ${netResult >= 0 ? "text-primary" : "text-win-error"}`}>
                {netResult >= 0 ? "+" : ""}${netResult.toFixed(2)}
              </p>
              <p className="text-[9px] text-gray-500 mt-0.5">
                {stats.count} transacciones
              </p>
            </div>
          </div>
        )}

        {/* Filter tabs */}
        <div className="flex gap-1 bg-[#0d0d0d] rounded-xl p-1 overflow-x-auto">
          {(
            [
              { key: "ALL", label: "Todas" },
              { key: "BUY", label: "🟢 Compras" },
              { key: "SELL", label: "🟣 Ventas" },
              { key: "PAYOUT", label: "🏆 Payouts" },
              { key: "ORDER", label: "📋 Órdenes" },
            ] as { key: FilterTab; label: string }[]
          ).map((tab) => (
            <button
              key={tab.key}
              onClick={() => setFilter(tab.key)}
              className={`flex-1 min-w-fit px-3 py-2 rounded-lg text-[11px] font-extrabold uppercase tracking-wider transition-all whitespace-nowrap ${
                filter === tab.key
                  ? "bg-white/10 text-white shadow"
                  : "text-gray-500 hover:text-white"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Transactions list */}
        {loadingTxs ? (
          <div className="flex justify-center py-20">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 gap-3">
            <div className="text-5xl opacity-20">📭</div>
            <p className="text-gray-500 text-sm font-bold">
              {filter === "ALL"
                ? "Aún no tienes transacciones"
                : "No hay transacciones de este tipo"}
            </p>
            {filter === "ALL" && (
              <Link
                href="/markets"
                className="mt-2 px-4 py-2 bg-primary text-win-bg text-xs font-bold rounded-xl uppercase tracking-wider hover:bg-primary-hover transition-all"
              >
                Explorar mercados
              </Link>
            )}
          </div>
        ) : (
          <div className="space-y-6">
            {Object.entries(grouped).map(([day, dayTxs]) => (
              <div key={day} className="space-y-2">
                <h3 className="text-[10px] font-bold text-gray-500 uppercase tracking-[0.2em] px-1 capitalize">
                  {day}
                </h3>
                <div className="space-y-2">
                  {dayTxs.map((t) => {
                    const meta = TX_META[t.type] || {
                      label: t.type,
                      icon: "•",
                      color: "text-gray-400",
                      bg: "bg-white/5 border-white/10",
                      group: "OTHER" as const,
                    };
                    const isPositive = t.amount > 0;
                    return (
                      <div
                        key={t.id}
                        className={`flex items-center justify-between gap-4 p-4 rounded-2xl border ${meta.bg}`}
                      >
                        <div className="flex items-center gap-3 min-w-0 flex-1">
                          <div className="text-xl">{meta.icon}</div>
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className={`text-xs font-extrabold uppercase tracking-wider ${meta.color}`}>
                                {meta.label}
                              </span>
                              {t.market?.status === "RESOLVED" && (
                                <span className="text-[8px] font-bold px-1.5 py-0.5 rounded bg-white/5 text-gray-400 uppercase">
                                  Resuelto: {t.market.outcome}
                                </span>
                              )}
                            </div>
                            {t.market ? (
                              <Link
                                href={`/markets/${t.market.id}`}
                                className="text-[11px] text-white/80 hover:text-white truncate block mt-0.5"
                              >
                                {t.market.playerName || t.market.question}
                              </Link>
                            ) : null}
                            <p className="text-[10px] text-gray-500 mt-0.5 truncate">
                              {t.description}
                            </p>
                            <p className="text-[9px] text-gray-600 mt-0.5">
                              {new Date(t.createdAt).toLocaleTimeString("es-CO", {
                                hour: "2-digit",
                                minute: "2-digit",
                              })}
                            </p>
                          </div>
                        </div>
                        <div className="text-right shrink-0">
                          <div className={`text-base font-extrabold ${isPositive ? "text-primary" : "text-win-error"}`}>
                            {isPositive ? "+" : ""}${t.amount.toFixed(2)}
                          </div>
                          <div className="text-[9px] text-gray-500">
                            Saldo: ${t.balanceAfter.toFixed(2)}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </Shell>
  );
}

export default function Page() {
  return (
    <UserProvider>
      <TransactionsPage />
    </UserProvider>
  );
}
