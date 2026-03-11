"use client";

import React, { useState, useEffect } from "react";
import { Button } from "@/components/ui/Button";

interface PredictionCardProps {
  market: any;
  userId: string;
  userBalance: number;
  onSuccess: () => void;
}

export function PredictionCard({
  market,
  userId,
  userBalance,
  onSuccess,
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
  } | null>(null);

  const yesOdds = market.odds.yesOdds;
  const totalVolume = market.yesPool + market.noPool;

  const formatVolume = (val: number) => {
    if (val >= 1000) return `$${(val / 1000).toFixed(1)}k`;
    return `$${val.toFixed(0)}`;
  };

  const amountNum = parseFloat(amount) || 0;

  // Debounce fetching quote
  useEffect(() => {
    const fetchQuote = async () => {
      if (amountNum <= 0) {
        setQuote(null);
        return;
      }

      setQuoteLoading(true);
      try {
        const res = await fetch(
          `/api/markets/${market.id}/price-quote?side=${side}&amount=${amountNum}`,
        );
        const data = await res.json();
        if (res.ok) {
          setQuote(data);
        } else {
          console.error("Error fetching quote:", data.error, data.details);
          setError(data.details || data.error || "Error al obtener cotización");
        }
      } catch (err) {
        console.error("Failed to fetch quote", err);
      } finally {
        setQuoteLoading(false);
      }
    };

    const timer = setTimeout(fetchQuote, 500);
    return () => clearTimeout(timer);
  }, [amountNum, side, market.id]);

  // Use quoted values or fallback to current market price for estimation
  const currentPrice =
    (side === "YES" ? market.odds.yesOdds : market.odds.noOdds) / 100;

  // Inclusive fee: If user spends 10, totalCost is 10, fee is 1, net is 9.
  const totalCost = amountNum;
  const netAmount = quote
    ? quote.totalCost - (quote.feeAmount ?? 0)
    : amountNum * 0.9;

  const estimatedShares = quote
    ? quote.shares
    : netAmount > 0
      ? netAmount / currentPrice
      : 0;
  // In LMSR, return is $1 per share. So potential return value = shares.
  const potentialReturnValue = estimatedShares;
  const potentialProfit = potentialReturnValue - netAmount;
  const roi = netAmount > 0 ? (potentialProfit / netAmount) * 100 : 0;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (amountNum <= 0) {
      setError("Ingresa un monto válido");
      return;
    }

    if (totalCost > userBalance) {
      setError("Saldo insuficiente");
      return;
    }

    setLoading(true);

    try {
      const res = await fetch("/api/positions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          marketId: market.id,
          userId,
          side,
          amount: amountNum,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Error al crear posición");

      setAmount("");
      setQuote(null);
      onSuccess();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error desconocido");
    } finally {
      setLoading(false);
    }
  };

  // Gauge constants
  const radius = 45;
  const stroke = 8;
  const normalizedRadius = radius - stroke;
  const circumference = normalizedRadius * 2 * Math.PI;
  const semiCircumference = circumference / 2;
  const strokeDashoffset =
    semiCircumference - (yesOdds / 100) * semiCircumference;

  return (
    <div className="bg-[#171717] rounded-3xl p-6 shadow-2xl border border-white/5 space-y-6">
      {/* Header with Gauge */}
      <div className="flex justify-between items-center">
        <h3 className="text-xl font-semibold text-white max-w-[60%] leading-tight">
          {market.question}
        </h3>

        <div className="relative flex flex-col items-center flex-shrink-0 w-[90px]">
          <svg
            height={radius + stroke}
            width={radius * 2}
            className="absolute block overflow-visible"
          >
            {/* Background Arch */}
            <circle
              stroke="#2a2a2a"
              fill="transparent"
              strokeWidth={stroke}
              strokeDasharray={`${semiCircumference} ${circumference}`}
              style={{ strokeDashoffset: 0 }}
              r={normalizedRadius}
              cx={radius}
              cy={radius}
              strokeLinecap="round"
              className="transform -rotate-180 origin-center"
            />
            {/* Progress Arch */}
            <circle
              stroke="#64c883"
              fill="transparent"
              strokeWidth={stroke}
              strokeDasharray={`${semiCircumference} ${circumference}`}
              style={{
                strokeDashoffset,
                transition: "stroke-dashoffset 0.5s ease-in-out",
              }}
              r={normalizedRadius}
              cx={radius}
              cy={radius}
              strokeLinecap="round"
              className="transform -rotate-180 origin-center"
            />
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

      {/* Selection Buttons */}
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
          <div className="flex gap-1 items-center mt-0.5">
            <span className="text-[10px] font-bold opacity-70">
              ${(market.odds.yesOdds / 100).toFixed(2)}
            </span>
          </div>
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
          <div className="flex gap-1 items-center mt-0.5">
            <span className="text-[10px] font-bold opacity-70">
              ${(market.odds.noOdds / 100).toFixed(2)}
            </span>
          </div>
        </button>
      </div>

      {/* Betting Form Elements (Integrated) */}
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
            <div className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-500 font-bold">
              $
            </div>
          </div>
        </div>

        {amountNum > 0 && (
          <div className="space-y-2">
            {quote?.feeAmount !== undefined && quote.feeAmount > 0 && (
              <>
                <div className="flex justify-between items-center px-4 py-3 bg-[#0d0d0d]/50 rounded-xl border border-white/5">
                  <span className="text-xs text-gray-400">
                    Comisión WIN (
                    {((quote.platformFeeRate ?? 0.1) * 100).toFixed(0)}%)
                  </span>
                  <span className="text-sm font-bold text-[#e16464]">
                    - ${quote.feeAmount.toFixed(2)}
                  </span>
                </div>
                <div className="flex justify-between items-center px-4 py-3 bg-[#0d0d0d]/50 rounded-xl border border-white/5">
                  <span className="text-xs text-gray-400">Inversión Neta</span>
                  <span className="text-sm font-bold text-white">
                    ${(quote.totalCost - quote.feeAmount).toFixed(2)}
                  </span>
                </div>
                <div className="flex justify-between items-center px-4 py-3 bg-[#0d0d0d]/50 rounded-xl border border-white/5">
                  <span className="text-xs text-gray-400">Costo Total</span>
                  <span className="text-sm font-bold text-white">
                    ${quote.totalCost.toFixed(2)}
                  </span>
                </div>
              </>
            )}
            <div className="flex justify-between items-center px-4 py-3 bg-[#0d0d0d]/50 rounded-xl border border-white/5">
              <span className="text-xs text-gray-400">Acciones Estimadas</span>
              <span className="text-sm font-bold text-white">
                {quoteLoading ? "..." : estimatedShares.toFixed(2)}
              </span>
            </div>
            <div className="flex justify-between items-center px-4 py-3 bg-[#0d0d0d]/50 rounded-xl border border-white/5">
              <span className="text-xs text-gray-400">Precio Promedio</span>
              <span className="text-sm font-bold text-white">
                {quoteLoading
                  ? "..."
                  : `$${(quote ? quote.avgPrice : currentPrice).toFixed(4)}`}
              </span>
            </div>
            {quote && (
              <div className="flex justify-between items-center px-4 py-3 bg-[#0d0d0d]/50 rounded-xl border border-white/5">
                <span className="text-xs text-gray-400">
                  Nuevo Precio del Mercado
                </span>
                <div className="flex gap-3">
                  <span className="text-sm font-bold text-[#64c883]">
                    Y ${quote.newProbabilities.yes.toFixed(2)}
                  </span>
                  <span className="text-sm font-bold text-[#e16464]">
                    N ${quote.newProbabilities.no.toFixed(2)}
                  </span>
                </div>
              </div>
            )}
            <div className="flex justify-between items-center px-4 py-4 bg-[#64c883]/5 rounded-xl border border-[#64c883]/10">
              <span className="text-xs text-[#64c883]">
                Retorno ({Math.max(0, roi).toFixed(0)}%)
              </span>
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
            <p className="mt-1">
              Máximo permitido:{" "}
              <strong>${quote.maxAllowedAmount?.toFixed(2)}</strong>
            </p>
            <button
              type="button"
              onClick={() =>
                setAmount(quote.maxAllowedAmount?.toString() || "")
              }
              className="mt-2 text-[10px] font-extrabold underline uppercase tracking-tighter"
            >
              Ajustar al máximo
            </button>
          </div>
        )}

        {error && (
          <p className="text-[#e16464] text-xs text-center font-medium">
            {error}
          </p>
        )}

        <Button
          type="submit"
          disabled={
            !amount ||
            loading ||
            quoteLoading ||
            amountNum <= 0 ||
            !!quote?.wouldExceedCap
          }
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

      {/* Footer Stats */}
      <div className="text-center pt-2">
        <span className="text-sm font-bold text-gray-500">
          {formatVolume(totalVolume)} Vol.
        </span>
      </div>
    </div>
  );
}
