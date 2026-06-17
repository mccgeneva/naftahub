"use client"

import { useMemo } from "react"
import {
  Area,
  AreaChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { useLedger, convertCurrency } from "@/lib/ledger-store"

const formatValue = (value: number) => {
  if (value >= 1000000000) {
    return `€${(value / 1000000000).toFixed(1)}B`
  }
  if (value >= 1000000) {
    return `€${(value / 1000000).toFixed(1)}M`
  }
  return `€${value.toLocaleString()}`
}

export function PortfolioChart() {
  const { entries } = useLedger()

  // Build a real cumulative-balance series (in EUR) from completed ledger
  // entries, ordered by date. No data is fabricated: each point reflects the
  // running total after an actual recorded payment.
  const series = useMemo(() => {
    const completed = entries
      .filter((e) => e.status === "completed")
      .slice()
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())

    let running = 0
    const points = completed.map((e) => {
      const signed = e.direction === "credit" ? e.amount : -e.amount
      running += convertCurrency(signed, e.currency, "EUR")
      return {
        date: new Date(e.date).toLocaleDateString("en-GB", { day: "2-digit", month: "short" }),
        value: Math.round(running),
      }
    })
    return points
  }, [entries])

  const currentValue = series.length ? series[series.length - 1].value : 0

  return (
    <Card className="bg-card border-border">
      <CardHeader className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <CardTitle className="text-lg font-semibold">Portfolio Performance</CardTitle>
          <p className="text-xs text-muted-foreground mt-1">
            Cumulative balance across all accounts (EUR)
          </p>
        </div>
        <div className="text-right">
          <p className="text-2xl font-bold text-foreground">{formatValue(currentValue)}</p>
          <p className="text-xs text-muted-foreground">Current total</p>
        </div>
      </CardHeader>
      <CardContent>
        {series.length === 0 ? (
          <div className="flex h-[300px] flex-col items-center justify-center text-center">
            <p className="text-sm font-medium text-foreground">No activity yet</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Your balance history will appear here as payments are recorded.
            </p>
          </div>
        ) : (
          <div className="h-[300px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart
                data={series}
                margin={{ top: 10, right: 10, left: 0, bottom: 0 }}
              >
                <defs>
                  <linearGradient id="colorValue" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <XAxis
                  dataKey="date"
                  stroke="hsl(var(--muted-foreground))"
                  fontSize={12}
                  tickLine={false}
                  axisLine={false}
                />
                <YAxis
                  stroke="hsl(var(--muted-foreground))"
                  fontSize={12}
                  tickLine={false}
                  axisLine={false}
                  tickFormatter={formatValue}
                />
                <Tooltip
                  content={({ active, payload }) => {
                    if (active && payload && payload.length) {
                      return (
                        <div className="rounded-lg border border-border bg-card p-3 shadow-lg">
                          <p className="text-xs text-muted-foreground">
                            {payload[0].payload.date}
                          </p>
                          <p className="text-lg font-bold text-foreground">
                            {formatValue(payload[0].value as number)}
                          </p>
                        </div>
                      )
                    }
                    return null
                  }}
                />
                <Area
                  type="monotone"
                  dataKey="value"
                  stroke="hsl(var(--primary))"
                  strokeWidth={2}
                  fillOpacity={1}
                  fill="url(#colorValue)"
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
