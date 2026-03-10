"use client";

import React, { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";

export function LmsrCalculator() {
  const [b, setB] = useState<number>(100);
  const [qYes, setQYes] = useState<number>(0);
  const [qNo, setQNo] = useState<number>(0);

  // Caps for simulation
  const [maxBetAmount, setMaxBetAmount] = useState<string>("");
  const [maxPriceImpact, setMaxPriceImpact] = useState<string>("");
  const [platformFeeRate, setPlatformFeeRate] = useState<string>("10");

  // Simulation state
  const [simAmount, setSimAmount] = useState<string>("100");
  const [simSide, setSimSide] = useState<"YES" | "NO">("YES");

  // Calculate current state locally
  const maxQ = b > 0 ? Math.max(qYes / b, qNo / b) : 0;
  const expYes = b > 0 ? Math.exp(qYes / b - maxQ) : 0;
  const expNo = b > 0 ? Math.exp(qNo / b - maxQ) : 0;
  const sum = expYes + expNo;

  const pYes = sum > 0 ? expYes / sum : 0.5;
  const pNo = sum > 0 ? expNo / sum : 0.5;
  const cost = b > 0 ? b * (maxQ + Math.log(sum)) : 0;

  const amount = parseFloat(simAmount) || 0;
  let simResult = null;

  if (amount > 0 && b > 0) {
    const feeRate = parseFloat(platformFeeRate) / 100 || 0;
    // Inclusive fee: Total = Net * (1 + platformFeeRate)
    // Net = Total / (1 + platformFeeRate)
    const netAmount = Number(amount) / (1 + feeRate);
    const feeAmount = Number(amount) - netAmount;

    let low = 0;
    let high = netAmount * 2; // Upper bound guess
    let shares = 0;

    // Binary search for shares
    for (let i = 0; i < 20; i++) {
      const mid = (low + high) / 2;
      const testQYes = simSide === "YES" ? qYes + mid : qYes;
      const testQNo = simSide === "NO" ? qNo + mid : qNo;

      const testMaxQ = Math.max(testQYes / b, testQNo / b);
      const costNew =
        b *
        (testMaxQ +
          Math.log(
            Math.exp(testQYes / b - testMaxQ) +
              Math.exp(testQNo / b - testMaxQ),
          ));
      const deltaCost = costNew - cost;

      if (Math.abs(deltaCost - netAmount) < 0.01) {
        shares = mid;
        break;
      }

      if (deltaCost > netAmount) high = mid;
      else low = mid;
    }
    shares = (low + high) / 2;

    const newQYes = simSide === "YES" ? qYes + shares : qYes;
    const newQNo = simSide === "NO" ? qNo + shares : qNo;

    const maxQNew = Math.max(newQYes / b, newQNo / b);
    const expYesNew = Math.exp(newQYes / b - maxQNew);
    const expNoNew = Math.exp(newQNo / b - maxQNew);
    const sumNew = expYesNew + expNoNew;

    const newPrices = {
      pYes: expYesNew / sumNew,
      pNo: expNoNew / sumNew,
    };

    // Price Impact Calculation
    const currentPrice = simSide === "YES" ? pYes : pNo;
    const newPrice = simSide === "YES" ? newPrices.pYes : newPrices.pNo;
    const priceImpact = (newPrice - currentPrice) * 100;

    // Validation
    const maxBet = parseFloat(maxBetAmount);
    const maxImpact = parseFloat(maxPriceImpact);

    let wouldExceedCap = false;
    let capReason = "";

    if (!isNaN(maxBet) && amount > maxBet) {
      wouldExceedCap = true;
      capReason = `Excede el monto máximo por transacción ($${maxBet})`;
    } else if (!isNaN(maxImpact) && priceImpact > maxImpact) {
      wouldExceedCap = true;
      capReason = `Excede el impacto de precio máximo (${priceImpact.toFixed(2)}% > ${maxImpact}%)`;
    }

    simResult = {
      shares,
      avgPrice: shares > 0 ? netAmount / shares : 0,
      newPrices,
      priceImpact,
      wouldExceedCap,
      capReason,
      feeAmount,
    };
  }

  // Liquidity Report Simulation
  const initialSeed = b * Math.LN2;
  const netInvestments = Math.max(0, cost - initialSeed);
  const netProfitLoss = netInvestments - initialSeed;

  return (
    <Card className="bg-[#121212] border-white/5">
      <CardHeader>
        <CardTitle className="text-white uppercase tracking-wider text-sm">
          Simulador LMSR
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="grid grid-cols-3 gap-4">
          <div>
            <label className="text-[10px] font-bold text-gray-400 uppercase">
              Liquidez (b)
            </label>
            <Input
              type="number"
              value={b}
              onChange={(e) => setB(parseFloat(e.target.value) || 100)}
              className="bg-[#0a0a0a] border-white/5 text-white"
            />
          </div>
          <div>
            <label className="text-[10px] font-bold text-gray-400 uppercase">
              Shares YES (q1)
            </label>
            <Input
              type="number"
              value={qYes}
              onChange={(e) => setQYes(parseFloat(e.target.value) || 0)}
              className="bg-[#0a0a0a] border-white/5 text-white"
            />
          </div>
          <div>
            <label className="text-[10px] font-bold text-gray-400 uppercase">
              Shares NO (q2)
            </label>
            <Input
              type="number"
              value={qNo}
              onChange={(e) => setQNo(parseFloat(e.target.value) || 0)}
              className="bg-[#0a0a0a] border-white/5 text-white"
            />
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="bg-[#0a0a0a] p-5 rounded-2xl border border-white/5 space-y-3">
            <h4 className="text-[10px] font-bold text-white uppercase tracking-wider mb-2">
              Balance de Liquidez (WIN)
            </h4>
            <div className="space-y-2">
              <div className="flex justify-between items-center text-[10px]">
                <span className="text-gray-500">
                  Liquidez puesta por WIN (b)
                </span>
                <span className="text-white font-bold">$ {b.toFixed(2)}</span>
              </div>
              <div className="flex justify-between items-center text-[10px]">
                <span className="text-gray-500">
                  Subsidio Inicial (Seed Cost)
                </span>
                <span className="text-white font-bold">
                  ${initialSeed.toFixed(2)}
                </span>
              </div>
              <div className="flex justify-between items-center text-[10px]">
                <span className="text-gray-500">Inversiones Netas (In)</span>
                <span className="text-white font-bold">
                  ${netInvestments.toFixed(2)}
                </span>
              </div>
              <div className="flex justify-between items-center text-[10px] pt-1 mt-1 border-t border-white/5">
                <span className="text-gray-400 font-bold uppercase">
                  PnL de Liquidez (Neto)
                </span>
                <span
                  className={`font-extrabold ${netProfitLoss >= 0 ? "text-[#64c883]" : "text-[#e16464]"}`}
                >
                  ${netProfitLoss.toFixed(2)}
                </span>
              </div>
              <div className="pt-2">
                <p className="text-[9px] text-gray-500 leading-tight italic">
                  * El Seed Cost se calcula como b × ln(2). El factor 0.6931
                  representa el costo de establecer las probabilidades al 50%
                  inicial en un mercado LMSR.
                </p>
              </div>
            </div>
          </div>

          <div className="bg-[#0a0a0a] p-5 rounded-2xl border border-white/5 grid grid-cols-2 gap-4 text-center items-center">
            <div>
              <div className="text-[10px] font-bold text-[#64c883] uppercase">
                Precio SÍ
              </div>
              <div className="text-2xl font-extrabold text-[#64c883]">
                {(pYes * 100).toFixed(1)}%
              </div>
            </div>
            <div>
              <div className="text-[10px] font-bold text-[#e16464] uppercase">
                Precio NO
              </div>
              <div className="text-2xl font-extrabold text-[#e16464]">
                {(pNo * 100).toFixed(1)}%
              </div>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-4">
          <div>
            <label className="text-[10px] font-bold text-gray-400 uppercase">
              CAP Pago ($)
            </label>
            <Input
              type="number"
              value={maxBetAmount}
              onChange={(e) => setMaxBetAmount(e.target.value)}
              placeholder="Sin límite"
              className="bg-[#0a0a0a] border-white/5 text-white"
            />
          </div>
          <div>
            <label className="text-[10px] font-bold text-gray-400 uppercase">
              CAP Impacto (%)
            </label>
            <Input
              type="number"
              value={maxPriceImpact}
              onChange={(e) => setMaxPriceImpact(e.target.value)}
              placeholder="Sin límite"
              className="bg-[#0a0a0a] border-white/5 text-white"
            />
          </div>
          <div>
            <label className="text-[10px] font-bold text-gray-400 uppercase">
              Comisión WIN (%)
            </label>
            <Input
              type="number"
              value={platformFeeRate}
              onChange={(e) => setPlatformFeeRate(e.target.value)}
              className="bg-[#0a0a0a] border-white/5 text-white"
            />
          </div>
        </div>

        <div className="pt-4 border-t border-white/5 space-y-4">
          <h4 className="text-[10px] font-bold text-gray-400 uppercase">
            Simular Compra
          </h4>
          <div className="flex gap-2">
            <div className="flex-1">
              <Input
                type="number"
                value={simAmount}
                onChange={(e) => setSimAmount(e.target.value)}
                className="bg-[#0a0a0a] border-white/5 text-white"
                placeholder="Monto ($)"
              />
            </div>
            <div className="flex gap-2">
              <Button
                onClick={() => setSimSide("YES")}
                className={`font-bold ${simSide === "YES" ? "bg-[#64c883] text-black" : "bg-[#1a2e21] text-[#64c883]"}`}
              >
                YES
              </Button>
              <Button
                onClick={() => setSimSide("NO")}
                className={`font-bold ${simSide === "NO" ? "bg-[#e16464] text-black" : "bg-[#2e1a1a] text-[#e16464]"}`}
              >
                NO
              </Button>
            </div>
          </div>

          {simResult && (
            <div className="bg-[#1a1a1a] p-3 rounded-lg text-xs space-y-1 border border-white/5">
              <div className="flex justify-between">
                <span className="text-gray-400">Shares Recibidas:</span>
                <span className="text-white font-bold">
                  {simResult.shares.toFixed(2)}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-400">Comisión WIN:</span>
                <span className="text-white font-bold">
                  ${simResult.feeAmount.toFixed(2)}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-400">Precio Promedio:</span>
                <span className="text-white font-bold">
                  ${simResult.avgPrice.toFixed(4)}
                </span>
              </div>
              <div className="flex justify-between pt-2 border-t border-white/5 mt-2">
                <span className="text-gray-400">Impacto p:</span>
                <span
                  className={`font-bold ${simResult.wouldExceedCap ? "text-[#e16464]" : "text-[#64c883]"}`}
                >
                  {simResult.priceImpact.toFixed(2)}%
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-400">Nuevo Precio {simSide}:</span>
                <span
                  className={`font-bold ${simSide === "YES" ? "text-[#64c883]" : "text-[#e16464]"}`}
                >
                  {(
                    simResult.newPrices[simSide === "YES" ? "pYes" : "pNo"] *
                    100
                  ).toFixed(2)}
                  %
                </span>
              </div>
              {simResult.wouldExceedCap && (
                <div className="mt-2 text-[#e16464] font-bold text-[10px] animate-pulse">
                  ⚠️ {simResult.capReason}
                </div>
              )}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
