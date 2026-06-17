"use client"

import { useEffect, useState } from "react"
import { cn } from "@/lib/utils"

type Ticker = {
  symbol: string
  last: number
  decimals: number
  change: number
}

const seed: Ticker[] = [
  { symbol: "EUR/USD", last: 1.0892, decimals: 4, change: 0.15 },
  { symbol: "GBP/USD", last: 1.2645, decimals: 4, change: -0.08 },
  { symbol: "USD/CHF", last: 0.8847, decimals: 4, change: 0.22 },
  { symbol: "USD/JPY", last: 149.52, decimals: 2, change: -0.12 },
  { symbol: "XAU/USD", last: 2331.4, decimals: 1, change: 0.62 },
  { symbol: "BRENT", last: 82.14, decimals: 2, change: -0.34 },
  { symbol: "WTI", last: 78.05, decimals: 2, change: -0.41 },
  { symbol: "SPX", last: 5421.0, decimals: 1, change: 0.28 },
  { symbol: "NDX", last: 19210.5, decimals: 1, change: 0.46 },
  { symbol: "UKX", last: 8204.2, decimals: 1, change: -0.11 },
  { symbol: "DAX", last: 18512.3, decimals: 1, change: 0.19 },
  { symbol: "US10Y", last: 4.218, decimals: 3, change: 0.03 },
  { symbol: "BTC/USD", last: 67214.0, decimals: 0, change: 1.24 },
  { symbol: "VIX", last: 13.42, decimals: 2, change: -0.87 },
]

function fmt(n: number, decimals: number) {
  return n.toLocaleString("en-US", { minimumFractionDigits: decimals, maximumFractionDigits: decimals })
}

export function MarketTicker() {
  const [items, setItems] = useState<Ticker[]>(seed)

  useEffect(() => {
    const id = setInterval(() => {
      setItems((prev) =>
        prev.map((t) => {
          const drift = (Math.random() - 0.5) * (t.last * 0.0008)
          const next = t.last + drift
          return { ...t, last: next, change: parseFloat((Math.random() * 1.6 - 0.8).toFixed(2)) }
        }),
      )
    }, 4000)
    return () => clearInterval(id)
  }, [])

  // Duplicate the list so the marquee can loop seamlessly (-50% translate).
  const loop = [...items, ...items]

  return (
    <div className="flex h-8 items-center overflow-hidden border-b border-border bg-background">
      <span className="flex h-full shrink-0 items-center gap-1.5 border-r border-border bg-primary px-3 text-[10px] font-bold uppercase tracking-wider text-primary-foreground">
        <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-primary-foreground" />
        Markets
      </span>
      <div className="flex-1 overflow-hidden">
        <div className="ticker-track flex animate-ticker whitespace-nowrap will-change-transform">
          {loop.map((t, i) => {
            const up = t.change >= 0
            return (
              <span
                key={`${t.symbol}-${i}`}
                className="flex items-center gap-1.5 px-4 font-mono text-[11px] tabular-nums"
              >
                <span className="font-semibold text-muted-foreground">{t.symbol}</span>
                <span className="text-foreground">{fmt(t.last, t.decimals)}</span>
                <span className={cn("font-medium", up ? "text-success" : "text-destructive")}>
                  {up ? "▲" : "▼"} {Math.abs(t.change).toFixed(2)}%
                </span>
              </span>
            )
          })}
        </div>
      </div>
    </div>
  )
}
