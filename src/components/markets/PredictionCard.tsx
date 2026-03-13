"use client";

import React, { useState, useEffect } from "react";
import { useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";

interface PredictionCardProps {
  market: any;
  userId: string;
  userBalance: number;
  onSuccess: () => void;
  prefillOrder?: { side: "YES" | "NO"; price: number; shares: number } | null;
}

// ─── BUY MODE ────────────────────────────────────────────────────────────────
function BuyForm({
  market,
  userId,
  userBalance,
  onSuccess,
  prefillOrder,
}: PredictionCardProps) {
  const [side, setSide] = useState<"YES" | "NO">("YES");
  const [amount, setAmount] = useState("");
  const [loading, setLoading] = useState(false);
  const [quoteLoading, setQuoteLoading] = useState(false);
  const [error, setError] = useState("");

  const [quote, setQuote] = useState<{
    shares: number;
    avgPrice: number;
    totalCost: number;
    newProbabilities: { yes: number; no: number };
    feeAmount?: number;
    platformFeeRate?: number;
    maxAllowedAmount: number;
    capReason: string | null;
    wouldExceedCap: boolean;
    lmsrShares?: number;
    obShares?: number;
    lmsrFeeAmount?: number;
    obFeeAmount?: number;
    lmsrFeeRate?: number;
    obFeeRate?: number;
  } | null>(null);

  const currentPrice =
    (side === "YES" ? market.odds.yesOdds : market.odds.noOdds) / 100;
  const amountNum = parseFloat(amount) || 0;
  const netAmount = quote
    ? quote.totalCost - (quote.feeAmount ?? 0)
    : amountNum * 0.9;
  const estimatedShares = quote
    ? quote.shares
    : netAmount > 0
      ? netAmount / currentPrice
      : 0;
  const potentialReturnValue = estimatedShares;
  const potentialProfit = potentialReturnValue - netAmount;
  const roi = netAmount > 0 ? (potentialProfit / netAmount) * 100 : 0;

  useEffect(() => {
    if (prefillOrder && prefillOrder.shares && prefillOrder.price) {
      setSide(prefillOrder.side);
      // Populate amount with the exact gross cost to consume that specific order size
      // Total cost without fee = price * shares
      // Gross cost = (price * shares) / (1 - platformFeeRate), but we don't know the exact fee rate here without quote.
      // We can just set amount to roughly what it takes (a bit more is fine, quote will adjust max)
      // Actually, since users see limit orders naturally, providing just price * shares is good enough to pre-fill close to it.
      const rawCost = prefillOrder.shares * prefillOrder.price;
      const estimatedGross = rawCost / 0.9; 
      setAmount(estimatedGross.toFixed(2));
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  }, [prefillOrder]);

  useEffect(() => {
    const fetchQuote = async () => {
      if (amountNum <= 0) { setQuote(null); return; }
      setQuoteLoading(true);
      try {
        const res = await fetch(
          `/api/markets/${market.id}/price-quote?side=${side}&amount=${amountNum}`
        );
        const data = await res.json();
        if (res.ok) setQuote(data);
        else setError(data.details || data.error || "Error al obtener cotización");
      } catch { /* swallow */ } finally { setQuoteLoading(false); }
    };
    const t = setTimeout(fetchQuote, 500);
    return () => clearTimeout(t);
  }, [amountNum, side, market.id]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (amountNum <= 0) { setError("Ingresa un monto válido"); return; }
    if (amountNum > userBalance) { setError("Saldo insuficiente"); return; }
    setLoading(true);
    try {
      const res = await fetch("/api/positions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ marketId: market.id, userId, side, amount: amountNum }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Error al crear posición");
      setAmount(""); setQuote(null); onSuccess();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error desconocido");
    } finally { setLoading(false); }
  };

  return (
    <>
      {/* YES / NO selector */}
      <div className="grid grid-cols-2 gap-4">
        <button
          type="button"
          onClick={() => setSide("YES")}
          className={`h-16 rounded-2xl flex flex-col items-center justify-center transition-all duration-300 transform hover:scale-[1.02] active:scale-[0.98] ${
            side === "YES"
              ? "bg-[#64c883] text-[#0a0a0a] shadow-lg shadow-[#64c883]/20"
              : "bg-[#1a2e21]/40 text-[#64c883]/60 border border-[#64c883]/10"
          }`}
        >
          <span className="text-xl font-bold">Yes</span>
          <span className="text-[10px] font-bold opacity-70">
            ${(market.odds.yesOdds / 100).toFixed(2)}
          </span>
        </button>
        <button
          type="button"
          onClick={() => setSide("NO")}
          className={`h-16 rounded-2xl flex flex-col items-center justify-center transition-all duration-300 transform hover:scale-[1.02] active:scale-[0.98] ${
            side === "NO"
              ? "bg-[#e16464] text-[#0a0a0a] shadow-lg shadow-[#e16464]/20"
              : "bg-[#2e1a1a]/40 text-[#e16464]/60 border border-[#e16464]/10"
          }`}
        >
          <span className="text-xl font-bold">No</span>
          <span className="text-[10px] font-bold opacity-70">
            ${(market.odds.noOdds / 100).toFixed(2)}
          </span>
        </button>
      </div>

      {/* Form */}
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="space-y-2">
          <div className="flex justify-between text-[11px] font-bold text-gray-500 uppercase tracking-wider px-1">
            <span>MONTO A INVERTIR</span>
            <span>Saldo: ${userBalance.toFixed(2)}</span>
          </div>
          <div className="relative group">
            <input
              type="number"
              placeholder="0.00"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="w-full bg-[#0d0d0d] border border-[#272727] rounded-xl px-4 py-3 text-white font-bold text-lg outline-none transition-all group-focus-within:border-[#64c883] group-focus-within:ring-1 group-focus-within:ring-[#64c883]/20"
            />
            <div className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-500 font-bold">$</div>
          </div>
        </div>

        {amountNum > 0 && (
          <div className="space-y-2">
            {quote?.feeAmount !== undefined && quote.feeAmount > 0 && (
              <>
                {quote.lmsrFeeAmount !== undefined && quote.lmsrFeeAmount > 0 && (
                  <div className="flex justify-between items-center px-4 py-3 bg-[#0d0d0d]/50 rounded-xl border border-white/5">
                    <span className="text-xs text-purple-400">Comisión WIN ({((quote.lmsrFeeRate ?? 0.1) * 100).toFixed(0)}%)</span>
                    <span className="text-sm font-bold text-[#e16464]">- ${quote.lmsrFeeAmount.toFixed(2)}</span>
                  </div>
                )}
                {quote.obFeeAmount !== undefined && quote.obFeeAmount > 0 && (
                  <div className="flex justify-between items-center px-4 py-3 bg-[#0d0d0d]/50 rounded-xl border border-white/5">
                    <span className="text-xs text-blue-400">Comisión P2P ({((quote.obFeeRate ?? 0.02) * 100).toFixed(0)}%)</span>
                    <span className="text-sm font-bold text-[#e16464]">- ${quote.obFeeAmount.toFixed(2)}</span>
                  </div>
                )}
                {(quote.lmsrFeeAmount === undefined || quote.lmsrFeeAmount === 0) && (quote.obFeeAmount === undefined || quote.obFeeAmount === 0) && quote.feeAmount > 0 && (
                  <div className="flex justify-between items-center px-4 py-3 bg-[#0d0d0d]/50 rounded-xl border border-white/5">
                    <span className="text-xs text-gray-400">Comisión WIN ({((quote.platformFeeRate ?? 0.1) * 100).toFixed(0)}%)</span>
                    <span className="text-sm font-bold text-[#e16464]">- ${quote.feeAmount.toFixed(2)}</span>
                  </div>
                )}
                <div className="flex justify-between items-center px-4 py-3 bg-[#0d0d0d]/50 rounded-xl border border-white/5">
                  <span className="text-xs text-gray-400">Inversión Neta</span>
                  <span className="text-sm font-bold text-white">${(quote.totalCost - quote.feeAmount).toFixed(2)}</span>
                </div>
                <div className="flex justify-between items-center px-4 py-3 bg-[#0d0d0d]/50 rounded-xl border border-white/5">
                  <span className="text-xs text-gray-400">Costo Total</span>
                  <span className="text-sm font-bold text-white">${quote.totalCost.toFixed(2)}</span>
                </div>
              </>
            )}
            <div className="flex flex-col px-4 py-3 bg-[#0d0d0d]/50 rounded-xl border border-white/5 space-y-2">
              <div className="flex justify-between items-center">
                <span className="text-xs text-gray-400">Acciones Estimadas</span>
                <span className="text-sm font-bold text-white">
                  {quoteLoading ? "..." : estimatedShares.toFixed(2)}
                </span>
              </div>
              {!quoteLoading && quote && (quote.lmsrShares || 0) + (quote.obShares || 0) > 0 && (
                <div className="pt-1">
                  <div className="w-full h-1.5 bg-white/5 rounded-full overflow-hidden flex">
                    {(quote.obShares || 0) > 0 && (
                      <div style={{ width: `${(quote.obShares! / quote.shares) * 100}%` }} className="h-full bg-blue-500" />
                    )}
                    {(quote.lmsrShares || 0) > 0 && (
                      <div style={{ width: `${(quote.lmsrShares! / quote.shares) * 100}%` }} className="h-full bg-purple-500" />
                    )}
                  </div>
                  <div className="flex justify-between mt-1.5 text-[9px] font-bold uppercase tracking-wider">
                    {(quote.obShares || 0) > 0 ? (
                      <span className="text-blue-400">P2P: {((quote.obShares! / quote.shares) * 100).toFixed(2)}%</span>
                    ) : <span />}
                    {(quote.lmsrShares || 0) > 0 ? (
                      <span className="text-purple-400">WIN: {((quote.lmsrShares! / quote.shares) * 100).toFixed(2)}%</span>
                    ) : <span />}
                  </div>
                </div>
              )}
            </div>
            <div className="flex justify-between items-center px-4 py-3 bg-[#0d0d0d]/50 rounded-xl border border-white/5">
              <span className="text-xs text-gray-400">Precio Promedio</span>
              <span className="text-sm font-bold text-white">
                {quoteLoading ? "..." : `$${(quote ? quote.avgPrice : currentPrice).toFixed(4)}`}
              </span>
            </div>
            {quote && (
              <div className="flex justify-between items-center px-4 py-3 bg-[#0d0d0d]/50 rounded-xl border border-white/5">
                <span className="text-xs text-gray-400">Nuevo Precio del Mercado</span>
                <div className="flex gap-3">
                  <span className="text-sm font-bold text-[#64c883]">Y ${quote.newProbabilities.yes.toFixed(2)}</span>
                  <span className="text-sm font-bold text-[#e16464]">N ${quote.newProbabilities.no.toFixed(2)}</span>
                </div>
              </div>
            )}
            <div className="flex justify-between items-center px-4 py-4 bg-[#64c883]/5 rounded-xl border border-[#64c883]/10">
              <span className="text-xs text-[#64c883]">Pago si gana {side} ({Math.max(0, roi).toFixed(0)}%)</span>
              <span className="text-base font-extrabold text-[#64c883]">
                {quoteLoading ? "..." : `$${potentialReturnValue.toFixed(2)}`}
              </span>
            </div>
          </div>
        )}

        {quote?.wouldExceedCap && (
          <div className="bg-[#e16464]/10 border border-[#e16464]/20 p-3 rounded-xl text-[#e16464] text-[11px] mb-2">
            <p className="font-bold mb-0.5">⚠️ Límite excedido</p>
            <p>{quote.capReason}</p>
            <p className="mt-1">Máximo permitido: <strong>${quote.maxAllowedAmount?.toFixed(2)}</strong></p>
            <button type="button" onClick={() => setAmount(quote.maxAllowedAmount?.toString() || "")}
              className="mt-2 text-[10px] font-extrabold underline uppercase tracking-tighter">
              Ajustar al máximo
            </button>
          </div>
        )}

        {error && <p className="text-[#e16464] text-xs text-center font-medium">{error}</p>}

        <Button
          type="submit"
          disabled={!amount || loading || quoteLoading || amountNum <= 0 || !!quote?.wouldExceedCap}
          loading={loading || quoteLoading}
          className={`w-full py-6 rounded-2xl text-lg font-bold transition-all shadow-xl ${
            side === "YES"
              ? "bg-[#64c883] text-[#0a0a0a] hover:bg-[#74db93] shadow-[#64c883]/20"
              : "bg-[#e16464] text-white hover:bg-[#ef7a7a] shadow-[#e16464]/20"
          }`}
        >
          Confirmar {side}
        </Button>
      </form>
    </>
  );
}

// ─── SELL MODE ────────────────────────────────────────────────────────────────
interface SellFormProps {
  market: any;
  userId: string;
  onSuccess: () => void;
}

function SellForm({ market, userId, onSuccess }: SellFormProps) {
  // myPositions = my active positions with shares > 0 and not already for sale
  const myPositions = (market.positions || []).filter(
    (p: any) => p.currentOwner.id === userId && p.shares > 0 && !p.isForSale
  );

  const [selectedPositionId, setSelectedPositionId] = useState<string>(
    myPositions[0]?.id || ""
  );
  const [sharesToSell, setSharesToSell] = useState("");
  const [pricePerShare, setPricePerShare] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);

  const selectedPos = myPositions.find((p: any) => p.id === selectedPositionId);
  const maxShares = selectedPos?.shares || 0;
  const numShares = parseFloat(sharesToSell) || 0;
  const numPrice = parseFloat(pricePerShare) || 0;
  const estimatedRevenue = numShares * numPrice;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (!selectedPos) { setError("Selecciona una posición"); return; }
    if (numShares <= 0 || numShares > maxShares) {
      setError(`Debes vender entre 0.01 y ${maxShares.toFixed(2)} shares`);
      return;
    }
    if (numPrice <= 0 || numPrice >= 1) {
      setError("El precio por share debe estar entre $0.01 y $0.99");
      return;
    }
    setLoading(true);
    try {
      const res = await fetch("/api/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          marketId: market.id,
          userId,
          positionId: selectedPositionId,
          shares: numShares,
          pricePerShare: numPrice,
          executionType: "LIMIT_SELL",
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Error al listar la orden");
      setSuccess(true);
      setSharesToSell(""); setPricePerShare("");
      setTimeout(() => { setSuccess(false); onSuccess(); }, 1200);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error desconocido");
    } finally { setLoading(false); }
  };

  if (myPositions.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-10 gap-3">
        <div className="text-4xl opacity-20">📭</div>
        <p className="text-gray-500 text-sm font-bold text-center">
          No tienes posiciones disponibles<br/>para vender en este mercado
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {/* Position selector */}
      {myPositions.length > 1 && (
        <div className="space-y-1">
          <div className="text-[10px] font-bold text-gray-500 uppercase tracking-wider px-1">
            Selecciona posición
          </div>
          <div className="grid gap-2">
            {myPositions.map((pos: any) => (
              <button
                key={pos.id}
                type="button"
                onClick={() => { setSelectedPositionId(pos.id); setSharesToSell(""); }}
                className={`flex items-center justify-between px-4 py-3 rounded-xl border transition-all text-left ${
                  selectedPositionId === pos.id
                    ? pos.side === "YES"
                      ? "border-[#64c883]/40 bg-[#64c883]/5"
                      : "border-[#e16464]/40 bg-[#e16464]/5"
                    : "border-white/5 bg-[#0d0d0d] hover:border-white/10"
                }`}
              >
                <div className="flex items-center gap-3">
                  <span className={`text-[10px] font-extrabold px-2 py-0.5 rounded ${
                    pos.side === "YES" ? "bg-[#64c883]/15 text-[#64c883]" : "bg-[#e16464]/15 text-[#e16464]"
                  }`}>
                    {pos.side}
                  </span>
                  <span className="text-xs text-gray-400">{new Date(pos.createdAt).toLocaleDateString()}</span>
                </div>
                <span className="text-sm font-bold text-white">{pos.shares.toFixed(2)} sh</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Single position info (if only one) */}
      {myPositions.length === 1 && selectedPos && (
        <div className={`flex items-center justify-between px-4 py-3 rounded-xl border ${
          selectedPos.side === "YES" ? "border-[#64c883]/20 bg-[#64c883]/5" : "border-[#e16464]/20 bg-[#e16464]/5"
        }`}>
          <div className="flex items-center gap-3">
            <span className={`text-[10px] font-extrabold px-2 py-0.5 rounded ${
              selectedPos.side === "YES" ? "bg-[#64c883]/20 text-[#64c883]" : "bg-[#e16464]/20 text-[#e16464]"
            }`}>
              {selectedPos.side}
            </span>
            <div>
              <div className="text-xs font-bold text-white">{selectedPos.shares.toFixed(2)} shares disponibles</div>
              <div className="text-[9px] text-gray-500">
                Compradas @ ${(selectedPos.amount / selectedPos.shares).toFixed(4)} c/u
                {selectedPos.totalCost > 0 && (
                  <span className="text-gray-600 ml-1">
                    · neto ${(selectedPos.totalCost / selectedPos.shares).toFixed(4)}
                  </span>
                )}
              </div>
            </div>
          </div>
          <div className="text-right">
            <div className="text-xs font-bold text-gray-300">${selectedPos.amount.toFixed(2)}</div>
            <div className="text-[9px] text-gray-500">invertido</div>
          </div>
        </div>
      )}

      {/* Inputs */}
      <div className="space-y-2">
        <div className="flex justify-between text-[10px] font-bold text-gray-500 uppercase tracking-wider px-1">
          <span>Shares a vender</span>
          <button type="button" className="text-orange-400 hover:text-orange-300 transition-colors"
            onClick={() => setSharesToSell(maxShares.toFixed(2))}>
            MAX {maxShares.toFixed(2)}
          </button>
        </div>
        <div className="relative group">
          <input
            type="number"
            placeholder="0.00"
            value={sharesToSell}
            onChange={(e) => setSharesToSell(e.target.value)}
            min="0.01"
            max={maxShares}
            step="0.01"
            className="w-full bg-[#0d0d0d] border border-[#272727] rounded-xl px-4 py-3 text-white font-bold text-lg outline-none transition-all group-focus-within:border-orange-500/50 group-focus-within:ring-1 group-focus-within:ring-orange-500/20"
          />
          <div className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-500 font-bold text-sm">sh</div>
        </div>
      </div>

      <div className="space-y-2">
        <div className="text-[10px] font-bold text-gray-500 uppercase tracking-wider px-1">
          Precio límite por share
        </div>
        <div className="relative group">
          <input
            type="number"
            placeholder="0.50"
            value={pricePerShare}
            onChange={(e) => setPricePerShare(e.target.value)}
            min="0.01"
            max="0.99"
            step="0.01"
            className="w-full bg-[#0d0d0d] border border-[#272727] rounded-xl px-4 py-3 text-white font-bold text-lg outline-none transition-all group-focus-within:border-orange-500/50 group-focus-within:ring-1 group-focus-within:ring-orange-500/20"
          />
          <div className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-500 font-bold">$</div>
        </div>
      </div>

      {/* Summary */}
      {numShares > 0 && numPrice > 0 && (
        <div className="space-y-2">
          <div className="flex justify-between items-center px-4 py-3 bg-[#0d0d0d]/50 rounded-xl border border-white/5">
            <span className="text-xs text-gray-400">Órdenes a colocar</span>
            <span className="text-sm font-bold text-white">{numShares.toFixed(2)} sh @ ${numPrice.toFixed(2)}</span>
          </div>
          <div className="flex justify-between items-center px-4 py-3 bg-[#0d0d0d]/50 rounded-xl border border-white/5">
            <span className="text-xs text-gray-400">Comisión (Maker)</span>
            <span className="text-sm font-bold text-[#64c883]">0%</span>
          </div>
          <div className="flex justify-between items-center px-4 py-4 bg-orange-500/5 rounded-xl border border-orange-500/10">
            <span className="text-xs text-orange-400">Recibirás si se ejecuta</span>
            <span className="text-base font-extrabold text-orange-300">${estimatedRevenue.toFixed(2)}</span>
          </div>
        </div>
      )}

      {error && <p className="text-[#e16464] text-xs text-center font-medium">{error}</p>}
      {success && <p className="text-[#64c883] text-xs text-center font-bold">✓ Orden listada en el Order Book</p>}

      <Button
        type="submit"
        disabled={loading || numShares <= 0 || numPrice <= 0 || numShares > maxShares}
        loading={loading}
        className="w-full py-6 rounded-2xl text-lg font-bold bg-orange-500 hover:bg-orange-400 text-white shadow-xl shadow-orange-500/20 transition-all"
      >
        Listar en Order Book
      </Button>
    </form>
  );
}

// ─── MAIN COMPONENT ───────────────────────────────────────────────────────────
export function PredictionCard({
  market, userId, userBalance, onSuccess, prefillOrder
}: PredictionCardProps) {
  const searchParams = useSearchParams();
  const initialTab = searchParams.get("tab") === "sell" ? "SELL" : "BUY";
  const [mode, setMode] = useState<"BUY" | "SELL">(initialTab);

  // Force buy mode if an order is prefilled
  useEffect(() => {
    if (prefillOrder) {
      setMode("BUY");
    }
  }, [prefillOrder]);

  const yesOdds = market.odds.yesOdds;
  const totalVolume = market.yesPool + market.noPool;
  const formatVolume = (val: number) =>
    val >= 1000 ? `$${(val / 1000).toFixed(1)}k` : `$${val.toFixed(0)}`;

  // Only show SELL tab if user has active positions with available shares
  const hasPositionsToSell = (market.positions || []).some(
    (p: any) => p.currentOwner.id === userId && p.shares > 0 && !p.isForSale
  );

  // Gauge
  const radius = 45;
  const stroke = 8;
  const normalizedRadius = radius - stroke;
  const circumference = normalizedRadius * 2 * Math.PI;
  const semiCircumference = circumference / 2;
  const strokeDashoffset = semiCircumference - (yesOdds / 100) * semiCircumference;

  return (
    <div className="bg-[#171717] rounded-3xl p-6 shadow-2xl border border-white/5 space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <h3 className="text-xl font-semibold text-white max-w-[60%] leading-tight">
          {market.question}
        </h3>
        <div className="relative flex flex-col items-center flex-shrink-0 w-[90px]">
          <svg height={radius + stroke} width={radius * 2} className="absolute block overflow-visible">
            <circle stroke="#2a2a2a" fill="transparent" strokeWidth={stroke}
              strokeDasharray={`${semiCircumference} ${circumference}`}
              style={{ strokeDashoffset: 0 }} r={normalizedRadius} cx={radius} cy={radius}
              strokeLinecap="round" className="transform -rotate-180 origin-center" />
            <circle stroke="#64c883" fill="transparent" strokeWidth={stroke}
              strokeDasharray={`${semiCircumference} ${circumference}`}
              style={{ strokeDashoffset, transition: "stroke-dashoffset 0.5s ease-in-out" }}
              r={normalizedRadius} cx={radius} cy={radius}
              strokeLinecap="round" className="transform -rotate-180 origin-center" />
          </svg>
          <div className="absolute top-[-10px] inset-x-0 text-center">
            <span className="block text-xl font-extrabold text-white leading-none tracking-tighter">
              {yesOdds.toFixed(0)}%
            </span>
            <span className="text-[10px] font-bold text-gray-400 uppercase tracking-[0.1em] mt-2 block">
              Chance
            </span>
          </div>
        </div>
      </div>

      {/* BUY / SELL tabs */}
      <div className="flex gap-1 bg-[#0d0d0d] rounded-xl p-1">
        <button
          type="button"
          onClick={() => setMode("BUY")}
          className={`flex-1 py-2 rounded-lg text-[11px] font-extrabold uppercase tracking-wider transition-all ${
            mode === "BUY"
              ? "bg-[#64c883] text-[#0a0a0a] shadow"
              : "text-gray-500 hover:text-white"
          }`}
        >
          Comprar
        </button>
        {hasPositionsToSell && (
          <button
            type="button"
            onClick={() => setMode("SELL")}
            className={`flex-1 py-2 rounded-lg text-[11px] font-extrabold uppercase tracking-wider transition-all ${
              mode === "SELL"
                ? "bg-orange-500 text-white shadow"
                : "text-gray-500 hover:text-orange-400"
            }`}
          >
            Vender
          </button>
        )}
      </div>

      {/* Form content */}
      {mode === "BUY" ? (
        <BuyForm market={market} userId={userId} userBalance={userBalance} onSuccess={onSuccess} prefillOrder={prefillOrder} />
      ) : (
        <SellForm market={market} userId={userId} onSuccess={onSuccess} />
      )}

      {/* Footer */}
      <div className="text-center pt-2">
        <span className="text-sm font-bold text-gray-500">
          {formatVolume(totalVolume)} Vol.
        </span>
      </div>
    </div>
  );
}
