"use client"

import { useMemo, useState } from "react"
import {
  Search,
  Plus,
  Pencil,
  Bell,
  ChevronRight,
  ChevronLeft,
  Minus,
  Bell as BellIcon,
  Maximize2,
  ArrowUp,
  ArrowDown,
  ClipboardList,
  CandlestickChart,
  PieChart,
  LayoutPanelLeft,
  LayoutGrid,
  X,
  ArrowDownToLine,
  ArrowUpFromLine,
  Layers,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { TradingViewWidget } from "@/components/market/tradingview-widget"
import { tradingViewSymbol } from "@/lib/market-symbols"

// Faithful light-theme cTrader mobile skin. It is a pure presentation layer:
// every figure and action is wired to the existing ring-fenced trading engine
// on the trading page (quotes, positions, wallet, order ticket). It renders no
// money logic of its own.

export type TerminalInstrument = {
  symbol: string
  name: string
  category: string
  price: number
  decimals: number
  change: number
  live?: boolean
}

export type TerminalPosition = {
  id: string
  symbol: string
  name: string
  side: "LONG" | "SHORT"
  lots: number
  entry: number
  current: number
  decimals: number
  pnl: number
}

type TerminalTab = "markets" | "charts" | "positions" | "blotter" | "account"

interface CtraderTerminalProps {
  instruments: TerminalInstrument[]
  positions: TerminalPosition[]
  balance: number
  equity: number
  openPnl: number
  freeMargin: number
  usedMargin: number
  marginLevel: number | null
  formatEur: (n: number) => string
  formatPrice: (value: number, decimals: number) => string
  marketStatus: (category: string) => { open: boolean; label: string }
  onTrade: (symbol: string, side: "LONG" | "SHORT") => void
  onClose: (id: string) => void
  onManage: () => void
  onFund: () => void
  onWithdraw: () => void
  onAlerts: () => void
  onExitTerminal: () => void
}

// cTrader palette (scoped to this faithful clone).
const GREEN = "#2f9e58"
const RED = "#d9534f"
const OIL = "#df6a3c"
const GRIP = "#e0a63a"
const INK = "#0f1115"
const MUTED = "#8a8f98"

function hashCode(str: string) {
  let h = 0
  for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) | 0
  return Math.abs(h)
}

// Deterministic pseudo price-walk for the row sparkline: no randomness, so it is
// stable per symbol and only drifts in the direction of the live percent change.
function sparkPath(symbol: string, change: number, w: number, h: number) {
  const n = 30
  let seed = hashCode(symbol) || 1
  const vals: number[] = []
  let v = 0
  for (let i = 0; i < n; i++) {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff
    const r = (seed % 1000) / 1000 - 0.5
    v += r * 1.6 + (change / 100) * 2.2 * (i / n)
    vals.push(v)
  }
  const min = Math.min(...vals)
  const max = Math.max(...vals)
  const range = max - min || 1
  const pad = h * 0.14
  const pts = vals.map((val, i) => {
    const x = (i / (n - 1)) * w
    const y = h - pad - ((val - min) / range) * (h - pad * 2)
    return [x, y] as const
  })
  const line = pts.map(([x, y], i) => `${i === 0 ? "M" : "L"}${x.toFixed(1)} ${y.toFixed(1)}`).join(" ")
  const area = `${line} L${w} ${h} L0 ${h} Z`
  return { line, area }
}

// Render a price with its final digit as a small subscript, exactly like cTrader.
function PriceText({ value, decimals, className }: { value: number; decimals: number; className?: string }) {
  const str = value.toLocaleString("en-US", { minimumFractionDigits: decimals, maximumFractionDigits: decimals })
  const head = str.slice(0, -1)
  const tail = str.slice(-1)
  return (
    <span className={className}>
      {head}
      <span className="relative top-[0.18em] text-[0.62em]">{tail}</span>
    </span>
  )
}

function Sparkline({ symbol, change }: { symbol: string; change: number }) {
  const w = 120
  const h = 44
  const color = change >= 0 ? GREEN : OIL
  const { line, area } = useMemo(() => sparkPath(symbol, change, w, h), [symbol, change])
  const gid = `sg-${hashCode(symbol)}`
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} className="overflow-visible">
      <defs>
        <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.22" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={area} fill={`url(#${gid})`} />
      <path d={line} fill="none" stroke={color} strokeWidth="1.6" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  )
}

