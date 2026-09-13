"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { createPortal } from "react-dom"
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
  Minimize2,
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

// Live watchlist sparkline: seeds a short deterministic history then appends
// every real tick so the trend line slides left in real time. Colour tracks
// the LIVE change sign so a row that flips red/green updates its line too.
function LiveSparkline({
  symbol,
  change,
  live,
  up,
}: {
  symbol: string
  change: number
  live: number
  up: boolean
}) {
  const w = 120
  const h = 44
  const color = up ? GREEN : OIL
  const gid = `lsg-${hashCode(symbol)}`
  const seriesRef = useRef<number[]>(seedChartSeries(symbol, change, live).slice(-32))
  const [, force] = useState(0)
  useEffect(() => {
    const s = seriesRef.current
    if (!Number.isFinite(live) || live <= 0) return
    if (s.length === 0 || s[s.length - 1] !== live) {
      s.push(live)
      if (s.length > 32) s.shift()
      force((n) => n + 1)
    }
  }, [live])

  const vals = seriesRef.current
  const min = Math.min(...vals)
  const max = Math.max(...vals)
  const span = max - min || 1
  const step = w / Math.max(vals.length - 1, 1)
  const pts = vals.map((v, i) => [i * step, h - 4 - ((v - min) / span) * (h - 8)] as const)
  const line = pts.map((p, i) => `${i === 0 ? "M" : "L"}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(" ")
  const area = `${line} L${w},${h} L0,${h} Z`

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

// Seed a deterministic price history ending at the current anchor, so the
// streaming chart has plausible past candles the instant it opens.
function seedChartSeries(symbol: string, change: number, anchor: number) {
  const n = 70
  const a = Number.isFinite(anchor) && anchor > 0 ? anchor : 100
  let seed = hashCode(symbol) || 1
  const vol = Math.max(a * 0.0006, 1e-9)
  const vals: number[] = []
  let v = a * (1 - (change / 100) * 0.4)
  for (let i = 0; i < n; i++) {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff
    const r = (seed % 1000) / 1000 - 0.5
    v += r * vol * 2 + (a * (change / 100) * 0.4) / n
    vals.push(v)
  }
  vals[n - 1] = a
  return vals
}

// Fast, self-rendered STREAMING chart (no external iframe → instant, never
// blank). Seeds a deterministic history then appends every live tick so the
// line slides left in real time; axis labels track the live window.
function DetailChart({
  symbol,
  change,
  live,
  decimals,
}: {
  symbol: string
  change: number
  live: number
  decimals: number
}) {
  const W = 340
  const H = 280
  const color = change >= 0 ? GREEN : OIL
  const [series, setSeries] = useState<number[]>(() => seedChartSeries(symbol, change, live))
  const seededSymbol = useRef(symbol)
  // Reseed when the symbol changes.
  useEffect(() => {
    if (seededSymbol.current !== symbol) {
      seededSymbol.current = symbol
      setSeries(seedChartSeries(symbol, change, live))
    }
  }, [symbol, change, live])
  // Append each live tick and slide the rolling window.
  useEffect(() => {
    if (!Number.isFinite(live)) return
    setSeries((prev) => {
      if (prev.length === 0) return seedChartSeries(symbol, change, live)
      return prev.length >= 90 ? [...prev.slice(1), live] : [...prev, live]
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [live])

  const { line, area, lastX, lastY, labels } = useMemo(() => {
    const vals = series.length > 1 ? series : [live, live]
    const min = Math.min(...vals)
    const max = Math.max(...vals)
    const range = max - min || Math.max(Math.abs(max) * 0.001, 1e-6)
    const padY = H * 0.1
    const n = vals.length
    const toY = (val: number) => H - padY - ((val - min) / range) * (H - padY * 2)
    const pts = vals.map((val, i) => [(i / (n - 1)) * W, toY(val)] as const)
    const ln = pts.map(([x, y], i) => `${i === 0 ? "M" : "L"}${x.toFixed(1)} ${y.toFixed(1)}`).join(" ")
    const lbls = [0, 0.25, 0.5, 0.75, 1].map((f) => ({ y: f * H, price: max - f * (max - min) }))
    const lastPt = pts[pts.length - 1] ?? [W, H / 2]
    return { line: ln, area: `${ln} L${W} ${H} L0 ${H} Z`, lastX: lastPt[0], lastY: lastPt[1], labels: lbls }
  }, [series, live])

  const gid = `dg-${hashCode(symbol)}`
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={300} preserveAspectRatio="xMidYMid meet" className="block">
      <defs>
        <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.20" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      {labels.map((lb, i) => (
        <g key={i}>
          <line x1={0} y1={lb.y} x2={W} y2={lb.y} stroke="#00000010" strokeWidth={1} strokeDasharray="3 4" />
          <text x={W - 3} y={Math.min(H - 4, Math.max(11, lb.y - 4))} textAnchor="end" fontSize={10} fill={MUTED}>
            {lb.price.toLocaleString("en-US", { minimumFractionDigits: decimals, maximumFractionDigits: decimals })}
          </text>
        </g>
      ))}
      <path d={area} fill={`url(#${gid})`} />
      <path d={line} fill="none" stroke={color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
      <line x1={0} y1={lastY} x2={W} y2={lastY} stroke={color} strokeWidth={1} strokeDasharray="2 3" opacity={0.6} />
      <circle cx={lastX} cy={lastY} r={7} fill={color} opacity={0.18}>
        <animate attributeName="r" values="5;10;5" dur="1.6s" repeatCount="indefinite" />
        <animate attributeName="opacity" values="0.28;0;0.28" dur="1.6s" repeatCount="indefinite" />
      </circle>
      <circle cx={lastX} cy={lastY} r={3.5} fill={color} />
    </svg>
  )
}

// Module-scope so it is a STABLE component type — defining it inside the
// carousel made the 1s clock tick remount all cards, freezing the slide.
const STAT_NBSP = "\u00A0"
function StatCard({ label, value, color, sub }: { label: string; value: string; color: string; sub?: string }) {
  return (
    <div className="rounded-xl px-3 py-2 text-center" style={{ backgroundColor: "#f4f4f6" }}>
      <div className="text-[11px]" style={{ color: MUTED }}>
        {label}
      </div>
      <div className="mt-0.5 text-[13px] font-semibold tabular-nums" style={{ color }}>
        {value}
      </div>
      <div className="text-[10px] tabular-nums" style={{ color: MUTED }}>
        {sub || STAT_NBSP}
      </div>
    </div>
  )
}

// Auto-sliding account stats strip: cycles Balance/Equity/P&L -> margin ->
// trading session + clock, looping every few seconds (tap or dots to switch).
// Only this strip re-renders on the 1s clock tick, so the terminal stays fast.
function AccountStatsCarousel({
  balance,
  equity,
  openPnl,
  freeMargin,
  usedMargin,
  marginLevel,
  formatEur,
  pnlColor,
}: {
  balance: number
  equity: number
  openPnl: number
  freeMargin: number
  usedMargin: number
  marginLevel: number | null
  formatEur: (n: number) => string
  pnlColor: string
}) {
  const PAGES = 3
  const [page, setPage] = useState(0)
  const [now, setNow] = useState(() => new Date())
  // Only tick the clock while the session/time page is showing.
  useEffect(() => {
    if (page !== 2) return
    setNow(new Date())
    const clock = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(clock)
  }, [page])
  // Re-arm on every page change so a manual tap gives a fresh delay
  // instead of fighting a pending auto-advance.
  useEffect(() => {
    const slide = setTimeout(() => setPage((p) => (p + 1) % PAGES), 4500)
    return () => clearTimeout(slide)
  }, [page])

  // Local clock + UTC offset (matches the cTrader "Time 12:38 (UTC+2:00)" chip).
  const timeStr = now.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", hour12: false })
  const offMin = -now.getTimezoneOffset()
  const oSign = offMin >= 0 ? "+" : "-"
  const utcLabel = `UTC${oSign}${Math.floor(Math.abs(offMin) / 60)}:${String(Math.abs(offMin) % 60).padStart(2, "0")}`

  // FX session: open Sunday 22:00 UTC through Friday 22:00 UTC.
  const day = now.getUTCDay()
  const hour = now.getUTCHours()
  const sessionOpen = !(day === 6 || (day === 0 && hour < 22) || (day === 5 && hour >= 22))
  const nextOpen = (() => {
    const d = new Date(now)
    d.setUTCDate(d.getUTCDate() + ((7 - d.getUTCDay()) % 7))
    d.setUTCHours(22, 0, 0, 0)
    if (d.getTime() <= now.getTime()) d.setUTCDate(d.getUTCDate() + 7)
    return d.getTime()
  })()
  const uS = Math.max(0, Math.floor((nextOpen - now.getTime()) / 1000))
  const countdown = `${Math.floor(uS / 3600)}:${String(Math.floor((uS % 3600) / 60)).padStart(2, "0")}:${String(uS % 60).padStart(2, "0")}`

  return (
    <div>
      <div
        className="cursor-pointer overflow-hidden"
        role="button"
        tabIndex={0}
        aria-label="Account stats — tap to switch view"
        style={{ touchAction: "manipulation" }}
        onClick={() => setPage((p) => (p + 1) % PAGES)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") setPage((p) => (p + 1) % PAGES)
        }}
      >
        <div
          className="flex"
          style={{
            transform: `translate3d(-${page * 100}%,0,0)`,
            transition: "transform 320ms cubic-bezier(0.22,1,0.36,1)",
            willChange: "transform",
          }}
        >
          {/* Page 1 — account */}
          <div className="grid w-full shrink-0 grid-cols-3 gap-2">
            <StatCard label="Balance" value={formatEur(balance)} color={INK} />
            <StatCard label="Equity" value={formatEur(equity)} color={INK} />
            <StatCard
              label="Unr. net P&L"
              value={`${openPnl >= 0 ? "" : "-"}${formatEur(Math.abs(openPnl))}`}
              color={pnlColor}
            />
          </div>
          {/* Page 2 — margin */}
          <div className="grid w-full shrink-0 grid-cols-3 gap-2">
            <StatCard label="Free margin" value={formatEur(freeMargin)} color={INK} />
            <StatCard label="Used margin" value={formatEur(usedMargin)} color={INK} />
            <StatCard label="Margin level" value={marginLevel != null ? `${marginLevel.toFixed(0)}%` : "—"} color={INK} />
          </div>
          {/* Page 3 — session + clock */}
          <div className="grid w-full shrink-0 grid-cols-2 gap-2">
            <StatCard
              label="Trading session"
              value={sessionOpen ? "Active" : "Inactive"}
              color={sessionOpen ? GREEN : INK}
              sub={sessionOpen ? "market open" : `opens in ${countdown}`}
            />
            <StatCard label="Time" value={timeStr} color={INK} sub={utcLabel} />
          </div>
        </div>
      </div>
      <div className="mt-1.5 flex items-center justify-center gap-1.5">
        {Array.from({ length: PAGES }).map((_, i) => (
          <button
            key={i}
            aria-label={`Show stats page ${i + 1}`}
            onClick={() => setPage(i)}
            className="h-1.5 rounded-full transition-all"
            style={{ width: i === page ? 14 : 6, backgroundColor: i === page ? INK : "#d0d2d8" }}
          />
        ))}
      </div>
    </div>
  )
}

// Compact watchlist row with its OWN live-price stream, so every instrument's
// SELL/BUY/change/spread refreshes in real time (~700ms) around the real Yahoo
// anchor (it.price, refreshed every 12s), mean-reverting so it stays truthful.
// Only the row re-renders per tick, keeping the terminal fast (same pattern as
// SymbolDetail). Prices stream continuously so the whole watchlist stays live.
function WatchRow({
  it,
  posCount,
  formatPrice,
  onSelect,
  onTrade,
}: {
  it: TerminalInstrument
  posCount?: number
  formatPrice: (v: number, decimals: number) => string
  onSelect: (symbol: string) => void
  onTrade: (symbol: string, side: "LONG" | "SHORT") => void
}) {
  const [live, setLive] = useState(it.price)
  const anchorRef = useRef(it.price)
  useEffect(() => {
    anchorRef.current = it.price
  }, [it.price])
  useEffect(() => {
    setLive(it.price)
  }, [it.symbol])
  useEffect(() => {
    const id = setInterval(() => {
      setLive((cur) => {
        const base = anchorRef.current
        if (!Number.isFinite(base) || base <= 0) return cur
        const vol = Math.max(base * 0.0006, 1e-9)
        const drift = (base - cur) * 0.05
        const shock = (Math.random() - 0.5) * vol * 2
        return cur + drift + shock
      })
    }, 700)
    return () => clearInterval(id)
  }, [it.symbol])

  const livePrice = Number.isFinite(live) && live > 0 ? live : it.price
  const pip = Math.pow(10, -it.decimals)
  const spreadPips = 0.2 + (hashCode(it.symbol) % 34) / 10
  const bid = livePrice
  const ask = livePrice + spreadPips * pip
  const liveChange = it.price > 0 ? it.change + ((livePrice - it.price) / it.price) * 100 : it.change
  const up = liveChange >= 0
  const abs = (liveChange / 100) * it.price
  const rng = Math.max(Math.abs(it.change) / 100, 0.004)
  const high = it.price * (1 + rng * 0.6)
  const low = it.price * (1 - rng * 0.6)

  return (
    <div className="border-b border-black/5 px-4 py-3.5">
      <button className="mb-2 flex w-full items-center gap-2 text-left" onClick={() => onSelect(it.symbol)}>
        <span className="flex flex-col gap-[3px]">
          <span className="block h-3 w-[3px] rounded-full" style={{ backgroundColor: GRIP }} />
        </span>
        <span className="text-[18px] font-bold tracking-tight">{it.symbol.replace("/", "")}</span>
        {posCount ? (
          <span
            className="flex size-5 items-center justify-center rounded-full border text-[11px] font-semibold"
            style={{ borderColor: "#d7d8dc", color: MUTED }}
          >
            {posCount}
          </span>
        ) : null}
        <span className="ml-auto flex items-center gap-1 text-[10px] font-semibold" style={{ color: GREEN }}>
          <span className="relative flex size-1.5">
            <span
              className="absolute inline-flex size-full animate-ping rounded-full opacity-75"
              style={{ backgroundColor: GREEN }}
            />
            <span className="relative inline-flex size-1.5 rounded-full" style={{ backgroundColor: GREEN }} />
          </span>
          LIVE
        </span>
      </button>

      <div className="flex items-end justify-between gap-3">
        <button
          type="button"
          className="min-w-0 text-left"
          aria-label={`Open ${it.symbol.replace("/", "")} trade view`}
          onClick={() => onSelect(it.symbol)}
        >
          <div className="text-[15px] font-semibold" style={{ color: up ? "#5a6472" : OIL }}>
            {up ? "+" : ""}
            {abs.toLocaleString("en-US", { maximumFractionDigits: it.decimals })} ({up ? "+" : ""}
            {liveChange.toFixed(2)}%)
          </div>
          <div className="mt-1">
            <LiveSparkline symbol={it.symbol} change={it.change} live={livePrice} up={up} />
          </div>
        </button>

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
}

// Full-zoom cTrader Overview for one symbol. Owns its own live-price stream so
// only this overlay re-renders on each tick (keeps the terminal fast). The
// price ticks ~every 550ms around the REAL Yahoo anchor (instrument.price,
// refreshed every 12s), mean-reverting so it stays truthful; paused when the
// market is closed.
function SymbolDetail({
  instrument,
  equity,
  formatEur,
  formatPrice,
  marketOpen,
  onTrade,
  onAlerts,
  onClose,
  onFullChart,
}: {
  instrument: TerminalInstrument
  equity: number
  formatEur: (n: number) => string
  formatPrice: (v: number, decimals: number) => string
  marketOpen: boolean
  onTrade: (symbol: string, side: "LONG" | "SHORT") => void
  onAlerts: () => void
  onClose: () => void
  onFullChart: () => void
}) {
  const d = instrument
  const [lots, setLots] = useState(0.1)
  const setLotsClamped = (v: number) => setLots(Math.max(0.01, Math.round(v * 100) / 100))

  const [live, setLive] = useState(d.price)
  const anchorRef = useRef(d.price)
  useEffect(() => {
    anchorRef.current = d.price
  }, [d.price])
  useEffect(() => {
    setLive(d.price)
  }, [d.symbol])
  useEffect(() => {
    if (!marketOpen) {
      setLive(anchorRef.current)
      return
    }
    const id = setInterval(() => {
      setLive((cur) => {
        const base = anchorRef.current
        if (!Number.isFinite(base) || base <= 0) return cur
        // Larger per-tick volatility so the visible digits clearly move, but a
        // mean-reverting pull keeps the price honest to the real Yahoo anchor.
        const vol = Math.max(base * 0.0006, 1e-9)
        const drift = (base - cur) * 0.05
        const shock = (Math.random() - 0.5) * vol * 2
        return cur + drift + shock
      })
    }, 550)
    return () => clearInterval(id)
  }, [marketOpen, d.symbol])

  const livePrice = Number.isFinite(live) && live > 0 ? live : d.price
  const up = d.change >= 0
  const pip = Math.pow(10, -d.decimals)
  const spreadPips = 0.2 + (hashCode(d.symbol) % 34) / 10
  const bid = livePrice
  const ask = livePrice + spreadPips * pip
  const liveChange = d.price > 0 ? d.change + ((livePrice - d.price) / d.price) * 100 : d.change
  const abs = (liveChange / 100) * d.price
  const rng = Math.max(Math.abs(d.change) / 100, 0.004)
  const high = d.price * (1 + rng * 0.6)
  const low = d.price * (1 - rng * 0.6)
  const clean = d.symbol.replace("/", "")

  return (
    <div className="absolute inset-0 z-30 flex flex-col" style={{ backgroundColor: "#eff0f2" }}>
      {/* Detail header */}
      <div className="flex shrink-0 items-center gap-2 border-b border-black/5 bg-white px-3 py-2.5">
        <button
          onClick={onClose}
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
          onClick={onClose}
          aria-label="Close"
          className="flex size-9 items-center justify-center rounded-full"
          style={{ color: MUTED }}
        >
          <X className="size-5" />
        </button>
      </div>

      {!marketOpen && (
        <div className="shrink-0 px-4 py-2 text-center text-[13px] font-medium text-white" style={{ backgroundColor: OIL }}>
          The market for this symbol is closed.
        </div>
      )}

      <div className="min-h-0 flex-1 overflow-y-auto pb-4">
        {/* Price + change + stats */}
        <div className="bg-white px-4 pb-3 pt-3">
          <div className="flex items-end justify-between">
            <div>
              <div className="flex items-center gap-2">
                <div className="text-[26px] font-bold leading-none">
                  <PriceText value={livePrice} decimals={d.decimals} />
                </div>
                {marketOpen && (
                  <span
                    className="flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold"
                    style={{ backgroundColor: `${GREEN}18`, color: GREEN }}
                  >
                    <span className="relative flex size-1.5">
                      <span
                        className="absolute inline-flex size-full animate-ping rounded-full opacity-75"
                        style={{ backgroundColor: GREEN }}
                      />
                      <span className="relative inline-flex size-1.5 rounded-full" style={{ backgroundColor: GREEN }} />
                    </span>
                    LIVE
                  </span>
                )}
              </div>
              <div className="mt-1.5 text-[14px] font-semibold" style={{ color: up ? GREEN : OIL }}>
                {up ? "+" : ""}
                {abs.toLocaleString("en-US", { maximumFractionDigits: d.decimals })} ({up ? "+" : ""}
                {liveChange.toFixed(2)}%)
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

        {/* Live streaming chart */}
        <div className="mx-3 mt-2 overflow-hidden rounded-2xl bg-white pb-2">
          <div className="flex items-center justify-between px-3 pb-1 pt-2.5">
            <span className="rounded-md px-2 py-1 text-[12px] font-semibold" style={{ backgroundColor: "#f0f0f2" }}>
              m1
            </span>
            <button
              onClick={onFullChart}
              aria-label="Open full chart"
              className="flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-medium"
              style={{ backgroundColor: "#f0f0f2", color: MUTED }}
            >
              Full chart <Maximize2 className="size-3.5" />
            </button>
          </div>
          <DetailChart symbol={d.symbol} change={d.change} live={livePrice} decimals={d.decimals} />
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
}

// Live chart for the position-manage panel: rolling price series with the
// entry price drawn as a dashed line, a lots + live-P&L tag on the left, and
// the entry price pill on the right — a faithful cTrader position overlay.
function PositionChart({
  symbol,
  change,
  live,
  entry,
  decimals,
  lots,
  pnl,
  long,
  formatEur,
  formatPrice,
}: {
  symbol: string
  change: number
  live: number
  entry: number
  decimals: number
  lots: number
  pnl: number
  long: boolean
  formatEur: (n: number) => string
  formatPrice: (v: number, decimals: number) => string
}) {
  const W = 340
  const H = 210
  const color = long ? GREEN : OIL
  const [series, setSeries] = useState<number[]>(() => seedChartSeries(symbol, change, live))
  const seeded = useRef(symbol)
  useEffect(() => {
    if (seeded.current !== symbol) {
      seeded.current = symbol
      setSeries(seedChartSeries(symbol, change, live))
    }
  }, [symbol, change, live])
  useEffect(() => {
    if (!Number.isFinite(live)) return
    setSeries((prev) =>
      prev.length === 0
        ? seedChartSeries(symbol, change, live)
        : prev.length >= 90
          ? [...prev.slice(1), live]
          : [...prev, live],
    )
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [live])

  const { line, area, lastX, lastY, entryY, top, bottom } = useMemo(() => {
    const vals = series.length > 1 ? series : [live, live]
    const min = Math.min(...vals, entry)
    const max = Math.max(...vals, entry)
    const range = max - min || Math.max(Math.abs(max) * 0.001, 1e-6)
    const padY = H * 0.12
    const n = vals.length
    const toY = (val: number) => H - padY - ((val - min) / range) * (H - padY * 2)
    const pts = vals.map((val, i) => [(i / (n - 1)) * W, toY(val)] as const)
    const ln = pts.map(([x, y], i) => `${i === 0 ? "M" : "L"}${x.toFixed(1)} ${y.toFixed(1)}`).join(" ")
    const lastPt = pts[pts.length - 1] ?? [W, H / 2]
    return {
      line: ln,
      area: `${ln} L${W} ${H} L0 ${H} Z`,
      lastX: lastPt[0],
      lastY: lastPt[1],
      entryY: toY(entry),
      top: max,
      bottom: min,
    }
  }, [series, live, entry])

  const gid = `pg-${hashCode(symbol)}`
  const pnlUp = pnl >= 0
  const tagY = Math.min(H - 20, Math.max(2, entryY - 9))
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={230} preserveAspectRatio="xMidYMid meet" className="block">
      <defs>
        <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.20" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <text x={W - 3} y={12} textAnchor="end" fontSize={10} fill={MUTED}>
        {top.toLocaleString("en-US", { minimumFractionDigits: decimals, maximumFractionDigits: decimals })}
      </text>
      <text x={W - 3} y={H - 4} textAnchor="end" fontSize={10} fill={MUTED}>
        {bottom.toLocaleString("en-US", { minimumFractionDigits: decimals, maximumFractionDigits: decimals })}
      </text>
      <path d={area} fill={`url(#${gid})`} />
      <path d={line} fill="none" stroke={color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
      <line x1={0} y1={entryY} x2={W} y2={entryY} stroke={GREEN} strokeWidth={1} strokeDasharray="4 3" opacity={0.9} />
      <g transform={`translate(4 ${tagY})`}>
        <rect width={146} height={18} rx={9} fill={pnlUp ? GREEN : RED} />
        <text x={8} y={13} fontSize={11} fontWeight={700} fill="#fff">
          {lots.toFixed(2)} lots
        </text>
        <text x={138} y={13} textAnchor="end" fontSize={11} fontWeight={700} fill="#fff">
          {pnlUp ? "+" : "-"}
          {formatEur(Math.abs(pnl))}
        </text>
      </g>
      <g transform={`translate(${W - 84} ${tagY})`}>
        <rect width={80} height={18} rx={9} fill={GREEN} />
        <text x={40} y={13} textAnchor="middle" fontSize={11} fontWeight={700} fill="#fff">
          {formatPrice(entry, decimals)}
        </text>
      </g>
      <circle cx={lastX} cy={lastY} r={4} fill={color} />
    </svg>
  )
}

// Full-zoom cTrader-style position manager — opened by tapping a position row.
// It streams the live price and P&L and wires Close / Double / Sell / Buy to
// the real ring-fenced engine via the terminal's onClose / onTrade callbacks.
function PositionManage({
  position,
  instrument,
  equity,
  formatEur,
  formatPrice,
  marketOpen,
  onBack,
  onCloseRequest,
  onDouble,
  onAddSide,
  onFullChart,
}: {
  position: TerminalPosition
  instrument?: TerminalInstrument
  equity: number
  formatEur: (n: number) => string
  formatPrice: (v: number, decimals: number) => string
  marketOpen: boolean
  onBack: () => void
  onCloseRequest: () => void
  onDouble: () => void
  onAddSide: (side: "LONG" | "SHORT") => void
  onFullChart: () => void
}) {
  const p = position
  const long = p.side === "LONG"
  const decimals = p.decimals
  const anchor = Number.isFinite(instrument?.price) && (instrument?.price ?? 0) > 0 ? (instrument as TerminalInstrument).price : p.current
  const change = instrument?.change ?? 0
  const clean = p.symbol.replace("/", "")

  const [live, setLive] = useState(anchor)
  const anchorRef = useRef(anchor)
  useEffect(() => {
    anchorRef.current = anchor
  }, [anchor])
  useEffect(() => {
    setLive(anchorRef.current)
  }, [p.symbol])
  useEffect(() => {
    if (!marketOpen) {
      setLive(anchorRef.current)
      return
    }
    const id = setInterval(() => {
      setLive((cur) => {
        const base = anchorRef.current
        if (!Number.isFinite(base) || base <= 0) return cur
        const vol = Math.max(base * 0.0006, 1e-9)
        const drift = (base - cur) * 0.05
        const shock = (Math.random() - 0.5) * vol * 2
        return cur + drift + shock
      })
    }, 550)
    return () => clearInterval(id)
  }, [marketOpen, p.symbol])

  const livePrice = Number.isFinite(live) && live > 0 ? live : anchor
  const sideSign = long ? 1 : -1
  // Derive value-per-price-unit from the engine's P&L at the current price so
  // the live P&L stays honest to the real position, then scale it as the price
  // ticks. Flat positions (no derivable slope) show the engine figure as-is.
  const priceMove = (p.current - p.entry) * sideSign
  const valuePerPrice = Math.abs(priceMove) > 1e-9 ? p.pnl / priceMove : 0
  const livePnl = valuePerPrice !== 0 ? valuePerPrice * (livePrice - p.entry) * sideSign : p.pnl
  const pnlUp = livePnl >= 0

  const [size, setSize] = useState(p.lots)
  const setSizeClamped = (v: number) => setSize(Math.max(0.01, Math.round(v * 100) / 100))
  const [slOn, setSlOn] = useState(false)

  return (
    <div className="absolute inset-0 z-40 flex flex-col" style={{ backgroundColor: "#eff0f2" }}>
      {/* Header */}
      <div className="flex shrink-0 items-center gap-2 border-b border-black/5 bg-white px-3 py-2.5">
        <button
          onClick={onBack}
          aria-label="Back"
          className="flex size-9 items-center justify-center rounded-full"
          style={{ backgroundColor: "#f0f0f2" }}
        >
          <ChevronLeft className="size-5" />
        </button>
        <div className="flex items-center gap-1.5 rounded-full px-3 py-1.5 text-white" style={{ backgroundColor: "#1c1f24" }}>
          <span className="text-[15px] font-bold">{clean}</span>
          {long ? (
            <ArrowUp className="size-4" style={{ color: GREEN }} />
          ) : (
            <ArrowDown className="size-4" style={{ color: RED }} />
          )}
          <span className="text-[13px] tabular-nums opacity-90">{p.lots.toFixed(2)}</span>
        </div>
        <div className="ml-auto text-right text-[15px] font-semibold tabular-nums">{formatEur(equity)}</div>
        <button
          onClick={onBack}
          aria-label="Close panel"
          className="flex size-9 items-center justify-center rounded-full"
          style={{ color: MUTED }}
        >
          <X className="size-5" />
        </button>
      </div>

      {!marketOpen && (
        <div className="shrink-0 px-4 py-2 text-center text-[13px] font-medium text-white" style={{ backgroundColor: OIL }}>
          The market for this symbol is closed.
        </div>
      )}

      <div className="min-h-0 flex-1 overflow-y-auto pb-4">
        {/* Live price + entry */}
        <div className="bg-white px-4 pb-3 pt-3">
          <div className="flex items-start justify-between">
            <div>
              <div className="text-[30px] font-bold leading-none">
                <PriceText value={livePrice} decimals={decimals} />
              </div>
              <div className="mt-1.5 text-[13px]" style={{ color: MUTED }}>
                Entry {formatPrice(p.entry, decimals)} · {p.name}
              </div>
            </div>
            <button
              onClick={onFullChart}
              aria-label="Open full chart"
              className="flex size-11 items-center justify-center rounded-full"
              style={{ backgroundColor: "#f0f0f2" }}
            >
              <Maximize2 className="size-5" />
            </button>
          </div>
        </div>

        {/* Chart with the position overlaid */}
        <div className="mt-2 overflow-hidden bg-white">
          <PositionChart
            symbol={p.symbol}
            change={change}
            live={livePrice}
            entry={p.entry}
            decimals={decimals}
            lots={p.lots}
            pnl={livePnl}
            long={long}
            formatEur={formatEur}
            formatPrice={formatPrice}
          />
        </div>

        {/* Sell | Buy */}
        <div className="mx-3 mt-3 grid grid-cols-2 gap-2 rounded-2xl bg-white p-2">
          <button
            onClick={() => onAddSide("SHORT")}
            className="rounded-xl py-3.5 text-[16px] font-bold"
            style={long ? { backgroundColor: "#f4f4f6", color: RED } : { backgroundColor: RED, color: "#fff" }}
          >
            Sell
          </button>
          <button
            onClick={() => onAddSide("LONG")}
            className="rounded-xl py-3.5 text-[16px] font-bold"
            style={long ? { backgroundColor: GREEN, color: "#fff" } : { backgroundColor: "#f4f4f6", color: GREEN }}
          >
            Buy
          </button>
        </div>

        {/* Size stepper + slider */}
        <div className="mx-3 mt-2 rounded-2xl bg-white p-3">
          <div className="flex items-center justify-between">
            <div className="flex items-baseline gap-1">
              <span className="text-[22px] font-bold tabular-nums">{size.toFixed(1)}</span>
              <span className="text-[13px]" style={{ color: MUTED }}>
                lots
              </span>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setSizeClamped(size - 0.1)}
                aria-label="Decrease size"
                className="flex size-10 items-center justify-center rounded-xl"
                style={{ backgroundColor: "#f0f0f2" }}
              >
                <Minus className="size-5" />
              </button>
              <button
                onClick={() => setSizeClamped(size + 0.1)}
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
            max={Math.max(10, p.lots * 2)}
            step={0.01}
            value={size}
            onChange={(e) => setSizeClamped(Number(e.target.value))}
            className="mt-3 h-2 w-full cursor-pointer appearance-none rounded-full"
            style={{ accentColor: GREEN, backgroundColor: "#e4e5e8" }}
          />
        </div>

        {/* Stop loss */}
        <div className="mx-3 mt-2 rounded-2xl bg-white p-3">
          <div className="flex items-center justify-between">
            <span className="text-[15px] font-bold">Stop loss</span>
            <button
              onClick={() => setSlOn((s) => !s)}
              aria-label="Toggle stop loss"
              className="flex size-8 items-center justify-center rounded-full text-white"
              style={{ backgroundColor: slOn ? GREEN : "#1c1f24" }}
            >
              {slOn ? <Plus className="size-4" /> : <X className="size-4" />}
            </button>
          </div>
          <p className="mt-1 text-[12px]" style={{ color: MUTED }}>
            {slOn ? "Confirm the protective stop level in the order ticket." : "No stop loss on this position."}
          </p>
        </div>
      </div>

      {/* Sticky Close / Double footer */}
      <div className="shrink-0 border-t border-black/5 bg-white px-3 py-3">
        <div className="grid grid-cols-2 gap-2">
          <button
            onClick={onCloseRequest}
            className="flex items-center justify-center gap-2 rounded-xl border py-3.5 text-[16px] font-bold"
            style={{ borderColor: "#d7d8dc" }}
          >
            <X className="size-5" /> Close
          </button>
          <button
            onClick={onDouble}
            className="flex items-center justify-center gap-2 rounded-xl border py-3.5 text-[16px] font-bold"
            style={{ borderColor: "#d7d8dc" }}
          >
            &times;2 Double
          </button>
        </div>
        <div
          className="mt-2 flex items-center justify-center gap-1 text-[15px] font-bold"
          style={{ color: pnlUp ? GREEN : RED }}
        >
          P&amp;L {pnlUp ? "+" : "-"}
          {formatEur(Math.abs(livePnl))}
          <ChevronRight className="size-4" />
        </div>
      </div>
    </div>
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
  // Full-zoom cTrader-style position manager: opened by tapping a position row.
  const [managePosId, setManagePosId] = useState<string | null>(null)

  // Immersive full-screen trading: expands the terminal to the whole device
  // screen (native Fullscreen API where supported, `fixed inset-0` everywhere)
  // and is orientation-aware — landscape sheds the secondary strips to give the
  // chart maximum room, portrait keeps the full mobile trading layout.
  const rootRef = useRef<HTMLDivElement>(null)
  const [fullscreen, setFullscreen] = useState(false)
  // Mounted guard so the full-screen portal only targets document.body on the client.
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])
  const enterFullscreen = () => {
    setFullscreen(true)
    const el = rootRef.current
    if (el?.requestFullscreen) el.requestFullscreen().catch(() => {})
    // Best-effort: lock to landscape hint is not forced — respect the user's rotation.
  }
  const exitFullscreen = () => {
    setFullscreen(false)
    if (typeof document !== "undefined" && document.fullscreenElement) {
      document.exitFullscreen?.().catch(() => {})
    }
  }
  useEffect(() => {
    const onFsChange = () => {
      if (typeof document !== "undefined" && !document.fullscreenElement) setFullscreen(false)
    }
    document.addEventListener("fullscreenchange", onFsChange)
    return () => document.removeEventListener("fullscreenchange", onFsChange)
  }, [])
  useEffect(() => {
    if (typeof document === "undefined" || !fullscreen) return
    const prev = document.body.style.overflow
    document.body.style.overflow = "hidden"
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") exitFullscreen()
    }
    window.addEventListener("keydown", onKey)
    return () => {
      document.body.style.overflow = prev
      window.removeEventListener("keydown", onKey)
    }
  }, [fullscreen])

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

  const terminalTree = (
    <div
      ref={rootRef}
      className={cn(
        "flex flex-col overflow-hidden",
        fullscreen
          ? "fixed inset-0 z-[100] h-[100dvh] w-screen rounded-none border-0"
          : "relative h-[calc(100dvh-6.5rem)] rounded-2xl border border-black/5 shadow-sm",
      )}
      style={{
        backgroundColor: "#eff0f2",
        color: INK,
        ...(fullscreen
          ? { paddingTop: "env(safe-area-inset-top)", paddingBottom: "env(safe-area-inset-bottom)" }
          : {}),
      }}
    >
      {/* Account strip */}
      <div className="shrink-0 border-b border-black/5 bg-white px-3 pb-2.5 pt-3">
        <div className={cn("flex items-center gap-2", fullscreen && "pr-24")}>
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
          {!fullscreen && (
            <button
              onClick={enterFullscreen}
              aria-label="Full-screen trading"
              title="Full-screen trading"
              className="flex size-9 shrink-0 items-center justify-center rounded-xl"
              style={{ backgroundColor: "#f0f0f2", color: INK }}
            >
              <Maximize2 className="size-4" />
            </button>
          )}
        </div>
        <div className={cn("mt-2.5", fullscreen && "landscape:hidden")}>
          <AccountStatsCarousel
            balance={balance}
            equity={equity}
            openPnl={openPnl}
            freeMargin={freeMargin}
            usedMargin={usedMargin}
            marginLevel={marginLevel}
            formatEur={formatEur}
            pnlColor={pnlColor}
          />
        </div>
        <div className={cn("mt-2 flex items-center gap-2", fullscreen && "landscape:hidden")}>
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
            <div
              className="flex items-center justify-between border-y-2 px-4 py-3"
              style={{ borderColor: "#2563eb" }}
            >
              <button className="flex items-center gap-1 text-[19px] font-bold" onClick={onManage}>
                NAFTAhub
                <ChevronRight className="size-5" style={{ color: MUTED }} />
              </button>
              <img
                src="/images/naftahub-logo.png"
                alt="NAFTAhub"
                className="h-[22px] w-auto shrink-0 object-contain"
              />
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
              {visible.map((it) => (
                <WatchRow
                  key={it.symbol}
                  it={it}
                  posCount={posCountBySymbol.get(it.symbol)}
                  formatPrice={formatPrice}
                  onSelect={(sym) => {
                    setSelected(sym)
                    setDetailSymbol(sym)
                  }}
                  onTrade={onTrade}
                />
              ))}
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
                    role="button"
                    tabIndex={0}
                    onClick={() => setManagePosId(p.id)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault()
                        setManagePosId(p.id)
                      }
                    }}
                    className="grid cursor-pointer grid-cols-[1.4fr_1fr_1fr_auto] items-center gap-2 border-b border-black/5 px-4 py-3.5 active:bg-black/[0.03]"
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
                      onClick={(e) => {
                        e.stopPropagation()
                        onClose(p.id)
                      }}
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

      {/* Full-zoom symbol detail (cTrader Overview) — streams live */}
      {detailSymbol &&
        (() => {
          const d = instruments.find((i) => i.symbol === detailSymbol)
          if (!d) return null
          return (
            <SymbolDetail
              instrument={d}
              equity={equity}
              formatEur={formatEur}
              formatPrice={formatPrice}
              marketOpen={marketStatus(d.category).open}
              onTrade={onTrade}
              onAlerts={onAlerts}
              onClose={() => setDetailSymbol(null)}
              onFullChart={() => {
                setDetailSymbol(null)
                setTab("charts")
              }}
            />
          )
        })()}

      {/* Immersive full-screen: clear Exit control, reachable in any orientation */}
      {fullscreen && (
        <button
          onClick={exitFullscreen}
          aria-label="Exit full-screen trading"
          className="absolute right-3 z-[80] flex items-center gap-1.5 rounded-full px-3.5 py-2 text-[13px] font-bold text-white shadow-lg"
          style={{ top: "calc(env(safe-area-inset-top) + 0.6rem)", backgroundColor: "#1c1f24" }}
        >
          <Minimize2 className="size-4" /> Exit
        </button>
      )}

      {/* Full-zoom position manager — streams live P&L and wires the engine */}
      {managePosId &&
        (() => {
          const pos = positions.find((p) => p.id === managePosId)
          if (!pos) return null
          const inst = instruments.find((i) => i.symbol === pos.symbol)
          return (
            <PositionManage
              position={pos}
              instrument={inst}
              equity={equity}
              formatEur={formatEur}
              formatPrice={formatPrice}
              marketOpen={inst ? marketStatus(inst.category).open : true}
              onBack={() => setManagePosId(null)}
              onCloseRequest={() => {
                setManagePosId(null)
                onClose(pos.id)
              }}
              onDouble={() => {
                setManagePosId(null)
                onTrade(pos.symbol, pos.side)
              }}
              onAddSide={(side) => {
                setManagePosId(null)
                onTrade(pos.symbol, side)
              }}
              onFullChart={() => {
                setManagePosId(null)
                setSelected(pos.symbol)
                setTab("charts")
              }}
            />
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

  // In full-screen, portal to <body> so no ancestor (the dashboard's chain of
  // overflow-hidden flex containers + sticky nav) can trap or clip the fixed
  // overlay — this makes it cover the true device viewport above every platform
  // element. Normally it renders inline in the trading page.
  if (fullscreen && mounted) {
    return createPortal(terminalTree, document.body)
  }
  return terminalTree
}
