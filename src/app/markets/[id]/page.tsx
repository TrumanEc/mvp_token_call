"use client";

import { useState, useEffect, use } from "react";
import { useRouter } from "next/navigation";
import { UserProvider, useUser } from "@/contexts/UserContext";
import { Shell } from "@/components/layout/Shell";
import { PriceChart } from "@/components/markets/PriceChart";
import { PredictionCard } from "@/components/markets/PredictionCard";
import { OrderbookDisplay } from "@/components/markets/OrderbookDisplay";
import { SellPositionForm } from "@/components/markets/SellPositionForm";

function MarketDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const { user, loading, refreshBalance } = useUser();
  const [market, setMarket] = useState<any>(null);
  const [loadingMarket, setLoadingMarket] = useState(true);
  const [sellingPositionId, setSellingPositionId] = useState<string | null>(null);

  const fetchMarket = () => {
    fetch(`/api/markets/${id}`)
      .then((r) => r.json())
      .then(setMarket)
      .catch(() => {})
      .finally(() => setLoadingMarket(false));
  };

  useEffect(() => {
    if (!loading && !user) {
      router.push("/");
    }
  }, [user, loading, router]);

  useEffect(() => {
    fetchMarket();
  }, [id]);

  const handleTransactionSuccess = () => {
    fetchMarket();
    refreshBalance();
  };

  if (loading || !user || loadingMarket) {
    return (
      <div className="min-h-screen bg-[#0a0a0a] flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[#64c883]" />
      </div>
    );
  }

  if (!market) {
    return (
      <Shell>
        <div className="text-center py-12 text-gray-500">
          Mercado no encontrado
        </div>
      </Shell>
    );
  }

  const totalVolume = market.yesPool + market.noPool;

  return (
    <Shell>
      <div className="max-w-[1200px] mx-auto pt-4 px-4">
        {/* Top Header: Question */}
        <div className="mb-12">
          <button
            onClick={() => router.back()}
            className="text-gray-400 hover:text-white text-xs font-bold uppercase tracking-wider mb-6 block transition-colors"
          >
            ← Volver
          </button>
          <h1 className="text-[32px] md:text-[40px] font-bold text-white leading-tight lg:max-w-3xl">
            {market.question}
          </h1>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-[1fr_400px] gap-12 items-start">
          {/* Left Column: Chart and Odds */}
          <div className="space-y-16">
            {/* Probability Large Display */}
            <div className="flex items-baseline gap-4">
              <span className="text-[64px] font-extrabold text-white leading-none tracking-tighter">
                {market.odds.yesOdds.toFixed(0)}%
              </span>
              <span className="text-sm font-bold text-gray-400 uppercase tracking-[0.1em]">
                Chance
              </span>
            </div>

            {/* Price Chart */}
            <div className="relative pb-8">
              <PriceChart data={market.history} height={350} showNo={false} />
              {/* Bottom Volume Info */}
              <div className="absolute bottom-[-4px] left-0 flex items-center gap-6">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-bold text-gray-400 capitalize">
                    Vol.:
                  </span>
                  <span className="text-xl font-extrabold text-white leading-none">
                    $ {totalVolume.toLocaleString()}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-sm font-bold text-gray-400 capitalize">
                    Liquidez:
                  </span>
                  <span className="text-sm font-bold text-gray-300 leading-none">
                    $ {(market.seedCost || 0).toFixed(2)}
                  </span>
                </div>
              </div>
            </div>

            {/* LMSR Audit Data */}
            <details className="group pt-4">
              <summary className="flex items-center gap-2 cursor-pointer text-[10px] font-bold uppercase tracking-[0.15em] text-gray-500 hover:text-gray-300 transition-colors select-none">
                <span className="group-open:rotate-90 transition-transform text-xs">
                  ▶
                </span>
                Datos LMSR / Auditoría
              </summary>
              <div className="mt-4 grid grid-cols-2 md:grid-cols-3 gap-3">
                {/* Liquidity */}
                <div className="bg-[#111] border border-white/5 rounded-xl p-3">
                  <div className="text-[9px] font-bold text-gray-500 uppercase tracking-wider">
                    Parámetro b
                  </div>
                  <div className="text-lg font-extrabold text-white mt-1">
                    {market.b}
                  </div>
                  <div className="text-[9px] text-gray-600 mt-0.5">
                    Liquidez del market maker
                  </div>
                </div>
                {/* Seed Cost */}
                <div className="bg-[#111] border border-white/5 rounded-xl p-3">
                  <div className="text-[9px] font-bold text-gray-500 uppercase tracking-wider">
                    Seed Cost
                  </div>
                  <div className="text-lg font-extrabold text-white mt-1">
                    $ {(market.seedCost || 0).toFixed(2)}
                  </div>
                  <div className="text-[9px] text-gray-600 mt-0.5">
                    b × ln(2) = subsidio inicial
                  </div>
                </div>
                {/* Platform Fee */}
                <div className="bg-[#111] border border-white/5 rounded-xl p-3">
                  <div className="text-[9px] font-bold text-gray-500 uppercase tracking-wider">
                    Fee Plataforma
                  </div>
                  <div className="text-lg font-extrabold text-white mt-1">
                    {((market.platformFee || 0.1) * 100).toFixed(0)}%
                  </div>
                  <div className="text-[9px] text-gray-600 mt-0.5">
                    Comisión por trade
                  </div>
                </div>
                {/* Shares YES */}
                <div className="bg-[#111] border border-white/5 rounded-xl p-3">
                  <div className="text-[9px] font-bold text-[#64c883] uppercase tracking-wider">
                    qYes (Shares)
                  </div>
                  <div className="text-lg font-extrabold text-white mt-1">
                    {(market.qYes || 0).toFixed(2)}
                  </div>
                  <div className="text-[9px] text-gray-600 mt-0.5">
                    Shares YES acumulados
                  </div>
                </div>
                {/* Shares NO */}
                <div className="bg-[#111] border border-white/5 rounded-xl p-3">
                  <div className="text-[9px] font-bold text-[#e16464] uppercase tracking-wider">
                    qNo (Shares)
                  </div>
                  <div className="text-lg font-extrabold text-white mt-1">
                    {(market.qNo || 0).toFixed(2)}
                  </div>
                  <div className="text-[9px] text-gray-600 mt-0.5">
                    Shares NO acumulados
                  </div>
                </div>
                {/* Prices */}
                <div className="bg-[#111] border border-white/5 rounded-xl p-3">
                  <div className="text-[9px] font-bold text-gray-500 uppercase tracking-wider">
                    Precios LMSR
                  </div>
                  <div className="flex gap-3 mt-1">
                    <span className="text-base font-extrabold text-[#64c883]">
                      Y ${(market.odds.yesOdds / 100).toFixed(2)}
                    </span>
                    <span className="text-base font-extrabold text-[#e16464]">
                      N ${(market.odds.noOdds / 100).toFixed(2)}
                    </span>
                  </div>
                  <div className="text-[9px] text-gray-600 mt-0.5">
                    Precio por share (YES/NO)
                  </div>
                </div>
                {/* YES Pool */}
                <div className="bg-[#111] border border-white/5 rounded-xl p-3">
                  <div className="text-[9px] font-bold text-[#64c883] uppercase tracking-wider">
                    Pool YES
                  </div>
                  <div className="text-lg font-extrabold text-white mt-1">
                    $ {market.yesPool.toFixed(2)}
                  </div>
                  <div className="text-[9px] text-gray-600 mt-0.5">
                    Total apostado a YES
                  </div>
                </div>
                {/* NO Pool */}
                <div className="bg-[#111] border border-white/5 rounded-xl p-3">
                  <div className="text-[9px] font-bold text-[#e16464] uppercase tracking-wider">
                    Pool NO
                  </div>
                  <div className="text-lg font-extrabold text-white mt-1">
                    $ {market.noPool.toFixed(2)}
                  </div>
                  <div className="text-[9px] text-gray-600 mt-0.5">
                    Total apostado a NO
                  </div>
                </div>
                {/* Max Pool */}
                <div className="bg-[#111] border border-white/5 rounded-xl p-3">
                  <div className="text-[9px] font-bold text-gray-500 uppercase tracking-wider">
                    Cap Máximo
                  </div>
                  <div className="text-lg font-extrabold text-white mt-1">
                    {market.maxPool
                      ? `$ ${market.maxPool.toLocaleString()}`
                      : "Ilimitado"}
                  </div>
                  <div className="text-[9px] text-gray-600 mt-0.5">
                    Límite de mercado
                  </div>
                </div>
                {/* Max Bet Amount */}
                <div className="bg-[#111] border border-white/5 rounded-xl p-3">
                  <div className="text-[9px] font-bold text-gray-500 uppercase tracking-wider">
                    CAP Pago ($)
                  </div>
                  <div className="text-lg font-extrabold text-white mt-1">
                    {market.maxBetAmount
                      ? `$ ${market.maxBetAmount.toLocaleString()}`
                      : "Ilimitado"}
                  </div>
                  <div className="text-[9px] text-gray-600 mt-0.5">
                    Límite por transacción
                  </div>
                </div>
                {/* Max Price Impact */}
                <div className="bg-[#111] border border-white/5 rounded-xl p-3">
                  <div className="text-[9px] font-bold text-gray-500 uppercase tracking-wider">
                    CAP Impacto (%)
                  </div>
                  <div className="text-lg font-extrabold text-white mt-1">
                    {market.maxPriceImpact
                      ? `${market.maxPriceImpact}%`
                      : "Ilimitado"}
                  </div>
                  <div className="text-[9px] text-gray-600 mt-0.5">
                    Impacto por transacción
                  </div>
                </div>
                {/* Max Payout (YES Outcome) */}
                <div className="bg-[#111] border border-white/5 rounded-xl p-3">
                  <div className="text-[9px] font-bold text-yellow-500 uppercase tracking-wider">
                    Max Payout (YES Outcome)
                  </div>
                  <div className="text-lg font-extrabold text-white mt-1">
                    $ {(market.qYes || 0).toFixed(2)}
                  </div>
                  <div className="text-[9px] text-gray-600 mt-0.5">
                    Payout si el settlement es YES
                  </div>
                </div>
                {/* Max Payout (NO Outcome) */}
                <div className="bg-[#111] border border-white/5 rounded-xl p-3">
                  <div className="text-[9px] font-bold text-yellow-500 uppercase tracking-wider">
                    Max Payout (NO Outcome)
                  </div>
                  <div className="text-lg font-extrabold text-white mt-1">
                    $ {(market.qNo || 0).toFixed(2)}
                  </div>
                  <div className="text-[9px] text-gray-600 mt-0.5">
                    Payout si el settlement es NO
                  </div>
                </div>
                {/* Collected Fees */}
                <div className="bg-[#111] border border-white/5 rounded-xl p-3">
                  <div className="text-[9px] font-bold text-gray-500 uppercase tracking-wider">
                    Fees Recolectados
                  </div>
                  <div className="text-lg font-extrabold text-white mt-1">
                    $ {(totalVolume * (market.platformFee || 0.1)).toFixed(2)}
                  </div>
                  <div className="text-[9px] text-gray-600 mt-0.5">
                    {((market.platformFee || 0.1) * 100).toFixed(0)}% del
                    volumen
                  </div>
                </div>
                {/* PnL YES Outcome */}
                <div className="bg-[#111] border border-white/5 rounded-xl p-3">
                  <div className="text-[9px] font-bold text-gray-500 uppercase tracking-wider">
                    PnL WIN (YES Outcome)
                  </div>
                  {(() => {
                    const maxPayout = market.qYes || 0;
                    const pnl = totalVolume - maxPayout;
                    return (
                      <>
                        <div
                          className={`text-lg font-extrabold mt-1 ${pnl >= 0 ? "text-[#64c883]" : "text-[#e16464]"}`}
                        >
                          {pnl >= 0 ? "+" : ""}${pnl.toFixed(2)}
                        </div>
                        <div className="text-[9px] text-gray-600 mt-0.5">
                          PnL si el settlement es YES
                        </div>
                      </>
                    );
                  })()}
                </div>
                {/* PnL NO Outcome */}
                <div className="bg-[#111] border border-white/5 rounded-xl p-3">
                  <div className="text-[9px] font-bold text-gray-500 uppercase tracking-wider">
                    PnL WIN (NO Outcome)
                  </div>
                  {(() => {
                    const maxPayout = market.qNo || 0;
                    const pnl = totalVolume - maxPayout;
                    return (
                      <>
                        <div
                          className={`text-lg font-extrabold mt-1 ${pnl >= 0 ? "text-[#64c883]" : "text-[#e16464]"}`}
                        >
                          {pnl >= 0 ? "+" : ""}${pnl.toFixed(2)}
                        </div>
                        <div className="text-[9px] text-gray-600 mt-0.5">
                          PnL si el settlement es NO
                        </div>
                      </>
                    );
                  })()}
                </div>
              </div>
            </details>

            {/* Active Positions */}
            {market.positions.length > 0 && (
              <div className="space-y-6 pt-8 border-t border-white/5">
                <h2 className="text-[10px] font-bold uppercase tracking-[0.1em] text-gray-400">
                  Posiciones Activas ({market.positions.length})
                </h2>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {market.positions.map((pos: any) => (
                    <div key={pos.id} className="bg-[#121212] border border-white/5 rounded-2xl p-4 flex flex-col gap-4 group hover:border-white/10 transition-all">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-4">
                          <div
                            className={`w-10 h-10 rounded-full flex items-center justify-center font-bold text-xs ${
                              pos.side === "YES"
                                ? "bg-[#64c883]/10 text-[#64c883]"
                                : "bg-[#e16464]/10 text-[#e16464]"
                            }`}
                          >
                            {pos.side}
                          </div>
                          <div>
                            <div className="text-sm font-bold text-white group-hover:text-[#64c883] transition-colors">
                              {pos.currentOwner.username
                                ? `@${pos.currentOwner.username}`
                                : pos.currentOwner.email?.split("@")[0] ||
                                  "Usuario"}
                            </div>
                            <div className="flex items-center gap-2 mt-0.5">
                              <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">
                                {new Date(pos.createdAt).toLocaleDateString()}
                              </span>
                              {pos.isForSale && (
                                <span className="bg-blue-500/20 text-blue-400 text-[8px] px-1.5 py-0.5 rounded font-bold uppercase tracking-wider">
                                  En Venta
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                        <div className="text-right">
                          <div className="text-base font-bold text-white flex items-baseline justify-end gap-1">
                            <span>{pos.shares ? pos.shares.toFixed(1) : "0"}</span>
                            <span className="text-[10px] text-gray-400 font-normal uppercase">sh</span>
                          </div>
                          {pos.initialProbability && (
                            <div className="text-[9px] font-bold text-gray-400 uppercase mt-0.5">
                              Compró @ {pos.initialProbability.toFixed(1)}%
                            </div>
                          )}
                        </div>
                      </div>

                      {user && user.id === pos.currentOwner.id && !pos.isForSale && pos.shares > 0 && (
                        <div>
                          {sellingPositionId === pos.id ? (
                            <SellPositionForm
                              marketId={market.id}
                              userId={user.id}
                              positionId={pos.id}
                              maxShares={pos.shares}
                              side={pos.side}
                              onSuccess={() => {
                                setSellingPositionId(null);
                                handleTransactionSuccess();
                              }}
                              onCancel={() => setSellingPositionId(null)}
                            />
                          ) : (
                            <button
                              onClick={() => setSellingPositionId(pos.id)}
                              className="w-full mt-2 py-2 border border-white/10 rounded-lg text-[10px] font-bold uppercase text-gray-400 hover:text-white hover:bg-white/5 transition-colors"
                            >
                              Vender Shares (Limit)
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
            
            {/* Orderbook Depth Display */}
            <div className="pt-8 border-t border-white/5 space-y-6">
               <h2 className="text-[10px] font-bold uppercase tracking-[0.1em] text-gray-400">
                  Profundidad del Mercado (Orderbook Limit)
               </h2>
               <OrderbookDisplay orders={market.orders || []} />
            </div>
          </div>

          {/* Right Column: Prediction Interaction (Yes/No Buttons + Form) */}
          <div className="sticky top-24">
            <PredictionCard
              market={market}
              userId={user.id}
              userBalance={user.balance}
              onSuccess={handleTransactionSuccess}
            />

            <div className="mt-8 space-y-4">
              <div className="flex justify-between items-center text-[10px] font-bold uppercase tracking-wider text-gray-400 border-t border-white/5 pt-6">
                <span>Resolución</span>
                <span className="text-gray-300">
                  {new Date(market.resolutionDate).toLocaleDateString()}
                </span>
              </div>
              <div className="flex justify-between items-center text-[10px] font-bold uppercase tracking-wider text-gray-400">
                <span>Plataforma</span>
                <span className="text-gray-300">WIN</span>
              </div>
            </div>
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
