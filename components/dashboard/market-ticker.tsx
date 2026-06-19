"use client"

import { cn } from "@/lib/utils"
import { useMarketQuotes } from "@/lib/use-market"

type TickerMeta = {
  symbol: string
  decimals: number
}

// Display order + formatting precision for each instrument. Prices and the
// percentage change come live from the market-data feed (see useMarketQuotes).
const META: TickerMeta[] = [
  { symbol: "EUR/USD", decimals: 4 },
  { symbol: "GBP/USD", decimals: 4 },
  { symbol: "USD/CHF", decimals: 4 },
  { symbol: "USD/JPY", decimals: 2 },
  { symbol: "XAU/USD", decimals: 1 },
  { symbol: "BRENT", decimals: 2 },
  { symbol: "WTI", decimals: 2 },
  { symbol: "SPX", decimals: 1 },
  { symbol: "NDX", decimals: 1 },
  { symbol: "UKX", decimals: 1 },
  { symbol: "DAX", decimals: 1 },
  { symbol: "US10Y", decimals: 3 },
  { symbol: "BTC/USD", decimals: 0 },
  { symbol: "VIX", decimals: 2 },
]

const SYMBOLS = META.map((m) => m.symbol)

function fmt(n: number, decimals: number) {
  return n.toLocaleString("en-US", { minimumFractionDigits: decimals, maximumFractionDigits: decimals })
}

export function MarketTicker() {
  const { quotes } = useMarketQuotes(SYMBOLS)

  // Only show instruments we have a live quote for; duplicate the list so the
  // marquee can loop seamlessly (-50% translate).
  const items = META.filter((m) => quotes[m.symbol])
  const loop = [...items, ...items]

  return (
    <div className="flex h-8 items-center overflow-hidden border-b border-border bg-background">
      <span className="flex h-full shrink-0 items-center gap-1.5 border-r border-border bg-primary px-3 text-[10px] font-bold uppercase tracking-wider text-primary-foreground">
        <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-primary-foreground" />
        Markets
      </span>
      <div className="flex-1 overflow-hidden">
        {loop.length === 0 ? (
          <span className="px-4 font-mono text-[11px] text-muted-foreground">Loading live market data…</span>
        ) : (
          <div className="ticker-track flex animate-ticker whitespace-nowrap will-change-transform">
            {loop.map((t, i) => {
              const q = quotes[t.symbol]
              const up = q.changePct >= 0
              return (
                <span
                  key={`${t.symbol}-${i}`}
                  className="flex items-center gap-1.5 px-4 font-mono text-[11px] tabular-nums"
                >
                  <span className="font-semibold text-muted-foreground">{t.symbol}</span>
                  <span className="text-foreground">{fmt(q.price, t.decimals)}</span>
                  <span className={cn("font-medium", up ? "text-success" : "text-destructive")}>
                    {up ? "▲" : "▼"} {Math.abs(q.changePct).toFixed(2)}%
                  </span>
                </span>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