// Fast, self-rendered detail chart (no external iframe → instant, never blank).
// Same deterministic price-walk as the row sparkline, drawn large with gridlines,
// price labels, a current-price line and a pulsing live end-dot.
function DetailChart({
  symbol,
  change,
  price,
  decimals,
  high,
  low,
}: {
  symbol: string
  change: number
  price: number
  decimals: number
  high: number
  low: number
}) {
  const W = 340
  const H = 280
  const up = change >= 0
  const color = up ? GREEN : OIL
  const { pts, line, area } = useMemo(() => {
    const n = 64
    let seed = hashCode(symbol) || 1
    const vals: number[] = []
    let v = 0
    for (let i = 0; i < n; i++) {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff
      const r = (seed % 1000) / 1000 - 0.5
      v += r * 1.6 + (change / 100) * 2.2 * (i / n)
      vals.push(v)
    }
    const min = Math.min(...vals)
    const max = Math.max(...vals)
    const range = max - min || 1
    const padY = H * 0.1
    const p = vals.map((val, i) => {
      const x = (i / (n - 1)) * W
      const y = H - padY - ((val - min) / range) * (H - padY * 2)
      return [x, y] as const
    })
    const ln = p.map(([x, y], i) => `${i === 0 ? "M" : "L"}${x.toFixed(1)} ${y.toFixed(1)}`).join(" ")
    return { pts: p, line: ln, area: `${ln} L${W} ${H} L0 ${H} Z` }
  }, [symbol, change])
  const last = pts[pts.length - 1] ?? [W, H / 2]
  const gid = `dg-${hashCode(symbol)}`
  const rows = [0, 0.25, 0.5, 0.75, 1]
  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      width="100%"
      height={300}
      preserveAspectRatio="xMidYMid meet"
      className="block"
    >
      <defs>
        <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.20" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      {rows.map((f) => {
        const y = f * H
        const p = high - f * (high - low)
        return (
          <g key={f}>
            <line x1={0} y1={y} x2={W} y2={y} stroke="#00000010" strokeWidth={1} strokeDasharray="3 4" />
            <text x={W - 3} y={Math.min(H - 4, Math.max(11, y - 4))} textAnchor="end" fontSize={10} fill={MUTED}>
              {p.toLocaleString("en-US", { minimumFractionDigits: decimals, maximumFractionDigits: decimals })}
            </text>
          </g>
        )
      })}
      <path d={area} fill={`url(#${gid})`} />
      <path d={line} fill="none" stroke={color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
      <line x1={0} y1={last[1]} x2={W} y2={last[1]} stroke={color} strokeWidth={1} strokeDasharray="2 3" opacity={0.6} />
      <circle cx={last[0]} cy={last[1]} r={7} fill={color} opacity={0.18}>
        <animate attributeName="r" values="5;10;5" dur="1.8s" repeatCount="indefinite" />
        <animate attributeName="opacity" values="0.28;0;0.28" dur="1.8s" repeatCount="indefinite" />
      </circle>
      <circle cx={last[0]} cy={last[1]} r={3.5} fill={color} />
    </svg>
  )
}

