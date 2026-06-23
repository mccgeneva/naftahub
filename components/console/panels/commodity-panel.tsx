"use client"

import { useEffect, useMemo, useState } from "react"
import { Droplet, TrendingUp, TrendingDown, Minus } from "lucide-react"
import { ConsolePanel } from "@/components/console/console-panel"
import {
  PORTS,
  PRODUCTS,
  getQuote,
  formatQuotePrice,
} from "@/lib/commodity-quotations"
import { cn } from "@/lib/utils"

// A compact CIF/FOB board for the console: the desk's key grades priced at a
// selectable benchmark port, refreshed on the hour like the full board.
const KEY_PRODUCT_IDS = PRODUCTS.slice(0, 8).map((p) => p.id)
const BENCHMARK_PORT_IDS = [
  PORTS[14]?.id, // Rotterdam
  PORTS[0]?.id,
].filter(Boolean) as string[]

export function CommodityPanel() {
  const [portId, setPortId] = useState(BENCHMARK_PORT_IDS[0] ?? PORTS[0].id)
  const [tick, setTick] = useState(0)

  useEffect(() => {
    const t = setInterval(() => setTick((n) => n + 1), 60_000)
    return () => clearInterval(t)
  }, [])

  const now = useMemo(() => new Date(), [tick])
  const port = PORTS.find((p) => p.id === portId) ?? PORTS[0]

  const rows = useMemo(
    () =>
      PRODUCTS.filter((p) => KEY_PRODUCT_IDS.includes(p.id)).map((product) => ({
        product,
        fob: getQuote(product, port, "FOB", now),
        cif: getQuote(product, port, "CIF", now),
      })),
    [port, now],
  )

  return (
    <ConsolePanel
      icon={Droplet}
      title="CIF / FOB Board"
      live
      actions={
        <select
          value={portId}
          onChange={(e) => setPortId(e.target.value)}
          className="max-w-[140px] rounded-sm border border-border bg-secondary px-1.5 py-0.5 text-[10px] text-foreground focus:border-primary focus:outline-none"
          aria-label="Benchmark port"
        >
          {PORTS.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      }
    >
      <table className="w-full text-xs">
        <thead className="sticky top-0 bg-card">
          <tr className="border-b border-border text-[9px] uppercase tracking-wider text-muted-foreground">
            <th className="px-3 py-1.5 text-left font-medium">Grade</th>
            <th className="px-3 py-1.5 text-right font-medium">FOB</th>
            <th className="px-3 py-1.5 text-right font-medium">CIF</th>
            <th className="px-3 py-1.5 text-right font-medium">24h</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(({ product, fob, cif }) => {
            const pct = cif.changePct
            const flat = Math.abs(pct) < 0.0005
            const up = pct > 0
            const Icon = flat ? Minus : up ? TrendingUp : TrendingDown
            return (
              <tr
                key={product.id}
                className="border-b border-border/50 transition-colors last:border-0 hover:bg-secondary/30"
              >
                <td className="px-3 py-1.5">
                  <p className="font-medium text-foreground">{product.name}</p>
                  <p className="text-[9px] text-muted-foreground">{product.category}</p>
                </td>
                <td className="px-3 py-1.5 text-right font-mono tabular-nums text-foreground">
                  {formatQuotePrice(fob.price, product.unit)}
                </td>
                <td className="px-3 py-1.5 text-right font-mono tabular-nums text-foreground">
                  {formatQuotePrice(cif.price, product.unit)}
                </td>
                <td
                  className={cn(
                    "px-3 py-1.5 text-right font-mono tabular-nums",
                    flat ? "text-muted-foreground" : up ? "text-success" : "text-destructive",
                  )}
                >
                  <span className="inline-flex items-center justify-end gap-0.5">
                    <Icon className="h-3 w-3" />
                    {up && !flat ? "+" : ""}
                    {(pct * 100).toFixed(2)}%
                  </span>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
      <p className="px-3 py-2 text-[10px] text-muted-foreground">
        Indicative cargo levels at {port.name}, {port.country}. Confirm firm pricing with the desk.
      </p>
    </ConsolePanel>
  )
}
