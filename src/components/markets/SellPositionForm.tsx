"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";

interface SellPositionFormProps {
  marketId: string;
  userId: string;
  positionId: string;
  maxShares: number;
  side: "YES" | "NO";
  onSuccess: () => void;
  onCancel: () => void;
}

export function SellPositionForm({
  marketId,
  userId,
  positionId,
  maxShares,
  side,
  onSuccess,
  onCancel,
}: SellPositionFormProps) {
  const [sharesToSell, setSharesToSell] = useState("");
  const [pricePerShare, setPricePerShare] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const numShares = parseFloat(sharesToSell) || 0;
  const numPrice = parseFloat(pricePerShare) || 0;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (numShares <= 0 || numShares > maxShares) {
      setError(`Debes vender entre 0 y ${maxShares.toFixed(2)} shares`);
      return;
    }

    if (numPrice <= 0 || numPrice >= 1) {
      setError("El precio por share debe estar entre $0.01 y $0.99");
      return;
    }

    setLoading(true);
    try {
      const payload = {
        marketId,
        userId,
        positionId,
        shares: numShares,
        pricePerShare: numPrice,
        executionType: "LIMIT_SELL",
      };

      const res = await fetch("/api/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Error al listar la orden");
      }

      onSuccess();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error desconocido");
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="mt-4 p-4 bg-[#0a0a0a] border border-white/5 rounded-xl space-y-4 animate-in slide-in-from-top-2">
      <div className="flex justify-between items-center mb-2 text-xs">
        <span className="font-bold uppercase text-gray-400">Vender Shares {side}</span>
        <span className="text-gray-500">Max: {maxShares.toFixed(2)}</span>
      </div>
      
      <div className="grid grid-cols-2 gap-3">
        <Input
          type="number"
          label="Shares a vender"
          placeholder={maxShares.toFixed(2)}
          value={sharesToSell}
          onChange={(e) => setSharesToSell(e.target.value)}
          min="0.01"
          max={maxShares}
          step="0.01"
        />
        <Input
          type="number"
          label="Precio límite por share ($)"
          placeholder="0.50"
          value={pricePerShare}
          onChange={(e) => setPricePerShare(e.target.value)}
          min="0.01"
          max="0.99"
          step="0.01"
        />
      </div>

      {numShares > 0 && numPrice > 0 && (
        <div className="text-[10px] font-bold text-[#64c883] uppercase tracking-wider text-right">
          Retorno estimado: ${(numShares * numPrice).toFixed(2)}
        </div>
      )}

      {error && <p className="text-red-500 text-[10px] font-bold uppercase">{error}</p>}

      <div className="flex gap-2 pt-2">
        <button
          type="button"
          onClick={onCancel}
          disabled={loading}
          className="flex-1 py-2 text-[10px] font-bold uppercase text-gray-400 hover:text-white transition-colors"
        >
          Cancelar
        </button>
        <button
          type="submit"
          disabled={loading || numShares <= 0 || numPrice <= 0 || numShares > maxShares}
          className="flex-1 py-2 bg-indigo-600 text-white text-[10px] font-bold uppercase rounded-lg hover:bg-indigo-700 disabled:opacity-50 transition-colors"
        >
          {loading ? "Procesando..." : "Listar en Orderbook"}
        </button>
      </div>
    </form>
  );
}
