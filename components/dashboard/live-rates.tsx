"use client"

import { ArrowUpRight, ArrowDownRight, RefreshCw } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { useMarketQuotes } from "@/lib/use-market"

// FX pairs shown in the card, with their display precision. Rates and the
// percentage change are pulled live from the market-data feed.
const PAIRS: { pair: string; decimals: number }[] = [
  { pair: "EUR/USD", decimals: 4 },
  { pair: "GBP/USD", decimals: 4 },
  { pair: "USD/CHF", decimals: 4 },
  { pair: "EUR/GBP", decimals: 4 },
  { pair: "USD/JPY", decimals: 2 },
  { pair: "AUD/USD", decimals: 4 },
]

const SYMBOLS = PAIRS.map((p) => p.pair)

export function LiveRates() {
  const { quotes, updatedAt, isLoading, refresh } = useMarketQuotes(SYMBOLS)

  return (
    <Card className="bg-card border-border gap-0 py-0 overflow-hidden">
      <CardHeader className="flex flex-row items-center justify-between border-b border-border px-4 py-2.5 [.border-b]:pb-2.5">
        <div className="flex items-center gap-2">
          <span className="h-3.5 w-1 rounded-full bg-primary" aria-hidden="true" />
          <div>
            <CardTitle className="text-xs font-semibold uppercase tracking-wider">Live FX Rates</CardTitle>
            <p className="font-mono text-[10px] text-muted-foreground">
              {updatedAt ? updatedAt.toLocaleTimeString("en-GB", { hour12: false }) : "--:--:--"} UTC
            </p>
          </div>
        </div>
        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => refresh()} disabled={isLoading}>
          <RefreshCw className={cn("h-3.5 w-3.5", isLoading && "animate-spin")} />
        </Button>
      </CardHeader>
      <CardContent className="p-0">
        <div className="divide-y divide-border">
          {PAIRS.map(({ pair, decimals }) => {
            const q = quotes[pair]
            const up = (q?.changePct ?? 0) >= 0
            return (
              <div
                key={pair}
                className="flex items-center justify-between px-4 py-2 transition-colors hover:bg-secondary/50"
              >
                <div className="flex items-center gap-2">
                  <span className="font-mono text-xs font-semibold text-foreground">{pair}</span>
                </div>
                <div className="flex items-center gap-4">
                  <span className="font-mono text-sm font-semibold tabular-nums text-foreground">
                    {q ? q.price.toFixed(decimals) : "—"}
                  </span>
                  <span
                    className={cn(
                      "flex w-16 items-center justify-end font-mono text-xs font-medium tabular-nums",
                      q ? (up ? "text-success" : "text-destructive") : "text-muted-foreground",
                    )}
                  >
                    {q ? (
                      <>
                        {up ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />}
                        {Math.abs(q.changePct).toFixed(2)}%
                      </>
                    ) : (
                      "—"
                    )}
                  </span>
                </div>
              </div>
            )
          })}
        </div>
      </CardContent>
    </Card>
  )
}
