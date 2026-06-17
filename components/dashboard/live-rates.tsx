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
    <Card className="bg-card border-border">
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <div>
          <CardTitle className="text-lg font-semibold">Live FX Rates</CardTitle>
          <p className="text-xs text-muted-foreground mt-1">
            Updated {lastUpdate.toLocaleTimeString()}
          </p>
        </div>
        <Button
          variant="ghost"
          size="icon"
          onClick={refreshRates}
          disabled={isRefreshing}
        >
          <RefreshCw className={cn("h-4 w-4", isRefreshing && "animate-spin")} />
        </Button>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          {rates.map((rate) => (
            <div
              key={rate.pair}
              className="flex items-center justify-between py-2 border-b border-border last:border-0"
            >
              <div className="flex items-center gap-3">
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-secondary">
                  <span className="text-xs font-medium text-foreground">
                    {rate.pair.split("/")[0]}
                  </span>
                </div>
                <div>
                  <p className="text-sm font-medium text-foreground">{rate.pair}</p>
                  <p className="text-xs text-muted-foreground">Live rate</p>
                </div>
              </div>
              <div className="text-right">
                <p className="text-sm font-mono font-semibold text-foreground">
                  {rate.rate.toFixed(4)}
                </p>
                <p
                  className={cn(
                    "flex items-center justify-end text-xs font-medium",
                    rate.direction === "up" ? "text-green-500" : "text-red-500"
                  )}
                >
                  {rate.direction === "up" ? (
                    <ArrowUpRight className="h-3 w-3" />
                  ) : (
                    <ArrowDownRight className="h-3 w-3" />
                  )}
                  {Math.abs(rate.change).toFixed(2)}%
                </p>
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  )
}
