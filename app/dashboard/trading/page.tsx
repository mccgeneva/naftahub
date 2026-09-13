"use client"

import { useState, useRef, useMemo, useEffect } from "react"
import useSWR from "swr"
import {
  Activity,
  TrendingUp,
  TrendingDown,
  Zap,
  Shield,
  ArrowRight,
  Crown,
  Sparkles,
  Bot,
  LineChart,
  Gauge,
  Landmark,
  Coins,
  Check,
  Lock,
  Minus,
  Plus,
  BadgeCheck,
  ArrowUpRight,
  Loader2,
  Clock,
  ShieldCheck,
  CalendarClock,
  CalendarDays,
  Wallet,
  Percent,
  Flag,
  AlertTriangle,
  LogOut,
  X,
  Archive,
  ChevronDown,
  RotateCw,
  Bell,
  ArrowDownToLine,
  ArrowUpFromLine,
} from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Progress } from "@/components/ui/progress"
import { Switch } from "@/components/ui/switch"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Label } from "@/components/ui/label"
import { Input } from "@/components/ui/input"
import { MoneyInput } from "@/components/ui/money-input"
import { Textarea } from "@/components/ui/textarea"
import { cn } from "@/lib/utils"
import { toast } from "sonner"
import { useActivityLog } from "@/components/activity-tracker"
import { mirrorSubmissionDetailed } from "@/lib/approval-sync"
import {
  listMyApprovals,
  requestTradingFundTermination,
  withdrawTradingFundTermination,
} from "@/app/actions/approvals"
import { useCurrentUser } from "@/lib/use-current-user"
import { useMembership } from "@/lib/use-membership"
import { requestMembershipUpgrade } from "@/app/actions/membership"
import { effectivePlatformTier, MEMBERSHIP_STATUS_LABEL } from "@/lib/membership"
import { useLedger } from "@/lib/ledger-store"
import {
  analyzeTradingFundPosition,
  quoteTradingFundExit,
  TRADING_FUND_TERM_MONTHS,
  TRADING_FUND_EXIT_COMMISSION,
} from "@/lib/trading-fund"
import { useMarketQuotes } from "@/lib/use-market"
import { TradingViewWidget } from "@/components/market/tradingview-widget"
import { tradingViewSymbol } from "@/lib/market-symbols"
import { marketStatus } from "@/lib/market-hours"
import { removeMyLedgerEntry } from "@/app/actions/ledger"
import { usePersistentState } from "@/lib/use-persistent-state"
import { WatchlistManager, type WatchEntry } from "@/components/trading/watchlist-manager"
import { CtraderTerminal } from "@/components/trading/ctrader-terminal"

type Signal = "BUY" | "SELL" | "HOLD"

type Instrument = {
  symbol: string
  name: string
  category: "Commodities" | "Forex" | "Equities" | "Crypto" | "Indices"
  price: number
  decimals: number
  change: number
  signal: Signal
  confidence: number
  /** True once a real quote from the live feed has been merged in. */
  live?: boolean
}

// Instrument metadata + analyst signal/confidence. Live price and change are
// merged in from the market-data feed at render time (see useMarketQuotes);
// the seed price/change here are only fallbacks until quotes load and are never
// shown on screen until a real quote merges in (see the `live` flag).
const INSTRUMENT_META: Instrument[] = [
  // Commodities & energy
  { symbol: "XAU/USD", name: "Gold Spot", category: "Commodities", price: 4103.0, decimals: 2, change: 1.37, signal: "BUY", confidence: 91 },
  { symbol: "WTI", name: "Crude Oil · WTI (USOIL)", category: "Commodities", price: 70.24, decimals: 2, change: -2.34, signal: "HOLD", confidence: 64 },
  { symbol: "BRENT", name: "Crude Oil · Brent (UKOIL)", category: "Commodities", price: 73.57, decimals: 2, change: -2.56, signal: "HOLD", confidence: 63 },
  { symbol: "ULSD", name: "Gulf Diesel · ULSD", category: "Commodities", price: 3.132, decimals: 4, change: -2.41, signal: "HOLD", confidence: 60 },
  { symbol: "RBOB", name: "Gasoline · RBOB", category: "Commodities", price: 2.853, decimals: 4, change: -1.71, signal: "HOLD", confidence: 58 },
  { symbol: "NG", name: "Natural Gas", category: "Commodities", price: 3.287, decimals: 3, change: -0.24, signal: "BUY", confidence: 78 },
  // Forex
  { symbol: "DXY", name: "US Dollar Index", category: "Forex", price: 101.37, decimals: 2, change: 0.01, signal: "HOLD", confidence: 67 },
  { symbol: "EUR/USD", name: "Euro / Dollar", category: "Forex", price: 1.139, decimals: 4, change: 0.11, signal: "BUY", confidence: 73 },
  { symbol: "USD/JPY", name: "Dollar / Yen", category: "Forex", price: 161.73, decimals: 2, change: -0.03, signal: "SELL", confidence: 69 },
  // Equities
  { symbol: "AAPL", name: "Apple Inc.", category: "Equities", price: 283.78, decimals: 2, change: 3.14, signal: "BUY", confidence: 84 },
  { symbol: "MSFT", name: "Microsoft Corp.", category: "Equities", price: 372.97, decimals: 2, change: 5.71, signal: "BUY", confidence: 86 },
  { symbol: "AMZN", name: "Amazon.com Inc.", category: "Equities", price: 232.69, decimals: 2, change: 2.5, signal: "BUY", confidence: 79 },
  { symbol: "GOOGL", name: "Alphabet Inc.", category: "Equities", price: 337.39, decimals: 2, change: -1.84, signal: "HOLD", confidence: 68 },
  { symbol: "META", name: "Meta Platforms", category: "Equities", price: 550.25, decimals: 2, change: 1.36, signal: "BUY", confidence: 82 },
  { symbol: "TSLA", name: "Tesla Inc.", category: "Equities", price: 379.71, decimals: 2, change: 1.22, signal: "SELL", confidence: 71 },
  { symbol: "NVDA", name: "Nvidia Corp.", category: "Equities", price: 192.53, decimals: 2, change: -1.64, signal: "BUY", confidence: 93 },
  { symbol: "PLTR", name: "Palantir Tech.", category: "Equities", price: 112.93, decimals: 2, change: 5.27, signal: "BUY", confidence: 81 },
  { symbol: "ORCL", name: "Oracle Corp.", category: "Equities", price: 148.53, decimals: 2, change: -2.58, signal: "HOLD", confidence: 67 },
  { symbol: "MSTR", name: "Strategy (MSTR)", category: "Equities", price: 82.31, decimals: 2, change: -3.54, signal: "HOLD", confidence: 62 },
  { symbol: "AMD", name: "Adv. Micro Devices", category: "Equities", price: 521.58, decimals: 2, change: -2.06, signal: "BUY", confidence: 77 },
  { symbol: "JPM", name: "JPMorgan Chase", category: "Equities", price: 329.05, decimals: 2, change: -1.81, signal: "HOLD", confidence: 65 },
  // Crypto
  { symbol: "BTC/USD", name: "Bitcoin", category: "Crypto", price: 60226, decimals: 0, change: 0.35, signal: "BUY", confidence: 88 },
  { symbol: "ETH/USD", name: "Ethereum", category: "Crypto", price: 1579, decimals: 0, change: 0.14, signal: "HOLD", confidence: 61 },
  // Indices
  { symbol: "NDX", name: "NASDAQ 100", category: "Indices", price: 29118, decimals: 0, change: -1.09, signal: "BUY", confidence: 80 },
  { symbol: "SPX", name: "S&P 500", category: "Indices", price: 7354, decimals: 0, change: -0.05, signal: "HOLD", confidence: 66 },
]

const INSTRUMENT_SYMBOLS = INSTRUMENT_META.map((m) => m.symbol)

// A deployed NQAi micro-position, persisted per browser so it survives reloads.
// The reserved margin is also held on the Master Account ledger, so the money is
// server-persisted and auditable independently of this record.
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
  notionalEur: number
}

// A user price alert, persisted per browser. Fires a toast and self-clears when
// the live price crosses the target.
type PriceAlert = { id: string; symbol: string; name: string; target: number; direction: "above" | "below" }

// Notional per lot, used to express a live signed P&L from the real price move.
const NOTIONAL_PER_LOT = 10000

// 2% fee charged on every transfer between the Master Account and the ring-fenced
// trading wallet (both funding-in and withdrawal-out).
const TRADING_TRANSFER_FEE_RATE = 0.02

// Indicative leverage per asset class — margin reserved on the Master Account is
// the notional divided by this. Real broker margins vary; these are conservative.
const LEVERAGE_BY_CATEGORY: Record<string, number> = {
  Forex: 30,
  Metals: 20,
  Commodities: 10,
  Energy: 10,
  Indices: 20,
  Equities: 5,
  Crypto: 2,
}
const leverageFor = (category: string) => LEVERAGE_BY_CATEGORY[category] ?? 10
const marginEurFor = (category: string, lots: number) =>
  Math.round(((lots * NOTIONAL_PER_LOT) / leverageFor(category)) * 100) / 100

// Signed-in user's guarantee position — drives the Trust Score / overdraft gate
// on order entry so trading respects the same controls as the rest of the desk.
const guaranteeFetcher = (url: string) => fetch(url).then((r) => (r.ok ? r.json() : null))

const TIERS = [
  {
    id: "pro",
    name: "PRO",
    icon: Sparkles,
    roi: "6.8% – 11.4%",
    features: ["Enhanced algorithms", "Cross-asset arbitrage", "Multi-asset execution"],
    active: true,
  },
  {
    id: "avantgarde",
    name: "Avant-Garde",
    icon: Crown,
    roi: "9.3% – 16.7%",
    features: ["Full NQAi engine", "Institutional tooling", "Maximum AI access"],
    active: false,
  },
]

const signalStyles: Record<Signal, string> = {
  BUY: "bg-green-500/10 text-green-500 border-green-500/20",
  SELL: "bg-red-500/10 text-red-500 border-red-500/20",
  HOLD: "bg-yellow-500/10 text-yellow-500 border-yellow-500/20",
}

// The full searchable catalog offered as quick-add rows in the watchlist
// manager (in addition to the live all-markets search), and the default
// preferred list shown to a user who hasn't customised theirs yet.
const SIGNAL_CATALOG: WatchEntry[] = INSTRUMENT_META.map((m) => ({
  symbol: m.symbol,
  name: m.name,
  category: m.category,
}))
const DEFAULT_WATCHLIST = INSTRUMENT_META.filter((m) => m.signal !== "HOLD").map((m) => m.symbol)

// Derive a deterministic AI signal + confidence for an instrument that has no
// curated analyst call (e.g. a ticker the user searched and added). It is a
// pure function of the live percent change and a stable per-symbol offset — no
// randomness — so it is reproducible and only moves when real market data does.
function deriveSignal(change: number, symbol: string): { signal: Signal; confidence: number } {
  const signal: Signal = change >= 0.15 ? "BUY" : change <= -0.15 ? "SELL" : "HOLD"
  let hash = 0
  for (let i = 0; i < symbol.length; i++) hash = (hash * 31 + symbol.charCodeAt(i)) | 0
  const offset = Math.abs(hash) % 9 // stable 0..8 spread so cards aren't identical
  const magnitude = Math.min(28, Math.abs(change) * 7)
  const base = signal === "HOLD" ? 56 : 64
  const confidence = Math.max(55, Math.min(95, Math.round(base + magnitude + offset)))
  return { signal, confidence }
}

// Treuhand AG Limited Hedge Fund — parameters from the NAFTAhub Investor Prospectus 2026.
const TOKEN_VALUE = 10000
const MIN_TOKENS = 3
const MONTHLY_ROI = 0.25

const FUND_HIGHLIGHTS = [
  { label: "Fixed Monthly ROI", value: "25%", note: "Secured, per active token" },
  { label: "Capital Guaranteed", value: "100%", note: "Swiss fiduciary law" },
  { label: "Token Unit Value", value: "€10,000", note: "Fixed denomination" },
  { label: "Minimum Entry", value: "3 Tokens", note: "€30,000 position" },
  { label: "Entry & Mgmt Fees", value: "0%", note: "Zero cost of entry" },
  { label: "Max Trading Days", value: "20 / mo", note: "Market dependent" },
]

const PROTECTION_LAYERS = [
  {
    icon: Bot,
    title: "Automated Trading Suspension",
    text: "NQAi monitors geopolitical risk and volatility, halting all trading automatically in abnormal conditions and resuming once stability is restored.",
  },
  {
    icon: Shield,
    title: "P&L Floor Absorption",
    text: "At withdrawal, any net trading loss below €2,500 is fully absorbed by the Treuhand AG fund — at zero cost to the investor.",
  },
  {
    icon: Lock,
    title: "Swiss Fiduciary Guarantee",
    text: "All positions are held under Swiss fiduciary law via Treuhand AG Limited. Capital is contractually guaranteed and ring-fenced.",
  },
  {
    icon: BadgeCheck,
    title: "AML / KYC Compliance Gate",
    text: "Full AML/KYC/FATCA/CRS due diligence prior to admission, monitored quarterly by Bildenberg Limited (Hong Kong SAR).",
  },
]

const GOVERNANCE = [
  { entity: "MCC Capital", role: "Strategic Command — Office of the President, Geneva." },
  { entity: "Bildenberg Limited", role: "Regulatory Compliance — AML/KYC oversight, Hong Kong SAR." },
  { entity: "Treuhand AG Limited", role: "Fiduciary & Trust administration, escrow and capital protection." },
  { entity: "NQAi Engine", role: "Autonomous multi-asset AI execution intelligence." },
]

const ONBOARDING_STEPS = [
  "Inquiry & investor profile review",
  "KYC / AML due diligence",
  "Treuhand AG investment agreement & token allocation",
  "Capital transfer to fiduciary account",
  "Dedicated IBAN issued — NQAi trading commences",
  "Monthly ROI settlement & P&L statement",
]

function formatPrice(value: number, decimals: number) {
  return value.toLocaleString("en-US", { minimumFractionDigits: decimals, maximumFractionDigits: decimals })
}

