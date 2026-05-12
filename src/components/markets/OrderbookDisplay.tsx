"use client";

import React, { useMemo } from 'react';

type Order = {
  id: string;
  side: "YES" | "NO";
  type: string;
  pricePerShare: number;
  remainingShares: number;
  user: { username: string | null };
};

export function OrderbookDisplay({ orders, onOrderClick }: { orders: Order[], onOrderClick?: (side: 'YES'|'NO', price: number, shares: number) => void }) {
  // Aggregate limits by price level and side
  const { yesBids, yesAsks, noBids, noAsks } = useMemo(() => {
    // Current MVP only has SELL limit orders technically (from the plan limitation)
    // but the system theoretically supports BUY limit orders too.
    
    const groupByPriceAndSide = (sideFilter: "YES"|"NO", typeFilter: string) => {
      const filtered = orders.filter(o => o.side === sideFilter && o.type === typeFilter);
      
      const aggregated: Record<number, number> = {};
      filtered.forEach(o => {
        aggregated[o.pricePerShare] = (aggregated[o.pricePerShare] || 0) + o.remainingShares;
      });

      return Object.entries(aggregated)
         .map(([price, totalShares]) => ({ price: parseFloat(price), totalShares }))
         .sort((a,b) => typeFilter === "BUY" ? b.price - a.price : a.price - b.price); 
         // Buys: highest price first. Sells: lowest price first
    };

    return {
       yesBids: groupByPriceAndSide("YES", "BUY"),
       yesAsks: groupByPriceAndSide("YES", "SELL"),
       // For NO:
       noBids: groupByPriceAndSide("NO", "BUY"),
       noAsks: groupByPriceAndSide("NO", "SELL"),
    };
  }, [orders]);

  const renderBook = (bids: {price:number, totalShares:number}[], asks: {price:number, totalShares:number}[], colorClass: string, lightBg: string, label: "YES"|"NO") => {
    return (
      <div className={`flex flex-col rounded-xl overflow-hidden border border-win-hover bg-win-card shadow-sm`}>
        <div className={`p-3 text-center font-bold text-sm tracking-widest uppercase ${lightBg} border-b border-win-hover`}>
          Orderbook: <span className={colorClass}>{label}</span>
        </div>

        <div className="grid grid-cols-2 text-[10px] font-bold text-win-text-tertiary uppercase tracking-wider p-2 px-4 bg-win-bg border-b border-win-hover">
           <div>Shares Size</div>
           <div className="text-right">Price ($)</div>
        </div>

        <div className="flex flex-col p-2 space-y-0.5">
           {/* ASKS (Ventas) renderizamos de mas caro a mas barato si hubieran muchos, pero el sort ya nos da los mejores arriba. */}
           {asks.length > 0 ? (
             asks.slice(0, 5).reverse().map((ask, i) => (
                <div 
                  key={`ask-${i}`} 
                  className="grid grid-cols-2 text-sm px-2 py-1 items-center hover:bg-win-hover rounded group cursor-pointer transition-colors"
                  onClick={() => onOrderClick && onOrderClick(label, ask.price, ask.totalShares)}
                >
                  <div className="text-win-text-tertiary font-medium">{ask.totalShares.toFixed(1)}</div>
                  <div className={`text-right font-bold text-win-error group-hover:text-win-error-hover`}>{ask.price.toFixed(2)}</div>
                </div>
             ))
           ) : (
             <div className="text-center text-xs text-win-text-tertiary py-2 italic">Sin Limites de Venta</div>
           )}

           <div className="my-1 border-t border-dashed border-win-hover"></div>

           {/* BIDS (Compras) */}
           {bids.length > 0 ? (
             bids.slice(0, 5).map((bid, i) => (
                <div 
                  key={`bid-${i}`} 
                  className="grid grid-cols-2 text-sm px-2 py-1 items-center hover:bg-win-hover rounded group cursor-pointer transition-colors"
                  onClick={() => onOrderClick && onOrderClick(label, bid.price, bid.totalShares)}
                >
                  <div className="text-win-text-tertiary font-medium">{bid.totalShares.toFixed(1)}</div>
                  <div className={`text-right font-bold text-primary group-hover:text-primary-hover`}>{bid.price.toFixed(2)}</div>
                </div>
             ))
           ) : (
             <div className="text-center text-xs text-win-text-tertiary py-2 italic">Sin Limites de Compra</div>
           )}
        </div>
      </div>
    );
  };

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      {renderBook(yesBids, yesAsks, "text-primary", "bg-win-success-tint", "YES")}
      {renderBook(noBids, noAsks, "text-win-error", "bg-win-error-tint", "NO")}
    </div>
  );
}