export function CtraderTerminal(props: CtraderTerminalProps) {
  const {
    instruments,
    positions,
    balance,
    equity,
    openPnl,
    freeMargin,
    usedMargin,
    marginLevel,
    formatEur,
    formatPrice,
    marketStatus,
    onTrade,
    onClose,
    onManage,
    onFund,
    onWithdraw,
    onAlerts,
    onExitTerminal,
  } = props

  const [tab, setTab] = useState<TerminalTab>("markets")
  const [query, setQuery] = useState("")
  const [selected, setSelected] = useState<string>(instruments[0]?.symbol ?? "XAU/USD")
  // Full-zoom cTrader-style symbol detail: opened by tapping a watchlist row.
  const [detailSymbol, setDetailSymbol] = useState<string | null>(null)
  const [lots, setLots] = useState(0.1)

  const posCountBySymbol = useMemo(() => {
    const m = new Map<string, number>()
    for (const p of positions) m.set(p.symbol, (m.get(p.symbol) ?? 0) + 1)
    return m
  }, [positions])

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return instruments
    return instruments.filter((i) => i.symbol.toLowerCase().includes(q) || i.name.toLowerCase().includes(q))
  }, [instruments, query])

  const pnlColor = openPnl >= 0 ? GREEN : RED
  const selectedInstrument = instruments.find((i) => i.symbol === selected) ?? instruments[0]

  const tabs: { id: TerminalTab; label: string; icon: typeof PieChart; badge?: number }[] = [
    { id: "markets", label: "Markets", icon: LayoutGrid },
    { id: "charts", label: "Charts", icon: CandlestickChart },
    { id: "positions", label: "Positions", icon: PieChart, badge: positions.length || undefined },
    { id: "blotter", label: "Blotter", icon: LayoutPanelLeft },
    { id: "account", label: "My NAFTAhub", icon: ClipboardList },
  ]

  return (
    <div
      className="relative flex h-[calc(100dvh-6.5rem)] flex-col overflow-hidden rounded-2xl border border-black/5 shadow-sm"
      style={{ backgroundColor: "#eff0f2", color: INK }}
    >
      {/* Account strip */}
      <div className="shrink-0 border-b border-black/5 bg-white px-3 pb-2.5 pt-3">
        <div className="flex items-center gap-2">
          <div
            className="flex size-9 shrink-0 items-center justify-center rounded-full"
            style={{ backgroundColor: "#e8352410" }}
          >
            <img src="/images/nqai-logo.png" alt="NQAi" className="size-7 rounded-full object-contain" />
          </div>
          <div className="flex min-w-0 flex-1 items-center gap-2 rounded-full px-3 py-2" style={{ backgroundColor: "#f0f0f2" }}>
            <Search className="size-4 shrink-0" style={{ color: MUTED }} />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search"
              className="w-full min-w-0 bg-transparent text-[15px] outline-none placeholder:text-[#9aa0a8]"
              style={{ color: INK }}
            />
          </div>
          <div className="relative shrink-0 rounded-xl px-3 py-1.5 text-right" style={{ backgroundColor: "#f0f0f2" }}>
            <span className="absolute right-2 top-1.5 size-2 rounded-full" style={{ backgroundColor: RED }} />
            <div className="text-[15px] font-semibold tabular-nums">{formatEur(equity)}</div>
          </div>
        </div>
        <div className="mt-2.5 grid grid-cols-3 gap-2">
          {[
            { label: "Balance", value: formatEur(balance), color: INK },
            { label: "Equity", value: formatEur(equity), color: INK },
            { label: "Unr. net P&L", value: `${openPnl >= 0 ? "" : "-"}${formatEur(Math.abs(openPnl))}`, color: pnlColor },
          ].map((c) => (
            <div key={c.label} className="rounded-xl px-3 py-2 text-center" style={{ backgroundColor: "#f4f4f6" }}>
              <div className="text-[11px]" style={{ color: MUTED }}>
                {c.label}
              </div>
              <div className="mt-0.5 text-[13px] font-semibold tabular-nums" style={{ color: c.color }}>
                {c.value}
              </div>
            </div>
          ))}
        </div>
        <div className="mt-2 flex items-center gap-2">
          <button
            onClick={onFund}
            className="flex flex-1 items-center justify-center gap-1.5 rounded-lg py-2 text-[13px] font-semibold text-white"
            style={{ backgroundColor: GREEN }}
          >
            <ArrowDownToLine className="size-4" /> Fund
          </button>
          <button
            onClick={onWithdraw}
            className="flex flex-1 items-center justify-center gap-1.5 rounded-lg border py-2 text-[13px] font-semibold"
            style={{ borderColor: "#d7d8dc", color: INK }}
          >
            <ArrowUpFromLine className="size-4" /> Withdraw
          </button>
          <button
            onClick={onAlerts}
            className="flex items-center justify-center gap-1.5 rounded-lg border px-3 py-2 text-[13px] font-semibold"
            style={{ borderColor: "#d7d8dc", color: INK }}
          >
            <Bell className="size-4" />
          </button>
        </div>
      </div>

      {/* Body */}
      <div className="min-h-0 flex-1 overflow-y-auto pb-24">
        {tab === "markets" && (
          <>
            <div className="flex items-center justify-between px-4 py-3">
              <button className="flex items-center gap-1 text-[19px] font-bold" onClick={onManage}>
                NAFTAhub
                <ChevronRight className="size-5" style={{ color: MUTED }} />
              </button>
              <div className="flex items-center gap-4">
                <button onClick={onManage} aria-label="Add instrument">
                  <Plus className="size-6" />
                </button>
                <button onClick={onManage} aria-label="Edit watchlist">
                  <Pencil className="size-5" />
                </button>
              </div>
            </div>

            <div className="bg-white">
              {visible.map((it) => {
                const up = it.change >= 0
                const pip = Math.pow(10, -it.decimals)
                const spreadPips = 0.2 + (hashCode(it.symbol) % 34) / 10
                const bid = it.price
                const ask = it.price + spreadPips * pip
                const rng = Math.max(Math.abs(it.change) / 100, 0.004)
                const high = it.price * (1 + rng * 0.6)
                const low = it.price * (1 - rng * 0.6)
                const abs = it.price * (it.change / 100)
                const count = posCountBySymbol.get(it.symbol)
                const status = marketStatus(it.category)
                return (
                  <div key={it.symbol} className="border-b border-black/5 px-4 py-3.5">
                    <button
                      className="mb-2 flex w-full items-center gap-2 text-left"
                      onClick={() => {
                        setSelected(it.symbol)
                        setDetailSymbol(it.symbol)
                      }}
                    >
                      <span className="flex flex-col gap-[3px]">
                        <span className="block h-3 w-[3px] rounded-full" style={{ backgroundColor: GRIP }} />
                      </span>
                      <span className="text-[18px] font-bold tracking-tight">{it.symbol.replace("/", "")}</span>
                      {count ? (
                        <span
                          className="flex size-5 items-center justify-center rounded-full border text-[11px] font-semibold"
                          style={{ borderColor: "#d7d8dc", color: MUTED }}
                        >
                          {count}
                        </span>
                      ) : null}
                      {!status.open && (
                        <span className="ml-auto text-[11px] font-medium" style={{ color: MUTED }}>
                          Closed
                        </span>
                      )}
                    </button>

                    <div className="flex items-end justify-between gap-3">
                      <div className="min-w-0">
                        <div className="text-[15px] font-semibold" style={{ color: up ? "#5a6472" : OIL }}>
                          {up ? "+" : ""}
                          {abs.toLocaleString("en-US", { maximumFractionDigits: it.decimals })} ({up ? "+" : ""}
                          {it.change.toFixed(2)}%)
                        </div>
                        <div className="mt-1">
                          <Sparkline symbol={it.symbol} change={it.change} />
                        </div>
                      </div>

                      <div className="flex-1">
                        <div className="mb-1.5 flex items-center justify-between text-[12px]" style={{ color: MUTED }}>
                          <span>H: {formatPrice(high, it.decimals)}</span>
                          <span>S: {spreadPips.toFixed(1)}</span>
                          <span>L: {formatPrice(low, it.decimals)}</span>
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                          <button
                            onClick={() => onTrade(it.symbol, "SHORT")}
                            className="rounded-lg border py-1.5 text-center"
                            style={{ borderColor: `${GREEN}55` }}
                          >
                            <div className="text-[11px] font-semibold" style={{ color: GREEN }}>
                              SELL
                            </div>
                            <PriceText value={bid} decimals={it.decimals} className="text-[17px] font-bold" />
                          </button>
                          <button
                            onClick={() => onTrade(it.symbol, "LONG")}
                            className="rounded-lg border py-1.5 text-center"
                            style={{ borderColor: `${GREEN}55` }}
                          >
                            <div className="text-[11px] font-semibold" style={{ color: GREEN }}>
                              BUY
                            </div>
                            <PriceText value={ask} decimals={it.decimals} className="text-[17px] font-bold" />
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                )
              })}
              {visible.length === 0 && (
                <div className="px-4 py-10 text-center text-[14px]" style={{ color: MUTED }}>
                  No instruments match “{query}”.
                </div>
              )}
            </div>
          </>
        )}

        {tab === "charts" && selectedInstrument && (
          <div className="p-3">
            <div className="mb-3 flex items-center gap-2 px-1">
              <span className="text-[20px] font-bold">{selectedInstrument.symbol.replace("/", "")}</span>
              <span className="text-[13px]" style={{ color: MUTED }}>
                {selectedInstrument.name}
              </span>
              <span
                className="ml-auto text-[15px] font-semibold"
                style={{ color: selectedInstrument.change >= 0 ? GREEN : RED }}
              >
                {selectedInstrument.change >= 0 ? "+" : ""}
                {selectedInstrument.change.toFixed(2)}%
              </span>
            </div>
            <div className="overflow-hidden rounded-xl bg-white">
              <TradingViewWidget
                key={selectedInstrument.symbol}
                scriptSrc="embed-widget-advanced-chart.js"
                height={420}
                config={{
                  symbol: tradingViewSymbol(selectedInstrument.symbol),
                  interval: "1",
                  timezone: "Etc/UTC",
                  theme: "light",
                  style: "1",
                  locale: "en",
                  hide_top_toolbar: false,
                  hide_legend: false,
                  allow_symbol_change: false,
                  autosize: true,
                }}
              />
            </div>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <button
                onClick={() => onTrade(selectedInstrument.symbol, "SHORT")}
                className="rounded-xl border py-3 text-[15px] font-bold"
                style={{ borderColor: `${RED}55`, color: RED }}
              >
                Sell
              </button>
              <button
                onClick={() => onTrade(selectedInstrument.symbol, "LONG")}
                className="rounded-xl py-3 text-[15px] font-bold text-white"
                style={{ backgroundColor: GREEN }}
              >
                Buy
              </button>
            </div>
          </div>
        )}

        {tab === "positions" && (
          <div className="bg-white">
            <div
              className="grid grid-cols-[1.4fr_1fr_1fr_auto] items-center gap-2 border-b border-black/5 px-4 py-2.5 text-[12px]"
              style={{ color: MUTED }}
            >
              <span>Symbol</span>
              <span>Side · Size</span>
              <span className="text-right">Net P&L</span>
              <span />
            </div>
            {positions.length === 0 ? (
              <div className="px-4 py-16 text-center">
                <PieChart className="mx-auto mb-3 size-8" style={{ color: "#c7c9cf" }} />
                <div className="text-[15px] font-semibold">No open positions</div>
                <div className="mx-auto mt-1 max-w-[16rem] text-[13px]" style={{ color: MUTED }}>
                  Tap SELL or BUY on any instrument to open a position.
                </div>
                <button
                  onClick={() => setTab("markets")}
                  className="mt-4 rounded-lg px-4 py-2 text-[14px] font-semibold text-white"
                  style={{ backgroundColor: GREEN }}
                >
                  Browse markets
                </button>
              </div>
            ) : (
              positions.map((p) => {
                const long = p.side === "LONG"
                return (
                  <div
                    key={p.id}
                    className="grid grid-cols-[1.4fr_1fr_1fr_auto] items-center gap-2 border-b border-black/5 px-4 py-3.5"
                  >
                    <div className="flex items-center gap-2">
                      <span className="block h-4 w-[3px] rounded-full" style={{ backgroundColor: GRIP }} />
                      <span className="text-[15px] font-bold">{p.symbol.replace("/", "")}</span>
                    </div>
                    <div className="flex items-center gap-1.5 text-[14px]">
                      {long ? (
                        <ArrowUp className="size-4" style={{ color: GREEN }} />
                      ) : (
                        <ArrowDown className="size-4" style={{ color: RED }} />
                      )}
                      <span className="tabular-nums">{p.lots.toFixed(2)} Lots</span>
                    </div>
                    <div
                      className="text-right text-[15px] font-semibold tabular-nums"
                      style={{ color: p.pnl >= 0 ? GREEN : RED }}
                    >
                      {p.pnl >= 0 ? "+" : "-"}
                      {formatEur(Math.abs(p.pnl))}
                    </div>
                    <button
                      onClick={() => onClose(p.id)}
                      aria-label={`Close ${p.symbol}`}
                      className="flex size-7 items-center justify-center rounded-full"
                      style={{ color: MUTED }}
                    >
                      <X className="size-4" />
                    </button>
                  </div>
                )
              })
            )}
          </div>
        )}

        {tab === "blotter" && (
          <div className="p-3">
            <div className="rounded-xl bg-white p-4">
              <div className="mb-3 text-[16px] font-bold">Account blotter</div>
              <dl className="space-y-2.5 text-[14px]">
                {[
                  ["Balance", formatEur(balance)],
                  ["Equity", formatEur(equity)],
                  ["Used margin", formatEur(usedMargin)],
                  ["Free margin", formatEur(freeMargin)],
                  ["Open positions", String(positions.length)],
                  ["Margin level", marginLevel != null ? `${marginLevel.toFixed(1)}%` : "—"],
                ].map(([k, v]) => (
                  <div key={k} className="flex items-center justify-between">
                    <dt style={{ color: MUTED }}>{k}</dt>
                    <dd className="font-semibold tabular-nums">{v}</dd>
                  </div>
                ))}
              </dl>
            </div>
          </div>
        )}

        {tab === "account" && (
          <div className="space-y-3 p-3">
            <div className="rounded-xl bg-white p-4">
              <div className="text-[13px]" style={{ color: MUTED }}>
                Trading wallet · ring-fenced
              </div>
              <div className="mt-1 text-[28px] font-bold tabular-nums">{formatEur(equity)}</div>
              <div className="mt-0.5 text-[13px]" style={{ color: openPnl >= 0 ? GREEN : RED }}>
                {openPnl >= 0 ? "+" : "-"}
                {formatEur(Math.abs(openPnl))} floating P&L
              </div>
              <div className="mt-3 flex gap-2">
                <button
                  onClick={onFund}
                  className="flex-1 rounded-lg py-2.5 text-[14px] font-semibold text-white"
                  style={{ backgroundColor: GREEN }}
                >
                  Fund
                </button>
                <button
                  onClick={onWithdraw}
                  className="flex-1 rounded-lg border py-2.5 text-[14px] font-semibold"
                  style={{ borderColor: "#d7d8dc" }}
                >
                  Withdraw
                </button>
              </div>
            </div>
            <button
              onClick={onExitTerminal}
              className="flex w-full items-center gap-3 rounded-xl bg-white p-4 text-left"
            >
              <Layers className="size-5" style={{ color: GREEN }} />
              <span className="flex-1">
                <span className="block text-[15px] font-semibold">Advanced desk</span>
                <span className="block text-[13px]" style={{ color: MUTED }}>
                  NQAi engine, AI signals, ROI tiers &amp; the Treuhand AG fund
                </span>
              </span>
              <ChevronRight className="size-5" style={{ color: MUTED }} />
            </button>
          </div>
        )}
      </div>

      {/* Full-zoom symbol detail (cTrader Overview) */}
      {detailSymbol &&
        (() => {
          const d = instruments.find((i) => i.symbol === detailSymbol)
          if (!d) return null
          const up = d.change >= 0
          const pip = Math.pow(10, -d.decimals)
          const spreadPips = 0.2 + (hashCode(d.symbol) % 34) / 10
          const bid = d.price
          const ask = d.price + spreadPips * pip
          const rng = Math.max(Math.abs(d.change) / 100, 0.004)
          const high = d.price * (1 + rng * 0.6)
          const low = d.price * (1 - rng * 0.6)
          const abs = d.price * (d.change / 100)
          const status = marketStatus(d.category)
          const clean = d.symbol.replace("/", "")
          const setLotsClamped = (v: number) => setLots(Math.max(0.01, Math.round(v * 100) / 100))
          return (
            <div className="absolute inset-0 z-30 flex flex-col" style={{ backgroundColor: "#eff0f2" }}>
              {/* Detail header */}
              <div className="flex shrink-0 items-center gap-2 border-b border-black/5 bg-white px-3 py-2.5">
                <button
                  onClick={() => setDetailSymbol(null)}
                  aria-label="Back"
                  className="flex size-9 items-center justify-center rounded-full"
                  style={{ backgroundColor: "#f0f0f2" }}
                >
                  <ChevronLeft className="size-5" />
                </button>
                <div className="flex items-center gap-1.5 rounded-full px-3 py-1.5" style={{ backgroundColor: "#f0f0f2" }}>
                  <span className="block h-4 w-[3px] rounded-full" style={{ backgroundColor: GRIP }} />
                  <span className="text-[16px] font-bold">{clean}</span>
                </div>
                <div className="ml-auto text-right">
                  <div className="text-[15px] font-semibold tabular-nums">{formatEur(equity)}</div>
                </div>
                <button
                  onClick={() => setDetailSymbol(null)}
                  aria-label="Close"
                  className="flex size-9 items-center justify-center rounded-full"
                  style={{ color: MUTED }}
                >
                  <X className="size-5" />
                </button>
              </div>

              {!status.open && (
                <div className="shrink-0 px-4 py-2 text-center text-[13px] font-medium text-white" style={{ backgroundColor: OIL }}>
                  The market for this symbol is closed.
                </div>
              )}

              <div className="min-h-0 flex-1 overflow-y-auto pb-4">
                {/* Price + change + stats */}
                <div className="bg-white px-4 pb-3 pt-3">
                  <div className="flex items-end justify-between">
                    <div>
                      <div className="text-[26px] font-bold leading-none">
                        <PriceText value={d.price} decimals={d.decimals} />
                      </div>
                      <div className="mt-1.5 text-[14px] font-semibold" style={{ color: up ? GREEN : OIL }}>
                        {up ? "+" : ""}
                        {abs.toLocaleString("en-US", { maximumFractionDigits: d.decimals })} ({up ? "+" : ""}
                        {d.change.toFixed(2)}%)
                      </div>
                    </div>
                    <div className="text-[13px]" style={{ color: MUTED }}>
                      {d.name}
                    </div>
                  </div>
                  <div className="mt-3 flex items-center justify-between text-[12px]" style={{ color: MUTED }}>
                    <span>L: {formatPrice(low, d.decimals)}</span>
                    <span>S: {spreadPips.toFixed(1)}</span>
                    <span>H: {formatPrice(high, d.decimals)}</span>
                  </div>
                </div>

                {/* SELL | lots | BUY */}
                <div className="mx-3 mt-3 grid grid-cols-[1fr_auto_1fr] items-stretch gap-2 rounded-2xl bg-white p-2">
                  <button
                    onClick={() => onTrade(d.symbol, "SHORT")}
                    className="flex flex-col items-center justify-center rounded-xl py-3"
                    style={{ backgroundColor: "#f4f4f6" }}
                  >
                    <span className="text-[12px] font-semibold" style={{ color: RED }}>
                      SELL
                    </span>
                    <PriceText value={bid} decimals={d.decimals} className="text-[19px] font-bold" />
                  </button>
                  <div className="flex flex-col items-center justify-center rounded-xl border px-3" style={{ borderColor: "#e4e5e8" }}>
                    <span className="text-[11px]" style={{ color: MUTED }}>
                      Size
                    </span>
                    <span className="text-[16px] font-bold tabular-nums">{lots.toFixed(2)}</span>
                    <span className="text-[10px]" style={{ color: MUTED }}>
                      lots
                    </span>
                  </div>
                  <button
                    onClick={() => onTrade(d.symbol, "LONG")}
                    className="flex flex-col items-center justify-center rounded-xl py-3"
                    style={{ backgroundColor: "#f4f4f6" }}
                  >
                    <span className="text-[12px] font-semibold" style={{ color: GREEN }}>
                      BUY
                    </span>
                    <PriceText value={ask} decimals={d.decimals} className="text-[19px] font-bold" />
                  </button>
                </div>

                {/* Lots stepper */}
                <div className="mx-3 mt-2 rounded-2xl bg-white p-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-baseline gap-1">
                      <span className="text-[22px] font-bold tabular-nums">{lots.toFixed(1)}</span>
                      <span className="text-[13px]" style={{ color: MUTED }}>
                        lots
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => setLotsClamped(lots - 0.1)}
                        aria-label="Decrease size"
                        className="flex size-10 items-center justify-center rounded-xl"
                        style={{ backgroundColor: "#f0f0f2" }}
                      >
                        <Minus className="size-5" />
                      </button>
                      <button
                        onClick={() => setLotsClamped(lots + 0.1)}
                        aria-label="Increase size"
                        className="flex size-10 items-center justify-center rounded-xl"
                        style={{ backgroundColor: "#f0f0f2" }}
                      >
                        <Plus className="size-5" />
                      </button>
                    </div>
                  </div>
                  <input
                    type="range"
                    min={0.01}
                    max={10}
                    step={0.01}
                    value={lots}
                    onChange={(e) => setLotsClamped(Number(e.target.value))}
                    className="mt-3 h-2 w-full cursor-pointer appearance-none rounded-full"
                    style={{ accentColor: GREEN, backgroundColor: "#e4e5e8" }}
                  />
                  <div className="mt-1 flex justify-between text-[11px]" style={{ color: MUTED }}>
                    <span>0.01</span>
                    <span>10</span>
                  </div>
                </div>

                {/* Price alert quick row */}
                <div className="mx-3 mt-2 rounded-2xl bg-white p-3">
                  <div className="mb-2.5 flex items-center justify-between">
                    <span className="text-[15px] font-bold">Price alert</span>
                    <button onClick={onAlerts} className="flex items-center gap-1 text-[13px]" style={{ color: MUTED }}>
                      All <ChevronRight className="size-4" />
                    </button>
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    {["-0.2%", "-0.1%"].map((l) => (
                      <button
                        key={l}
                        onClick={onAlerts}
                        className="flex-1 rounded-full py-2 text-[13px] font-semibold"
                        style={{ backgroundColor: `${RED}14`, color: RED }}
                      >
                        {l}
                      </button>
                    ))}
                    <button
                      onClick={onAlerts}
                      aria-label="Add alert"
                      className="flex size-10 shrink-0 items-center justify-center rounded-full"
                      style={{ backgroundColor: `${GRIP}22`, color: GRIP }}
                    >
                      <BellIcon className="size-5" />
                    </button>
                    {["+0.1%", "+0.2%"].map((l) => (
                      <button
                        key={l}
                        onClick={onAlerts}
                        className="flex-1 rounded-full py-2 text-[13px] font-semibold"
                        style={{ backgroundColor: `${GREEN}14`, color: GREEN }}
                      >
                        {l}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Live chart (fast in-house SVG — instant, no external iframe) */}
                <div className="mx-3 mt-2 overflow-hidden rounded-2xl bg-white pb-2">
                  <div className="flex items-center justify-between px-3 pb-1 pt-2.5">
                    <span className="rounded-md px-2 py-1 text-[12px] font-semibold" style={{ backgroundColor: "#f0f0f2" }}>
                      m1
                    </span>
                    <button
                      onClick={() => {
                        setDetailSymbol(null)
                        setTab("charts")
                      }}
                      aria-label="Open full chart"
                      className="flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-medium"
                      style={{ backgroundColor: "#f0f0f2", color: MUTED }}
                    >
                      Full chart <Maximize2 className="size-3.5" />
                    </button>
                  </div>
                  <DetailChart
                    symbol={d.symbol}
                    change={d.change}
                    price={d.price}
                    decimals={d.decimals}
                    high={high}
                    low={low}
                  />
                </div>
              </div>

              {/* Sticky Sell/Buy footer */}
              <div className="shrink-0 border-t border-black/5 bg-white px-3 py-3">
                <div className="grid grid-cols-2 gap-2">
                  <button
                    onClick={() => onTrade(d.symbol, "SHORT")}
                    className="rounded-xl border py-3.5 text-[16px] font-bold"
                    style={{ borderColor: `${RED}55`, color: RED }}
                  >
                    Sell {lots.toFixed(2)}
                  </button>
                  <button
                    onClick={() => onTrade(d.symbol, "LONG")}
                    className="rounded-xl py-3.5 text-[16px] font-bold text-white"
                    style={{ backgroundColor: GREEN }}
                  >
                    Buy {lots.toFixed(2)}
                  </button>
                </div>
                <p className="mt-2 text-center text-[11px]" style={{ color: MUTED }}>
                  Confirm the exact size and stop-loss in the order ticket.
                </p>
              </div>
            </div>
          )
        })()}

      {/* New order pill */}
      {(tab === "markets" || tab === "positions" || tab === "charts") && selectedInstrument && (
        <button
          onClick={() => onTrade(selectedInstrument.symbol, "LONG")}
          className="absolute bottom-[4.75rem] right-4 z-10 flex items-center gap-2 rounded-full px-5 py-3.5 text-[15px] font-semibold text-white shadow-lg"
          style={{ backgroundColor: "#1c1f24" }}
        >
          <ClipboardList className="size-5" />
          New order
        </button>
      )}

      {/* Bottom tab bar */}
      <div className="shrink-0 border-t border-black/5 bg-white">
        <div className="grid grid-cols-5">
          {tabs.map((t) => {
            const active = tab === t.id
            const Icon = t.icon
            return (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className="flex flex-col items-center gap-1 py-2.5"
                style={{ color: active ? INK : "#9aa0a8" }}
              >
                <span className="relative">
                  <Icon className="size-[22px]" strokeWidth={active ? 2.2 : 1.8} />
                  {t.badge ? (
                    <span
                      className="absolute -right-2 -top-1.5 flex min-w-4 items-center justify-center rounded-full px-1 text-[10px] font-bold text-white"
                      style={{ backgroundColor: GREEN }}
                    >
                      {t.badge}
                    </span>
                  ) : null}
                </span>
                <span className="text-[10.5px] font-medium leading-none">{t.label}</span>
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}
