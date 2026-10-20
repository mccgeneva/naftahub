"use client"

import { useMemo, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import useSWR from "swr"
import { useTheme } from "next-themes"
import { ArrowDownRight, ArrowUpRight, ExternalLink, Loader2, Send } from "lucide-react"
import { toast } from "sonner"
import { TradingViewWidget } from "@/components/market/tradingview-widget"
import { tradingViewSymbol, type MarketQuoteMap } from "@/lib/market-symbols"
import { usePersistentState } from "@/lib/use-persistent-state"
import { sendMessage } from "@/app/actions/bankeka"
import { BANKEKA_ADMIN_ID } from "@/lib/bankeka-shared"
import { cn } from "@/lib/utils"

export type DeskInstrument = { symbol: string; name: string; category: AssetClass; decimals: number }
export type AssetClass = "Forex" | "Commodities" | "Equities" | "Crypto" | "Indices"
export type DeskLog = (
  action: string,
  details?: Record<string, string | number | boolean | null | undefined>,
) => void

export const DESK_UNIVERSE: DeskInstrument[] = [
  { symbol: "EUR/USD", name: "Euro / Dollar", category: "Forex", decimals: 5 },
  { symbol: "USD/JPY", name: "Dollar / Yen", category: "Forex", decimals: 3 },
  { symbol: "DXY", name: "US Dollar Index", category: "Forex", decimals: 2 },
  { symbol: "XAU/USD", name: "Gold Spot", category: "Commodities", decimals: 2 },
  { symbol: "WTI", name: "Crude Oil WTI", category: "Commodities", decimals: 2 },
  { symbol: "BRENT", name: "Crude Oil Brent", category: "Commodities", decimals: 2 },
  { symbol: "ULSD", name: "Gulf Diesel ULSD", category: "Commodities", decimals: 4 },
  { symbol: "NG", name: "Natural Gas", category: "Commodities", decimals: 3 },
  { symbol: "AAPL", name: "Apple", category: "Equities", decimals: 2 },
  { symbol: "MSFT", name: "Microsoft", category: "Equities", decimals: 2 },
  { symbol: "NVDA", name: "Nvidia", category: "Equities", decimals: 2 },
  { symbol: "TSLA", name: "Tesla", category: "Equities", decimals: 2 },
  { symbol: "JPM", name: "JPMorgan Chase", category: "Equities", decimals: 2 },
  { symbol: "BTC/USD", name: "Bitcoin", category: "Crypto", decimals: 2 },
  { symbol: "ETH/USD", name: "Ethereum", category: "Crypto", decimals: 2 },
  { symbol: "SPX", name: "S&P 500", category: "Indices", decimals: 2 },
  { symbol: "NDX", name: "NASDAQ 100", category: "Indices", decimals: 2 },
]

// Must match the trading engine's constant so the blotter's P&L equals the
// figure the cTrader terminal shows.
const NOTIONAL_PER_LOT = 10000

type StoredPosition = {
  id: string
  symbol: string
  name: string
  side: "LONG" | "SHORT"
  lots: number
  entry: number
  decimals: number
  openedAt: string
  marginEur: number
  stopLoss?: number
  takeProfit?: number
}
type PriceAlert = { id: string; symbol: string; name: string; target: number; direction: "above" | "below" }

export function fmtPrice(v: number | undefined, decimals = 2) {
  if (v == null || !Number.isFinite(v)) return "—"
  return v.toLocaleString("en-US", { minimumFractionDigits: decimals, maximumFractionDigits: decimals })
}
function fmtEur(v: number) {
  return v.toLocaleString("en-US", { style: "currency", currency: "EUR", maximumFractionDigits: 2 })
}
function bias(change: number) {
  if (change >= 0.5) return { label: "BUY", cls: "text-emerald-500" }
  if (change <= -0.5) return { label: "SELL", cls: "text-red-500" }
  return { label: "HOLD", cls: "text-muted-foreground" }
}
function decimalsFor(symbol: string) {
  return DESK_UNIVERSE.find((i) => i.symbol === symbol)?.decimals ?? 2
}

// ── Monitor ────────────────────────────────────────────────────────────────
export function QuotesPanel({
  quotes,
  assetClass,
  symbol,
  onSelect,
}: {
  quotes: MarketQuoteMap
  assetClass: AssetClass | "All"
  symbol: string
  onSelect: (s: string) => void
}) {
  const rows = DESK_UNIVERSE.filter((i) => assetClass === "All" || i.category === assetClass)
  return (
    <div className="h-full overflow-auto">
      <table className="w-full font-mono text-xs">
        <thead className="sticky top-0 bg-card text-[10px] uppercase tracking-wider text-muted-foreground">
          <tr>
            <th className="px-2 py-1.5 text-left font-medium">Security</th>
            <th className="px-2 py-1.5 text-right font-medium">Last</th>
            <th className="px-2 py-1.5 text-right font-medium">Chg%</th>
            <th className="px-2 py-1.5 text-right font-medium">NQAi</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((i) => {
            const q = quotes[i.symbol]
            const chg = q?.changePct ?? 0
            const b = bias(chg)
            return (
              <tr
                key={i.symbol}
                onClick={() => onSelect(i.symbol)}
                className={cn(
                  "cursor-pointer border-t border-border/60 hover:bg-muted/50",
                  symbol === i.symbol && "bg-primary/10",
                )}
              >
                <td className="px-2 py-2">
                  <div className="font-semibold text-foreground">{i.symbol}</div>
                  <div className="truncate font-sans text-[10px] text-muted-foreground">{i.name}</div>
                </td>
                <td className="px-2 py-2 text-right tabular-nums text-foreground">{fmtPrice(q?.price, i.decimals)}</td>
                <td className={cn("px-2 py-2 text-right tabular-nums", chg >= 0 ? "text-emerald-500" : "text-red-500")}>
                  {q ? `${chg >= 0 ? "+" : ""}${chg.toFixed(2)}` : "—"}
                </td>
                <td className={cn("px-2 py-2 text-right font-semibold", b.cls)}>{q ? b.label : "—"}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

// ── Chart / News (TradingView licensed embeds) ─────────────────────────────
export function ChartPanel({ symbol }: { symbol: string }) {
  const { resolvedTheme } = useTheme()
  return (
    <TradingViewWidget
      key={`${symbol}-${resolvedTheme}`}
      scriptSrc="embed-widget-advanced-chart.js"
      config={{
        symbol: tradingViewSymbol(symbol),
        interval: "60",
        theme: resolvedTheme === "light" ? "light" : "dark",
        style: "1",
        autosize: true,
        hide_side_toolbar: true,
        allow_symbol_change: false,
        backgroundColor: "rgba(0,0,0,0)",
        locale: "en",
      }}
    />
  )
}

export function NewsPanel({ symbol }: { symbol: string }) {
  const { resolvedTheme } = useTheme()
  return (
    <TradingViewWidget
      key={`news-${symbol}-${resolvedTheme}`}
      scriptSrc="embed-widget-timeline.js"
      config={{
        feedMode: "symbol",
        symbol: tradingViewSymbol(symbol),
        colorTheme: resolvedTheme === "light" ? "light" : "dark",
        isTransparent: true,
        displayMode: "compact",
        width: "100%",
        height: "100%",
        locale: "en",
      }}
    />
  )
}

// ── Ticket: routes into the real cTrader engine ─────────────────────────────
export function TicketPanel({ symbol, quotes, log }: { symbol: string; quotes: MarketQuoteMap; log: DeskLog }) {
  const router = useRouter()
  const q = quotes[symbol]
  const d = decimalsFor(symbol)
  const send = (side: "LONG" | "SHORT") => {
    log(`Desk order ticket routed to cTrader — ${side === "LONG" ? "Buy" : "Sell"} ${symbol}`, {
      symbol,
      side,
      indicativePrice: q?.price ?? null,
    })
    router.push(`/dashboard/trading?ticket=${encodeURIComponent(symbol)}&side=${side}`)
  }
  return (
    <div className="flex h-full flex-col gap-3 p-3">
      <div>
        <p className="font-mono text-lg font-semibold text-foreground">{symbol}</p>
        <p className="font-mono text-2xl tabular-nums text-foreground">{fmtPrice(q?.price, d)}</p>
        <p className={cn("font-mono text-xs", (q?.changePct ?? 0) >= 0 ? "text-emerald-500" : "text-red-500")}>
          {q ? `${q.changePct >= 0 ? "+" : ""}${q.changePct.toFixed(2)}% today` : "Awaiting quote"}
        </p>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={() => send("SHORT")}
          className="flex min-h-12 items-center justify-center gap-1.5 rounded-md bg-red-600 font-semibold text-white hover:bg-red-700"
        >
          <ArrowDownRight className="size-4" aria-hidden /> Sell
        </button>
        <button
          type="button"
          onClick={() => send("LONG")}
          className="flex min-h-12 items-center justify-center gap-1.5 rounded-md bg-emerald-600 font-semibold text-white hover:bg-emerald-700"
        >
          <ArrowUpRight className="size-4" aria-hidden /> Buy
        </button>
      </div>
      <p className="text-pretty text-xs leading-relaxed text-muted-foreground">
        Orders open in the cTrader ticket, where lots, stop-loss and take-profit are set and margin is checked against
        your trading wallet under the usual rules.
      </p>
    </div>
  )
}

// ── Blotter ────────────────────────────────────────────────────────────────
export function useDeskBook(userId: string, quotes: MarketQuoteMap) {
  const [positions] = usePersistentState<StoredPosition[]>(`mcc.nqai.positions.v1::${userId}`, [])
  const [wallet] = usePersistentState<number>(`mcc.trade.wallet.v1::${userId}`, 0)
  const [alerts] = usePersistentState<PriceAlert[]>(`mcc.trade.alerts.v1::${userId}`, [])
  return useMemo(() => {
    const live = positions.map((p) => {
      const current = quotes[p.symbol]?.price ?? p.entry
      const sign = p.side === "LONG" ? 1 : -1
      const pnl = p.entry > 0 ? ((current - p.entry) / p.entry) * p.lots * NOTIONAL_PER_LOT * sign : 0
      return { ...p, current, pnl }
    })
    const openPnl = live.reduce((s, p) => s + p.pnl, 0)
    const usedMargin = live.reduce((s, p) => s + (p.marginEur || 0), 0)
    const equity = wallet + openPnl
    return {
      positions: live,
      alerts,
      wallet,
      openPnl,
      usedMargin,
      equity,
      freeMargin: Math.max(0, wallet - usedMargin),
      marginLevel: usedMargin > 0 ? (equity / usedMargin) * 100 : null,
    }
  }, [positions, wallet, alerts, quotes])
}

type Book = ReturnType<typeof useDeskBook>

export function BlotterPanel({ book, onSelect }: { book: Book; onSelect: (s: string) => void }) {
  if (book.positions.length === 0) {
    return (
      <EmptyState text="No open positions.">
        <Link href="/dashboard/trading" className="text-primary underline-offset-4 hover:underline">
          Open the cTrader terminal
        </Link>
      </EmptyState>
    )
  }
  return (
    <div className="h-full overflow-auto">
      <table className="w-full font-mono text-xs">
        <thead className="sticky top-0 bg-card text-[10px] uppercase tracking-wider text-muted-foreground">
          <tr>
            <th className="px-2 py-1.5 text-left font-medium">Pos</th>
            <th className="px-2 py-1.5 text-right font-medium">Entry / Last</th>
            <th className="px-2 py-1.5 text-right font-medium">P&amp;L</th>
          </tr>
        </thead>
        <tbody>
          {book.positions.map((p) => (
            <tr
              key={p.id}
              onClick={() => onSelect(p.symbol)}
              className="cursor-pointer border-t border-border/60 hover:bg-muted/50"
            >
              <td className="px-2 py-2">
                <span className={cn("font-semibold", p.side === "LONG" ? "text-emerald-500" : "text-red-500")}>
                  {p.side === "LONG" ? "B" : "S"}
                </span>{" "}
                <span className="font-semibold text-foreground">{p.symbol}</span>
                <div className="text-[10px] text-muted-foreground">{p.lots.toFixed(2)} lots</div>
              </td>
              <td className="px-2 py-2 text-right tabular-nums text-foreground">
                {fmtPrice(p.entry, p.decimals)}
                <div className="text-[10px] text-muted-foreground">{fmtPrice(p.current, p.decimals)}</div>
              </td>
              <td className={cn("px-2 py-2 text-right tabular-nums", p.pnl >= 0 ? "text-emerald-500" : "text-red-500")}>
                {fmtEur(p.pnl)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// ── Risk & P&L ───────────────────────────────────────────────────────────────
type GuaranteePayload = {
  ok: boolean
  score?: { finalScore: number; highRisk: boolean; inputs?: { availableBalance?: number; totalExposure?: number } }
  overdraft?: { limitEur: number; remainingEur: number; inOverdraft: boolean }
  highRiskThreshold?: number
}
const jsonFetcher = (url: string) => fetch(url).then((r) => r.json())

export function RiskPanel({ book }: { book: Book }) {
  const { data } = useSWR<GuaranteePayload>("/api/guarantees", jsonFetcher, { refreshInterval: 30000 })
  const s = data?.score
  const rows: Array<[string, string, string?]> = [
    ["Trading wallet", fmtEur(book.wallet)],
    ["Equity", fmtEur(book.equity)],
    ["Open P&L", fmtEur(book.openPnl), book.openPnl >= 0 ? "text-emerald-500" : "text-red-500"],
    ["Used margin", fmtEur(book.usedMargin)],
    ["Free margin", fmtEur(book.freeMargin)],
    ["Margin level", book.marginLevel == null ? "—" : `${book.marginLevel.toFixed(0)}%`],
    ["Master available", s?.inputs?.availableBalance != null ? fmtEur(s.inputs.availableBalance) : "—"],
    ["Borrowed exposure", s?.inputs?.totalExposure != null ? fmtEur(s.inputs.totalExposure) : "—"],
    [
      "Overdraft headroom",
      data?.overdraft ? `${fmtEur(data.overdraft.remainingEur)} / ${fmtEur(data.overdraft.limitEur)}` : "—",
    ],
  ]
  return (
    <div className="flex h-full flex-col overflow-auto p-3">
      <div className="mb-3 flex items-baseline justify-between gap-2">
        <span className="text-xs uppercase tracking-wider text-muted-foreground">Trust score</span>
        {s ? (
          <span className={cn("font-mono text-lg font-semibold", s.highRisk ? "text-red-500" : "text-emerald-500")}>
            {s.finalScore.toFixed(2)}
            <span className="ml-1 text-xs font-normal text-muted-foreground">
              / {data?.highRiskThreshold ?? "—"} {s.highRisk ? "· High risk" : "· OK"}
            </span>
          </span>
        ) : (
          <Loader2 className="size-4 animate-spin text-muted-foreground" aria-label="Loading" />
        )}
      </div>
      <dl className="grid grid-cols-1 gap-y-1.5 font-mono text-xs">
        {rows.map(([k, v, cls]) => (
          <div key={k} className="flex items-baseline justify-between gap-3 border-b border-border/50 pb-1">
            <dt className="font-sans text-muted-foreground">{k}</dt>
            <dd className={cn("text-right tabular-nums text-foreground", cls)}>{v}</dd>
          </div>
        ))}
      </dl>
      {s?.highRisk && (
        <p className="mt-3 text-pretty text-xs leading-relaxed text-red-500">
          High-risk profile: new financing is paused until exposure is reduced.
        </p>
      )}
    </div>
  )
}

// ── Alerts ───────────────────────────────────────────────────────────────────
export function AlertsPanel({ book, quotes }: { book: Book; quotes: MarketQuoteMap }) {
  if (book.alerts.length === 0) {
    return (
      <EmptyState text="No price alerts set.">
        <Link href="/dashboard/trading" className="text-primary underline-offset-4 hover:underline">
          Create one in the terminal
        </Link>
      </EmptyState>
    )
  }
  return (
    <ul className="h-full divide-y divide-border/60 overflow-auto font-mono text-xs">
      {book.alerts.map((a) => {
        const price = quotes[a.symbol]?.price
        const d = decimalsFor(a.symbol)
        const hit = price != null && (a.direction === "above" ? price >= a.target : price <= a.target)
        const dist = price != null && price > 0 ? ((a.target - price) / price) * 100 : null
        return (
          <li key={a.id} className="flex items-center justify-between gap-2 px-3 py-2">
            <div>
              <span className="font-semibold text-foreground">{a.symbol}</span>{" "}
              <span className="text-muted-foreground">
                {a.direction} {fmtPrice(a.target, d)}
              </span>
            </div>
            <span className={cn("tabular-nums", hit ? "font-semibold text-primary" : "text-muted-foreground")}>
              {hit ? "TRIGGERED" : dist == null ? "—" : `${dist >= 0 ? "+" : ""}${dist.toFixed(2)}%`}
            </span>
          </li>
        )
      })}
    </ul>
  )
}

// ── Messages ─────────────────────────────────────────────────────────────────
export function MessagesPanel({ symbol, log }: { symbol: string; log: DeskLog }) {
  const [text, setText] = useState("")
  const [sending, setSending] = useState(false)
  const submit = async () => {
    const body = text.trim()
    if (!body || sending) return
    setSending(true)
    try {
      const res = await sendMessage(BANKEKA_ADMIN_ID, `[Trading Desk · ${symbol}] ${body}`)
      if (res.ok) {
        toast.success("Message sent to the trading desk")
        log("Desk message sent to the trading desk", { symbol, length: body.length })
        setText("")
      } else {
        toast.error(res.error ?? "Could not send the message")
      }
    } finally {
      setSending(false)
    }
  }
  return (
    <div className="flex h-full flex-col gap-2 p-3">
      <p className="text-pretty text-xs leading-relaxed text-muted-foreground">
        Message the NAFTAhub trading desk about {symbol}. Replies arrive in your Bankeka inbox.
      </p>
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={3}
        maxLength={2000}
        placeholder="Request a quote, ask for liquidity, flag an order…"
        className="min-h-20 flex-1 resize-none rounded-md border border-input bg-background px-3 py-2 text-base text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring md:text-sm"
      />
      <div className="flex items-center justify-between gap-2">
        <Link
          href="/dashboard/bankeka"
          className="inline-flex min-h-11 items-center gap-1 text-xs text-primary underline-offset-4 hover:underline"
        >
          Open inbox <ExternalLink className="size-3" aria-hidden />
        </Link>
        <button
          type="button"
          onClick={submit}
          disabled={!text.trim() || sending}
          className="inline-flex min-h-11 items-center gap-1.5 rounded-md bg-primary px-4 text-sm font-semibold text-primary-foreground disabled:opacity-50"
        >
          {sending ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Send className="size-4" aria-hidden />}
          Send
        </button>
      </div>
    </div>
  )
}

function EmptyState({ text, children }: { text: string; children?: React.ReactNode }) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-1 p-4 text-center text-xs text-muted-foreground">
      <p>{text}</p>
      {children}
    </div>
  )
}
