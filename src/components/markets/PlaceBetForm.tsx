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
  }, [amountNum, side, marketId]);

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

    setLoading(true);

    try {
      const res = await fetch("/api/positions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ marketId, userId, side, amount: amountNum }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Error al crear posición");
      }

      setAmount("");
      setQuote(null);
      onSuccess();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error desconocido");
    } finally {
      setLoading(false);
    }
  };

  // Use quoted shares for potential return, or fallback to estimate
  // In LMSR, Potential Return = Shares * $1
  const potentialReturn = quote ? quote.shares : 0;
  // Quote avgPrice is per share.
  const avgPrice = quote
    ? quote.avgPrice
    : side === "YES"
      ? odds.yesOdds / 100
      : odds.noOdds / 100;

  // Calculate ROI based on net investment (inclusive fee: Net = Total / 1.1)
  const netAmountForRoi = quote
    ? quote.totalCost - (quote.feeAmount || 0)
    : amountNum / 1.1;
  const roi = ((potentialReturn - netAmountForRoi) / netAmountForRoi) * 100;

  // Manual fallback for shares if quote is missing
  const estimatedShares = quote ? quote.shares : amountNum / 1.1 / avgPrice;
  // PlaceBetForm doesn't seem to show ROI in UI yet, but we'll prepare the variables.

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <button
          type="button"
          onClick={() => setSide("YES")}
          className={`p-4 rounded-lg border-2 transition-all ${
            side === "YES"
              ? "border-green-500 bg-green-50 text-green-700"
              : "border-gray-200 hover:border-green-300"
          }`}
        >
          <div className="text-2xl font-bold">
            {quote
              ? (quote.newProbabilities.yes * 100).toFixed(1)
              : odds.yesOdds.toFixed(1)}
            %
          </div>
          <div className="text-sm font-medium">YES</div>
          <div className="text-xs opacity-75">
            Price: $
            {(quote ? quote.newProbabilities.yes : odds.yesOdds / 100).toFixed(
              2,
            )}
          </div>
        </button>

        <button
          type="button"
          onClick={() => setSide("NO")}
          className={`p-4 rounded-lg border-2 transition-all ${
            side === "NO"
              ? "border-red-500 bg-red-50 text-red-700"
              : "border-gray-200 hover:border-red-300"
          }`}
        >
          <div className="text-2xl font-bold">
            {quote
              ? (quote.newProbabilities.no * 100).toFixed(1)
              : odds.noOdds.toFixed(1)}
            %
          </div>
          <div className="text-sm font-medium">NO</div>
          <div className="text-xs opacity-75">
            Price: $
            {(quote ? quote.newProbabilities.no : odds.noOdds / 100).toFixed(2)}
          </div>
        </button>
      </div>

      <Input
        type="number"
        label="Monto a invertir ($)"
        placeholder="100"
        value={amount}
        onChange={(e) => setAmount(e.target.value)}
        min="1"
        max={userBalance}
      />

      <div className="space-y-2 text-sm text-gray-600 bg-gray-50 p-3 rounded-md">
        <div className="flex justify-between">
          <span>Tu saldo:</span>
          <span className="font-medium">${userBalance.toFixed(2)}</span>
        </div>
        <div className="flex justify-between">
          <span>Costo Promedio:</span>
          <span className="font-medium">
            {quoteLoading ? "Calculando..." : `$${avgPrice.toFixed(4)}`}
          </span>
        </div>
        <div className="flex justify-between text-base border-t pt-2 mt-2">
          <span className="font-semibold text-gray-800">
            Acciones Estimadas:
          </span>
          <span className="font-bold text-gray-900">
            {quoteLoading ? "..." : quote?.shares.toFixed(2) || "0.00"}
          </span>
        </div>
        <div className="flex justify-between text-base">
          <span className="font-semibold text-green-700">
            Retorno Potencial:
          </span>
          <span className="font-bold text-green-700">
            {quoteLoading ? "..." : `$${potentialReturn.toFixed(2)}`}
          </span>
        </div>
      </div>

      {quote?.wouldExceedCap && (
        <div className="bg-orange-50 border border-orange-200 p-3 rounded-md text-orange-800 text-sm">
          <p className="font-semibold mb-1">⚠️ Límite excedido</p>
          <p>{quote.capReason}</p>
          <p className="mt-1">
            Puedes comprar hasta{" "}
            <strong>${quote.maxAllowedAmount.toFixed(2)}</strong> por el
            momento.
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

      {error && <p className="text-red-500 text-sm">{error}</p>}

      <Button
        type="submit"
        variant={side === "YES" ? "success" : "danger"}
        className="w-full"
        loading={loading || quoteLoading}
        disabled={
          loading || quoteLoading || amountNum <= 0 || !!quote?.wouldExceedCap
        }
      >
        Comprar {side}
      </Button>
    </form>
  );
}
