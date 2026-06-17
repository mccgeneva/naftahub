"use client"

import { useState, useEffect } from "react"
import { ArrowUpRight, ArrowDownRight, RefreshCw } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

const initialRates = [
  { pair: "EUR/USD", rate: 1.0892, change: 0.15, direction: "up" },
  { pair: "GBP/USD", rate: 1.2645, change: -0.08, direction: "down" },
  { pair: "USD/CHF", rate: 0.8847, change: 0.22, direction: "up" },
  { pair: "EUR/GBP", rate: 0.8613, change: 0.05, direction: "up" },
  { pair: "USD/JPY", rate: 149.52, change: -0.12, direction: "down" },
  { pair: "AUD/USD", rate: 0.6542, change: 0.18, direction: "up" },
]

export function LiveRates() {
  const [rates, setRates] = useState(initialRates)
  const [lastUpdate, setLastUpdate] = useState(new Date())
  const [isRefreshing, setIsRefreshing] = useState(false)

  const refreshRates = () => {
    setIsRefreshing(true)
    setTimeout(() => {
      setRates((prev) =>
        prev.map((rate) => ({
          ...rate,
          rate: rate.rate + (Math.random() - 0.5) * 0.01,
          change: parseFloat((Math.random() * 0.4 - 0.2).toFixed(2)),
          direction: Math.random() > 0.5 ? "up" : "down",
        }))
      )
      setLastUpdate(new Date())
      setIsRefreshing(false)
    }, 500)
  }

  useEffect(() => {
    const interval = setInterval(refreshRates, 30000)
    return () => clearInterval(interval)
  }, [])

  return (
    <Card className="bg-card border-border gap-0 py-0 overflow-hidden">
      <CardHeader className="flex flex-row items-center justify-between border-b border-border px-4 py-2.5 [.border-b]:pb-2.5">
        <div className="flex items-center gap-2">
          <span className="h-3.5 w-1 rounded-full bg-primary" aria-hidden="true" />
          <div>
            <CardTitle className="text-xs font-semibold uppercase tracking-wider">Live FX Rates</CardTitle>
            <p className="font-mono text-[10px] text-muted-foreground">
              {lastUpdate.toLocaleTimeString("en-GB", { hour12: false })} UTC
            </p>
          </div>
        </div>
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7"
          onClick={refreshRates}
          disabled={isRefreshing}
        >
          <RefreshCw className={cn("h-3.5 w-3.5", isRefreshing && "animate-spin")} />
        </Button>
      </CardHeader>
      <CardContent className="p-0">
        <div className="divide-y divide-border">
          {rates.map((rate) => (
            <div
              key={rate.pair}
              className="flex items-center justify-between px-4 py-2 transition-colors hover:bg-secondary/50"
            >
              <div className="flex items-center gap-2">
                <span className="font-mono text-xs font-semibold text-foreground">{rate.pair}</span>
              </div>
              <div className="flex items-center gap-4">
                <span className="font-mono text-sm font-semibold tabular-nums text-foreground">
                  {rate.rate.toFixed(4)}
                </span>
                <span
                  className={cn(
                    "flex w-16 items-center justify-end font-mono text-xs font-medium tabular-nums",
                    rate.direction === "up" ? "text-success" : "text-destructive"
                  )}
                >
                  {rate.direction === "up" ? (
                    <ArrowUpRight className="h-3 w-3" />
                  ) : (
                    <ArrowDownRight className="h-3 w-3" />
                  )}
                  {Math.abs(rate.change).toFixed(2)}%
                </span>
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  )
}
