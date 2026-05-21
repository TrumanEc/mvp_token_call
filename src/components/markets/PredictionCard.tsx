"use client";

import React, { useState, useEffect, useRef } from "react";

// ─── Tooltip ──────────────────────────────────────────────────────────────────
function Tooltip({ children, content }: { children: React.ReactNode; content: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  return (
    <span ref={ref} className="relative inline-flex items-center">
      <span
        onClick={() => setOpen((v) => !v)}
        className="ml-1 w-3.5 h-3.5 rounded-full border border-gray-600 text-gray-500 text-[8px] font-bold flex items-center justify-center cursor-pointer hover:border-gray-400 hover:text-gray-300 transition-colors select-none"
      >
        i
      </span>
      {open && (
        <span className="absolute z-50 bottom-full left-1/2 -translate-x-1/2 mb-2 w-56 bg-[#1a1a1a] border border-white/15 rounded-xl p-3 shadow-2xl">
          <span className="block text-[11px] text-gray-300 leading-relaxed">{content}</span>
          <span className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-[#1a1a1a]" />
        </span>
      )}
      {children}
    </span>
  );
}

// ─── Row helper ───────────────────────────────────────────────────────────────
function Row({ label, value, sub, labelTip, valueClass = "text-white" }: {
  label: React.ReactNode; value: React.ReactNode; sub?: string;
  labelTip?: React.ReactNode; valueClass?: string;
}) {
  return (
    <div className="flex items-center justify-between py-2.5 border-b border-white/5 last:border-0">
      <span className="text-[11px] text-gray-500 flex items-center">
        {label}{labelTip && <Tooltip content={labelTip}>{null}</Tooltip>}
      </span>
      <span className={`text-[12px] font-bold ${valueClass} text-right`}>
        {value}
        {sub && <span className="block text-[9px] text-gray-600 font-normal">{sub}</span>}
      </span>
    </div>
  );
}

// ─── Types ────────────────────────────────────────────────────────────────────
interface OutcomeData {
  id: string;
  name: string;
  probability: number;
  price: number;
  displayOrder?: number;
}

interface PredictionCardProps {
  market: any;
  userId: string;
  userBalance: number;
  onSuccess: () => void;
  prefillOrder?: { side: "YES" | "NO"; price: number; shares: number } | null;
}

interface Quote {
  shares: number;
  avgPrice: number;
  totalCost: number;
  feeAmount: number;
  platformFeeRate: number;
  estimatedPayoutPerShare: number;
  newProbabilities: Record<string, number>;
  maxAllowedAmount: number;
  wouldExceedCap: boolean;
  capReason: string | null;
}

interface SellQuote {
  shares: number;
  grossAmount: number;
  feeAmount: number;
  netAmount: number;
  avgPricePerShare: number;
  feeRate: number;
  newProbabilities: Record<string, number>;
  capped: boolean;
  capReason: string | null;
}

const OUTCOME_COLORS = ['#64c883', '#f87171', '#60a5fa', '#fbbf24', '#a78bfa', '#f472b6', '#34d399'];

/** YES → Sí, everything else stays */
function labelEs(name: string) {
  if (name === "YES") return "SÍ";
  if (name === "NO")  return "NO";
  return name;
}

// ─── BUY FORM ─────────────────────────────────────────────────────────────────
function BuyForm({ market, userId, userBalance, onSuccess }: PredictionCardProps) {
  const outcomes: OutcomeData[] = market.outcomes ?? [];
  const isBinary = outcomes.length === 2 && outcomes[0]?.name === "YES";

  const [selectedOutcomeId, setSelectedOutcomeId] = useState<string>(outcomes[0]?.id ?? "");
  const [amount, setAmount] = useState("");
  const [step, setStep] = useState<"configure" | "review">("configure");
  const [loading, setLoading] = useState(false);
  const [quoteLoading, setQuoteLoading] = useState(false);
  const [error, setError] = useState("");
  const [quote, setQuote] = useState<Quote | null>(null);

  const selectedOutcome = outcomes.find(o => o.id === selectedOutcomeId) ?? outcomes[0];
  const selectedIdx = outcomes.indexOf(selectedOutcome);
  const side = selectedOutcome?.name ?? "YES";
  const sideLabel = labelEs(side);

  const amountNum = parseFloat(amount) || 0;
  const currentPrice = (selectedOutcome?.price ?? selectedOutcome?.probability / 100) ?? 0.5;

  const quickPicks = [
    { label: "25%", value: userBalance * 0.25 },
    { label: "50%", value: userBalance * 0.5 },
    { label: "75%", value: userBalance * 0.75 },
    { label: "MAX", value: userBalance },
  ];

  const estimatedShares = quote ? quote.shares : amountNum > 0 ? (amountNum * 0.985) / currentPrice : 0;
  const payoutPerShare = quote?.estimatedPayoutPerShare ?? 1 / currentPrice;
  const estimatedPayout = estimatedShares * payoutPerShare;
  const profit = estimatedPayout - amountNum;
  const roi = amountNum > 0 ? (profit / amountNum) * 100 : 0;
  const feeAmt = quote?.feeAmount ?? amountNum * (market.platformFee ?? 0.015);
  const feeRate = ((quote?.platformFeeRate ?? market.platformFee ?? 0.015) * 100).toFixed(1);
  const payoutMax = estimatedPayout * 1.3;

  useEffect(() => {
    if (amountNum <= 0) { setQuote(null); return; }
    setQuoteLoading(true);
    const t = setTimeout(async () => {
      try {
        const res = await fetch(`/api/markets/${market.id}/price-quote?outcomeId=${selectedOutcomeId}&amount=${amountNum}`);
        const data = await res.json();
        if (res.ok) setQuote(data);
        else setError(data.error || "Error al cotizar");
      } catch { /* noop */ } finally { setQuoteLoading(false); }
    }, 400);
    return () => clearTimeout(t);
  }, [amountNum, selectedOutcomeId, market.id]);

  useEffect(() => { setStep("configure"); setError(""); }, [selectedOutcomeId, amount]);

  const handleConfirm = async () => {
    setError(""); setLoading(true);
    try {
      const res = await fetch("/api/positions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ marketId: market.id, userId, outcomeId: selectedOutcomeId, side, amount: amountNum }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Error al crear posición");
      setAmount(""); setQuote(null); setStep("configure"); onSuccess();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error desconocido");
      setStep("configure");
    } finally { setLoading(false); }
  };

  // ── Review step ────────────────────────────────────────────────────────────
  if (step === "review") {
    return (
      <div className="space-y-5">
        <button
          onClick={() => setStep("configure")}
          className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-gray-500 hover:text-white transition-colors"
        >
          ← Volver
        </button>

        <div className="bg-win-bg rounded-2xl border border-white/8">
          <div className="px-4 py-3 flex items-center gap-2" style={{ background: `${OUTCOME_COLORS[selectedIdx] ?? '#60a5fa'}15` }}>
            <span className="text-[10px] font-bold uppercase tracking-widest px-2 py-0.5 rounded-full"
              style={{ background: `${OUTCOME_COLORS[selectedIdx] ?? '#60a5fa'}30`, color: OUTCOME_COLORS[selectedIdx] ?? '#60a5fa' }}>
              {sideLabel}
            </span>
            <span className="text-[11px] font-semibold text-white">{market.question}</span>
          </div>
          <div className="px-4 py-1">
            <Row label="Invertir" value={`$${amountNum.toFixed(2)}`} />
            <Row label="Precio promedio" value={`$${(quote?.avgPrice ?? currentPrice).toFixed(4)}`} />
            <Row
              label="Fee plataforma"
              value={`-$${feeAmt.toFixed(2)}`}
              valueClass="text-gray-400"
              labelTip={`Comisión WIN del ${feeRate}% sobre el monto invertido.`}
            />
            <Row label="Participaciones" value={`${estimatedShares.toFixed(2)}`} />
            <Row
              label={<>Pago si se resuelve {sideLabel}<Tooltip content={
                <span>
                  Estimado bajo el estado actual del mercado.<br />
                  Los ganadores se reparten el pool proporcionalmente.<br />
                  <span className="text-gray-300">Rango posible:</span>{" "}
                  <span className="text-win-error">$0 si pierde</span>
                  {" → "}
                  <span className="text-green-400">~${payoutMax.toFixed(2)} si entra más liquidez del lado opuesto</span>
                </span>
              }>{null}</Tooltip></>}
              value={
                <span className="text-primary font-extrabold" style={{ fontSize: 18 }}>
                  ${estimatedPayout.toFixed(2)}
                  <span className={`text-[10px] ml-1 font-normal ${roi >= 0 ? "text-primary" : "text-win-error"}`}>
                    ({roi >= 0 ? "+" : ""}{roi.toFixed(1)}%)
                  </span>
                </span>
              }
            />
          </div>
        </div>

        {quote?.newProbabilities && (
          <div className="px-3 py-2 rounded-xl bg-white/3 border border-white/5">
            <span className="text-[10px] text-gray-600 block mb-1">Nuevo precio del mercado</span>
            <div className="flex flex-wrap gap-2 text-[11px] font-bold">
              {outcomes.map((o, i) => {
                const newProb = quote.newProbabilities[o.id] ?? quote.newProbabilities[o.name];
                const pct = newProb != null ? (newProb > 1 ? newProb : newProb * 100) : o.probability;
                return (
                  <span key={o.id} style={{ color: OUTCOME_COLORS[i % OUTCOME_COLORS.length] }}>
                    {labelEs(o.name)} {pct.toFixed(0)}%
                  </span>
                );
              })}
            </div>
          </div>
        )}

        {error && <p className="text-win-error text-[11px] text-center">{error}</p>}

        <button
          onClick={handleConfirm}
          disabled={loading}
          className="w-full py-4 rounded-2xl text-[13px] font-bold uppercase tracking-wider transition-all shadow-xl disabled:opacity-50 disabled:cursor-not-allowed"
          style={{
            background: OUTCOME_COLORS[selectedIdx] ?? '#60a5fa',
            color: selectedIdx === 0 && isBinary ? '#0d1117' : '#fff',
            boxShadow: `0 10px 25px ${OUTCOME_COLORS[selectedIdx] ?? '#60a5fa'}33`,
          }}
        >
          {loading ? "Procesando…" : `Confirmar ${sideLabel}`}
        </button>
      </div>
    );
  }

  // ── Configure step ─────────────────────────────────────────────────────────
  return (
    <div className="space-y-4">
      {/* Outcome selector */}
      {isBinary ? (
        <div className="grid grid-cols-2 gap-3">
          {outcomes.map((o, i) => {
            const active = selectedOutcomeId === o.id;
            const color = OUTCOME_COLORS[i % OUTCOME_COLORS.length];
            return (
              <button
                key={o.id}
                onClick={() => setSelectedOutcomeId(o.id)}
                className="h-14 rounded-2xl flex flex-col items-center justify-center transition-all duration-200 border"
                style={active
                  ? { background: color, borderColor: color, color: i === 0 ? '#0d1117' : '#fff' }
                  : { background: `${color}18`, borderColor: `${color}30`, color: color }
                }
              >
                <span className="text-base font-extrabold">{labelEs(o.name)}</span>
                <span className="text-[11px] font-bold opacity-75">{o.probability.toFixed(0)}%</span>
              </button>
            );
          })}
        </div>
      ) : (
        <div className="space-y-2">
          <div className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">Elegir resultado</div>
          <div className="grid grid-cols-2 gap-2">
            {outcomes.map((o, i) => {
              const active = selectedOutcomeId === o.id;
              const color = OUTCOME_COLORS[i % OUTCOME_COLORS.length];
              return (
                <button
                  key={o.id}
                  onClick={() => setSelectedOutcomeId(o.id)}
                  className="px-3 py-2.5 rounded-xl flex flex-col items-start transition-all duration-200 border"
                  style={active
                    ? { borderColor: `${color}60`, background: `${color}12`, boxShadow: `0 4px 12px ${color}22` }
                    : { borderColor: 'rgba(255,255,255,0.05)' }
                  }
                >
                  <span className="text-[11px] font-bold truncate w-full text-left" style={{ color: active ? color : '#9ca3af' }}>{o.name}</span>
                  <span className="text-[10px] font-bold" style={{ color: active ? color : '#6b7280' }}>{o.probability.toFixed(0)}%</span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Amount input */}
      <div>
        <div className="flex justify-between text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-1.5 px-0.5">
          <span>Monto a invertir</span>
          <span>Saldo: <span className="text-gray-300">${userBalance.toFixed(2)}</span></span>
        </div>
        <div className="relative">
          <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 font-bold text-lg">$</span>
          <input
            type="number" placeholder="0.00" value={amount}
            onChange={(e) => setAmount(e.target.value)}
            onWheel={(e) => e.currentTarget.blur()}
            className="w-full bg-win-bg border border-white/10 rounded-xl pl-8 pr-4 py-3 text-white font-bold text-lg outline-none focus:border-primary/40 focus:ring-1 focus:ring-primary/10 transition-all [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
          />
        </div>
        <div className="grid grid-cols-4 gap-2 mt-2">
          {quickPicks.map(({ label, value }) => (
            <button key={label} onClick={() => setAmount(value.toFixed(2))}
              className="py-1.5 rounded-lg bg-white/5 border border-white/8 text-[10px] font-bold text-gray-400 hover:text-white hover:bg-white/10 transition-all">
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Quote summary */}
      {amountNum > 0 && (
        <div className="bg-win-bg rounded-2xl border border-white/8">
          <div className="px-4 py-1">
            <Row label="Precio promedio"
              value={quoteLoading ? "…" : `$${(quote?.avgPrice ?? currentPrice).toFixed(4)}`} />
            <Row
              label={<>Costo estimado</>}
              value={quoteLoading ? "…" : `$${amountNum.toFixed(2)}`}
              labelTip={`Incluye fee WIN del ${feeRate}% = $${feeAmt.toFixed(2)}. Inversión neta: $${(amountNum - feeAmt).toFixed(2)}.`}
            />
            <Row
              label={<>Pago si se resuelve {sideLabel}</>}
              value={
                quoteLoading ? "…" : (
                  <span className="text-primary font-extrabold" style={{ fontSize: 18 }}>
                    ${estimatedPayout.toFixed(2)}
                    <span className={`text-[10px] ml-1 font-normal ${roi >= 0 ? "text-primary" : "text-win-error"}`}>
                      ({roi >= 0 ? "+" : ""}{roi.toFixed(1)}%)
                    </span>
                  </span>
                )
              }
              labelTip={
                <span>
                  Estimado bajo el estado actual del mercado.<br /><br />
                  Los ganadores se reparten el pool proporcionalmente.<br /><br />
                  <span className="text-gray-300">Rango posible:</span><br />
                  <span className="text-win-error">$0 si pierde</span>{" → "}
                  <span className="text-green-400">~${payoutMax.toFixed(2)} si entra más liquidez del lado opuesto</span>
                </span>
              }
            />
          </div>
        </div>
      )}

      {quote?.wouldExceedCap && (
        <div className="px-3 py-2 bg-win-error/10 border border-win-error/20 rounded-xl">
          <p className="text-[11px] text-win-error font-bold">⚠ Límite excedido</p>
          <p className="text-[10px] text-gray-400 mt-0.5">{quote.capReason}</p>
          <button onClick={() => setAmount(quote.maxAllowedAmount.toFixed(2))}
            className="mt-1.5 text-[10px] font-bold text-primary underline">
            Ajustar a ${quote.maxAllowedAmount.toFixed(2)}
          </button>
        </div>
      )}

      {error && <p className="text-win-error text-[11px] text-center">{error}</p>}

      <button
        disabled={!amount || amountNum <= 0 || quoteLoading || !!quote?.wouldExceedCap}
        onClick={() => { setError(""); setStep("review"); }}
        className="w-full py-3.5 rounded-2xl text-[13px] font-bold uppercase tracking-wider transition-all shadow-lg disabled:opacity-30 disabled:cursor-not-allowed"
        style={{
          background: OUTCOME_COLORS[selectedIdx] ?? '#60a5fa',
          color: selectedIdx === 0 && isBinary ? '#0d1117' : '#fff',
          boxShadow: `0 10px 20px ${OUTCOME_COLORS[selectedIdx] ?? '#60a5fa'}22`,
        }}
      >
        Revisar Orden →
      </button>
    </div>
  );
}

// ─── SELL FORM ────────────────────────────────────────────────────────────────
function SellForm({ market, userId, onSuccess }: { market: any; userId: string; onSuccess: () => void }) {
  const myPositions = (market.positions || []).filter(
    (p: any) => p.currentOwner.id === userId && p.shares > 0
  );

  // Build outcome groups dynamically from market.outcomes (supports N outcomes)
  const outcomes: any[] = market.outcomes || [];
  type OutcomeGroup = {
    outcomeId: string;
    name: string;
    shares: number;
    totalAmount: number;
    positions: any[];
    probability: number; // 0–100
  };

  const outcomeGroups: OutcomeGroup[] = outcomes.map((o: any) => {
    const positionsForOutcome = myPositions.filter((p: any) => p.outcomeId === o.id);
    const shares = positionsForOutcome.reduce((s: number, p: any) => s + p.shares, 0);
    const totalAmount = positionsForOutcome.reduce((s: number, p: any) => s + Number(p.amount), 0);
    return {
      outcomeId: o.id,
      name: o.name,
      shares,
      totalAmount,
      positions: positionsForOutcome,
      probability: typeof o.probability === "number" ? o.probability : 50,
    };
  });

  // Legacy binary fallback: if market has no outcomes (legacy YES/NO via side), build from side
  if (outcomeGroups.length === 0 && myPositions.length > 0) {
    const yes = myPositions.filter((p: any) => p.side === "YES");
    const no  = myPositions.filter((p: any) => p.side === "NO");
    if (yes.length > 0) outcomeGroups.push({
      outcomeId: "_legacy_yes", name: "YES",
      shares: yes.reduce((s: number, p: any) => s + p.shares, 0),
      totalAmount: yes.reduce((s: number, p: any) => s + Number(p.amount), 0),
      positions: yes, probability: market.odds?.yesOdds ?? 50,
    });
    if (no.length > 0) outcomeGroups.push({
      outcomeId: "_legacy_no", name: "NO",
      shares: no.reduce((s: number, p: any) => s + p.shares, 0),
      totalAmount: no.reduce((s: number, p: any) => s + Number(p.amount), 0),
      positions: no, probability: market.odds?.noOdds ?? 50,
    });
  }

  const ownedGroups = outcomeGroups.filter(g => g.shares > 0);

  const defaultGroupId = ownedGroups[0]?.outcomeId ?? "";
  const [selectedOutcomeId, setSelectedOutcomeId] = useState<string>(defaultGroupId);
  const [value, setValue] = useState("");
  const [step, setStep] = useState<"configure" | "review">("configure");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [sellQuote, setSellQuote] = useState<SellQuote | null>(null);
  const [quoteLoading, setQuoteLoading] = useState(false);
  // Max quote: real net amount user gets if selling ALL their shares (slippage + fee included)
  const [maxQuote, setMaxQuote] = useState<SellQuote | null>(null);

  // Re-default when ownership changes (e.g., after a sell)
  useEffect(() => {
    if (!ownedGroups.find(g => g.outcomeId === selectedOutcomeId) && ownedGroups.length > 0) {
      setSelectedOutcomeId(ownedGroups[0].outcomeId);
    }
  }, [ownedGroups.length]);

  const selectedGroup = outcomeGroups.find(g => g.outcomeId === selectedOutcomeId) || null;
  // Best position for the selected outcome (most shares)
  const selectedPos = selectedGroup
    ? [...selectedGroup.positions].sort((a: any, b: any) => b.shares - a.shares)[0] ?? null
    : null;
  const totalSideShares = selectedGroup?.shares ?? 0;

  const currentSharePrice = selectedGroup ? selectedGroup.probability / 100 : 0.5;

  // Fetch the REAL max (after slippage + fee) by quoting all shares
  useEffect(() => {
    if (!selectedPos || totalSideShares <= 0) { setMaxQuote(null); return; }
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(
          `/api/markets/${market.id}/sell-quote?outcomeId=${selectedPos.outcomeId ?? ''}&side=${selectedPos.side ?? ''}&shares=${totalSideShares}`
        );
        const data = await res.json();
        if (!cancelled && res.ok) setMaxQuote(data);
      } catch { /* noop */ }
    })();
    return () => { cancelled = true; };
  }, [selectedOutcomeId, market.id, totalSideShares, selectedPos]);

  const valueNum = parseFloat(value) || 0;
  // The input represents the GROSS sale value (before fee). The user enters how much
  // they "sell"; the fee is then visibly deducted to reach "Recibirás" (net).
  // Real max from backend (slippage-aware). Fallback to frontend approximation while loading.
  const maxValue = maxQuote?.grossAmount ?? (totalSideShares * currentSharePrice);
  const exceedsMax = valueNum > 0 && valueNum > maxValue + 0.005; // tiny epsilon
  // Map gross value → shares. Linear approximation around the max is very accurate.
  const sharesNum = valueNum > 0
    ? (valueNum >= maxValue - 0.005
        ? totalSideShares
        : Math.min((valueNum / maxValue) * totalSideShares, totalSideShares))
    : 0;

  useEffect(() => { setStep("configure"); setError(""); }, [value, selectedOutcomeId]);

  useEffect(() => {
    if (!selectedPos || sharesNum <= 0) { setSellQuote(null); return; }
    // Reuse maxQuote when selling everything (avoid redundant call)
    if (sharesNum >= totalSideShares - 1e-6 && maxQuote) {
      setSellQuote(maxQuote);
      return;
    }
    setQuoteLoading(true);
    const t = setTimeout(async () => {
      try {
        const res = await fetch(
          `/api/markets/${market.id}/sell-quote?outcomeId=${selectedPos.outcomeId ?? ''}&side=${selectedPos.side ?? ''}&shares=${sharesNum}`
        );
        const data = await res.json();
        if (res.ok) setSellQuote(data);
        else setError(data.error || "Error al cotizar");
      } catch { /* noop */ } finally { setQuoteLoading(false); }
    }, 400);
    return () => clearTimeout(t);
  }, [sharesNum, selectedOutcomeId, market.id, selectedPos, totalSideShares, maxQuote]);

  const handleConfirm = async () => {
    if (!selectedPos) return;
    setError(""); setLoading(true);
    try {
      const res = await fetch(`/api/positions/${selectedPos.id}/sell-lmsr`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, shares: sharesNum }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Error al vender");
      setValue(""); setSellQuote(null); setStep("configure"); onSuccess();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error");
      setStep("configure");
    } finally { setLoading(false); }
  };

  if (myPositions.length === 0) {
    return (
      <div className="flex flex-col items-center py-10 gap-2">
        <span className="text-3xl opacity-20">📭</span>
        <p className="text-[12px] text-gray-500 text-center">No tienes participaciones disponibles para vender</p>
      </div>
    );
  }

  // ── Review step ──────────────────────────────────────────────────────────────
  if (step === "review") {
    const feeRate = ((sellQuote?.feeRate ?? 0.015) * 100).toFixed(1);
    const reviewName = selectedGroup?.name ?? "";
    const isBinaryYes = reviewName === "YES";
    const isBinaryNo  = reviewName === "NO";
    const reviewColor = isBinaryYes ? "bg-primary/10" : isBinaryNo ? "bg-win-error/10" : "bg-purple-500/10";
    const reviewBadge = isBinaryYes
      ? "bg-primary/20 text-primary"
      : isBinaryNo
        ? "bg-win-error/20 text-win-error"
        : "bg-purple-500/20 text-purple-300";
    return (
      <div className="space-y-5">
        <button onClick={() => setStep("configure")}
          className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-gray-500 hover:text-white transition-colors">
          ← Volver
        </button>
        <div className="bg-win-bg rounded-2xl border border-white/8">
          <div className={`px-4 py-3 flex items-center gap-2 ${reviewColor}`}>
            <span className={`text-[10px] font-bold uppercase tracking-widest px-2 py-0.5 rounded-full ${reviewBadge}`}>
              {isBinaryYes || isBinaryNo ? labelEs(reviewName) : reviewName}
            </span>
            <span className="text-[11px] font-semibold text-white">Venta al mercado</span>
          </div>
          <div className="px-4 py-1">
            <Row label="Participaciones a vender" value={`${sharesNum.toFixed(2)}`} />
            <Row label="Precio promedio" value={`$${(sellQuote?.avgPricePerShare ?? 0).toFixed(4)}`} />
            <Row label="Monto bruto" value={`$${(sellQuote?.grossAmount ?? 0).toFixed(2)}`} />
            <Row label="Fee plataforma" value={`-$${(sellQuote?.feeAmount ?? 0).toFixed(2)}`}
              valueClass="text-gray-400"
              labelTip={`Comisión WIN del ${feeRate}% sobre el monto bruto.`} />
            <Row label="Recibirás" value={`$${(sellQuote?.netAmount ?? 0).toFixed(2)}`} valueClass="text-orange-300" />
          </div>
        </div>
        {error && <p className="text-win-error text-[11px] text-center">{error}</p>}
        <button onClick={handleConfirm} disabled={loading}
          className="w-full py-4 rounded-2xl text-[13px] font-bold uppercase tracking-wider bg-orange-500 text-white hover:brightness-110 shadow-lg shadow-orange-500/20 disabled:opacity-50 disabled:cursor-not-allowed transition-all">
          {loading ? "Procesando…" : "Confirmar Venta"}
        </button>
      </div>
    );
  }

  // ── Configure step ───────────────────────────────────────────────────────────
  return (
    <div className="space-y-4">
      {/* Accumulated position tiles: dynamic per outcome */}
      <div>
        <div className="text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-2">Posición</div>
        <div className={`grid gap-2 ${outcomeGroups.length <= 2 ? "grid-cols-2" : outcomeGroups.length === 3 ? "grid-cols-3" : "grid-cols-2"}`}>
          {outcomeGroups.map((g) => {
            const active = selectedOutcomeId === g.outcomeId;
            const isBinaryYes = g.name === "YES";
            const isBinaryNo  = g.name === "NO";
            // Color per outcome: YES=green, NO=red, others=purple variants
            const color = isBinaryYes ? "#64c883" : isBinaryNo ? "#f87171" : "#a78bfa";
            const hasShares = g.shares > 0;
            const label = isBinaryYes || isBinaryNo ? labelEs(g.name as any) : g.name;
            return (
              <button
                key={g.outcomeId}
                onClick={() => { if (hasShares) { setSelectedOutcomeId(g.outcomeId); setValue(""); } }}
                disabled={!hasShares}
                className="rounded-xl border px-3 py-2.5 text-left transition-all disabled:opacity-30 disabled:cursor-not-allowed"
                style={active
                  ? { borderColor: `${color}60`, background: `${color}12` }
                  : { borderColor: 'rgba(255,255,255,0.05)', background: 'transparent' }
                }
              >
                <div className="flex items-center gap-1.5 mb-1">
                  <span
                    className="text-[9px] font-bold px-1.5 py-0.5 rounded truncate max-w-full"
                    style={{ background: `${color}22`, color }}
                    title={label}
                  >
                    {label}
                  </span>
                </div>
                <div className="text-[15px] font-extrabold text-white leading-none">{g.shares.toFixed(2)}</div>
                <div className="text-[10px] text-gray-500 mt-0.5">
                  participaciones · <span className="text-gray-400">${g.totalAmount.toFixed(2)}</span>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Input */}
      <div>
        <div className="flex justify-between text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-1.5 px-0.5">
          <span>Valor de venta (bruto)</span>
          <button onClick={() => setValue(maxValue.toFixed(2))}
            className="text-orange-400 hover:text-orange-300 transition-colors">
            MAX ${maxValue.toFixed(2)}
          </button>
        </div>
        <div className="relative">
          <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 font-bold text-lg">$</span>
          <input
            type="number" placeholder="0.00" value={value}
            onChange={(e) => setValue(e.target.value)}
            onWheel={(e) => e.currentTarget.blur()}
            className={`w-full bg-win-bg border rounded-xl pl-8 pr-4 py-3 text-white font-bold text-lg outline-none transition-all [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none ${
              exceedsMax ? "border-win-error/50 focus:border-win-error/70" : "border-white/10 focus:border-orange-500/40"
            }`}
          />
        </div>
        {sharesNum > 0 && !exceedsMax && (
          <p className="text-[10px] text-gray-600 mt-1 px-1">≈ {sharesNum.toFixed(2)} participaciones a vender</p>
        )}
      </div>

      {exceedsMax && (
        <div className="px-3 py-2.5 bg-win-error/10 border border-win-error/20 rounded-xl">
          <p className="text-[11px] text-win-error font-bold">⚠ Supera el máximo disponible</p>
          <p className="text-[10px] text-gray-400 mt-0.5">Máximo de venta: ${maxValue.toFixed(2)}</p>
          <button onClick={() => setValue(maxValue.toFixed(2))}
            className="mt-1.5 text-[10px] font-bold text-orange-400 underline">
            Ajustar al máximo
          </button>
        </div>
      )}

      {/* Quote summary */}
      {sharesNum > 0 && (
        <div className="bg-win-bg rounded-2xl border border-white/8">
          <div className="px-4 py-1">
            <Row label="Participaciones" value={quoteLoading ? "…" : `${(sellQuote?.shares ?? sharesNum).toFixed(2)}`} />
            <Row label="Precio promedio" value={quoteLoading ? "…" : `$${(sellQuote?.avgPricePerShare ?? 0).toFixed(4)}`} />
            <Row label="Monto bruto" value={quoteLoading ? "…" : `$${(sellQuote?.grossAmount ?? 0).toFixed(2)}`} />
            <Row label="Fee plataforma" value={quoteLoading ? "…" : `-$${(sellQuote?.feeAmount ?? 0).toFixed(2)}`}
              valueClass="text-gray-400"
              labelTip={`Comisión WIN del ${((sellQuote?.feeRate ?? 0.015) * 100).toFixed(1)}% sobre el monto bruto.`} />
            <Row label="Recibirás" value={quoteLoading ? "…" : `$${(sellQuote?.netAmount ?? 0).toFixed(2)}`}
              valueClass="text-orange-300" />
          </div>
        </div>
      )}

      {error && <p className="text-win-error text-[11px] text-center">{error}</p>}

      <button
        disabled={!sharesNum || sharesNum <= 0 || exceedsMax || quoteLoading || !sellQuote}
        onClick={() => { setError(""); setStep("review"); }}
        className="w-full py-3.5 rounded-2xl text-[13px] font-bold uppercase tracking-wider bg-orange-500 text-white hover:brightness-105 shadow-lg shadow-orange-500/15 disabled:opacity-30 disabled:cursor-not-allowed transition-all">
        Revisar Venta →
      </button>
    </div>
  );
}

// ─── MAIN ─────────────────────────────────────────────────────────────────────
export function PredictionCard({ market, userId, userBalance, onSuccess }: PredictionCardProps) {
  const [mode, setMode] = useState<"BUY" | "SELL">("BUY");

  return (
    <div className="bg-win-card rounded-3xl p-5 shadow-2xl border border-white/5 space-y-5">
      {/* Header: solo título, sin arco */}
      <p className="font-bold text-white leading-snug" style={{ fontSize: 18 }}>
        {market.question}
      </p>

      {/* COMPRAR / VENDER — siempre visibles, 50% opacidad en inactivo */}
      <div className="flex gap-2">
        <button
          onClick={() => setMode("BUY")}
          className="flex-1 py-2.5 rounded-xl text-[12px] font-extrabold uppercase tracking-wider transition-all"
          style={{
            background: mode === "BUY" ? "#64c883" : "rgba(100,200,131,0.35)",
            color: "#0d1117",
          }}
        >
          Comprar
        </button>
        <button
          onClick={() => setMode("SELL")}
          className="flex-1 py-2.5 rounded-xl text-[12px] font-extrabold uppercase tracking-wider transition-all"
          style={{
            background: mode === "SELL" ? "#f97316" : "rgba(249,115,22,0.35)",
            color: mode === "SELL" ? "#fff" : "rgba(255,255,255,0.8)",
          }}
        >
          Vender
        </button>
      </div>

      {/* Content */}
      {mode === "BUY" ? (
        <BuyForm market={market} userId={userId} userBalance={userBalance} onSuccess={onSuccess} />
      ) : (
        <SellForm market={market} userId={userId} onSuccess={onSuccess} />
      )}
    </div>
  );
}
