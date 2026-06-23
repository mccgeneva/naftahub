"use client"

import { Fragment, useMemo, useState } from "react"
import { LineChart, RefreshCw, TrendingUp, TrendingDown } from "lucide-react"
import { ConsolePanel } from "@/components/console/console-panel"
import { useMarketQuotes } from "@/lib/use-market"
import { cn } from "@/lib/utils"

// Bloomberg-style watchlist grouped into the desk's core asset classes.
const GROUPS: { label: string; symbols: string[] }[] = [
  { label: "Energy", symbols: ["BRENT", "WTI", "NG", "XAU/USD"] },
  { label: "FX", symbols: ["EUR/USD", "GBP/USD", "USD/CHF", "USD/JPY", "USD/CAD"] },
  { label: "Indices", symbols: ["SPX", "NDX", "DAX", "UKX"] },
  { label: "Rates / Vol", symbols: ["US10Y", "VIX"] },
  { label: "Crypto", symbols: ["BTC/USD", "ETH/USD"] },
]

const ALL_SYMBOLS = GROUPS.flatMap((g) => g.symbols)

// Decimal precision per instrument family for clean tabular display.
function decimalsFor(symbol: string): number {
  if (symbol === "US10Y" || symbol === "VIX") return 2
  if (symbol.includes("/USD") && (symbol.startsWith("BTC") || symbol.startsWith("ETH"))) return 0
  if (symbol === "SPX" || symbol === "NDX" || symbol === "DAX" || symbol === "UKX") return 1
  if (symbol.includes("JPY")) return 2
  if (symbol.includes("/")) return 4
  return 2
}

function formatPrice(symbol: string, price: number): string {
  return price.toLocaleString("en-US", {
    minimumFractionDigits: decimalsFor(symbol),
    maximumFractionDigits: decimalsFor(symbol),
  })
}

export function MarketsPanel() {
  const { quotes, updatedAt, isLoading, refresh } = useMarketQuotes(ALL_SYMBOLS)
  const [flash, setFlash] = useState(false)

  const stamp = useMemo(
    () => (updatedAt ? updatedAt.toLocaleTimeString("en-GB", { hour12: false }) : "--:--:--"),
    [updatedAt],
  )

  const onRefresh = () => {
    setFlash(true)
    refresh()
    setTimeout(() => setFlash(false), 400)
  }

  return (
    <ConsolePanel
      icon={LineChart}
      title="Markets"
      live
      actions={
        <>
          <span className="hidden font-mono text-[10px] tabular-nums text-muted-foreground sm:inline">{stamp}</span>
          <button
            type="button"
            onClick={onRefresh}
            aria-label="Refresh quotes"
            className="flex h-6 w-6 items-center justify-center rounded-sm text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
          >
            <RefreshCw className={cn("h-3 w-3", flash && "animate-spin")} />
          </button>
        </>
      }
    >
      <table className="w-full text-xs">
        <tbody>
          {GROUPS.map((group) => (
            <Fragment key={group.label}>
              <tr className="bg-secondary/40">
                <td
                  colSpan={3}
                  className="px-3 py-1 text-[9px] font-semibold uppercase tracking-wider text-muted-foreground"
                >
                  {group.label}
                </td>
              </tr>
              {group.symbols.map((symbol) => {
                const q = quotes[symbol]
                const up = (q?.changePct ?? 0) >= 0
                return (
                  <tr
                    key={symbol}
                    className="border-b border-border/50 transition-colors last:border-0 hover:bg-secondary/30"
                  >
                    <td className="px-3 py-1.5 font-medium text-foreground">{symbol}</td>
                    <td className="px-3 py-1.5 text-right font-mono tabular-nums text-foreground">
                      {q ? formatPrice(symbol, q.price) : isLoading ? "···" : "—"}
                    </td>
                    <td
                      className={cn(
                        "px-3 py-1.5 text-right font-mono tabular-nums",
                        !q ? "text-muted-foreground" : up ? "text-success" : "text-destructive",
                      )}
                    >
                      {q ? (
                        <span className="inline-flex items-center justify-end gap-0.5">
                          {up ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
                          {up ? "+" : ""}
                          {q.changePct.toFixed(2)}%
                        </span>
                      ) : (
                        "—"
                      )}
                    </td>
                  </tr>
                )
              })}
            </Fragment>
          ))}
        </tbody>
      </table>
    </ConsolePanel>
  )
}
