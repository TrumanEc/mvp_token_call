"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { UserProvider, useUser } from "@/contexts/UserContext";
import { Shell } from "@/components/layout/Shell";
import { getMarketVisual } from "@/lib/market-visual";

// ─── Types ────────────────────────────────────────────────────────────────────
interface OutcomeData {
  id: string;
  name: string;
  shares: number;
  invested: number;
  avgPrice: number;
  fairValue: number;
  pnl: number;
  roi: number;
  payout: number;
  prob: number;
}

interface MarketPosition {
  id: string;
  marketId: string;
  market: {
    id: string;
    question: string;
    status: string;
    imageUrl?: string | null;
    winningOutcomeId: string | null;
    winningOutcomeName: string | null;
    outcomes: { id: string; name: string; color?: string | null }[];
  };
  outcomesData: Record<string, OutcomeData>;
  fairValue: number;
  totalPnL: number;
  totalROI: number;
  amount: number;
  payout: number;
  scenarios: Record<string, { payout: number; net: number }>;
}

interface Transaction {
  id: string;
  type: string;
  amount: number;
  description: string;
  createdAt: string;
  market: { id: string; question: string; status: string; outcome: string | null } | null;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────
const BUY_RE  = /Market Buy:\s*([\d.]+)\s+(.+?)\s+for\s+\$([\d.]+)/i;
const SELL_RE = /Sell-back LMSR:\s*([\d.]+)\s+(.+?)\s+shares\s+por\s+\$([\d.]+)\s+\(fee\s+\$([\d.]+)\)/i;

function parseTx(tx: Transaction) {
  if (tx.type === "BET_PLACED") {
    const m = BUY_RE.exec(tx.description);
    return { kind: "BUY" as const, side: m?.[2] ?? "?", shares: m ? parseFloat(m[1]) : 0, cost: m ? parseFloat(m[3]) : Math.abs(tx.amount) };
  }
  if (tx.type === "POSITION_SOLD") {
    const m = SELL_RE.exec(tx.description);
    return { kind: "SELL" as const, side: m?.[2] ?? "?", shares: m ? parseFloat(m[1]) : 0, proceeds: m ? parseFloat(m[3]) : tx.amount, fee: m ? parseFloat(m[4]) : 0 };
  }
  if (tx.type === "PAYOUT_RECEIVED") {
    return { kind: "PAYOUT" as const, side: "?", payout: tx.amount };
  }
  return null;
}

function timeAgo(date: string) {
  const diff = Date.now() - new Date(date).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "ahora";
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  const d = Math.floor(h / 24);
  return d < 30 ? `${d}d` : new Date(date).toLocaleDateString("es-ES", { day: "2-digit", month: "short" });
}

function pct(n: number) {
  return `${n >= 0 ? "+" : ""}${n.toFixed(1)}%`;
}

function usd(n: number) {
  return `$${Math.abs(n).toFixed(2)}`;
}

function labelEs(name: string) {
  if (name === "YES") return "SÍ";
  if (name === "NO")  return "NO";
  return name;
}

const OUTCOME_COLORS = ["#64c883", "#f87171", "#60a5fa", "#fbbf24", "#a78bfa", "#f472b6", "#34d399"];

// ─── Market Position Card ─────────────────────────────────────────────────────
function MarketPositionCard({ pos }: { pos: MarketPosition }) {
  const visual = getMarketVisual(pos.market.id, pos.market.question);
  const isResolved = pos.market.status === "RESOLVED";

  // Active outcomes (have shares)
  const activeOutcomes = pos.market.outcomes
    .map((o, i) => ({ ...o, idx: i, od: pos.outcomesData[o.id] }))
    .filter(({ od }) => od && od.shares > 0.001);

  const isMulti  = activeOutcomes.length > 2;
  const [expanded, setExpanded] = useState(!isMulti);

  // Winning payout
  const winningOd     = pos.market.winningOutcomeId ? pos.outcomesData[pos.market.winningOutcomeId] : null;
  const hasWinShares  = (winningOd?.shares ?? 0) > 0.001;
  const payoutReceived = (winningOd?.payout ?? 0) > 0;
  const payoutAmount  = winningOd?.payout || pos.scenarios[pos.market.winningOutcomeId ?? ""]?.payout || 0;

  // Average ROI (weighted by invested) — only shown when resolved + multiple outcomes
  const totalInvested = activeOutcomes.reduce((s, { od }) => s + od.invested, 0);
  const weightedPnL   = activeOutcomes.reduce((s, { od }) => s + od.pnl, 0);
  const avgROI        = totalInvested > 0 ? (weightedPnL / totalInvested) * 100 : 0;

  // Rows to show in table (collapsed: binary shows both, multi shows 2)
  const visibleRows = expanded ? activeOutcomes : activeOutcomes.slice(0, 2);

  return (
    <div className="bg-win-card rounded-2xl border border-white/5 p-4">

      {/* ── Market header ───────────────────────────────────────────── */}
      <div className="flex items-start gap-3 mb-4">
        {/* Icon: imageUrl or emoji */}
        <div className="flex-shrink-0 w-10 h-10 rounded-xl overflow-hidden border border-white/8">
          {pos.market.imageUrl ? (
            <img src={pos.market.imageUrl} alt="" className="w-full h-full object-cover" />
          ) : (
            <div
              className="w-full h-full flex items-center justify-center text-lg"
              style={{ background: visual.gradient }}
            >
              {visual.emoji}
            </div>
          )}
        </div>

        <div className="flex-1 min-w-0">
          <p className="text-[13px] font-semibold text-white leading-snug line-clamp-2">
            {pos.market.question}
          </p>
          <div className="flex items-center gap-2 mt-1.5">
            <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full ${
              isResolved ? "bg-gray-500/20 text-gray-400" : "bg-primary/15 text-primary"
            }`}>
              {isResolved
                ? `Resuelto · ${pos.market.winningOutcomeName ? labelEs(pos.market.winningOutcomeName) : "N/A"}`
                : "Activo"}
            </span>
          </div>
        </div>

        {/* Total value + ROI */}
        <div className="text-right shrink-0">
          <div className="text-[14px] font-extrabold text-white">{usd(pos.fairValue)}</div>
          <div className={`text-[10px] font-bold ${pos.totalPnL >= 0 ? "text-primary" : "text-win-error"}`}>
            {pct(pos.totalROI)}
          </div>
        </div>
      </div>

      {/* ── Outcomes table ──────────────────────────────────────────── */}
      {activeOutcomes.length > 0 && (
        <div className="rounded-xl overflow-hidden border border-white/5 mb-3">
          {/* Table header */}
          <div className="grid grid-cols-5 px-3 py-1.5 bg-white/3 border-b border-white/5">
            <span className="text-[9px] font-bold uppercase tracking-wider text-gray-600">Opción</span>
            <span className="text-[9px] font-bold uppercase tracking-wider text-gray-600 text-right">Part.</span>
            <span className="text-[9px] font-bold uppercase tracking-wider text-gray-600 text-right">Precio prom.</span>
            <span className="text-[9px] font-bold uppercase tracking-wider text-gray-600 text-right">Valor</span>
            <span className="text-[9px] font-bold uppercase tracking-wider text-gray-600 text-right">ROI</span>
          </div>

          {/* Rows */}
          {visibleRows.map(({ id, name, idx, od }) => {
            const color     = pos.market.outcomes.find(o => o.id === id)?.color || OUTCOME_COLORS[idx % OUTCOME_COLORS.length];
            const isWinner  = isResolved && id === pos.market.winningOutcomeId;
            const isLoser   = isResolved && id !== pos.market.winningOutcomeId;
            return (
              <div
                key={id}
                className="grid grid-cols-5 px-3 py-2.5 border-b border-white/5 last:border-0 items-center"
                style={{ background: isWinner ? `${color}08` : isLoser ? "transparent" : "rgba(255,255,255,0.02)" }}
              >
                {/* Outcome pill */}
                <span
                  className="text-[9px] font-bold px-1.5 py-0.5 rounded w-fit"
                  style={{ background: `${color}22`, color }}
                >
                  {labelEs(name)}
                </span>

                {/* Participaciones */}
                <span className="text-[11px] text-gray-300 text-right tabular-nums">
                  {od.shares.toFixed(2)}
                </span>

                {/* Precio promedio */}
                <span className="text-[11px] text-gray-400 text-right tabular-nums">
                  {od.shares > 0 ? `$${(od.invested / od.shares).toFixed(4)}` : "—"}
                </span>

                {/* Valor actual */}
                <span className={`text-[11px] font-bold text-right tabular-nums ${isLoser ? "text-gray-600" : "text-white"}`}>
                  {usd(od.fairValue)}
                </span>

                {/* ROI or payout indicator */}
                {isResolved ? (
                  <span className={`text-[10px] font-bold text-right ${isWinner ? "text-primary" : "text-gray-600"}`}>
                    {isWinner ? (od.payout > 0 ? `✓ ${usd(od.payout)}` : "Ganó") : "—"}
                  </span>
                ) : (
                  <span className={`text-[11px] font-semibold text-right tabular-nums ${od.pnl >= 0 ? "text-primary" : "text-win-error"}`}>
                    {pct(od.roi)}
                  </span>
                )}
              </div>
            );
          })}

          {/* Expand / collapse for multi-outcome */}
          {isMulti && (
            <button
              onClick={() => setExpanded((v) => !v)}
              className="w-full flex items-center justify-center gap-1.5 py-2 text-[9px] font-bold uppercase tracking-wider text-gray-600 hover:text-gray-400 border-t border-white/5 transition-colors"
            >
              {expanded ? (
                <>Ver menos <ChevronUp /></>
              ) : (
                <>Ver {activeOutcomes.length - 2} más <ChevronDown /></>
              )}
            </button>
          )}
        </div>
      )}

      {/* Resolved: avg ROI line (only when multiple outcomes) */}
      {isResolved && activeOutcomes.length > 1 && (
        <div className="flex justify-between items-center px-1 pb-2 text-[10px]">
          <span className="text-gray-600 uppercase tracking-wider font-bold">ROI promedio</span>
          <span className={`font-extrabold ${avgROI >= 0 ? "text-primary" : "text-win-error"}`}>
            {pct(avgROI)}
          </span>
        </div>
      )}

      {/* Scenarios: active markets only */}
      {!isResolved && pos.scenarios && Object.keys(pos.scenarios).length > 0 && (
        <div className="flex flex-wrap gap-2">
          {pos.market.outcomes.map((outcome, i) => {
            const scenario = pos.scenarios[outcome.id];
            if (!scenario || scenario.payout <= 0) return null;
            const color = outcome.color || OUTCOME_COLORS[i % OUTCOME_COLORS.length];
            return (
              <div
                key={outcome.id}
                className="flex-1 min-w-[100px] px-2.5 py-1.5 rounded-lg border text-center"
                style={{ borderColor: `${color}20`, background: `${color}08` }}
              >
                <div className="text-[9px] text-gray-600 uppercase tracking-wider mb-0.5">
                  Se resuelve {labelEs(outcome.name)}
                </div>
                <div className="text-[12px] font-bold" style={{ color }}>{usd(scenario.payout)}</div>
              </div>
            );
          })}
        </div>
      )}

      {/* COBRAR CTA */}
      {isResolved && hasWinShares && payoutAmount > 0 && (
        <div className="mt-3 pt-3 border-t border-white/5">
          {payoutReceived ? (
            <div className="w-full py-2.5 rounded-xl flex items-center justify-center gap-2 bg-primary/8 border border-primary/20">
              <svg className="w-3.5 h-3.5 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
              <span className="text-[11px] font-bold text-primary">Cobrado · {usd(payoutAmount)}</span>
            </div>
          ) : (
            <Link
              href={`/markets/${pos.market.id}`}
              className="block w-full py-3 rounded-xl text-center text-[12px] font-extrabold uppercase tracking-wider text-[#0d1117] transition-all hover:brightness-110 shadow-lg"
              style={{ background: "#64c883", boxShadow: "0 8px 20px rgba(100,200,131,0.25)" }}
            >
              Cobrar {usd(payoutAmount)}
            </Link>
          )}
        </div>
      )}
    </div>
  );
}

function ChevronDown() {
  return (
    <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
    </svg>
  );
}

function ChevronUp() {
  return (
    <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M5 15l7-7 7 7" />
    </svg>
  );
}

// ─── Portfolio tab ────────────────────────────────────────────────────────────
function PortfolioTab({ positions }: { positions: MarketPosition[] }) {
  if (positions.length === 0) {
    return (
      <div className="text-center py-16">
        <p className="text-4xl mb-3 opacity-20">📭</p>
        <p className="text-[13px] text-gray-500">No tienes posiciones abiertas</p>
        <Link href="/markets" className="mt-4 inline-block text-[11px] font-bold text-primary underline">
          Explorar mercados →
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {positions.map((pos) => (
        <MarketPositionCard key={pos.id} pos={pos} />
      ))}
    </div>
  );
}

// ─── Activity tab ─────────────────────────────────────────────────────────────
function ActivityTab({ userId }: { userId: string }) {
  const [txs, setTxs] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAll, setShowAll] = useState(false);

  useEffect(() => {
    setLoading(true);
    fetch(`/api/users/${userId}/transactions?limit=${showAll ? 200 : 20}`)
      .then((r) => r.json())
      .then((d) => setTxs((d.transactions ?? []).filter((t: Transaction) =>
        ["BET_PLACED", "POSITION_SOLD", "PAYOUT_RECEIVED"].includes(t.type)
      )))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [userId, showAll]);

  if (loading) return (
    <div className="flex justify-center py-12">
      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
    </div>
  );

  if (txs.length === 0) return (
    <div className="text-center py-16">
      <p className="text-4xl mb-3 opacity-20">📋</p>
      <p className="text-[13px] text-gray-500">No hay actividad aún</p>
    </div>
  );

  return (
    <div>
      {txs.map((tx) => {
        const parsed = parseTx(tx);
        if (!parsed) return null;

        return (
          <div key={tx.id} className="flex items-start gap-3 py-3.5 border-b border-white/5 last:border-0">
            {parsed.kind === "PAYOUT" ? (
              <div className="w-8 h-8 rounded-full flex items-center justify-center text-base shrink-0 bg-yellow-500/10">★</div>
            ) : (
              <div className={`w-8 h-8 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0 ${
                parsed.side === "YES" ? "bg-primary/15 text-primary"
                : parsed.side === "NO" ? "bg-win-error/15 text-win-error"
                : "bg-white/10 text-white"
              }`}>
                {labelEs(parsed.side).slice(0, 2)}
              </div>
            )}

            <div className="flex-1 min-w-0">
              {tx.market && (
                <Link href={`/markets/${tx.market.id}`} className="block text-[10px] text-gray-500 hover:text-gray-300 transition-colors truncate mb-0.5">
                  {tx.market.question}
                </Link>
              )}

              <div className="flex items-center gap-1.5 flex-wrap">
                {parsed.kind === "BUY" && (
                  <>
                    <span className="text-[11px] text-gray-500">Compró</span>
                    <span className={`text-[11px] font-bold ${
                      parsed.side === "YES" ? "text-primary" : parsed.side === "NO" ? "text-win-error" : "text-white"
                    }`}>
                      {parsed.shares.toFixed(2)} participaciones {labelEs(parsed.side)}
                    </span>
                    <span className="text-[10px] text-gray-500">por</span>
                    <span className="text-[11px] font-bold text-white">{usd(parsed.cost)}</span>
                  </>
                )}
                {parsed.kind === "SELL" && (
                  <>
                    <span className="text-[11px] text-orange-400 font-bold">Vendió</span>
                    <span className={`text-[11px] font-bold ${
                      parsed.side === "YES" ? "text-primary" : parsed.side === "NO" ? "text-win-error" : "text-white"
                    }`}>
                      {parsed.shares.toFixed(2)} participaciones {labelEs(parsed.side)}
                    </span>
                    <span className="text-[10px] text-gray-500">→</span>
                    <span className="text-[11px] font-bold text-orange-300">+{usd(parsed.proceeds)}</span>
                  </>
                )}
                {parsed.kind === "PAYOUT" && (
                  <>
                    <span className="text-[11px] text-yellow-400 font-bold">Cobró ganancia</span>
                    <span className="text-[11px] font-bold text-yellow-300">+{usd(parsed.payout)}</span>
                  </>
                )}
              </div>

              {parsed.kind === "BUY" && parsed.shares > 0 && (
                <div className="text-[9px] text-gray-600 mt-0.5">
                  ${(parsed.cost / parsed.shares).toFixed(4)}/participación
                </div>
              )}
              {parsed.kind === "SELL" && parsed.fee > 0 && (
                <div className="text-[9px] text-gray-600 mt-0.5">fee {usd(parsed.fee)}</div>
              )}
            </div>

            <span className="text-[10px] text-gray-600 shrink-0 tabular-nums mt-1">{timeAgo(tx.createdAt)}</span>
          </div>
        );
      })}

      {!showAll && txs.length >= 20 && (
        <button
          onClick={() => setShowAll(true)}
          className="mt-4 w-full py-2.5 rounded-xl border border-white/10 text-[11px] font-bold uppercase tracking-wider text-gray-400 hover:text-white hover:border-white/20 transition-all"
        >
          Ver más operaciones
        </button>
      )}
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────
function ProfilePage() {
  const router = useRouter();
  const { user, loading: authLoading } = useUser();
  const [tab, setTab]     = useState<"portfolio" | "actividad">("portfolio");
  const [positions, setPositions] = useState<MarketPosition[]>([]);
  const [loadingData, setLoadingData] = useState(true);

  useEffect(() => {
    if (!authLoading && !user) router.push("/");
  }, [user, authLoading, router]);

  useEffect(() => {
    if (!user) return;
    fetch(`/api/positions?userId=${user.id}`)
      .then((r) => r.json())
      .then((pos) => setPositions(Array.isArray(pos) ? pos : []))
      .catch(() => {})
      .finally(() => setLoadingData(false));
  }, [user]);

  if (authLoading || !user) {
    return (
      <div className="min-h-screen bg-win-bg flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary" />
      </div>
    );
  }

  const totalInvested  = positions.reduce((s, p) => s + p.amount, 0);
  const totalFairValue = positions.reduce((s, p) => s + p.fairValue, 0);
  const totalPnL       = totalFairValue - totalInvested;
  const totalROI       = totalInvested > 0 ? (totalPnL / totalInvested) * 100 : 0;

  const initial     = (user.username ?? "U")[0].toUpperCase();
  const colors      = ["bg-primary/20 text-primary", "bg-blue-500/20 text-blue-400", "bg-purple-500/20 text-purple-400", "bg-orange-500/20 text-orange-400"];
  const avatarColor = colors[(initial.charCodeAt(0) ?? 0) % colors.length];

  return (
    <Shell>
      <div className="max-w-2xl mx-auto space-y-6">

        {/* ── Header ──────────────────────────────────────────────────── */}
        <div className="flex items-center gap-4 pt-2">
          <div className={`w-14 h-14 rounded-full flex items-center justify-center text-xl font-extrabold shrink-0 ${avatarColor}`}>
            {initial}
          </div>
          <div className="flex-1">
            <h1 className="text-[20px] font-extrabold text-white leading-none">
              {user.username ?? "Usuario"}
            </h1>
            <div className="flex items-center gap-2 mt-1.5">
              <span className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">Saldo disponible</span>
              <span className="text-[13px] font-extrabold text-white">${Number(user.balance).toFixed(2)}</span>
            </div>
          </div>
        </div>

        {/* ── Stats row ───────────────────────────────────────────────── */}
        {!loadingData && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              { label: "Portafolio", value: `$${totalFairValue.toFixed(2)}`,                       color: "text-white" },
              { label: "P&L Total",  value: `${totalPnL >= 0 ? "+" : ""}$${totalPnL.toFixed(2)}`, color: totalPnL >= 0 ? "text-primary" : "text-win-error" },
              { label: "Invertido",  value: `$${totalInvested.toFixed(2)}`,                        color: "text-gray-300" },
              { label: "ROI",        value: pct(totalROI),                                         color: totalROI >= 0 ? "text-primary" : "text-win-error" },
            ].map(({ label, value, color }) => (
              <div key={label} className="bg-win-card rounded-2xl border border-white/5 p-3 text-center">
                <div className="text-[9px] font-bold text-gray-500 uppercase tracking-wider mb-1">{label}</div>
                <div className={`text-[15px] font-extrabold ${color}`}>{value}</div>
              </div>
            ))}
          </div>
        )}

        {/* ── Tabs ────────────────────────────────────────────────────── */}
        <div className="flex border-b border-white/10">
          {([
            { key: "portfolio", label: `Portfolio (${positions.length})` },
            { key: "actividad", label: "Actividad" },
          ] as { key: "portfolio" | "actividad"; label: string }[]).map(({ key, label }) => (
            <button
              key={key}
              onClick={() => setTab(key)}
              className={`py-3 px-5 text-[11px] font-bold uppercase tracking-wider border-b-2 transition-colors ${
                tab === key ? "border-primary text-primary" : "border-transparent text-gray-500 hover:text-gray-300"
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {/* ── Tab content ─────────────────────────────────────────────── */}
        {loadingData ? (
          <div className="flex justify-center py-16">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
          </div>
        ) : (
          <>
            {tab === "portfolio" && <PortfolioTab positions={positions} />}
            {tab === "actividad" && <ActivityTab userId={user.id} />}
          </>
        )}
      </div>
    </Shell>
  );
}

export default function Page() {
  return (
    <UserProvider>
      <ProfilePage />
    </UserProvider>
  );
}
