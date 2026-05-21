"use client";

import { useState, useEffect, use, Suspense } from "react";
import { useRouter } from "next/navigation";
import { UserProvider, useUser } from "@/contexts/UserContext";
import { Shell } from "@/components/layout/Shell";
import { PriceChart } from "@/components/markets/PriceChart";
import { PredictionCard } from "@/components/markets/PredictionCard";
import { MarketRules } from "@/components/markets/MarketRules";
import { MarketActivity } from "@/components/markets/MarketActivity";
import { MarketDiscussion } from "@/components/markets/MarketDiscussion";
import { getMarketVisual } from "@/lib/market-visual";

type BottomTab = "actividad" | "mi-actividad" | "discusion";

function MarketDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const { user, loading, refreshBalance } = useUser();
  const [market, setMarket] = useState<any>(null);
  const [loadingMarket, setLoadingMarket] = useState(true);
  const [mobileTab, setMobileTab] = useState<"trade" | "info">("trade");
  const [bottomTab, setBottomTab] = useState<BottomTab>("actividad");

  const fetchMarket = () => {
    fetch(`/api/markets/${id}`)
      .then((r) => r.json())
      .then(setMarket)
      .catch(() => {})
      .finally(() => setLoadingMarket(false));
  };

  useEffect(() => {
    if (!loading && !user) router.push("/");
  }, [user, loading, router]);

  useEffect(() => { fetchMarket() }, [id]);

  const handleTransactionSuccess = () => {
    fetchMarket();
    refreshBalance();
  };

  if (loading || !user || loadingMarket) {
    return (
      <div className="min-h-screen bg-win-bg flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary" />
      </div>
    );
  }

  if (!market || market.error) {
    return (
      <Shell>
        <div className="text-center py-12 text-gray-500">Mercado no encontrado</div>
      </Shell>
    );
  }

  const totalVolume = market.totalPool ?? 0;
  const visual = getMarketVisual(market.id, market.question);
  const outcomes = market.outcomes ?? [];
  const isBinary = outcomes.length === 2 && outcomes[0]?.name === 'YES';
  const topOutcome = outcomes.length > 0
    ? outcomes.reduce((a: any, b: any) => a.probability > b.probability ? a : b)
    : null;
  const topProb = topOutcome?.probability ?? market.odds.yesOdds;
  const topLabel = isBinary
    ? `Chance ${topOutcome?.name ?? 'YES'}`
    : topOutcome?.name ?? '';

  // User has shares if they own any active position
  const userHasShares = market.positions.some(
    (p: any) => p.currentOwner.id === user.id && p.shares > 0
  );

  const myPositions = market.positions.filter(
    (p: any) => p.currentOwner.id === user.id && p.shares > 0
  );

  return (
    <Shell>
      <div className="max-w-[1200px] mx-auto">

        {/* ── Header compacto: icono + título + fechas ───────────────────── */}
        <div className="mb-8">
          <button
            onClick={() => router.back()}
            className="text-gray-500 hover:text-white text-[10px] font-bold uppercase tracking-wider mb-4 flex items-center gap-1.5 transition-colors"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
            </svg>
            Volver
          </button>

          <div className="flex items-start gap-4">
            {/* Market icon */}
            <div className="flex-shrink-0 w-14 h-14 rounded-2xl overflow-hidden border border-white/8">
              {market.imageUrl ? (
                <img src={market.imageUrl} alt="" className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-3xl" style={{ background: visual.gradient }}>
                  {visual.emoji}
                </div>
              )}
            </div>

            <div className="flex-1 min-w-0">
              <h1 className="text-xl font-extrabold text-white leading-snug mb-2">
                {market.question}
              </h1>
              {/* Fechas */}
              <div className="flex items-center gap-4 text-[11px] font-semibold text-gray-500">
                <span className="flex items-center gap-1.5">
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                  </svg>
                  <span className="text-gray-600">Abre</span>
                  <span className="text-gray-400">
                    {new Date(market.createdAt).toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' })}
                  </span>
                </span>
                <span className="text-gray-700">·</span>
                <span className="flex items-center gap-1.5">
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <span className="text-gray-600">Cierra</span>
                  <span className="text-gray-400">
                    {new Date(market.resolutionDate).toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' })}
                  </span>
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* ── Mobile tab switcher ────────────────────────────────────────── */}
        <div className="flex border-b border-white/10 lg:hidden mb-6">
          {(["trade", "info"] as const).map((t) => (
            <button
              key={t}
              onClick={() => setMobileTab(t)}
              className={`py-2.5 px-4 text-[10px] font-bold uppercase tracking-wider flex-1 text-center border-b-2 transition-colors ${
                mobileTab === t ? "border-primary text-primary" : "border-transparent text-gray-400"
              }`}
            >
              {t === "trade" ? "Operar" : "Info"}
            </button>
          ))}
        </div>

        {/* ── Main two-column grid ───────────────────────────────────────── */}
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_380px] gap-10 items-start">

          {/* Left column: chart + rules */}
          <div className={`space-y-8 ${mobileTab === "info" ? "block" : "block lg:block"} ${mobileTab === "trade" ? "hidden lg:block" : ""}`}>

            {/* Probability + chart */}
            <div>
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-baseline gap-3">
                  <span className="text-[56px] font-extrabold text-white leading-none tracking-tighter">
                    {topProb.toFixed(0)}%
                  </span>
                  <span className="text-sm font-bold text-gray-400 uppercase tracking-[0.1em]">
                    {topLabel}
                  </span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">Vol.</span>
                  <span className="text-sm font-extrabold text-white leading-none">
                    ${totalVolume.toLocaleString()}
                  </span>
                </div>
              </div>

              {/* Multi-outcome probability bars */}
              {!isBinary && outcomes.length > 2 && (
                <div className="space-y-2 mb-5">
                  {outcomes.map((o: any, i: number) => {
                    const colors = ['#64c883', '#f87171', '#60a5fa', '#fbbf24', '#a78bfa', '#f472b6', '#34d399'];
                    const color = colors[i % colors.length];
                    return (
                      <div key={o.id} className="flex items-center gap-3">
                        <span className="text-[11px] text-gray-400 w-[100px] truncate font-medium">{o.name}</span>
                        <div className="flex-1 h-2 bg-white/5 rounded-full overflow-hidden">
                          <div
                            className="h-full rounded-full transition-all duration-700"
                            style={{ width: `${o.probability}%`, background: color }}
                          />
                        </div>
                        <span className="text-[12px] font-bold text-gray-200 w-[40px] text-right">{o.probability.toFixed(0)}%</span>
                      </div>
                    );
                  })}
                </div>
              )}

              <PriceChart data={market.history} height={300} outcomes={outcomes} />
            </div>

            {/* Market Rules */}
            <MarketRules market={market} />
          </div>

          {/* Right column: prediction card + my positions */}
          <div className={`sticky top-24 space-y-5 ${mobileTab === "trade" ? "block" : "hidden lg:block"}`}>
            <Suspense fallback={null}>
              <PredictionCard
                market={market}
                userId={user.id}
                userBalance={user.balance}
                onSuccess={handleTransactionSuccess}
                prefillOrder={null}
              />
            </Suspense>

            {/* Quick market meta */}
            <div className="bg-win-card rounded-2xl border border-white/5 p-4 space-y-0">
              <div className="flex justify-between items-center py-2 border-b border-white/5 text-[10px] font-bold uppercase tracking-wider">
                <span className="text-gray-500">Resolución</span>
                <span className="text-gray-300">{new Date(market.resolutionDate).toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' })}</span>
              </div>
              <div className="flex justify-between items-center py-2 text-[10px] font-bold uppercase tracking-wider">
                <span className="text-gray-500">Plataforma</span>
                <span className="text-gray-300">WIN</span>
              </div>
            </div>

          </div>
        </div>

        {/* ── Bottom tabs: Actividad + Discusión ────────────────────────── */}
        <div className="mt-10">
          {/* Tab bar */}
          <div className="flex border-b border-white/10 mb-6">
            {([
              { key: "actividad",    label: "Actividad" },
              { key: "mi-actividad", label: "Mi actividad" },
              { key: "discusion",    label: "Discusión" },
            ] as { key: BottomTab; label: string }[]).map(({ key, label }) => (
              <button
                key={key}
                onClick={() => setBottomTab(key)}
                className={`py-3 px-5 text-[11px] font-bold uppercase tracking-wider border-b-2 transition-colors ${
                  bottomTab === key
                    ? "border-primary text-primary"
                    : "border-transparent text-gray-500 hover:text-gray-300"
                }`}
              >
                {label}
                {key === "discusion" && userHasShares && (
                  <span className="ml-2 inline-flex items-center justify-center w-1.5 h-1.5 rounded-full bg-primary" />
                )}
              </button>
            ))}
          </div>

          {/* Tab content */}
          <div className="max-w-2xl">
            {bottomTab === "actividad" && (
              <MarketActivity marketId={id} />
            )}
            {bottomTab === "mi-actividad" && (
              <MarketActivity marketId={id} userId={user.id} />
            )}
            {bottomTab === "discusion" && (
              <MarketDiscussion
                marketId={id}
                userId={user.id}
                canComment={userHasShares}
              />
            )}
          </div>
        </div>

      </div>
    </Shell>
  );
}

export default function Page({ params }: { params: Promise<{ id: string }> }) {
  return (
    <UserProvider>
      <MarketDetailPage params={params} />
    </UserProvider>
  );
}
