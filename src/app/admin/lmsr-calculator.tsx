'use client'

import React, { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card'
import { Input } from '@/components/ui/Input'
import { Button } from '@/components/ui/Button'

export function LmsrCalculator() {
  const [b, setB] = useState<number>(100)
  const [qYes, setQYes] = useState<number>(0)
  const [qNo, setQNo] = useState<number>(0)
  
  const [prices, setPrices] = useState({ pYes: 0.5, pNo: 0.5 })
  const [cost, setCost] = useState(0)
  
  // Caps for simulation
  const [maxBetAmount, setMaxBetAmount] = useState<string>('')
  const [maxPriceImpact, setMaxPriceImpact] = useState<string>('')

  // Simulation state
  const [simAmount, setSimAmount] = useState<string>('100')
  const [simSide, setSimSide] = useState<'YES' | 'NO'>('YES')
  const [simResult, setSimResult] = useState<any>(null)

  useEffect(() => {
    // Calculate current state locally
    const maxQ = Math.max(qYes / b, qNo / b)
    const expYes = Math.exp(qYes / b - maxQ)
    const expNo = Math.exp(qNo / b - maxQ)
    const sum = expYes + expNo
    
    setPrices({
      pYes: expYes / sum,
      pNo: expNo / sum
    })
    
    // Cost function: C = b * ln(exp(q1/b) + exp(q2/b))
    // Optimized: C = b * (maxQ + ln(sum))
    setCost(b * (maxQ + Math.log(sum)))

  }, [b, qYes, qNo])

  const runSimulation = () => {
    const amount = parseFloat(simAmount) || 0
    if (amount <= 0) return

    // This is a rough estimation client-side. 
    // Ideally we'd use the same service logic, but for a simple calculator, 
    // re-implementing the core logic here is fine for admin visualization.
    
    // To find shares for exact amount: C(new) - C(old) = amount
    // It requires iterative solution or binary search. 
    // For simplicity in this UI calculator, let's just approximate or show the "Next Share Price"
    
    // Let's implement a quick binary search for shares
    let low = 0
    let high = amount * 2 // Upper bound guess
    let shares = 0
    
    // Binary search for shares
    for(let i=0; i<20; i++) {
      const mid = (low + high) / 2
      const testQYes = simSide === 'YES' ? qYes + mid : qYes
      const testQNo  = simSide === 'NO'  ? qNo + mid  : qNo
      
      const maxQ = Math.max(testQYes / b, testQNo / b)
      const costNew = b * (maxQ + Math.log(Math.exp(testQYes / b - maxQ) + Math.exp(testQNo / b - maxQ)))
      const deltaCost = costNew - cost
      
      if (Math.abs(deltaCost - amount) < 0.01) {
        shares = mid
        break
      }
      
      if (deltaCost > amount) high = mid
      else low = mid
    }
    shares = (low + high) / 2

    const newQYes = simSide === 'YES' ? qYes + shares : qYes
    const newQNo = simSide === 'NO' ? qNo + shares : qNo
    
    const maxQNew = Math.max(newQYes / b, newQNo / b)
    const expYesNew = Math.exp(newQYes / b - maxQNew)
    const expNoNew = Math.exp(newQNo / b - maxQNew)
    const sumNew = expYesNew + expNoNew
    
    const newPrices = {
       pYes: expYesNew / sumNew,
       pNo: expNoNew / sumNew
    }

    // Price Impact Calculation
    const currentPrice = simSide === 'YES' ? prices.pYes : prices.pNo
    const newPrice = simSide === 'YES' ? newPrices.pYes : newPrices.pNo
    const priceImpact = (newPrice - currentPrice) * 100

    // Validation
    const maxBet = parseFloat(maxBetAmount)
    const maxImpact = parseFloat(maxPriceImpact)
    
    let wouldExceedCap = false
    let capReason = ''

    if (!isNaN(maxBet) && amount > maxBet) {
      wouldExceedCap = true
      capReason = `Excede el monto máximo por transacción ($${maxBet})`
    } else if (!isNaN(maxImpact) && priceImpact > maxImpact) {
      wouldExceedCap = true
      capReason = `Excede el impacto de precio máximo (${priceImpact.toFixed(2)}% > ${maxImpact}%)`
    }

    setSimResult({
      shares,
      avgPrice: amount / shares,
      newPrices,
      priceImpact,
      wouldExceedCap,
      capReason
    })
  }

  return (
    <Card className="bg-[#121212] border-white/5">
      <CardHeader>
        <CardTitle className="text-white uppercase tracking-wider text-sm">Simulador LMSR</CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="grid grid-cols-3 gap-4">
          <div>
            <label className="text-[10px] font-bold text-gray-400 uppercase">Liquidez (b)</label>
            <Input 
              type="number" 
              value={b} 
              onChange={(e) => setB(parseFloat(e.target.value) || 100)} 
              className="bg-[#0a0a0a] border-white/5 text-white"
            />
          </div>
          <div>
            <label className="text-[10px] font-bold text-gray-400 uppercase">Shares YES (q1)</label>
            <Input 
              type="number" 
              value={qYes} 
              onChange={(e) => setQYes(parseFloat(e.target.value) || 0)} 
              className="bg-[#0a0a0a] border-white/5 text-white"
            />
          </div>
          <div>
            <label className="text-[10px] font-bold text-gray-400 uppercase">Shares NO (q2)</label>
            <Input 
              type="number" 
              value={qNo} 
              onChange={(e) => setQNo(parseFloat(e.target.value) || 0)} 
              className="bg-[#0a0a0a] border-white/5 text-white"
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
           <div>
             <label className="text-[10px] font-bold text-gray-400 uppercase">CAP Pago ($)</label>
             <Input 
               type="number" 
               value={maxBetAmount} 
               onChange={(e) => setMaxBetAmount(e.target.value)} 
               placeholder="Sin límite"
               className="bg-[#0a0a0a] border-white/5 text-white"
             />
           </div>
           <div>
             <label className="text-[10px] font-bold text-gray-400 uppercase">CAP Impacto (%)</label>
             <Input 
               type="number" 
               value={maxPriceImpact} 
               onChange={(e) => setMaxPriceImpact(e.target.value)} 
               placeholder="Sin límite"
               className="bg-[#0a0a0a] border-white/5 text-white"
             />
           </div>
        </div>

        <div className="bg-[#0a0a0a] p-4 rounded-xl border border-white/5 grid grid-cols-2 gap-4 text-center">
           <div>
             <div className="text-[10px] font-bold text-[#64c883] uppercase">Precio SÍ</div>
             <div className="text-2xl font-extrabold text-[#64c883]">{(prices.pYes * 100).toFixed(2)}%</div>
           </div>
           <div>
             <div className="text-[10px] font-bold text-[#e16464] uppercase">Precio NO</div>
             <div className="text-2xl font-extrabold text-[#e16464]">{(prices.pNo * 100).toFixed(2)}%</div>
           </div>
        </div>

        <div className="pt-4 border-t border-white/5 space-y-4">
           <h4 className="text-[10px] font-bold text-gray-400 uppercase">Simular Compra</h4>
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
                   onClick={() => setSimSide('YES')}
                   className={`font-bold ${simSide === 'YES' ? 'bg-[#64c883] text-black' : 'bg-[#1a2e21] text-[#64c883]'}`}
                >
                  YES
                </Button>
                <Button 
                   onClick={() => setSimSide('NO')}
                   className={`font-bold ${simSide === 'NO' ? 'bg-[#e16464] text-black' : 'bg-[#2e1a1a] text-[#e16464]'}`}
                >
                  NO
                </Button>
             </div>
           </div>
           
           <Button onClick={runSimulation} className="w-full bg-white text-black font-bold uppercase tracking-wider text-xs">Calculadora</Button>

           {simResult && (
             <div className="bg-[#1a1a1a] p-3 rounded-lg text-xs space-y-1 border border-white/5">
                <div className="flex justify-between">
                   <span className="text-gray-400">Shares Recibidas:</span>
                   <span className="text-white font-bold">{simResult.shares.toFixed(2)}</span>
                </div>
                <div className="flex justify-between">
                   <span className="text-gray-400">Precio Promedio:</span>
                   <span className="text-white font-bold">${simResult.avgPrice.toFixed(3)}</span>
                </div>
                 <div className="flex justify-between pt-2 border-t border-white/5 mt-2">
                    <span className="text-gray-400">Impacto p:</span>
                    <span className={`font-bold ${simResult.wouldExceedCap ? 'text-[#e16464]' : 'text-[#64c883]'}`}>
                       {simResult.priceImpact.toFixed(2)}%
                    </span>
                 </div>
                 <div className="flex justify-between">
                    <span className="text-gray-400">Nuevo Precio {simSide}:</span>
                    <span className={`font-bold ${simSide === 'YES' ? 'text-[#64c883]' : 'text-[#e16464]'}`}>
                       {(simResult.newPrices[simSide === 'YES' ? 'pYes' : 'pNo'] * 100).toFixed(2)}%
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
  )
}
