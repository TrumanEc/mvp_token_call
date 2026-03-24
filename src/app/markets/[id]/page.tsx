"use client";

import { useState, useEffect, use, Suspense } from "react";
import { useRouter } from "next/navigation";
import { UserProvider, useUser } from "@/contexts/UserContext";
import { Shell } from "@/components/layout/Shell";
import { PriceChart } from "@/components/markets/PriceChart";
import { PredictionCard } from "@/components/markets/PredictionCard";
import { OrderbookDisplay } from "@/components/markets/OrderbookDisplay";
import { SellPositionForm } from "@/components/markets/SellPositionForm";
import { getMarketVisual } from "@/lib/market-visual";

function MarketDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const { user, loading, refreshBalance } = useUser();
  const [market, setMarket] = useState<any>(null);
  const [loadingMarket, setLoadingMarket] = useState(true);
  const [sellingPositionId, setSellingPositionId] = useState<string | null>(
    null,
  );
  const [prefillOrder, setPrefillOrder] = useState<{
    side: "YES" | "NO";
    price: number;
    shares: number;
  } | null>(null);
  const [activeTab, setActiveTab] = useState<
    "trade" | "orderbook" | "activity"
  >("trade");

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

  if (!market || market.error) {
    return (
      <Shell>
        <div className="text-center py-12 text-gray-500">
          Mercado no encontrado
        </div>
      </Shell>
    );
  }

  const totalVolume = market.yesPool + market.noPool;
  const visual = getMarketVisual(market.id, market.question);

  return (
    <Shell>
      <div className="max-w-[1200px] mx-auto pt-0 px-0">
        {/* Hero banner */}
        <div
          className="relative rounded-3xl overflow-hidden mb-10 h-48 flex items-end"
          style={{ background: visual.gradient }}
        >
          {/* Decorative blobs */}
          <div
            className="absolute -top-10 -right-10 w-64 h-64 rounded-full opacity-20 blur-3xl"
            style={{ background: visual.to }}
          />
          <div
            className="absolute -bottom-8 -left-8 w-48 h-48 rounded-full opacity-15 blur-2xl"
            style={{ background: visual.to }}
          />

          {/* Emoji centered */}
          <span
            className="absolute top-1/2 right-10 -translate-y-1/2 text-[80px] opacity-30 select-none drop-shadow-2xl"
            aria-hidden
          >
            {visual.emoji}
          </span>

          {/* Content overlay */}
          <div className="relative z-10 p-8 w-full">
            <button
              onClick={() => router.back()}
              className="text-white/60 hover:text-white text-[10px] font-bold uppercase tracking-wider mb-3 block transition-colors"
            >
              ← Volver
            </button>
            <h1 className="text-2xl md:text-3xl font-extrabold text-white leading-tight lg:max-w-2xl drop-shadow">
              {market.question}
            </h1>
          </div>
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

            {/* Mobile Tabs */}
            <div className="flex border-b border-white/10 lg:hidden mt-0 mb-4">
              <button
                onClick={() => setActiveTab("trade")}
                className={`py-3 px-4 text-[10px] font-bold uppercase tracking-wider flex-1 text-center border-b-2 transition-colors ${activeTab === "trade" ? "border-[#64c883] text-[#64c883]" : "border-transparent text-gray-400 hover:text-white"}`}
              >
                Operar
              </button>
              <button
                onClick={() => setActiveTab("orderbook")}
                className={`py-3 px-4 text-[10px] font-bold uppercase tracking-wider flex-1 text-center border-b-2 transition-colors ${activeTab === "orderbook" ? "border-[#64c883] text-[#64c883]" : "border-transparent text-gray-400 hover:text-white"}`}
              >
                Orderbook
              </button>
              <button
                onClick={() => setActiveTab("activity")}
                className={`py-3 px-4 text-[10px] font-bold uppercase tracking-wider flex-1 text-center border-b-2 transition-colors ${activeTab === "activity" ? "border-[#64c883] text-[#64c883]" : "border-transparent text-gray-400 hover:text-white"}`}
              >
                Actividad
              </button>
            </div>

            {/* Active Positions - other users only (own positions shown in right column) */}
            {market.positions.filter((p: any) => p.currentOwner.id !== user.id)
              .length > 0 && (
              <div
                className={`space-y-6 lg:pt-8 lg:block ${activeTab === "activity" ? "block pt-4" : "hidden"}`}
              >
                <h2 className="text-[10px] font-bold uppercase tracking-[0.1em] text-gray-400">
                  Posiciones Activas (
                  {
                    market.positions.filter(
                      (p: any) => p.currentOwner.id !== user.id,
                    ).length
                  }
                  )
                </h2>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {market.positions
                    .filter((p: any) => p.currentOwner.id !== user.id)
                    .map((pos: any) => (
                      <div
                        key={pos.id}
                        className={`bg-[#121212] border border-white/5 rounded-2xl p-4 flex flex-col gap-4 group transition-all ${pos.shares === 0 ? "opacity-50 grayscale" : "hover:border-white/10"}`}
                      >
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
                              <div className="text-sm font-bold text-white group-hover:text-[#64c883] transition-colors flex items-center gap-2">
                                {pos.currentOwner.username
                                  ? `@${pos.currentOwner.username}`
                                  : pos.currentOwner.email?.split("@")[0] ||
                                    "Usuario"}
                                {pos.shares === 0 && (
                                  <span className="text-[8px] bg-gray-500/20 text-gray-400 px-1.5 py-0.5 rounded uppercase tracking-wider">
                                    Vendida
                                  </span>
                                )}
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
                          <div className="text-right flex flex-col items-end">
                            <div
                              className={`text-base font-bold flex items-baseline justify-end gap-1 ${pos.shares === 0 ? "text-gray-500 line-through" : "text-white"}`}
                            >
                              <span>
                                {pos.shares > 0
                                  ? pos.shares.toFixed(2)
                                  : "0.00"}
                              </span>
                              <span className="text-[10px] text-gray-400 font-normal uppercase ml-1">
                                {pos.shares === 0 ? "(Sold)" : "sh"}
                              </span>
                            </div>
                            <div className="text-[11px] font-bold text-[#64c883] mt-0.5">
                              $
                              {pos.amount
                                ? pos.amount.toLocaleString(undefined, {
                                    minimumFractionDigits: 2,
                                    maximumFractionDigits: 2,
                                  })
                                : "0.00"}{" "}
                              <span className="text-gray-500 font-normal text-[9px] ml-0.5">
                                inv. original
                              </span>
                            </div>
                            <div className="text-[9px] font-bold text-gray-400 uppercase mt-1">
                              Avg. original $
                              {(pos.shares > 0 && pos.amount > 0
                                ? pos.amount / pos.shares
                                : pos.purchasePrice || 0
                              ).toFixed(2)}{" "}
                              c/u
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}
                </div>
              </div>
            )}

            {/* Orderbook Depth Display */}
            <div
              className={`lg:pt-8 space-y-6 lg:border-t border-white/5 lg:block ${activeTab === "orderbook" ? "block pt-4 border-t-0" : "hidden"}`}
            >
              <h2 className="text-[10px] font-bold uppercase tracking-[0.1em] text-gray-400">
                Profundidad del Mercado (Orderbook Limit)
              </h2>
              <OrderbookDisplay
                orders={market.orders || []}
                onOrderClick={(side, price, shares) => {
                  setPrefillOrder({ side, price, shares });
                  setActiveTab("trade");
                }}
              />
            </div>
          </div>

          {/* Right Column: Prediction Interaction + My Positions */}
          <div
            className={`sticky top-24 space-y-6 lg:block ${activeTab === "trade" ? "block" : "hidden"}`}
          >
            <Suspense fallback={null}>
              <PredictionCard
                market={market}
                userId={user.id}
                userBalance={user.balance}
                onSuccess={handleTransactionSuccess}
                prefillOrder={prefillOrder}
              />
            </Suspense>
            <div className="space-y-4 pt-2 ">
              <div className="flex justify-between items-center text-[10px] font-bold uppercase tracking-wider text-gray-400 border-t border-white/5 pt-4">
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
            {/* My positions in this market */}
            <div className="border-t border-white/5" />

            {market.positions.filter((p: any) => p.currentOwner.id === user.id)
              .length > 0 && (
              <div className="space-y-3">
                <h2 className="text-[10px] font-bold uppercase tracking-[0.1em] text-gray-400">
                  Mis Posiciones
                </h2>
                <div className="space-y-3">
                  {market.positions
                    .filter((p: any) => p.currentOwner.id === user.id)
                    .map((pos: any) => (
                      <div
                        key={pos.id}
                        className={`bg-[#121212] border rounded-2xl p-4 flex flex-col gap-3 transition-all ${
                          pos.shares === 0
                            ? "opacity-40 grayscale border-white/5"
                            : "border-white/10 hover:border-white/20"
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            <div
                              className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-[10px] ${
                                pos.side === "YES"
                                  ? "bg-[#64c883]/15 text-[#64c883]"
                                  : "bg-[#e16464]/15 text-[#e16464]"
                              }`}
                            >
                              {pos.side}
                            </div>
                            <div>
                              <div className="flex items-center gap-2">
                                <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">
                                  {new Date(pos.createdAt).toLocaleDateString()}
                                </span>
                                {pos.shares === 0 && (
                                  <span className="text-[8px] bg-gray-500/20 text-gray-400 px-1.5 py-0.5 rounded uppercase tracking-wider">
                                    Vendida
                                  </span>
                                )}
                                {pos.isForSale && pos.shares > 0 && (
                                  <span className="bg-blue-500/20 text-blue-400 text-[8px] px-1.5 py-0.5 rounded font-bold uppercase tracking-wider">
                                    En Venta
                                  </span>
                                )}
                              </div>
                            </div>
                          </div>
                          <div className="text-right">
                            <div
                              className={`text-sm font-bold ${pos.shares === 0 ? "text-gray-500 line-through" : "text-white"}`}
                            >
                              {pos.shares > 0 ? pos.shares.toFixed(2) : "0.00"}
                              <span className="text-[10px] text-gray-500 ml-1 font-normal">
                                {pos.shares === 0 ? "(Sold)" : "sh"}
                              </span>
                            </div>
                            <div className="text-[11px] text-[#64c883] font-bold">
                              $
                              {pos.amount
                                ? pos.amount.toLocaleString(undefined, {
                                    minimumFractionDigits: 2,
                                    maximumFractionDigits: 2,
                                  })
                                : "0.00"}
                              <span className="text-gray-500 font-normal text-[9px] ml-1">
                                inv.
                              </span>
                            </div>
                          </div>
                        </div>

                        {/* Stats row */}
                        {pos.shares > 0 && (
                          <div className="grid grid-cols-3 gap-2 pt-2 border-t border-white/5">
                            <div className="text-center">
                              <div className="text-[9px] text-gray-500 uppercase tracking-wider">
                                Precio comp.
                              </div>
                              <div className="text-xs font-bold text-white mt-0.5">
                                $
                                {(pos.shares > 0 && pos.amount > 0
                                  ? pos.amount / pos.shares
                                  : pos.purchasePrice || 0
                                ).toFixed(4)}
                              </div>
                            </div>
                            <div className="text-center">
                              <div className="text-[9px] text-gray-500 uppercase tracking-wider">
                                Valor Mkt.
                              </div>
                              <div className="text-xs font-bold text-white mt-0.5">
                                ${(pos.fairValue || 0).toFixed(2)}
                              </div>
                            </div>
                            <div className="text-center">
                              <div className="text-[9px] text-gray-500 uppercase tracking-wider">
                                Si gana {pos.side}
                              </div>
                              <div
                                className={`text-xs font-bold mt-0.5 ${pos.shares > 0 ? "text-[#64c883]" : "text-gray-500"}`}
                              >
                                ${pos.shares.toFixed(2)}
                              </div>
                            </div>
                          </div>
                        )}

                        {!pos.isForSale && pos.shares > 0 && (
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
                                className="w-full py-1.5 border border-orange-500/40 rounded-lg text-[9px] font-bold uppercase text-orange-400 hover:text-white hover:bg-orange-500/20 hover:border-orange-500/60 transition-all"
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
