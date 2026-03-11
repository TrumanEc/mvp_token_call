"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";

interface PlaceBetFormProps {
  marketId: string;
  userId: string;
  userBalance: number;
  odds: {
    yesOdds: number;
    noOdds: number;
    yesPayout: number; // Legacy/Reference
    noPayout: number; // Legacy/Reference
  };
  onSuccess: () => void;
}

export function PlaceBetForm({
  marketId,
  userId,
  userBalance,
  odds,
  onSuccess,
}: PlaceBetFormProps) {
  const [orderType, setOrderType] = useState<"MARKET" | "LIMIT">("MARKET");
  const [side, setSide] = useState<"YES" | "NO">("YES");
  const [amount, setAmount] = useState("");
  const [limitPrice, setLimitPrice] = useState("");
  
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

  const amountNum = parseFloat(amount) || 0;
  const limitPriceNum = parseFloat(limitPrice) || 0;

  // Debounce fetching quote (Only for Market or when initial preview needed)
  useEffect(() => {
    const fetchQuote = async () => {
      if (amountNum <= 0 || orderType === "LIMIT") {
        setQuote(null);
        return;
      }

      setQuoteLoading(true);
      try {
        const res = await fetch(
          `/api/markets/${marketId}/price-quote?side=${side}&amount=${amountNum}`,
        );
        const data = await res.json();
        if (res.ok) {
          setQuote(data);
        } else {
          console.error("Error fetching quote:", data.error);
        }
      } catch (err) {
        console.error("Failed to fetch quote", err);
      } finally {
        setQuoteLoading(false);
      }
    };

    const timer = setTimeout(fetchQuote, 500);
    return () => clearTimeout(timer);
  }, [amountNum, side, marketId, orderType]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (amountNum <= 0) {
      setError("Ingresa un monto válido");
      return;
    }

    if (amountNum > userBalance) {
      setError("Saldo insuficiente");
      return;
    }
    
    if (orderType === "LIMIT" && (limitPriceNum <= 0 || limitPriceNum >= 1)) {
      setError("El precio límite debe estar entre $0.01 y $0.99");
      return;
    }

    setLoading(true);

    try {
      const payload = {
        marketId,
        userId,
        side,
        amount: amountNum,
        executionType: orderType === "MARKET" ? "MARKET" : "LIMIT_BUY",
        ...(orderType === "LIMIT" && { pricePerShare: limitPriceNum }),
      };

      const res = await fetch("/api/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Error enviando orden");
      }

      setAmount("");
      setLimitPrice("");
      setQuote(null);
      onSuccess();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error desconocido");
    } finally {
      setLoading(false);
    }
  };

  // Limit orders simple calculation
  const limitEstimatedShares = limitPriceNum > 0 ? (amountNum / limitPriceNum) : 0;
  
  const potentialReturn = orderType === "MARKET"
    ? (quote ? quote.shares : 0)
    : limitEstimatedShares;

  const avgPrice = orderType === "MARKET"
    ? (quote ? quote.avgPrice : (side === "YES" ? odds.yesOdds / 100 : odds.noOdds / 100))
    : limitPriceNum;

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {/* Type Selector Tabs */}
      <div className="flex p-0.5 bg-gray-100 rounded-lg shadow-inner ring-1 ring-gray-200/50">
        <button
          type="button"
          onClick={() => { setOrderType("MARKET"); setError(""); }}
          className={`flex-1 py-1.5 text-sm font-semibold rounded-md transition-all duration-200 ease-out ${
            orderType === "MARKET"
              ? "bg-white text-gray-900 shadow-sm ring-1 ring-gray-200/50"
              : "text-gray-500 hover:text-gray-700 hover:bg-gray-200/50"
          }`}
        >
          Market
        </button>
        <button
          type="button"
          onClick={() => { setOrderType("LIMIT"); setError(""); }}
          className={`flex-1 py-1.5 text-sm font-semibold rounded-md transition-all duration-200 ease-out ${
            orderType === "LIMIT"
              ? "bg-white text-gray-900 shadow-sm ring-1 ring-gray-200/50"
              : "text-gray-500 hover:text-gray-700 hover:bg-gray-200/50"
          }`}
        >
          Limit
        </button>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <button
          type="button"
          onClick={() => setSide("YES")}
          className={`p-4 rounded-lg border-2 transition-all ${
            side === "YES"
              ? "border-green-500 bg-green-50/50 text-green-700 shadow-sm"
              : "border-gray-200 hover:border-green-300"
          }`}
        >
          <div className="text-2xl font-bold">
            {orderType === "MARKET" && quote ? (quote.newProbabilities.yes * 100).toFixed(1) : odds.yesOdds.toFixed(1)}%
          </div>
          <div className="text-sm font-medium">YES</div>
          <div className="text-xs opacity-75">
            Spot: ${(odds.yesOdds / 100).toFixed(2)}
          </div>
        </button>

        <button
          type="button"
          onClick={() => setSide("NO")}
          className={`p-4 rounded-lg border-2 transition-all ${
            side === "NO"
              ? "border-red-500 bg-red-50/50 text-red-700 shadow-sm"
              : "border-gray-200 hover:border-red-300"
          }`}
        >
          <div className="text-2xl font-bold">
            {orderType === "MARKET" && quote ? (quote.newProbabilities.no * 100).toFixed(1) : odds.noOdds.toFixed(1)}%
          </div>
          <div className="text-sm font-medium">NO</div>
          <div className="text-xs opacity-75">
            Spot: ${(odds.noOdds / 100).toFixed(2)}
          </div>
        </button>
      </div>

      <div className="space-y-3">
        <Input
          type="number"
          label={orderType === "MARKET" ? "Monto a invertir ($)" : "Dinero a gastar ($)"}
          placeholder="100"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          min="1"
          max={userBalance}
          step="0.01"
        />

        {orderType === "LIMIT" && (
          <div className="animate-in slide-in-from-top-2 fade-in duration-200">
             <Input
                type="number"
                label="Precio límite por share ($)"
                placeholder="0.50"
                value={limitPrice}
                onChange={(e) => setLimitPrice(e.target.value)}
                min="0.01"
                max="0.99"
                step="0.01"
              />
          </div>
        )}
      </div>

      <div className="space-y-2 text-sm text-gray-600 bg-gray-50 p-4 rounded-xl border border-gray-100 shadow-inner">
        <div className="flex justify-between">
          <span className="text-gray-500">Tu saldo líquido:</span>
          <span className="font-medium text-gray-900">${userBalance.toFixed(2)}</span>
        </div>
        <div className="flex justify-between pb-1 border-b border-gray-200 border-dashed">
          <span className="text-gray-500">{orderType === "MARKET" ? "Costo Promedio:" : "Precio Fijo:"}</span>
          <span className="font-medium text-gray-900">
            {orderType === "MARKET" && quoteLoading ? "Calculando..." : `$${(avgPrice || 0).toFixed(4)}`}
          </span>
        </div>
        
        <div className="flex justify-between text-base pt-1">
          <span className="font-medium text-gray-700">
            {orderType === "MARKET" ? "Shares Estimados:" : "Shares a Comprar:"}
          </span>
          <span className="font-bold text-gray-900">
            {orderType === "MARKET" && quoteLoading ? "..." : (potentialReturn || 0).toFixed(2)}
          </span>
        </div>
        <div className="flex justify-between text-base">
          <span className="font-semibold text-green-600">Retorno Potencial:</span>
          <span className="font-bold text-green-600">
            {orderType === "MARKET" && quoteLoading ? "..." : `$${(potentialReturn || 0).toFixed(2)}`}
          </span>
        </div>
      </div>

      {orderType === "MARKET" && quote?.wouldExceedCap && (
        <div className="bg-orange-50 border border-orange-200 p-3 rounded-md text-orange-800 text-sm">
          <p className="font-semibold mb-1">⚠️ Límite excedido</p>
          <p>{quote.capReason}</p>
          <p className="mt-1">
            Puedes comprar hasta <strong>${quote.maxAllowedAmount.toFixed(2)}</strong>
          </p>
          <button
            type="button"
            onClick={() => setAmount(quote.maxAllowedAmount.toString())}
            className="mt-2 text-xs font-bold underline text-orange-700 hover:text-orange-900"
          >
            Ajustar a ${quote.maxAllowedAmount.toFixed(2)}
          </button>
        </div>
      )}

      {error && <p className="text-red-500 text-sm font-medium animate-in fade-in">{error}</p>}

      <Button
        type="submit"
        variant={side === "YES" ? "success" : "danger"}
        className={`w-full text-base font-semibold py-6 shadow-sm hover:shadow-md transition-all ${orderType === "LIMIT" ? "bg-indigo-600 hover:bg-indigo-700 focus:ring-indigo-500 text-white" : ""}`}
        loading={loading || (orderType === "MARKET" && quoteLoading)}
        disabled={
          loading || 
          (orderType === "MARKET" && quoteLoading) || 
          amountNum <= 0 || 
          (orderType === "MARKET" && !!quote?.wouldExceedCap) ||
          (orderType === "LIMIT" && (limitPriceNum <= 0 || limitPriceNum >= 1))
        }
      >
        {orderType === "MARKET" ? `Comprar ${side} al Mercado` : `Colocar Orden Limit en ${side}`}
      </Button>
    </form>
  );
}