export default function TradingPage() {
  const log = useActivityLog()
  const user = useCurrentUser()
  const { membership, hydrated: membershipHydrated, refresh: refreshMembership } = useMembership()
  const [upgradeSubmitting, setUpgradeSubmitting] = useState(false)
  const { totalIn, entries, addDebit, addReceipt, refresh: refreshLedger } = useLedger()

  // Trust Score / Guarantees Accumulator — gates order entry so trading respects
  // the same risk controls as the rest of the platform.
  const { data: guarantee } = useSWR<{
    score?: { highRisk?: boolean }
  }>("/api/guarantees", guaranteeFetcher, { revalidateOnFocus: false })
  const highRisk = Boolean(guarantee?.score?.highRisk)

  // The client's real effective tier drives which ROI-tier card is "current"
  // and whether an Avant-Garde upgrade request is already in flight — so the
  // UI always reflects the actual membership state, never a hardcoded flag.
  const effectiveTier = effectivePlatformTier(user.accountBadge, membership)
  const isAvantActive = effectiveTier.id === "avantgarde"
  const avantPending = membership?.tier === "avantgarde" && membership.status === "pending"
  const avantApproved = membership?.tier === "avantgarde" && membership.status === "approved"
  const avantRejected = membership?.tier === "avantgarde" && membership.status === "rejected"

  const requestAvantGarde = async () => {
    setUpgradeSubmitting(true)
    const res = await requestMembershipUpgrade("avantgarde")
    setUpgradeSubmitting(false)
    if (!res.ok) {
      toast.error(res.error)
      return
    }
    await refreshMembership()
    log({
      action: "Requested upgrade to Avant-Garde tier",
      category: "NAFTAhub Trading",
      details: {
        summary:
          "Client submitted an Avant-Garde upgrade request. It is pending administrator approval; once approved, Treasury validates the €1,000,000 security deposit to activate the membership.",
        tier: "Avant-Garde",
        requestedAt: new Date().toLocaleString("en-GB"),
      },
    })
    toast.success("Upgrade request submitted", {
      description:
        "Your Avant-Garde request is pending administrator approval. Once approved, Treasury validates the €1,000,000 security deposit to activate your membership.",
    })
  }
  // Real funds available to the client, aggregated from the ledger (EUR equiv.).
  const availableCapital = totalIn("EUR")

  // The client's Treuhand fund positions, reconstructed straight from the ledger
  // the master account already reads. Every fund entry is tagged with a
  // "NAFTAhub Trading —" category and shares `reference = <subscription id>`, so
  // grouping by reference gives one position per subscription. This makes the
  // reservation, the deployed (debited) capital, and the ROI undeniably visible
  // as their own line items — independent of the master account's overall
  // balance, where a €30k move can be dwarfed by a multi-billion figure.
  const fundPositions = useMemo(() => {
    // The position's approval id is embedded in EVERY entry's id, regardless of
    // its `reference` (the subscription debit carries a token label like
    // "TREUHAND-3T", while engine entries carry the approval id). Deriving the
    // id from the entry id gives a stable grouping key that also equals the real
    // approval id — so the early-termination request can address the position.
    const approvalIdFromEntryId = (id: string): string | null => {
      if (id.startsWith("TFUND-ROI-")) return id.slice("TFUND-ROI-".length).replace(/-M\d+$/, "")
      if (id.startsWith("TFUND-RETURN-")) return id.slice("TFUND-RETURN-".length)
      if (id.startsWith("TFUND-COMM-")) return id.slice("TFUND-COMM-".length)
      if (id.startsWith("TFUND-PENALTY-")) return id.slice("TFUND-PENALTY-".length)
      if (id.startsWith("TFUND-CHARGE-")) return id.slice("TFUND-CHARGE-".length)
      if (id.startsWith("APPR-")) return id.slice("APPR-".length)
      return null
    }
    const groups = new Map<string, typeof entries>()
    for (const e of entries) {
      if (!e.category?.startsWith("NAFTAhub Trading —")) continue
      const key = approvalIdFromEntryId(e.id) || e.reference || e.id
      const list = groups.get(key)
      if (list) list.push(e)
      else groups.set(key, [e])
    }
    return Array.from(groups.entries())
      .map(([ref, list]) => {
        const reserved = list
          .filter((e) => e.status === "hold" && e.direction === "debit")
          .reduce((s, e) => s + e.amount, 0)
        const deployed = list
          .filter((e) => e.status === "completed" && e.direction === "debit")
          .reduce((s, e) => s + e.amount, 0)
        const roiEarned = list
          .filter((e) => e.status === "completed" && e.direction === "credit" && e.category === "NAFTAhub Trading — Fund ROI")
          .reduce((s, e) => s + e.amount, 0)
        const returned = list
          .filter((e) => e.status === "completed" && e.direction === "credit" && e.category === "NAFTAhub Trading — Fund Exit")
          .reduce((s, e) => s + e.amount, 0)
        const capitalBase = deployed || reserved
        const tokens = capitalBase > 0 ? Math.round(capitalBase / TOKEN_VALUE) : 0
        const status: "reserved" | "active" | "closed" =
          returned > 0 ? "closed" : deployed > 0 ? "active" : "reserved"
        const latest = list.reduce(
          (acc, e) => (new Date(e.date).getTime() > new Date(acc).getTime() ? e.date : acc),
          list[0].date,
        )
        // Activation = the date the capital was actually deployed (the completed
        // subscription debit). Drives the term/ROI/expiry timeline. A pending
        // (reserved) position has no activation yet.
        const deployEntry = list.find(
          (e) => e.status === "completed" && e.direction === "debit" && e.category === "NAFTAhub Trading — Fund Subscription",
        )
        const activation = deployEntry ? deployEntry.date : null
        return { ref, reserved, deployed, roiEarned, returned, tokens, status, activation, currency: list[0].currency, date: latest }
      })
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
  }, [entries])

  // Attach the full lifecycle view (term, ROI schedule, expiry countdown) to
  // every position that has been activated. `now` is captured once per render so
  // all countdowns are consistent; it refreshes on each ledger poll / re-render.
  const positionViews = useMemo(() => {
    const now = new Date()
    return fundPositions.map((p) => {
      if (!p.activation || p.status === "reserved") return { ...p, view: null }
      const view = analyzeTradingFundPosition({
        capitalStarted: p.deployed || p.reserved,
        activation: new Date(p.activation),
        roiMatured: p.roiEarned,
        now,
      })
      return { ...p, view }
    })
  }, [fundPositions])

  const activeFundCapital = fundPositions
    .filter((p) => p.status === "active")
    .reduce((s, p) => s + p.deployed, 0)
  const totalRoiEarned = fundPositions.reduce((s, p) => s + p.roiEarned, 0)
  // Only the NEXT scheduled monthly ROI across active positions that still have
  // a payout pending. We deliberately do NOT project full-term ROI: the program
  // can be terminated at any time, so promising a year of profit would be
  // misleading — the customer only ever sees the next month's expected credit.
  const nextMonthRoi = positionViews
    .filter((p) => p.view && !p.view.expired && p.status === "active" && p.view.nextRoiDate)
    .reduce((s, p) => s + (p.view?.monthlyRoiAmount ?? 0), 0)
  // Live positions (reserved + active) get the full lifecycle card; settled ones
  // are tucked into the "Archived NAFTAhub trades" folder below.
  const activePositions = positionViews.filter((p) => p.status !== "closed")
  const closedPositions = positionViews.filter((p) => p.status === "closed")
  // Live market prices power the trade-ticket execution price and the AI-signal
  // context. The on-screen price BOARD itself is rendered by TradingView's own
  // widget (see "Live Markets" below) so the displayed numbers always match the
  // user's TradingView app exactly. Yahoo's spot-vs-futures symbol differences
  // (e.g. gold) and weekend-frozen closes were the source of the recurring
  // "prices don't match TradingView / not updating" reports.
  // ── Preferred signals watchlist ──────────────────────────────────────────
  // The AI Signals list is a user-managed preferred list. It persists per
  // browser and can be built from the curated catalog or from any instrument
  // searched across the live market (stocks, ETFs, commodities, FX, crypto).
  // Every persisted trading key is namespaced to the signed-in account, so a
  // shared device never exposes one user's wallet / positions / alerts /
  // watchlist to the next person who logs in. `user.id` is the authoritative
  // session identity (resolved server-side), and usePersistentState resets to
  // its default whenever this key changes.
  const ptKey = (name: string) => `${name}::${user.id}`

  const [watchlist, setWatchlist] = usePersistentState<string[]>(
    ptKey("mcc.signals.watchlist.v1"),
    DEFAULT_WATCHLIST,
  )
  const [customMeta, setCustomMeta] = usePersistentState<Record<string, WatchEntry>>(
    ptKey("mcc.signals.custom.v1"),
    {},
  )
  const [manageOpen, setManageOpen] = useState(false)

  // ── Ring-fenced trading wallet ────────────────────────────────────────────
  // Funded FROM the Master Account (2% fee) and withdrawn back to it (2% fee).
  // Trading margin and P&L run against this wallet, never the master balance
  // directly — the Master Account is only touched on fund/withdraw.
  const [walletBalance, setWalletBalance] = usePersistentState<number>(ptKey("mcc.trade.wallet.v1"), 0)
  // The full legacy desk (NQAi engine, AI signals, ROI tiers, Treuhand fund, wallet
  // management) is the DEFAULT surface with every function intact; a button opens the
  // optional cTrader-style terminal, which itself has an exit back to this desk.
  const [ctraderView, setCtraderView] = useState(false)
  const [fundOpen, setFundOpen] = useState(false)
  const [withdrawOpen, setWithdrawOpen] = useState(false)
  const [transferAmount, setTransferAmount] = useState("")

  // Per-user price alerts (persisted per browser).
  const [alertsOpen, setAlertsOpen] = useState(false)
  const [priceAlerts, setPriceAlerts] = usePersistentState<PriceAlert[]>(ptKey("mcc.trade.alerts.v1"), [])
  const [alertSymbol, setAlertSymbol] = useState("")
  const [alertPrice, setAlertPrice] = useState("")
  const [alertDir, setAlertDir] = useState<"above" | "below">("above")

  // Deployed NQAi micro-positions, persisted per browser so a deployed trade
  // actually appears (and survives reload) under the Positions tab.
  const [deployed, setDeployed] = usePersistentState<StoredPosition[]>(ptKey("mcc.nqai.positions.v1"), [])

  // Quotes cover the curated board, every custom symbol the user added, and
  // every open position, so a searched or held ticker gets a real live price.
  const quoteSymbols = useMemo(
    () => Array.from(new Set([...INSTRUMENT_SYMBOLS, ...watchlist, ...deployed.map((p) => p.symbol)])),
    [watchlist, deployed],
  )
  const { quotes, refresh: refreshQuotes, updatedAt, isValidating } = useMarketQuotes(quoteSymbols)
  // Merge live price + change onto the instrument metadata; analyst signal and
  // confidence are kept as-is, only the market price/change come from the feed.
  const instruments = useMemo<Instrument[]>(
    () =>
      INSTRUMENT_META.map((m) => {
        const q = quotes[m.symbol]
        // Only mark an instrument "live" once a real quote merges in, so the
        // trade ticket never executes against a stale seed price.
        return q ? { ...m, price: q.price, change: q.changePct, live: true } : { ...m, live: false }
      }),
    [quotes],
  )

  const metaBySymbol = useMemo(() => new Map(INSTRUMENT_META.map((m) => [m.symbol, m])), [])

  // Build the AI-signal cards from the user's preferred watchlist. Curated
  // symbols keep their designed analyst call (with live price/change merged in);
  // custom symbols derive a deterministic signal from live data.
  const signalInstruments = useMemo<Instrument[]>(
    () =>
      watchlist.map((sym) => {
        const meta = metaBySymbol.get(sym)
        const q = quotes[sym]
        if (meta) {
          return q ? { ...meta, price: q.price, change: q.changePct, live: true } : { ...meta, live: false }
        }
        const custom = customMeta[sym]
        const category = (custom?.category as Instrument["category"]) ?? "Equities"
        const change = q ? q.changePct : 0
        const { signal, confidence } = deriveSignal(change, sym)
        return {
          symbol: sym,
          name: custom?.name ?? sym,
          category,
          price: q?.price ?? 0,
          decimals: category === "Forex" ? 4 : category === "Crypto" || category === "Indices" ? 0 : 2,
          change,
          signal,
          confidence,
          live: Boolean(q),
        }
      }),
    [watchlist, customMeta, quotes, metaBySymbol],
  )

  const addToWatchlist = (entry: WatchEntry) => {
    setWatchlist((prev) => (prev.includes(entry.symbol) ? prev : [...prev, entry.symbol]))
    if (!metaBySymbol.has(entry.symbol)) {
      setCustomMeta((prev) => ({ ...prev, [entry.symbol]: entry }))
    }
    toast.success(`${entry.symbol} added to your signals`)
  }
  const removeFromWatchlist = (sym: string) => {
    setWatchlist((prev) => prev.filter((s) => s !== sym))
    toast.success(`${sym} removed from your signals`)
  }

  // Group every instrument by asset class for the TradingView "Market Quotes"
  // widget, mapping each to its canonical TradingView symbol so the board shows
  // exactly the prices the user sees on TradingView.
  const quoteGroups = useMemo(() => {
    const order: Instrument["category"][] = ["Commodities", "Forex", "Indices", "Equities", "Crypto"]
    return order
      .map((cat) => ({
        name: cat,
        symbols: INSTRUMENT_META.filter((m) => m.category === cat).map((m) => ({
          name: tradingViewSymbol(m.symbol),
          displayName: `${m.symbol} · ${m.name}`,
        })),
      }))
      .filter((g) => g.symbols.length > 0)
  }, [])

  // Symbols for the live ticker-tape banner (one canonical TradingView symbol
  // per instrument), so the moving strip shows real, self-updating prices.
  const tickerTapeSymbols = useMemo(
    () =>
      INSTRUMENT_META.map((m) => ({
        proName: tradingViewSymbol(m.symbol),
        title: m.symbol,
      })),
    [],
  )
  const [autoExecute, setAutoExecute] = useState(true)
  const [tradeTarget, setTradeTarget] = useState<Instrument | null>(null)
  const [tradeSide, setTradeSide] = useState<"LONG" | "SHORT">("LONG")
  const [lots, setLots] = useState("0.10")
  const [activeTab, setActiveTab] = useState("markets")
  const [tokens, setTokens] = useState(MIN_TOKENS)
  // Draft string for the manual token field, so the user can clear it and type
  // a large number (e.g. 1000) freely; committed/clamped on blur.
  const [tokenDraft, setTokenDraft] = useState(String(MIN_TOKENS))
  const [applyOpen, setApplyOpen] = useState(false)
  const [applicantName, setApplicantName] = useState("")
  const [applicantEmail, setApplicantEmail] = useState("")
  const [submitting, setSubmitting] = useState(false)

  // Prefill the application with the signed-in customer's own identity so they
  // don't retype it. Only fills empty fields (never overwrites edits), and
  // guards against the neutral placeholder identity before the session resolves.
  const openApplyDialog = () => {
    const name = user.fullName && user.fullName !== "Account" ? user.fullName : ""
    const company = user.company && user.company !== "—" ? user.company : ""
    const composedName = name && company ? `${name} — ${company}` : name || company
    const composedEmail = user.accountEmail?.trim() || user.email?.trim() || ""
    if (composedName) setApplicantName((prev) => (prev.trim() ? prev : composedName))
    if (composedEmail) setApplicantEmail((prev) => (prev.trim() ? prev : composedEmail))
    setApplyOpen(true)
  }

  // Early-termination request state, loaded from the user's own trading_fund
  // approvals (keyed by subscription id = the ledger position ref). Tells us
  // which positions already have a request under administrator review.
  const { data: termRequests, mutate: mutateTermRequests } = useSWR(
    "trading-fund-termination-requests",
    async () => {
      const reqs = await listMyApprovals("trading_fund")
      const map: Record<string, { requestedAt: string | null; reason: string | null; closed: boolean }> = {}
      for (const r of reqs) {
        const p = (r.payload ?? {}) as {
          terminationRequestedAt?: string
          terminationReason?: string
          closedAt?: string
          exitedAt?: string
        }
        map[r.id] = {
          requestedAt: p.terminationRequestedAt ?? null,
          reason: p.terminationReason ?? null,
          closed: Boolean(p.closedAt || p.exitedAt),
        }
      }
      return map
    },
    { refreshInterval: 20000 },
  )

  // The position the user is requesting to terminate early (opens the dialog).
  const [terminateTarget, setTerminateTarget] = useState<
    { ref: string; capital: number; roiMatured: number; activation: string } | null
  >(null)
  const [terminateReason, setTerminateReason] = useState("")
  const [terminating, setTerminating] = useState(false)
  const [withdrawing, setWithdrawing] = useState<string | null>(null)
  // Collapsible "Archived NAFTAhub trades" folder (closed positions).
  const [archiveOpen, setArchiveOpen] = useState(false)

  const submitTermination = async () => {
    if (!terminateTarget || terminating) return
    setTerminating(true)
    try {
      const res = await requestTradingFundTermination(terminateTarget.ref, terminateReason)
      if (!res.ok) {
        toast.error(res.error || "The request could not be submitted.")
        return
      }
      toast.success("Termination request submitted — MCC Capital will evaluate it and reconcile your position.")
      setTerminateTarget(null)
      setTerminateReason("")
      void mutateTermRequests()
    } catch {
      toast.error("The request could not be submitted. Please try again.")
    } finally {
      setTerminating(false)
    }
  }

  const withdrawTermination = async (ref: string) => {
    if (withdrawing) return
    setWithdrawing(ref)
    try {
      const res = await withdrawTradingFundTermination(ref)
      if (!res.ok) {
        toast.error(res.error || "The request could not be withdrawn.")
        return
      }
      toast.success("Termination request withdrawn.")
      void mutateTermRequests()
    } catch {
      toast.error("The request could not be withdrawn. Please try again.")
    } finally {
      setWithdrawing(null)
    }
  }

  const capital = tokens * TOKEN_VALUE
  const monthlyReturn = capital * MONTHLY_ROI
  // There is no upper cap on tokens — the only limit is the money on the master
  // account. This is the largest whole-token position the balance can fund.
  const maxAffordableTokens = Math.floor(Math.max(0, availableCapital) / TOKEN_VALUE)
  // Set the token count from any control (stepper, preset, Max) and keep the
  // manual-entry draft field in sync.
  const setTokensSynced = (n: number) => {
    const v = Math.max(MIN_TOKENS, Math.floor(n))
    setTokens(v)
    setTokenDraft(String(v))
  }

  const formatEur = (n: number) =>
    `€${n.toLocaleString("en-US", { maximumFractionDigits: 0 })}`

  // Compact form for the large KPI/metric tiles so billion-scale figures fit on
  // a single line instead of wrapping mid-number (e.g. "€2.98B"). Values under
  // €1M keep full grouping. The exact amount is shown via the tile's title.
  const formatEurCompact = (n: number) => {
    if (Math.abs(n) < 1_000_000) return formatEur(n)
    return `€${n.toLocaleString("en-US", { notation: "compact", maximumFractionDigits: 2 })}`
  }

  const fmtDate = (d: Date | string) =>
    new Date(d).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })

  const tabsNavRef = useRef<HTMLDivElement>(null)

  // When switching sections, bring the sticky nav into view so the new section
  // starts from its top instead of leaving the user stranded mid-scroll.
  const handleTabChange = (value: string) => {
    setActiveTab(value)
    requestAnimationFrame(() => {
      tabsNavRef.current?.scrollIntoView({ behavior: "smooth", block: "start" })
    })
  }

  const openFund = () => handleTabChange("fund")

  const submitApplication = async () => {
    if (submitting) return

    // You cannot reserve funds you do not have. Applying blocks the capital on
    // the master account immediately, so refuse when the available balance
    // cannot cover it — otherwise the reservation drives the balance negative.
    if (capital > availableCapital + 0.01) {
      toast.error("Insufficient funds", {
        description: `This subscription reserves ${formatEur(capital)} but only ${formatEur(
          Math.max(0, availableCapital),
        )} is available on your master account. Fund the account before applying.`,
      })
      return
    }

    const applicant = applicantName.trim() || user.fullName
    const email = applicantEmail.trim() || user.email
    setSubmitting(true)

    // Mirror the application into the DB-backed approvals backbone so the
    // Administrator receives an authorization task cross-client — WITHOUT this
    // the submission only logged locally and no admin task was ever raised.
    const res = await mirrorSubmissionDetailed({
      kind: "trading_fund",
      title: `Treuhand AG Hedge Fund — ${tokens} tokens`,
      summary: `${applicant} applied to the Treuhand AG Limited Hedge Fund for ${tokens} tokens (${formatEur(capital)} capital) at 25% fixed monthly ROI (${formatEur(monthlyReturn)}/mo projected).`,
      amount: capital,
      currency: "EUR",
      // Two-phase funds handling:
      //   • On APPLICATION the capital is RESERVED (blocked) on the master
      //     account as a `hold` — posted by the trading-fund reconciler while
      //     the request is pending (see buildTradingFundPosts).
      //   • On APPROVAL this `gate: true`, "completed" effect SETTLES that same
      //     reservation into a real debit: the capital leaves the master
      //     account. `gate: true` routes it through the feasibility check +
      //     capped cross-currency FX funding + solvency enforcement, so the
      //     Administrator can only authorize it when the balance covers it and
      //     it can never overdraw the account.
      ledgerEffect: {
        direction: "debit",
        amount: capital,
        currency: "EUR",
        status: "completed",
        gate: true,
        counterparty: "Treuhand AG Limited Hedge Fund",
        category: "NAFTAhub Trading — Fund Subscription",
        reference: `TREUHAND-${tokens}T`,
      },
      payload: {
        fund: "Treuhand AG Limited Hedge Fund",
        tokens,
        tokenValue: TOKEN_VALUE,
        capital,
        monthlyRoi: monthlyReturn,
        applicant,
        email,
        submittedAt: new Date().toISOString(),
      },
    })
    setSubmitting(false)

    if (!res.ok) {
      toast.error("Application could not be submitted", {
        description: res.error || "Please try again in a moment.",
      })
      return
    }

    log({
      action: `Applied to Treuhand AG Limited Hedge Fund — ${tokens} tokens (${formatEur(capital)})`,
      category: "NAFTAhub Trading",
      details: {
        summary: `Client submitted an application to the Treuhand AG Limited Hedge Fund for ${tokens} tokens (${formatEur(capital)} capital) at 25% fixed monthly ROI (${formatEur(monthlyReturn)}/mo projected). Sent to the Administrator for authorization.`,
        fund: "Treuhand AG Limited Hedge Fund",
        tokens: String(tokens),
        capitalDeployed: formatEur(capital),
        monthlyRoi: formatEur(monthlyReturn),
        applicant,
        email,
        approvalId: res.id ?? "—",
        submittedAt: new Date().toLocaleString("en-GB"),
      },
    })
    toast.success("Application submitted", {
      description: `${formatEur(capital)} has been reserved on your master account for this ${tokens}-token application and sent to the Administrator. The funds stay blocked while pending; on approval they are debited and deployed to the fund.`,
    })
    setApplyOpen(false)
    setApplicantName("")
    setApplicantEmail("")
  }

  const toggleAutoExecute = (next: boolean) => {
    setAutoExecute(next)
    log({
      action: `NQAi auto-execution ${next ? "enabled" : "disabled"}`,
      category: "NAFTAhub Trading",
      details: {
        summary: `Client ${next ? "enabled" : "disabled"} the NQAi automated execution engine.`,
        engine: "NQAi",
        autoExecution: next ? "ON" : "OFF",
        toggledAt: new Date().toLocaleString("en-GB"),
      },
    })
    toast[next ? "success" : "info"](`NQAi auto-execution ${next ? "enabled" : "paused"}`, {
      description: next
        ? "The engine will now execute micro-positions automatically."
        : "Automated execution paused. Signals remain live for manual trading.",
    })
  }

  const openTrade = (instrument: Instrument, side: "LONG" | "SHORT") => {
    setTradeTarget(instrument)
    setTradeSide(side)
    setLots("0.10")
  }

  const confirmTrade = () => {
    if (!tradeTarget) return
    const volume = parseFloat(lots) || 0
    if (volume <= 0) {
      toast.error("Enter a lot size greater than zero")
      return
    }
    if (!(tradeTarget.price > 0)) {
      toast.error("No live price yet", { description: "Wait for a market price before deploying this position." })
      return
    }
    const status = marketStatus(tradeTarget.category)
    if (!status.open) {
      toast.error("Market closed", {
        description: `${tradeTarget.symbol} is not tradable right now (${status.label}).`,
      })
      return
    }
    if (highRisk) {
      toast.error("Trading paused by risk controls", {
        description:
          "Your Guarantees Accumulator score is high-risk. Reduce exposure or contact your administrator before opening new positions.",
      })
      return
    }
    const notionalEur = volume * NOTIONAL_PER_LOT
    const marginEur = marginEurFor(tradeTarget.category, volume)
    if (marginEur > freeMargin + 0.01) {
      toast.error("Insufficient trading balance", {
        description: `This position needs ${formatEur(marginEur)} margin but only ${formatEur(freeMargin)} free margin is in your trading wallet. Fund it from your Master Account first.`,
      })
      return
    }
    const id = `NQ-${Date.now().toString(36).toUpperCase()}`
    const position: StoredPosition = {
      id,
      symbol: tradeTarget.symbol,
      name: tradeTarget.name,
      side: tradeSide,
      lots: volume,
      entry: tradeTarget.price,
      decimals: tradeTarget.decimals,
      openedAt: new Date().toISOString(),
      marginEur,
      notionalEur,
    }
    // Margin is reserved from the ring-fenced trading wallet's free margin, not
    // the Master Account — the master was already debited when the wallet was
    // funded. The reservation is expressed by this open position's marginEur.
    setDeployed((prev) => [position, ...prev])
    log({
      action: `Deployed NQAi ${tradeSide} micro-position on ${tradeTarget.symbol}`,
      category: "NAFTAhub Trading",
      details: {
        summary: `Client opened a ${tradeSide} position of ${volume.toFixed(2)} lots on ${tradeTarget.symbol} (${tradeTarget.name}) at ${formatPrice(tradeTarget.price, tradeTarget.decimals)} via the NQAi engine. ${formatEur(marginEur)} margin (1:${leverageFor(tradeTarget.category)}) reserved from the trading wallet.`,
        instrument: tradeTarget.symbol,
        side: tradeSide,
        lots: volume.toFixed(2),
        entryPrice: formatPrice(tradeTarget.price, tradeTarget.decimals),
        notional: formatEur(notionalEur),
        marginReserved: formatEur(marginEur),
        leverage: `1:${leverageFor(tradeTarget.category)}`,
        aiSignal: tradeTarget.signal,
        confidence: `${tradeTarget.confidence}%`,
        openedAt: new Date().toLocaleString("en-GB"),
      },
    })
    toast.success("Position deployed", {
      description: `${tradeSide} ${volume.toFixed(2)} lots ${tradeTarget.symbol} — ${formatEur(marginEur)} margin reserved from your trading wallet.`,
    })
    setTradeTarget(null)
    handleTabChange("positions")
  }

  // Deployed positions with a live, signed P&L derived from the current market
  // price vs entry — recomputes whenever quotes refresh.
  const livePositions = useMemo(
    () =>
      deployed.map((p) => {
        const current = quotes[p.symbol]?.price ?? p.entry
        const sign = p.side === "LONG" ? 1 : -1
        const pnl = p.entry > 0 ? ((current - p.entry) / p.entry) * p.lots * NOTIONAL_PER_LOT * sign : 0
        return { ...p, current, pnl }
      }),
    [deployed, quotes],
  )

  const closePosition = async (id: string) => {
    const pos = livePositions.find((p) => p.id === id)
    if (!pos) return
    // Best-effort release of any legacy Master-Account margin hold from an
    // earlier build (positions opened before the ring-fenced wallet model).
    await removeMyLedgerEntry(`TRADE-MGN-${id}`).catch(() => {})
    // Settle realized P&L into the trading wallet; the reserved margin frees up
    // automatically once the position leaves the book.
    const realized = Math.round(pos.pnl * 100) / 100
    setWalletBalance((prev) => Math.round((prev + realized) * 100) / 100)
    setDeployed((prev) => prev.filter((p) => p.id !== id))
    log({
      action: `Closed NQAi position on ${pos.symbol}`,
      category: "NAFTAhub Trading",
      details: {
        summary: `Client closed ${pos.side} ${pos.lots.toFixed(2)} lots ${pos.symbol}; realized ${realized >= 0 ? "profit" : "loss"} ${formatEur(Math.abs(realized))} settled to the trading wallet and ${formatEur(pos.marginEur)} margin released.`,
        instrument: pos.symbol,
        side: pos.side,
        lots: pos.lots.toFixed(2),
        realizedPnl: formatEur(realized),
        marginReleased: formatEur(pos.marginEur),
        closedAt: new Date().toLocaleString("en-GB"),
      },
    })
    toast[realized >= 0 ? "success" : "info"]("Position closed", {
      description:
        realized >= 0
          ? `Realized profit ${formatEur(realized)} added to your trading wallet.`
          : `Realized loss ${formatEur(Math.abs(realized))} deducted from your trading wallet.`,
    })
  }

  const openPnl = livePositions.reduce((sum, p) => sum + p.pnl, 0)

  // cTrader-style account metrics for the ring-fenced trading wallet: balance is
  // the wallet's realized cash, used margin is the sum of open-position margins,
  // free margin is what's left to open new trades or withdraw, and equity =
  // balance + floating P&L.
  const usedMargin = livePositions.reduce((sum, p) => sum + (p.marginEur || 0), 0)
  const balance = walletBalance
  const freeMargin = Math.max(0, walletBalance - usedMargin)
  const equity = walletBalance + openPnl
  const marginLevel = usedMargin > 0 ? (equity / usedMargin) * 100 : null

  const fundWallet = () => {
    const amt = Number.parseFloat(transferAmount.replace(/,/g, "")) || 0
    if (amt <= 0) {
      toast.error("Enter an amount greater than zero")
      return
    }
    const fee = Math.round(amt * TRADING_TRANSFER_FEE_RATE * 100) / 100
    const total = Math.round((amt + fee) * 100) / 100
    if (total > availableCapital + 0.01) {
      toast.error("Insufficient Master Account balance", {
        description: `Funding ${formatEur(amt)} costs ${formatEur(total)} incl. the 2% fee, but only ${formatEur(availableCapital)} is available.`,
      })
      return
    }
    const id = `TW-${Date.now().toString(36).toUpperCase()}`
    // The Master Account bears the full cost — the funded amount PLUS the 2% fee.
    // The wallet is credited the full amount the client asked to fund.
    addDebit({
      id: `TRADE-FUND-${id}`,
      status: "completed",
      currency: "EUR",
      amount: total,
      category: "Trading Wallet Funding",
      counterparty: "NQAi Trading Desk",
      comment: `Funded trading wallet ${formatEur(amt)} + 2% fee ${formatEur(fee)}`,
      reference: id,
      date: new Date().toISOString(),
    })
    setWalletBalance((prev) => Math.round((prev + amt) * 100) / 100)
    log({
      action: "Funded NQAi trading wallet",
      category: "NAFTAhub Trading",
      details: {
        summary: `Client funded the trading wallet with ${formatEur(amt)}; a ${formatEur(fee)} (2%) fee was charged to the Master Account, so ${formatEur(total)} was debited from the Master Account and ${formatEur(amt)} credited to the wallet.`,
        debitedFromMaster: formatEur(total),
        fee: formatEur(fee),
        creditedToWallet: formatEur(amt),
        at: new Date().toLocaleString("en-GB"),
      },
    })
    refreshLedger()
    setTransferAmount("")
    setFundOpen(false)
    toast.success("Trading wallet funded", {
      description: `${formatEur(amt)} credited to your wallet — ${formatEur(total)} debited from your Master Account (2% fee ${formatEur(fee)}).`,
    })
  }

  const withdrawWallet = () => {
    const amt = Number.parseFloat(transferAmount.replace(/,/g, "")) || 0
    if (amt <= 0) {
      toast.error("Enter an amount greater than zero")
      return
    }
    if (amt > freeMargin + 0.01) {
      toast.error("Exceeds free margin", {
        description: `Only ${formatEur(freeMargin)} is free to withdraw — the rest is reserved as margin on open positions.`,
      })
      return
    }
    const fee = Math.round(amt * TRADING_TRANSFER_FEE_RATE * 100) / 100
    const net = Math.round((amt - fee) * 100) / 100
    const id = `TW-${Date.now().toString(36).toUpperCase()}`
    // Credit the net (after 2% fee) back to the Master Account.
    addReceipt({
      id: `TRADE-WD-${id}`,
      status: "completed",
      currency: "EUR",
      amount: net,
      category: "Trading Wallet Withdrawal",
      counterparty: "NQAi Trading Desk",
      comment: `Withdrew ${formatEur(amt)} from trading wallet (net of 2% fee ${formatEur(fee)})`,
      reference: id,
      date: new Date().toISOString(),
    })
    setWalletBalance((prev) => Math.round((prev - amt) * 100) / 100)
    log({
      action: "Withdrew from NQAi trading wallet",
      category: "NAFTAhub Trading",
      details: {
        summary: `Client withdrew ${formatEur(amt)} from the trading wallet to the Master Account; ${formatEur(fee)} (2%) fee applied, ${formatEur(net)} credited to the Master Account.`,
        withdrawn: formatEur(amt),
        fee: formatEur(fee),
        credited: formatEur(net),
        at: new Date().toLocaleString("en-GB"),
      },
    })
    refreshLedger()
    setTransferAmount("")
    setWithdrawOpen(false)
    toast.success("Withdrawn to Master Account", { description: `${formatEur(net)} credited (2% fee ${formatEur(fee)}).` })
  }

  // Derived values for the open order ticket.
  const tradeVolume = parseFloat(lots) || 0
  const tradeMarketState = tradeTarget ? marketStatus(tradeTarget.category) : null
  const tradeMarginEur = tradeTarget ? marginEurFor(tradeTarget.category, tradeVolume) : 0
  const tradeNotionalEur = tradeVolume * NOTIONAL_PER_LOT
  const tradeSpendable = freeMargin
  const tradeInsufficient = tradeMarginEur > freeMargin + 0.01
  const tradeBlocked = !tradeMarketState?.open || tradeVolume <= 0 || tradeInsufficient || highRisk

  const addAlert = () => {
    const target = Number.parseFloat(alertPrice.replace(/,/g, "")) || 0
    if (!alertSymbol || target <= 0) {
      toast.error("Pick a symbol and a target price")
      return
    }
    const meta = metaBySymbol.get(alertSymbol) ?? customMeta[alertSymbol]
    setPriceAlerts((prev) => [
      { id: `AL-${Date.now().toString(36)}`, symbol: alertSymbol, name: meta?.name ?? alertSymbol, target, direction: alertDir },
      ...prev,
    ])
    setAlertPrice("")
    toast.success(`Alert set — ${alertSymbol} ${alertDir} ${target}`)
  }

  // Fire (and self-clear) any alert whose target has been crossed by the live price.
  useEffect(() => {
    if (priceAlerts.length === 0) return
    const triggered = priceAlerts.filter((a) => {
      const price = quotes[a.symbol]?.price
      if (price == null) return false
      return a.direction === "above" ? price >= a.target : price <= a.target
    })
    if (triggered.length === 0) return
    triggered.forEach((a) =>
      toast.info(`Price alert · ${a.symbol}`, {
        description: `${a.symbol} is now ${a.direction} ${a.target} (${quotes[a.symbol]?.price}).`,
      }),
    )
    setPriceAlerts((prev) => prev.filter((a) => !triggered.some((t) => t.id === a.id)))
  }, [quotes, priceAlerts, setPriceAlerts])

  return (
    <>
      {ctraderView && (
        <CtraderTerminal
          instruments={signalInstruments}
          positions={livePositions}
          balance={balance}
          equity={equity}
          openPnl={openPnl}
          freeMargin={freeMargin}
          usedMargin={usedMargin}
          marginLevel={marginLevel}
          formatEur={formatEur}
          formatPrice={formatPrice}
          marketStatus={marketStatus}
          onTrade={(sym, side) => {
            const full = signalInstruments.find((s) => s.symbol === sym)
            if (full) openTrade(full, side)
          }}
          onClose={closePosition}
          onManage={() => setManageOpen(true)}
          onFund={() => setFundOpen(true)}
          onWithdraw={() => setWithdrawOpen(true)}
          onAlerts={() => setAlertsOpen(true)}
          onExitTerminal={() => setCtraderView(false)}
        />
      )}
      <div className={cn("space-y-6", ctraderView && "hidden")}>
        <button
          type="button"
          onClick={() => setCtraderView(true)}
          className="flex w-full items-center justify-between gap-2 rounded-xl border border-primary/40 bg-primary/10 px-4 py-3 text-left transition-colors hover:bg-primary/15"
        >
          <span className="flex items-center gap-2.5">
            <LineChart className="size-5 shrink-0 text-primary" />
            <span className="flex flex-col">
              <span className="text-sm font-semibold text-foreground">Open trading terminal</span>
              <span className="text-xs text-muted-foreground">cTrader-style Markets, Charts, Positions &amp; order ticket</span>
            </span>
          </span>
          <ArrowRight className="size-5 shrink-0 text-primary" />
        </button>
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-start gap-3">
          <div className="flex shrink-0 items-center rounded-lg bg-white px-2 py-1.5">
            <img
              src="/images/naftahub-logo.png"
              alt="NAFTAhub logo"
              className="h-7 w-auto object-contain sm:h-8"
            />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-bold text-foreground">NAFTAhub</h1>
              <Badge variant="outline" className="border-primary/30 bg-primary/10 text-primary text-[10px]">
                NQAi Engine
              </Badge>
            </div>
            <p className="text-sm text-muted-foreground text-pretty">
              Neural Quantum AI trading across commodities, FX, equities, crypto &amp; indices.
            </p>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <a
                href="https://v0-nqai-political-volatility-agent.vercel.app"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 rounded-md border border-border bg-secondary/40 px-2.5 py-1 text-xs font-medium text-foreground transition-colors hover:bg-secondary"
              >
                <Landmark className="h-3.5 w-3.5 text-primary" />
                Political Volatility Agent
                <ArrowUpRight className="h-3.5 w-3.5 text-muted-foreground" />
              </a>
              <a
                href="https://v0-naftahub.vercel.app/"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 rounded-md border border-border bg-secondary/40 px-2.5 py-1 text-xs font-medium text-foreground transition-colors hover:bg-secondary"
              >
                <LineChart className="h-3.5 w-3.5 text-primary" />
                NAFTAhub Platform
                <ArrowUpRight className="h-3.5 w-3.5 text-muted-foreground" />
              </a>
            </div>
          </div>
        </div>
        <button
          type="button"
          onClick={openFund}
          className="group flex w-fit max-w-md items-start gap-2 rounded-lg border border-primary/20 bg-primary/10 px-3 py-2 text-left leading-snug text-primary transition-colors hover:bg-primary/20"
        >
          <Sparkles className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span className="text-xs font-medium">
            Apply to the Treuhand AG Limited hedge fund and benefit from 25% monthly ROI — secured &amp; automated by NQAi
          </span>
          <ArrowRight className="mt-0.5 h-3.5 w-3.5 shrink-0 transition-transform group-hover:translate-x-0.5" />
        </button>
      </div>

      {/* NQAi engine status */}
      <Card className="border-primary/20 bg-gradient-to-r from-primary/10 to-primary/5">
        <CardContent className="flex flex-col gap-4 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-3">
            <div className="relative mt-0.5">
              <span className="absolute inline-flex h-3 w-3 animate-ping rounded-full bg-green-500/60" />
              <span className="relative inline-flex h-3 w-3 rounded-full bg-green-500" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <Bot className="h-4 w-4 text-primary" />
                <h2 className="font-semibold text-foreground">NQAi Engine — Operational</h2>
              </div>
              <p className="mt-1 text-xs text-muted-foreground text-pretty">
                Neural Quantum Scalping Dynamics running. Midpoint deviation, RSI/EMA/ATR
                overlays and fractional foresight active across {instruments.length} instruments.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3 rounded-lg border border-border bg-background/40 px-4 py-2">
            <div>
              <p className="text-xs font-medium text-foreground">Auto-Execution</p>
              <p className="text-[10px] text-muted-foreground">{autoExecute ? "Engine trading live" : "Manual mode"}</p>
            </div>
            <Switch checked={autoExecute} onCheckedChange={toggleAutoExecute} aria-label="Toggle NQAi auto-execution" />
          </div>
        </CardContent>
      </Card>

      {/* cTrader-style trading account bar — managed against the Master Account */}
      <Card className="bg-card border-border">
        <CardContent className="p-4">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <div className="rounded-md bg-primary/10 p-1.5">
                <Wallet className="h-4 w-4 text-primary" />
              </div>
              <div>
                <p className="text-sm font-semibold text-foreground">Trading Wallet</p>
                <p className="text-[11px] text-muted-foreground">Ring-fenced · funded from your Master Account</p>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Button
                size="sm"
                className="shrink-0"
                onClick={() => {
                  setTransferAmount("")
                  setFundOpen(true)
                }}
              >
                <ArrowDownToLine className="mr-1.5 h-3.5 w-3.5" />
                Fund
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="shrink-0"
                onClick={() => {
                  setTransferAmount("")
                  setWithdrawOpen(true)
                }}
              >
                <ArrowUpFromLine className="mr-1.5 h-3.5 w-3.5" />
                Withdraw
              </Button>
              <Button variant="outline" size="sm" className="shrink-0" onClick={() => setAlertsOpen(true)}>
                <Bell className="mr-1.5 h-3.5 w-3.5" />
                Alerts{priceAlerts.length > 0 ? ` · ${priceAlerts.length}` : ""}
              </Button>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
            <div>
              <p className="text-[11px] text-muted-foreground">Balance</p>
              <p className="mt-0.5 font-mono text-base font-bold text-foreground">{formatEur(balance)}</p>
            </div>
            <div>
              <p className="text-[11px] text-muted-foreground">Equity</p>
              <p className="mt-0.5 font-mono text-base font-bold text-foreground">{formatEur(equity)}</p>
            </div>
            <div>
              <p className="text-[11px] text-muted-foreground">Unrealized P&amp;L</p>
              <p
                className={cn(
                  "mt-0.5 font-mono text-base font-bold",
                  openPnl > 0 ? "text-green-500" : openPnl < 0 ? "text-red-500" : "text-foreground",
                )}
              >
                {openPnl > 0 ? "+" : ""}
                {formatEur(openPnl)}
              </p>
            </div>
            <div>
              <p className="text-[11px] text-muted-foreground">Free Margin</p>
              <p className="mt-0.5 font-mono text-base font-bold text-foreground">{formatEur(freeMargin)}</p>
            </div>
            <div>
              <p className="text-[11px] text-muted-foreground">Used Margin</p>
              <p className="mt-0.5 font-mono text-base font-bold text-foreground">{formatEur(usedMargin)}</p>
              {marginLevel != null && (
                <p className="text-[10px] text-muted-foreground">Level {marginLevel.toFixed(0)}%</p>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Stats */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card className="bg-card border-border">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-muted-foreground">Available Capital</p>
                <p className="mt-1 text-2xl font-bold text-foreground">{formatEur(availableCapital)}</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {livePositions.length > 0 ? `Across ${livePositions.length} positions` : "Ready to allocate"}
                </p>
              </div>
              <div className="rounded-lg bg-primary/10 p-3">
                <LineChart className="h-5 w-5 text-primary" />
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-card border-border">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-muted-foreground">Today&apos;s P&amp;L</p>
                <p className={cn("mt-1 text-2xl font-bold", openPnl > 0 ? "text-green-500" : openPnl < 0 ? "text-red-500" : "text-foreground")}>
                  {openPnl > 0 ? `+${formatEur(openPnl)}` : formatEur(openPnl)}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {livePositions.length > 0 ? "Live session" : "No active positions"}
                </p>
              </div>
              <div className={cn("rounded-lg p-3", openPnl > 0 ? "bg-green-500/10" : "bg-secondary")}>
                <TrendingUp className={cn("h-5 w-5", openPnl > 0 ? "text-green-500" : "text-muted-foreground")} />
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-card border-border">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-muted-foreground">NQAi Win Rate</p>
                <p className="mt-1 text-2xl font-bold text-foreground">87.2%</p>
                <p className="mt-1 text-xs text-muted-foreground">Engine benchmark</p>
              </div>
              <div className="rounded-lg bg-blue-500/10 p-3">
                <Gauge className="h-5 w-5 text-blue-400" />
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-card border-border">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-muted-foreground">Open Positions</p>
                <p className="mt-1 text-2xl font-bold text-foreground">{livePositions.length}</p>
                <p className="mt-1 text-xs text-muted-foreground">Micro-position layering</p>
              </div>
              <div className="rounded-lg bg-orange-500/10 p-3">
                <Activity className="h-5 w-5 text-orange-400" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Live ticker tape — real, self-updating quotes streamed directly from
          TradingView so the numbers always match the TradingView app. */}
      <Card className="bg-card border-border overflow-hidden">
        <div className="h-[46px] w-full">
          <TradingViewWidget
            scriptSrc="embed-widget-ticker-tape.js"
            config={{
              symbols: tickerTapeSymbols,
              showSymbolLogo: true,
              isTransparent: true,
              displayMode: "adaptive",
              colorTheme: "dark",
              locale: "en",
            }}
            height={46}
          />
        </div>
      </Card>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={handleTabChange} className="w-full">
        {/* Sticky section nav: stays pinned below the header so users can jump
            between sections from anywhere in a long, data-heavy tab. */}
        <div
          ref={tabsNavRef}
          className="sticky top-0 z-30 -mx-4 mb-2 scroll-mt-2 border-b border-border bg-background/95 px-4 py-2 backdrop-blur supports-[backdrop-filter]:bg-background/80 md:-mx-6 md:px-6"
        >
          <TabsList className="flex w-full justify-start overflow-x-auto">
            <TabsTrigger value="markets">Markets</TabsTrigger>
            <TabsTrigger value="signals">AI Signals</TabsTrigger>
            <TabsTrigger value="positions">Positions</TabsTrigger>
            <TabsTrigger value="tiers">ROI Tiers</TabsTrigger>
            <TabsTrigger value="fund" className="gap-1.5">
              Treuhand Fund
              {activePositions.length > 0 && (
                <span
                  className="inline-flex min-w-5 items-center justify-center rounded-full bg-primary px-1.5 text-[11px] font-semibold leading-5 text-primary-foreground"
                  aria-label={`${activePositions.length} active Treuhand position${activePositions.length === 1 ? "" : "s"}`}
                >
                  {activePositions.length}
                </span>
              )}
            </TabsTrigger>
          </TabsList>
        </div>

        {/* Markets */}
        <TabsContent value="markets" className="mt-6 space-y-6">
          {/* Real-time TradingView chart — switch instruments via the watchlist. */}
          <Card className="bg-card border-border overflow-hidden">
            <CardHeader className="pb-2">
              <CardTitle className="text-lg font-semibold">Live Chart</CardTitle>
              <p className="mt-1 text-xs text-muted-foreground">Real-time market data · TradingView</p>
            </CardHeader>
            <CardContent>
              <div className="h-[420px] w-full">
                <TradingViewWidget
                  scriptSrc="embed-widget-advanced-chart.js"
                  config={{
                    autosize: true,
                    symbol: tradingViewSymbol("XAU/USD"),
                    interval: "60",
                    timezone: "Etc/UTC",
                    theme: "dark",
                    style: "1",
                    locale: "en",
                    hide_side_toolbar: true,
                    allow_symbol_change: true,
                    watchlist: INSTRUMENT_SYMBOLS.map((s) => tradingViewSymbol(s)),
                    support_host: "https://www.tradingview.com",
                  }}
                  height="100%"
                />
              </div>
            </CardContent>
          </Card>

          <Card className="bg-card border-border">
            <CardHeader className="pb-2">
              <div className="flex items-center gap-2">
                <CardTitle className="text-lg font-semibold">Live Markets</CardTitle>
                <span className="inline-flex items-center gap-1 rounded-full border border-green-500/30 bg-green-500/10 px-1.5 py-0.5 text-[10px] font-medium text-green-500">
                  <span className="relative flex h-1.5 w-1.5">
                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-green-500/70" />
                    <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-green-500" />
                  </span>
                  LIVE
                </span>
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                Real-time quotes streamed from TradingView — the exact prices shown in your TradingView app.
              </p>
            </CardHeader>
            <CardContent>
              <div className="h-[560px] w-full">
                <TradingViewWidget
                  scriptSrc="embed-widget-market-quotes.js"
                  config={{
                    width: "100%",
                    height: "100%",
                    symbolsGroups: quoteGroups,
                    showSymbolLogo: true,
                    isTransparent: true,
                    colorTheme: "dark",
                    backgroundColor: "rgba(0,0,0,0)",
                    locale: "en",
                  }}
                  height="100%"
                />
              </div>
            </CardContent>
          </Card>

          {/* Quick Trade — deploy an NQAi position. No price is shown here so it
              can never contradict the TradingView board above; the execution
              price is captured live from the feed at order time. */}
          <Card className="bg-card border-border">
            <CardHeader className="pb-2">
              <CardTitle className="text-lg font-semibold">Quick Trade</CardTitle>
              <p className="mt-1 text-xs text-muted-foreground">
                Deploy a position with the NQAi engine — execution price is taken live at order time.
              </p>
            </CardHeader>
            <CardContent className="grid gap-2 sm:grid-cols-2">
              {instruments.map((it) => (
                <div
                  key={it.symbol}
                  className="flex items-center justify-between gap-3 rounded-lg border border-border bg-secondary/30 p-3"
                >
                  <div className="flex min-w-0 items-center gap-3">
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-secondary">
                      <span className="text-[10px] font-semibold text-foreground">
                        {it.symbol.split("/")[0].slice(0, 4)}
                      </span>
                    </div>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-foreground">{it.symbol}</p>
                      <p className="truncate text-xs text-muted-foreground">
                        {it.name} · {it.category}
                      </p>
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <Badge variant="outline" className={cn("w-14 justify-center text-[10px]", signalStyles[it.signal])}>
                      {it.signal}
                    </Badge>
                    <Button
                      size="sm"
                      className="h-8"
                          disabled={!it.live || !marketStatus(it.category).open}
                          onClick={() => openTrade(it, it.signal === "SELL" ? "SHORT" : "LONG")}
                    >
                      Trade
                    </Button>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        </TabsContent>

        {/* AI Signals — user-managed preferred watchlist */}
        <TabsContent value="signals" className="mt-6 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="min-w-0">
              <p className="text-sm font-semibold text-foreground">
                Preferred signals · {signalInstruments.length}
              </p>
              <p className="text-xs text-muted-foreground">
                {updatedAt ? `Updated ${updatedAt.toLocaleTimeString()}` : "Fetching live data…"}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  void refreshQuotes()
                  toast.success("Signals refreshed")
                }}
                disabled={isValidating}
              >
                <RotateCw className={cn("mr-2 h-4 w-4", isValidating && "animate-spin")} />
                Refresh
              </Button>
              <Button size="sm" onClick={() => setManageOpen(true)}>
                <Plus className="mr-2 h-4 w-4" />
                Add / manage
              </Button>
            </div>
          </div>

          {signalInstruments.length === 0 ? (
            <Card className="bg-card border-border">
              <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-secondary">
                  <LineChart className="h-6 w-6 text-muted-foreground" />
                </div>
                <div>
                  <p className="text-sm font-medium text-foreground">Your signal list is empty</p>
                  <p className="mt-1 text-xs text-muted-foreground text-pretty">
                    Search the market and add stocks, ETFs, commodities, FX or crypto to build your
                    preferred NQAi signal list.
                  </p>
                </div>
                <Button size="sm" onClick={() => setManageOpen(true)}>
                  <Plus className="mr-2 h-4 w-4" />
                  Add instruments
                </Button>
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-4 md:grid-cols-2">
              {signalInstruments.map((it) => (
                <Card key={it.symbol} className="bg-card border-border">
                  <CardHeader className="pb-2">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <CardTitle className="text-base font-semibold">{it.symbol}</CardTitle>
                        <p className="truncate text-xs text-muted-foreground">{it.name}</p>
                      </div>
                      <div className="flex items-center gap-1">
                        {!marketStatus(it.category).open && (
                          <Badge variant="outline" className="border-border text-[10px] text-muted-foreground">
                            <Clock className="mr-1 h-3 w-3" />
                            Closed
                          </Badge>
                        )}
                        <Badge variant="outline" className={cn("text-[10px]", signalStyles[it.signal])}>
                          <Zap className="mr-1 h-3 w-3" />
                          {it.signal}
                        </Badge>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6 text-muted-foreground hover:text-foreground"
                          onClick={() => removeFromWatchlist(it.symbol)}
                          aria-label={`Remove ${it.symbol}`}
                        >
                          <X className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div>
                      <div className="mb-1 flex items-center justify-between">
                        <span className="text-xs text-muted-foreground">NQAi Confidence</span>
                        <span className="text-xs font-semibold text-foreground">{it.confidence}%</span>
                      </div>
                      <Progress value={it.confidence} className="h-1.5" />
                    </div>
                    <div className="grid grid-cols-3 gap-2">
                      <div className="rounded-md bg-secondary/40 p-2 text-center">
                        <p className="text-[10px] text-muted-foreground">RSI(7)</p>
                        <p className="text-xs font-semibold text-foreground">
                          {it.signal === "BUY" ? "31" : it.signal === "SELL" ? "69" : "50"}
                        </p>
                      </div>
                      <div className="rounded-md bg-secondary/40 p-2 text-center">
                        <p className="text-[10px] text-muted-foreground">EMA(40)</p>
                        <p className="text-xs font-semibold text-foreground">
                          {it.signal === "BUY" ? "↑" : it.signal === "SELL" ? "↓" : "→"}
                        </p>
                      </div>
                      <div className="rounded-md bg-secondary/40 p-2 text-center">
                        <p className="text-[10px] text-muted-foreground">ATR×</p>
                        <p className="text-xs font-semibold text-foreground">1.5</p>
                      </div>
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      className="w-full"
                          disabled={!it.live || !marketStatus(it.category).open}
                          onClick={() => openTrade(it, it.signal === "SELL" ? "SHORT" : "LONG")}
                    >
                      {!marketStatus(it.category).open
                        ? "Market closed"
                        : it.live
                          ? "Execute Signal"
                          : "Waiting for price…"}
                      {it.live && marketStatus(it.category).open && <ArrowRight className="ml-2 h-4 w-4" />}
                    </Button>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        {/* Positions */}
        <TabsContent value="positions" className="mt-6">
          <Card className="bg-card border-border">
            <CardHeader className="pb-2">
              <CardTitle className="text-lg font-semibold">Open Micro-Positions</CardTitle>
              <p className="text-xs text-muted-foreground">
                Capital-segmented layering managed by the NQAi risk controller
              </p>
            </CardHeader>
            <CardContent className="space-y-2">
              {livePositions.length === 0 ? (
                <div className="flex flex-col items-center justify-center gap-3 py-10 text-center">
                  <div className="flex h-12 w-12 items-center justify-center rounded-full bg-secondary">
                    <Activity className="h-6 w-6 text-muted-foreground" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-foreground">No open positions</p>
                    <p className="mt-1 text-xs text-muted-foreground text-pretty">
                      You have no capital allocated to NQAi yet. Deploy a position from the Markets
                      tab or apply to the Treuhand AG fund to begin.
                    </p>
                  </div>
                  <Button variant="outline" size="sm" onClick={() => handleTabChange("markets")}>
                    Browse Markets
                    <ArrowRight className="ml-2 h-4 w-4" />
                  </Button>
                </div>
              ) : (
                livePositions.map((p) => (
                  <div
                    key={p.id}
                    className="flex items-center justify-between rounded-lg border border-border bg-secondary/30 p-3"
                  >
                    <div className="flex min-w-0 items-center gap-3">
                      <Badge
                        variant="outline"
                        className={cn(
                          "text-[10px]",
                          p.side === "LONG"
                            ? "bg-green-500/10 text-green-500 border-green-500/20"
                            : "bg-red-500/10 text-red-500 border-red-500/20",
                        )}
                      >
                        {p.side}
                      </Badge>
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-foreground">{p.symbol}</p>
                        <p className="truncate text-xs text-muted-foreground">
                          {p.lots.toFixed(2)} lots · {p.id}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="text-right">
                        <p
                          className={cn(
                            "text-sm font-semibold",
                            p.pnl > 0 ? "text-green-500" : p.pnl < 0 ? "text-red-500" : "text-foreground",
                          )}
                        >
                          {p.pnl > 0 ? "+" : ""}
                          {formatEur(p.pnl)}
                        </p>
                        <p className="font-mono text-xs text-muted-foreground">
                          {formatPrice(p.entry, p.decimals)} → {formatPrice(p.current, p.decimals)}
                        </p>
                      </div>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 shrink-0 text-muted-foreground hover:text-foreground"
                        onClick={() => closePosition(p.id)}
                        aria-label={`Close ${p.symbol}`}
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ROI Tiers */}
        <TabsContent value="tiers" className="mt-6">
          {/* Live upgrade status — gives the client a clear sign of a pending,
              approved or declined Avant-Garde request instead of a silent click. */}
          {membershipHydrated && membership?.tier === "avantgarde" && membership.status !== "active" && (
            <div
              className={cn(
                "mb-6 flex items-start gap-3 rounded-lg border p-4",
                avantApproved
                  ? "border-primary/30 bg-primary/5"
                  : avantRejected
                    ? "border-destructive/30 bg-destructive/5"
                    : "border-amber-500/30 bg-amber-500/10",
              )}
            >
              {avantApproved ? (
                <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
              ) : avantRejected ? (
                <Lock className="mt-0.5 h-5 w-5 shrink-0 text-destructive" />
              ) : (
                <Clock className="mt-0.5 h-5 w-5 shrink-0 text-amber-500" />
              )}
              <div className="min-w-0">
                <p className="text-sm font-semibold text-foreground">
                  Avant-Garde upgrade — {MEMBERSHIP_STATUS_LABEL[membership.status]}
                </p>
                <p className="text-xs text-muted-foreground text-pretty">
                  {avantApproved
                    ? "Your request has been approved. Treasury is validating your €1,000,000 security deposit; your tier activates as soon as it is secured."
                    : avantRejected
                      ? `Your request was declined.${membership.note ? ` ${membership.note}` : ""} You may submit a new request below.`
                      : "Your request is pending administrator approval. After approval, Treasury validates the €1,000,000 security deposit to activate your membership."}
                </p>
              </div>
            </div>
          )}
          <div className="grid gap-6 md:grid-cols-3">
            {TIERS.map((tier) => {
              const isCurrent =
                (tier.id === "pro" && effectiveTier.id === "pro") ||
                (tier.id === "avantgarde" && isAvantActive)
              return (
              <Card
                key={tier.id}
                className={cn("relative border-border bg-card", isCurrent && "border-primary shadow-lg shadow-primary/10")}
              >
                {isCurrent && (
                  <Badge className="absolute -top-3 left-1/2 -translate-x-1/2 bg-primary text-primary-foreground">
                    Your Tier
                  </Badge>
                )}
                <CardHeader className="space-y-3">
                  <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10">
                    <tier.icon className="h-6 w-6 text-primary" />
                  </div>
                  <div>
                    <h3 className="text-lg font-bold text-foreground">{tier.name}</h3>
                    <p className="text-xs text-muted-foreground">Daily ROI</p>
                    <p className="text-2xl font-bold text-primary">{tier.roi}</p>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  <ul className="space-y-2">
                    {tier.features.map((f) => (
                      <li key={f} className="flex items-start gap-2">
                        <Shield className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                        <span className="text-sm text-foreground">{f}</span>
                      </li>
                    ))}
                  </ul>
                  {tier.id === "pro" ? (
                    <Button className="w-full" variant="outline" disabled>
                      {isCurrent ? (
                        <>
                          <Check className="mr-1.5 h-4 w-4" /> Current Tier
                        </>
                      ) : (
                        "Included in your plan"
                      )}
                    </Button>
                  ) : isAvantActive ? (
                    <Button className="w-full" variant="outline" disabled>
                      <Check className="mr-1.5 h-4 w-4" /> Current Tier
                    </Button>
                  ) : !membershipHydrated ? (
                    <Button className="w-full" disabled>
                      <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> Checking status…
                    </Button>
                  ) : avantPending ? (
                    <Button className="w-full" disabled>
                      <Clock className="mr-1.5 h-4 w-4" /> Pending approval
                    </Button>
                  ) : avantApproved ? (
                    <Button className="w-full" disabled>
                      <ShieldCheck className="mr-1.5 h-4 w-4" /> Awaiting €1M deposit validation
                    </Button>
                  ) : (
                    <Button className="w-full" onClick={requestAvantGarde} disabled={upgradeSubmitting}>
                      {upgradeSubmitting ? (
                        <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                      ) : (
                        <Crown className="mr-1.5 h-4 w-4" />
                      )}
                      {avantRejected ? "Request Avant-Garde again" : "Upgrade to Avant-Garde"}
                    </Button>
                  )}
                </CardContent>
              </Card>
              )
            })}
          </div>
          <p className="mt-4 text-center text-xs text-muted-foreground text-pretty">
            ROI tiers are backed by Swiss fiduciary law and treasury deposits with partner
            institutions including UBS, Barclays &amp; HSBC. Past performance does not guarantee
            future results.
          </p>
        </TabsContent>

        {/* Treuhand AG Limited Hedge Fund */}
        <TabsContent value="fund" className="mt-6 space-y-6">
          {/* My positions — reconstructed from the ledger so the reservation and
              the debited capital are visible as their own line items. */}
          {fundPositions.length > 0 && (
            <Card className="bg-card border-border">
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-lg font-semibold">
                  <Coins className="h-5 w-5 text-primary" />
                  My Treuhand Positions
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-5">
                {/* Portfolio summary */}
                <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
                  <div className="rounded-lg border border-border bg-secondary/30 p-4">
                    <p className="text-xs text-muted-foreground">Capital deployed (active)</p>
                    <p
                      className="mt-1 text-lg font-bold tabular-nums leading-tight whitespace-nowrap text-foreground"
                      title={formatEur(activeFundCapital)}
                    >
                      {formatEurCompact(activeFundCapital)}
                    </p>
                    <p className="mt-0.5 text-[11px] text-muted-foreground">Debited from your master account</p>
                  </div>
                  <div className="rounded-lg border border-border bg-secondary/30 p-4">
                    <p className="text-xs text-muted-foreground">ROI matured to date</p>
                    <p
                      className="mt-1 text-lg font-bold tabular-nums leading-tight whitespace-nowrap text-green-500"
                      title={formatEur(totalRoiEarned)}
                    >
                      {formatEurCompact(totalRoiEarned)}
                    </p>
                    <p className="mt-0.5 text-[11px] text-muted-foreground">Already credited to you</p>
                  </div>
                  <div className="rounded-lg border border-border bg-secondary/30 p-4">
                    <p className="text-xs text-muted-foreground">Next month ROI</p>
                    <p
                      className="mt-1 text-lg font-bold tabular-nums leading-tight whitespace-nowrap text-primary"
                      title={formatEur(nextMonthRoi)}
                    >
                      {formatEurCompact(nextMonthRoi)}
                    </p>
                    <p className="mt-0.5 text-[11px] text-muted-foreground">Only if active at next payout</p>
                  </div>
                  <div className="rounded-lg border border-border bg-secondary/30 p-4">
                    <p className="text-xs text-muted-foreground">Active positions</p>
                    <p className="mt-1 text-lg font-bold text-foreground">
                      {fundPositions.filter((p) => p.status === "active").length}
                      <span className="text-sm font-normal text-muted-foreground"> / {fundPositions.length}</span>
                    </p>
                    <p className="mt-0.5 text-[11px] text-muted-foreground">{TRADING_FUND_TERM_MONTHS}-month engagement</p>
                  </div>
                </div>

                <p className="text-[11px] leading-relaxed text-muted-foreground text-pretty">
                  ROI accrues monthly and is credited only while a position stays active. The program may be terminated
                  at any time, so only ROI already matured is yours — figures beyond the next scheduled payout are not
                  guaranteed.
                </p>

                {/* Per-position lifecycle — live (reserved + active) positions */}
                <div className="space-y-4">
                  {activePositions.map((p) => {
                    const v = p.view
                    return (
                      <div key={p.ref} className="rounded-xl border border-border bg-background p-4 sm:p-5">
                        {/* Header */}
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-semibold text-foreground">
                              {p.tokens.toLocaleString("en-US")} token{p.tokens === 1 ? "" : "s"}
                            </span>
                            {p.status === "reserved" && (
                              <Badge variant="outline" className="border-amber-500/40 bg-amber-500/10 text-amber-600 text-[10px]">
                                <Clock className="mr-1 h-3 w-3" /> Reserved �� pending
                              </Badge>
                            )}
                            {p.status === "active" && (
                              <Badge variant="outline" className="border-green-500/40 bg-green-500/10 text-green-600 text-[10px]">
                                <BadgeCheck className="mr-1 h-3 w-3" /> Active · trading
                              </Badge>
                            )}
                            {p.status === "closed" && (
                              <Badge variant="outline" className="border-border bg-secondary text-muted-foreground text-[10px]">
                                <Check className="mr-1 h-3 w-3" />
                                {v?.expired ? "Matured · capital returned" : "Closed · capital returned"}
                              </Badge>
                            )}
                          </div>
                          <p className="truncate text-[11px] text-muted-foreground">Ref {p.ref}</p>
                        </div>

                        {/* Reserved (pending) — no timeline yet */}
                        {p.status === "reserved" && (
                          <p className="mt-3 text-xs text-muted-foreground text-pretty">
                            {formatEur(p.reserved)} is reserved on your master account and awaiting administrator
                            authorization. The {TRADING_FUND_TERM_MONTHS}-month engagement and ROI schedule begin once approved.
                          </p>
                        )}

                        {v && (
                          <>
                            {/* Timeline */}
                            <div className="mt-4">
                              <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                                <span className="inline-flex items-center gap-1">
                                  <Flag className="h-3 w-3" /> Started {fmtDate(v.activation)}
                                </span>
                                <span className="inline-flex items-center gap-1">
                                  <CalendarClock className="h-3 w-3" /> Expires {fmtDate(v.expiry)}
                                </span>
                              </div>
                              <Progress value={v.termProgress * 100} className="mt-2 h-2" />
                              <div className="mt-1.5 flex items-center justify-between text-[11px]">
                                <span className="text-muted-foreground">
                                  Month {v.monthsMatured} of {v.termMonths}
                                </span>
                                <span className={cn("font-medium", v.expired ? "text-muted-foreground" : "text-primary")}>
                                  {v.expired ? "Engagement matured" : `${v.daysRemaining} day${v.daysRemaining === 1 ? "" : "s"} to auto-termination`}
                                </span>
                              </div>
                            </div>

                            {/* Metrics grid */}
                            <div className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
                              <div className="rounded-lg border border-border/60 bg-secondary/20 p-3">
                                <p className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
                                  <Wallet className="h-3 w-3" /> Capital started
                                </p>
                                <p className="mt-1 text-sm font-bold tabular-nums leading-tight whitespace-nowrap text-foreground" title={formatEur(v.capitalStarted)}>{formatEurCompact(v.capitalStarted)}</p>
                              </div>
                              <div className="rounded-lg border border-border/60 bg-secondary/20 p-3">
                                <p className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
                                  <TrendingUp className="h-3 w-3" /> ROI matured
                                </p>
                                <p className="mt-1 text-sm font-bold tabular-nums leading-tight whitespace-nowrap text-green-500" title={formatEur(v.roiMatured)}>{formatEurCompact(v.roiMatured)}</p>
                                <p className="mt-0.5 text-[10px] text-muted-foreground">{v.monthsMatured} of {v.termMonths} months</p>
                              </div>
                              <div className="rounded-lg border border-border/60 bg-secondary/20 p-3">
                                <p className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
                                  <CalendarDays className="h-3 w-3" /> Trading days
                                </p>
                                <p className="mt-1 text-sm font-bold text-foreground">{v.daysElapsed}</p>
                                <p className="mt-0.5 text-[10px] text-muted-foreground">of {v.daysTotal} total</p>
                              </div>
                              <div className="rounded-lg border border-border/60 bg-secondary/20 p-3">
                                <p className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
                                  <CalendarClock className="h-3 w-3" /> Days to expiry
                                </p>
                                <p className="mt-1 text-sm font-bold text-foreground">{v.expired ? 0 : v.daysRemaining}</p>
                                <p className="mt-0.5 text-[10px] text-muted-foreground">{fmtDate(v.expiry)}</p>
                              </div>
                              <div className="rounded-lg border border-border/60 bg-secondary/20 p-3">
                                <p className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
                                  <Percent className="h-3 w-3" /> Next month ROI
                                </p>
                                <p className="mt-1 text-sm font-bold tabular-nums leading-tight whitespace-nowrap text-primary" title={formatEur(v.monthlyRoiAmount)}>{formatEurCompact(v.monthlyRoiAmount)}</p>
                                <p className="mt-0.5 text-[10px] text-muted-foreground">{(v.monthlyRoiRate * 100).toFixed(0)}% · only if active</p>
                              </div>
                              <div className="rounded-lg border border-border/60 bg-secondary/20 p-3">
                                <p className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
                                  <Coins className="h-3 w-3" /> Next payout
                                </p>
                                <p className="mt-1 text-sm font-bold text-foreground">
                                  {v.nextRoiDate ? fmtDate(v.nextRoiDate) : "—"}
                                </p>
                                <p className="mt-0.5 text-[10px] text-muted-foreground">
                                  {v.nextRoiDate ? "Next ROI credit" : "Fully matured"}
                                </p>
                              </div>
                            </div>

                            {/* Early-resignation control (active positions only) */}
                            {p.status === "active" && !v.expired && (() => {
                              const reqState = termRequests?.[p.ref]
                              const requested = Boolean(reqState?.requestedAt)
                              return requested ? (
                                <div className="mt-4 flex flex-col gap-2 rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 sm:flex-row sm:items-center sm:justify-between">
                                  <div className="flex items-start gap-2">
                                    <Clock className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
                                    <div>
                                      <p className="text-xs font-medium text-amber-700">
                                        Anticipated termination requested — under administrator review
                                      </p>
                                      <p className="mt-0.5 text-[11px] text-amber-700/80 text-pretty">
                                        MCC Capital will evaluate your request and reconcile the position, returning your
                                        capital minus the {(TRADING_FUND_EXIT_COMMISSION * 100).toFixed(0)}% exit commission
                                        and any penalty or charges.
                                        {reqState?.reason ? ` Reason: ${reqState.reason}` : ""}
                                      </p>
                                    </div>
                                  </div>
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    className="shrink-0 border-amber-500/40 text-amber-700 hover:bg-amber-500/10"
                                    disabled={withdrawing === p.ref}
                                    onClick={() => withdrawTermination(p.ref)}
                                  >
                                    {withdrawing === p.ref ? (
                                      <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                                    ) : (
                                      <X className="mr-1.5 h-3.5 w-3.5" />
                                    )}
                                    Withdraw
                                  </Button>
                                </div>
                              ) : (
                                <div className="mt-4 flex flex-col gap-2 border-t border-border/60 pt-4 sm:flex-row sm:items-center sm:justify-between">
                                  <p className="text-[11px] text-muted-foreground text-pretty">
                                    Need to exit before the {v.termMonths}-month term? You can request an anticipated
                                    termination for administrator evaluation. Early resignation may incur a penalty in
                                    addition to the {(TRADING_FUND_EXIT_COMMISSION * 100).toFixed(0)}% exit commission.
                                  </p>
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    className="shrink-0"
                                    onClick={() => {
                                      setTerminateTarget({
                                        ref: p.ref,
                                        capital: v.capitalStarted,
                                        roiMatured: v.roiMatured,
                                        activation: v.activation.toISOString(),
                                      })
                                      setTerminateReason("")
                                    }}
                                  >
                                    <LogOut className="mr-1.5 h-3.5 w-3.5" />
                                    Request early termination
                                  </Button>
                                </div>
                              )
                            })()}
                          </>
                        )}
                      </div>
                    )
                  })}
                  {activePositions.length === 0 && (
                    <p className="rounded-xl border border-dashed border-border bg-background px-4 py-6 text-center text-xs text-muted-foreground">
                      No live positions. Your settled trades are filed in the archive below.
                    </p>
                  )}
                </div>

                {/* Archived NAFTAhub trades — collapsible folder of closed positions */}
                {closedPositions.length > 0 && (
                  <div className="rounded-xl border border-border bg-background">
                    <button
                      type="button"
                      onClick={() => setArchiveOpen((o) => !o)}
                      className="flex w-full items-center justify-between gap-3 rounded-xl px-4 py-3 text-left transition-colors hover:bg-secondary/30"
                      aria-expanded={archiveOpen}
                    >
                      <span className="flex items-center gap-2">
                        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-secondary">
                          <Archive className="h-4 w-4 text-muted-foreground" />
                        </span>
                        <span>
                          <span className="block text-sm font-semibold text-foreground">Archived NAFTAhub trades</span>
                          <span className="block text-[11px] text-muted-foreground">
                            {closedPositions.length} settled position{closedPositions.length === 1 ? "" : "s"} · capital
                            returned
                          </span>
                        </span>
                      </span>
                      <ChevronDown
                        className={cn(
                          "h-4 w-4 shrink-0 text-muted-foreground transition-transform",
                          archiveOpen && "rotate-180",
                        )}
                      />
                    </button>

                    {archiveOpen && (
                      <div className="space-y-2 border-t border-border p-3">
                        {closedPositions.map((p) => {
                          const v = p.view
                          return (
                            <div
                              key={p.ref}
                              className="rounded-lg border border-border/60 bg-secondary/20 p-3 sm:p-4"
                            >
                              <div className="flex flex-wrap items-center justify-between gap-2">
                                <div className="flex items-center gap-2">
                                  <span className="text-sm font-semibold text-foreground">
                                    {p.tokens.toLocaleString("en-US")} token{p.tokens === 1 ? "" : "s"}
                                  </span>
                                  <Badge
                                    variant="outline"
                                    className="border-border bg-secondary text-[10px] text-muted-foreground"
                                  >
                                    <Check className="mr-1 h-3 w-3" />
                                    {v?.expired ? "Matured" : "Closed early"}
                                  </Badge>
                                </div>
                                <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
                                  <CalendarClock className="h-3 w-3" /> Closed {fmtDate(new Date(p.date))}
                                </span>
                              </div>
                              <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
                                <div>
                                  <p className="text-[10px] text-muted-foreground">Capital deployed</p>
                                  <p
                                    className="mt-0.5 text-sm font-semibold tabular-nums leading-tight whitespace-nowrap text-foreground"
                                    title={formatEur(p.deployed)}
                                  >
                                    {formatEurCompact(p.deployed)}
                                  </p>
                                </div>
                                <div>
                                  <p className="text-[10px] text-muted-foreground">ROI earned</p>
                                  <p
                                    className="mt-0.5 text-sm font-semibold tabular-nums leading-tight whitespace-nowrap text-green-500"
                                    title={formatEur(p.roiEarned)}
                                  >
                                    {formatEurCompact(p.roiEarned)}
                                  </p>
                                </div>
                                <div>
                                  <p className="text-[10px] text-muted-foreground">Capital returned</p>
                                  <p
                                    className="mt-0.5 text-sm font-semibold tabular-nums leading-tight whitespace-nowrap text-foreground"
                                    title={formatEur(p.returned)}
                                  >
                                    {formatEurCompact(p.returned)}
                                  </p>
                                </div>
                                <div>
                                  <p className="text-[10px] text-muted-foreground">Reference</p>
                                  <p className="mt-0.5 truncate text-xs font-medium text-muted-foreground">{p.ref}</p>
                                </div>
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    )}
                  </div>
                )}

                <p className="text-[11px] text-muted-foreground text-pretty">
                  Reserved funds are blocked on your master account while an application is pending. On approval the
                  capital is deployed and the fixed {(MONTHLY_ROI * 100).toFixed(0)}% monthly ROI is credited in arrears —
                  the first payment one month after activation, then every month for the {TRADING_FUND_TERM_MONTHS}-month
                  engagement. When the term expires the position is automatically terminated and your capital is returned
                  to the master account (an administrator may also close it earlier). Paused periods extend the expiry by
                  the paused time.
                </p>
              </CardContent>
            </Card>
          )}

          {/* Hero */}
          <Card className="border-primary/20 bg-gradient-to-br from-primary/10 to-primary/5">
            <CardContent className="p-5 sm:p-6">
              <div className="flex items-start gap-3">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary/15">
                  <Landmark className="h-6 w-6 text-primary" />
                </div>
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="text-xl font-bold text-foreground">Treuhand AG Limited Hedge Fund</h2>
                    <Badge variant="outline" className="border-primary/30 bg-primary/10 text-primary text-[10px]">
                      Prospectus 2026
                    </Badge>
                  </div>
                  <p className="mt-1 text-sm text-muted-foreground text-pretty">
                    A fully automated, capital-guaranteed investment vehicle governed under Swiss
                    fiduciary law and powered by the NQAi engine. Structured returns for qualified
                    investors — 25% fixed monthly ROI on active trading days.
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Highlights */}
          <div className="grid gap-3 grid-cols-2 lg:grid-cols-3">
            {FUND_HIGHLIGHTS.map((h) => (
              <Card key={h.label} className="bg-card border-border">
                <CardContent className="p-4">
                  <p className="text-xs text-muted-foreground">{h.label}</p>
                  <p className="mt-1 text-2xl font-bold text-primary">{h.value}</p>
                  <p className="mt-1 text-[11px] text-muted-foreground">{h.note}</p>
                </CardContent>
              </Card>
            ))}
          </div>

          {/* Calculator */}
          <Card className="bg-card border-border">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-lg font-semibold">
                <Coins className="h-5 w-5 text-primary" />
                Token & ROI Calculator
              </CardTitle>
              <p className="text-xs text-muted-foreground">
                Each token is a fixed €10,000 unit · minimum entry 3 tokens (€30,000) · no upper limit.
              </p>
            </CardHeader>
            <CardContent className="space-y-5">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <p className="text-sm font-medium text-foreground">Tokens</p>
                  <p className="text-xs text-muted-foreground">Adjust your position</p>
                </div>
                <div className="flex items-center gap-3">
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    className="h-9 w-9"
                    onClick={() => setTokensSynced(tokens - 1)}
                    disabled={tokens <= MIN_TOKENS}
                    aria-label="Decrease tokens"
                  >
                    <Minus className="h-4 w-4" />
                  </Button>
                  <Input
                    type="number"
                    inputMode="numeric"
                    min={MIN_TOKENS}
                    step={1}
                    value={tokenDraft}
                    onChange={(e) => {
                      // Allow free typing (including a temporarily empty field);
                      // reflect a valid positive integer immediately, don't clamp
                      // until blur so large numbers can be typed digit by digit.
                      const raw = e.target.value
                      setTokenDraft(raw)
                      const n = Math.floor(Number(raw))
                      if (raw !== "" && Number.isFinite(n) && n > 0) setTokens(n)
                    }}
                    onBlur={() => setTokensSynced(Number(tokenDraft) || MIN_TOKENS)}
                    onFocus={(e) => e.currentTarget.select()}
                    className="w-24 text-center text-xl font-bold [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                    aria-label="Number of tokens to buy"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    className="h-9 w-9"
                    onClick={() => setTokensSynced(tokens + 1)}
                    aria-label="Increase tokens"
                  >
                    <Plus className="h-4 w-4" />
                  </Button>
                </div>
              </div>

              <div className="flex flex-wrap gap-2">
                {[3, 5, 10, 20, 50, 100].map((q) => (
                  <Button
                    key={q}
                    type="button"
                    variant={tokens === q ? "default" : "outline"}
                    size="sm"
                    onClick={() => setTokensSynced(q)}
                  >
                    {q}
                  </Button>
                ))}
                {maxAffordableTokens >= MIN_TOKENS && (
                  <Button
                    type="button"
                    variant={tokens === maxAffordableTokens ? "default" : "outline"}
                    size="sm"
                    onClick={() => setTokensSynced(maxAffordableTokens)}
                    title={`Invest your full available balance (${formatEur(availableCapital)})`}
                  >
                    Max · {maxAffordableTokens}
                  </Button>
                )}
              </div>

              <div className="grid gap-3 sm:grid-cols-3">
                <div className="rounded-lg border border-border bg-secondary/30 p-4">
                  <p className="text-xs text-muted-foreground">Capital Deployed</p>
                  <p className="mt-1 text-xl font-bold text-foreground">{formatEur(capital)}</p>
                </div>
                <div className="rounded-lg border border-border bg-secondary/30 p-4">
                  <p className="text-xs text-muted-foreground">Monthly ROI @ 25%</p>
                  <p className="mt-1 text-xl font-bold text-primary">{formatEur(monthlyReturn)}</p>
                </div>
                <div className="rounded-lg border border-border bg-secondary/30 p-4">
                  <p className="text-xs text-muted-foreground">12-Month Cumulative</p>
                  <p className="mt-1 text-xl font-bold text-green-500">{formatEur(monthlyReturn * 12)}</p>
                </div>
              </div>

              <Button className="w-full" size="lg" onClick={openApplyDialog}>
                Apply with {tokens.toLocaleString("en-US")} Tokens · {formatEur(capital)}
                <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
              <p className="text-center text-[11px] text-muted-foreground text-pretty">
                Projections are illustrative, based on 25% fixed monthly ROI over up to 20 active
                trading days. Capital is fully guaranteed under Swiss fiduciary law.
              </p>
            </CardContent>
          </Card>

          {/* Capital protection */}
          <Card className="bg-card border-border">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-lg font-semibold">
                <Shield className="h-5 w-5 text-primary" />
                Capital Protection &amp; Risk Management
              </CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4 sm:grid-cols-2">
              {PROTECTION_LAYERS.map((layer) => (
                <div key={layer.title} className="flex items-start gap-3 rounded-lg border border-border bg-secondary/30 p-4">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10">
                    <layer.icon className="h-4 w-4 text-primary" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-foreground">{layer.title}</p>
                    <p className="mt-1 text-xs text-muted-foreground text-pretty">{layer.text}</p>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>

          {/* Governance + Onboarding */}
          <div className="grid gap-6 lg:grid-cols-2">
            <Card className="bg-card border-border">
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-lg font-semibold">
                  <Landmark className="h-5 w-5 text-primary" />
                  Governance Structure
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {GOVERNANCE.map((g) => (
                  <div key={g.entity} className="rounded-lg border border-border bg-secondary/30 p-3">
                    <p className="text-sm font-semibold text-foreground">{g.entity}</p>
                    <p className="mt-0.5 text-xs text-muted-foreground text-pretty">{g.role}</p>
                  </div>
                ))}
                <p className="text-[11px] text-muted-foreground text-pretty">
                  MCC Holding SA · Rue du Rhone 14, 1204 Geneva · CHE-110.027.662 · AML/KYC/FATCA/CRS compliant.
                </p>
              </CardContent>
            </Card>

            <Card className="bg-card border-border">
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-lg font-semibold">
                  <BadgeCheck className="h-5 w-5 text-primary" />
                  Onboarding Process
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ol className="space-y-3">
                  {ONBOARDING_STEPS.map((step, i) => (
                    <li key={step} className="flex items-start gap-3">
                      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/15 text-xs font-bold text-primary">
                        {i + 1}
                      </span>
                      <span className="text-sm text-foreground text-pretty">{step}</span>
                    </li>
                  ))}
                </ol>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>

      {/* Trade dialog */}
      <WatchlistManager
        open={manageOpen}
        onOpenChange={setManageOpen}
        catalog={SIGNAL_CATALOG}
        watch={watchlist}
        onAdd={addToWatchlist}
        onRemove={removeFromWatchlist}
      />

      <Dialog open={!!tradeTarget} onOpenChange={(open) => !open && setTradeTarget(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Deploy NQAi Position</DialogTitle>
            <DialogDescription>
              {tradeTarget ? `${tradeTarget.name} (${tradeTarget.symbol})` : ""}
            </DialogDescription>
          </DialogHeader>
          {tradeTarget && (
            <div className="space-y-4">
              <div className="flex items-center justify-between rounded-lg border border-border bg-secondary/30 p-3">
                <div>
                  <p className="text-xs text-muted-foreground">Live Price</p>
                  <p className="font-mono text-lg font-bold text-foreground">
                    {formatPrice(tradeTarget.price, tradeTarget.decimals)}
                  </p>
                </div>
                <Badge variant="outline" className={cn("text-[10px]", signalStyles[tradeTarget.signal])}>
                  AI: {tradeTarget.signal} · {tradeTarget.confidence}%
                </Badge>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <Button
                  type="button"
                  variant={tradeSide === "LONG" ? "default" : "outline"}
                  onClick={() => setTradeSide("LONG")}
                  className={cn(tradeSide === "LONG" && "bg-green-600 hover:bg-green-600/90")}
                >
                  <TrendingUp className="mr-2 h-4 w-4" />
                  Long
                </Button>
                <Button
                  type="button"
                  variant={tradeSide === "SHORT" ? "default" : "outline"}
                  onClick={() => setTradeSide("SHORT")}
                  className={cn(tradeSide === "SHORT" && "bg-red-600 hover:bg-red-600/90")}
                >
                  <TrendingDown className="mr-2 h-4 w-4" />
                  Short
                </Button>
              </div>

              <div className="space-y-2">
                <Label htmlFor="lots">Volume (lots)</Label>
                <Input
                  id="lots"
                  inputMode="decimal"
                  value={lots}
                  onChange={(e) => setLots(e.target.value)}
                  placeholder="0.10"
                />
                <p className="text-[10px] text-muted-foreground">
                  Micro-position range 0.01–0.12 lots recommended by the NQAi risk controller.
                </p>
              </div>

              {/* Margin & market summary — reserved from the Master Account */}
              <div className="space-y-2 rounded-lg border border-border bg-secondary/20 p-3">
                {tradeMarketState && !tradeMarketState.open && (
                  <div className="flex items-center gap-2 rounded-md bg-red-500/10 px-2 py-1.5 text-xs font-medium text-red-500">
                    <Clock className="h-3.5 w-3.5" />
                    Market {tradeMarketState.label} — order entry disabled
                  </div>
                )}
                <div className="flex items-center justify-between text-xs">
                  <span className="text-muted-foreground">Notional</span>
                  <span className="font-mono font-medium text-foreground">{formatEur(tradeNotionalEur)}</span>
                </div>
                <div className="flex items-center justify-between text-xs">
                  <span className="text-muted-foreground">Leverage</span>
                  <span className="font-medium text-foreground">1:{leverageFor(tradeTarget.category)}</span>
                </div>
                <div className="flex items-center justify-between text-xs">
                  <span className="text-muted-foreground">Required margin</span>
                  <span
                    className={cn(
                      "font-mono font-semibold",
                      tradeInsufficient ? "text-red-500" : "text-foreground",
                    )}
                  >
                    {formatEur(tradeMarginEur)}
                  </span>
                </div>
                <div className="flex items-center justify-between text-xs">
                  <span className="text-muted-foreground">Free margin (wallet)</span>
                  <span className="font-mono text-muted-foreground">{formatEur(tradeSpendable)}</span>
                </div>
                {highRisk && (
                  <p className="text-[11px] font-medium text-red-500">
                    Trading is paused by your Guarantees Accumulator risk controls.
                  </p>
                )}
                {tradeInsufficient && !highRisk && (
                  <p className="text-[11px] font-medium text-red-500">
                    Insufficient free margin in your trading wallet — fund it first.
                  </p>
                )}
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setTradeTarget(null)}>
              Cancel
            </Button>
            <Button onClick={confirmTrade} disabled={tradeBlocked}>
              Deploy Position
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Fund trading wallet from the Master Account */}
      <Dialog open={fundOpen} onOpenChange={setFundOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Fund Trading Wallet</DialogTitle>
            <DialogDescription>Transfer from your Master Account. A 2% transfer fee applies.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="rounded-lg border border-border bg-secondary/20 p-3">
              <div className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground">Master Account available</span>
                <span className="font-mono font-medium text-foreground">{formatEur(availableCapital)}</span>
              </div>
            </div>
            <div>
              <label className="mb-1 block text-xs text-muted-foreground">Amount to transfer (EUR)</label>
              <MoneyInput
                value={transferAmount}
                onValueChange={setTransferAmount}
                placeholder="0.00"
                className="text-base"
              />
            </div>
            {(() => {
              const amt = Number.parseFloat(transferAmount.replace(/,/g, "")) || 0
              const fee = Math.round(amt * TRADING_TRANSFER_FEE_RATE * 100) / 100
              const total = Math.round((amt + fee) * 100) / 100
              return (
                <div className="space-y-1.5 rounded-lg border border-border bg-secondary/20 p-3 text-xs">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Credited to wallet</span>
                    <span className="font-mono text-foreground">{formatEur(amt)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">2% fee (Master Account)</span>
                    <span className="font-mono text-red-500">-{formatEur(fee)}</span>
                  </div>
                  <div className="flex justify-between border-t border-border pt-1.5 font-semibold">
                    <span className="text-muted-foreground">Debited from Master Account</span>
                    <span className="font-mono text-foreground">{formatEur(total)}</span>
                  </div>
                </div>
              )
            })()}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setFundOpen(false)}>
              Cancel
            </Button>
            <Button onClick={fundWallet}>Fund wallet</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Withdraw trading wallet back to the Master Account */}
      <Dialog open={withdrawOpen} onOpenChange={setWithdrawOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Withdraw to Master Account</DialogTitle>
            <DialogDescription>Return free margin to your Master Account. A 2% transfer fee applies.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="rounded-lg border border-border bg-secondary/20 p-3">
              <div className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground">Free to withdraw</span>
                <span className="font-mono font-medium text-foreground">{formatEur(freeMargin)}</span>
              </div>
            </div>
            <div>
              <label className="mb-1 block text-xs text-muted-foreground">Amount to withdraw (EUR)</label>
              <MoneyInput
                value={transferAmount}
                onValueChange={setTransferAmount}
                placeholder="0.00"
                className="text-base"
              />
            </div>
            {(() => {
              const amt = Number.parseFloat(transferAmount.replace(/,/g, "")) || 0
              const fee = Math.round(amt * TRADING_TRANSFER_FEE_RATE * 100) / 100
              const net = Math.max(0, Math.round((amt - fee) * 100) / 100)
              return (
                <div className="space-y-1.5 rounded-lg border border-border bg-secondary/20 p-3 text-xs">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Withdrawal amount</span>
                    <span className="font-mono text-foreground">{formatEur(amt)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">2% fee</span>
                    <span className="font-mono text-red-500">-{formatEur(fee)}</span>
                  </div>
                  <div className="flex justify-between border-t border-border pt-1.5 font-semibold">
                    <span className="text-muted-foreground">Credited to Master Account</span>
                    <span className="font-mono text-foreground">{formatEur(net)}</span>
                  </div>
                </div>
              )
            })()}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setWithdrawOpen(false)}>
              Cancel
            </Button>
            <Button onClick={withdrawWallet}>Withdraw</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Price alerts dialog */}
      <Dialog open={alertsOpen} onOpenChange={setAlertsOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Price Alerts</DialogTitle>
            <DialogDescription>Get notified when a symbol crosses your target price.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2 rounded-lg border border-border bg-secondary/20 p-3">
              <select
                value={alertSymbol}
                onChange={(e) => setAlertSymbol(e.target.value)}
                className="h-11 w-full rounded-md border border-border bg-background px-3 text-base text-foreground"
                aria-label="Alert symbol"
              >
                <option value="">Select symbol…</option>
                {watchlist.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
              <div className="grid grid-cols-2 gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant={alertDir === "above" ? "default" : "outline"}
                  onClick={() => setAlertDir("above")}
                >
                  <TrendingUp className="mr-1.5 h-4 w-4" />
                  Above
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant={alertDir === "below" ? "default" : "outline"}
                  onClick={() => setAlertDir("below")}
                >
                  <TrendingDown className="mr-1.5 h-4 w-4" />
                  Below
                </Button>
              </div>
              <Input
                inputMode="decimal"
                value={alertPrice}
                onChange={(e) => setAlertPrice(e.target.value)}
                placeholder="Target price"
                className="text-base"
              />
              <Button size="sm" className="w-full" onClick={addAlert}>
                <Plus className="mr-1.5 h-4 w-4" />
                Set alert
              </Button>
            </div>
            <div className="space-y-2">
              {priceAlerts.length === 0 ? (
                <p className="py-4 text-center text-xs text-muted-foreground">No active alerts.</p>
              ) : (
                priceAlerts.map((a) => (
                  <div
                    key={a.id}
                    className="flex items-center justify-between rounded-md border border-border bg-secondary/30 p-2.5"
                  >
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-foreground">{a.symbol}</p>
                      <p className="text-xs text-muted-foreground">
                        {a.direction} {a.target}
                      </p>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 shrink-0 text-muted-foreground"
                      onClick={() => setPriceAlerts((prev) => prev.filter((x) => x.id !== a.id))}
                      aria-label={`Remove alert for ${a.symbol}`}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                ))
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Treuhand AG fund application dialog */}
        <Dialog
          open={applyOpen}
          onOpenChange={(open) => {
            if (open) openApplyDialog()
            else setApplyOpen(false)
          }}
        >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Apply — Treuhand AG Limited Hedge Fund</DialogTitle>
            <DialogDescription>
              Submit your interest. A compliance officer will follow up with KYC onboarding.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-3 gap-3 rounded-lg border border-border bg-secondary/30 p-3 text-center">
              <div>
                <p className="text-[11px] text-muted-foreground">Tokens</p>
                <p className="text-base font-bold tabular-nums text-foreground">{tokens.toLocaleString("en-US")}</p>
              </div>
              <div>
                <p className="text-[11px] text-muted-foreground">Capital</p>
                <p className="text-base font-bold text-foreground">{formatEur(capital)}</p>
              </div>
              <div>
                <p className="text-[11px] text-muted-foreground">Monthly ROI</p>
                <p className="text-base font-bold text-primary">{formatEur(monthlyReturn)}</p>
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="applicant-name">Full name / Entity</Label>
              <Input
                id="applicant-name"
                value={applicantName}
                onChange={(e) => setApplicantName(e.target.value)}
                placeholder={`${user.fullName} — ${user.company}`}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="applicant-email">Contact email</Label>
              <Input
                id="applicant-email"
                type="email"
                inputMode="email"
                value={applicantEmail}
                onChange={(e) => setApplicantEmail(e.target.value)}
                placeholder="you@company.com"
              />
            </div>
            <div className="flex items-start gap-2 rounded-lg border border-border bg-secondary/20 p-3">
              <Check className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
              <p className="text-[11px] text-muted-foreground text-pretty">
                100% capital guaranteed under Swiss fiduciary law · 0% entry &amp; management fees ·
                AML/KYC/FATCA/CRS due diligence applies.
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setApplyOpen(false)} disabled={submitting}>
              Cancel
            </Button>
            <Button onClick={submitApplication} disabled={submitting}>
              {submitting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Submitting…
                </>
              ) : (
                "Submit Application"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Early-termination request confirmation */}
      <Dialog open={terminateTarget !== null} onOpenChange={(o) => !o && setTerminateTarget(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-amber-500" />
              Request early termination
            </DialogTitle>
            <DialogDescription className="text-pretty">
              You are requesting to resign from the Treuhand AG Limited Hedge Fund before the{" "}
              {TRADING_FUND_TERM_MONTHS}-month term. MCC Capital will evaluate your request and, if agreed, reconcile
              your position.
            </DialogDescription>
          </DialogHeader>

          {terminateTarget && (() => {
            const q = quoteTradingFundExit({
              capitalStarted: terminateTarget.capital,
              activation: new Date(terminateTarget.activation),
            })
            return (
              <div className="space-y-3">
                <div className="rounded-lg border border-border bg-secondary/30 p-3 text-sm">
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Capital returned</span>
                    <span className="font-medium text-foreground">{formatEur(q.capitalReturned)}</span>
                  </div>
                  <div className="mt-1.5 flex items-center justify-between">
                    <span className="text-muted-foreground">
                      Exit commission ({(TRADING_FUND_EXIT_COMMISSION * 100).toFixed(0)}%)
                    </span>
                    <span className="font-medium text-red-500">− {formatEur(q.commission)}</span>
                  </div>
                  <div className="mt-1.5 flex items-center justify-between">
                    <span className="text-muted-foreground">Early-resignation penalty</span>
                    <span className="font-medium text-muted-foreground">Set by administrator</span>
                  </div>
                </div>
                <p className="rounded-md bg-amber-500/10 px-3 py-2 text-[11px] text-amber-700 text-pretty">
                  {q.monthsRemaining} of {TRADING_FUND_TERM_MONTHS} months remain. Because this is an early resignation, a
                  penalty will be calculated and applied by the administrator in addition to the commission. Your final
                  net credit is confirmed at reconciliation.
                </p>
                <div className="space-y-1.5">
                  <Label htmlFor="terminate-reason" className="text-xs">
                    Reason (optional)
                  </Label>
                  <Textarea
                    id="terminate-reason"
                    value={terminateReason}
                    onChange={(e) => setTerminateReason(e.target.value)}
                    placeholder="Let the administrator know why you wish to exit early…"
                    rows={3}
                    className="resize-none text-sm"
                  />
                </div>
              </div>
            )
          })()}

          <DialogFooter>
            <Button variant="ghost" onClick={() => setTerminateTarget(null)} disabled={terminating}>
              Cancel
            </Button>
            <Button onClick={submitTermination} disabled={terminating}>
              {terminating ? (
                <>
                  <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                  Submitting…
                </>
              ) : (
                "Submit request"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      </div>
    </>
  )
}
