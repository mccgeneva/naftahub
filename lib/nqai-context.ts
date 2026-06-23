import "server-only"

import { listLiveSpotDeals } from "@/app/actions/spot-deals"
import { dealCountdown } from "@/lib/spot-deals-shared"

// Builds a compact, real-time snapshot of the platform that is injected into
// NQAi's system prompt so it can reason over actual figures — live benchmark
// prices and the current spot-deal board — rather than only static knowledge.
//
// Everything here is best-effort: any upstream hiccup degrades gracefully to a
// partial (or empty) context so the chat never fails because of enrichment.

/** Display benchmarks surfaced to NQAi, mapped to Yahoo Finance symbols. */
const BENCHMARKS: { label: string; yahoo: string; unit: string }[] = [
  { label: "Brent crude", yahoo: "BZ=F", unit: "USD/bbl" },
  { label: "WTI crude", yahoo: "CL=F", unit: "USD/bbl" },
  { label: "Natural gas (Henry Hub)", yahoo: "NG=F", unit: "USD/MMBtu" },
  { label: "Gold (XAU)", yahoo: "GC=F", unit: "USD/oz" },
  { label: "EUR/USD", yahoo: "EURUSD=X", unit: "" },
  { label: "USD/CHF", yahoo: "USDCHF=X", unit: "" },
  { label: "S&P 500", yahoo: "^GSPC", unit: "pts" },
  { label: "US 10Y yield", yahoo: "^TNX", unit: "%" },
  { label: "BTC/USD", yahoo: "BTC-USD", unit: "USD" },
]

type Quote = { price: number; changePct: number }

// Cache the live market snapshot briefly so rapid consecutive prompts don't each
// hit Yahoo. 60s keeps NQAi's figures fresh without hammering the upstream.
let marketCache: { at: number; text: string } | null = null
const MARKET_TTL_MS = 60_000

async function fetchBenchmarks(): Promise<Record<string, Quote>> {
  const query = BENCHMARKS.map((b) => encodeURIComponent(b.yahoo)).join(",")
  const hosts = ["query1.finance.yahoo.com", "query2.finance.yahoo.com"]
  for (const host of hosts) {
    try {
      const controller = new AbortController()
      const timer = setTimeout(() => controller.abort(), 6000)
      const res = await fetch(
        `https://${host}/v7/finance/spark?symbols=${query}&interval=1d&range=1d`,
        {
          headers: { "User-Agent": "Mozilla/5.0 (compatible; NAFTAhub/1.0)" },
          cache: "no-store",
          signal: controller.signal,
        },
      ).finally(() => clearTimeout(timer))
      if (!res.ok) continue
      const json = (await res.json()) as {
        spark?: { result?: { symbol: string; response?: { meta?: { regularMarketPrice?: number; chartPreviousClose?: number; previousClose?: number } }[] }[] }
      }
      const results = json?.spark?.result ?? []
      const out: Record<string, Quote> = {}
      for (const r of results) {
        const meta = r.response?.[0]?.meta
        const price = meta?.regularMarketPrice
        const prev = meta?.chartPreviousClose ?? meta?.previousClose
        if (typeof price === "number" && typeof prev === "number" && prev !== 0) {
          out[r.symbol] = { price, changePct: ((price - prev) / prev) * 100 }
        } else if (typeof price === "number") {
          out[r.symbol] = { price, changePct: 0 }
        }
      }
      if (Object.keys(out).length > 0) return out
    } catch {
      // try the next host
    }
  }
  return {}
}

function fmt(n: number): string {
  if (Math.abs(n) >= 1000) return n.toLocaleString("en-US", { maximumFractionDigits: 0 })
  if (Math.abs(n) >= 10) return n.toFixed(2)
  return n.toFixed(4)
}

async function buildMarketBlock(): Promise<string> {
  if (marketCache && Date.now() - marketCache.at < MARKET_TTL_MS) return marketCache.text
  const quotes = await fetchBenchmarks()
  if (Object.keys(quotes).length === 0) {
    return "LIVE MARKET BENCHMARKS: temporarily unavailable (upstream feed unreachable)."
  }
  const lines = BENCHMARKS.filter((b) => quotes[b.yahoo]).map((b) => {
    const q = quotes[b.yahoo]
    const sign = q.changePct >= 0 ? "+" : ""
    const unit = b.unit ? ` ${b.unit}` : ""
    return `- ${b.label}: ${fmt(q.price)}${unit} (${sign}${q.changePct.toFixed(2)}% today)`
  })
  const text = `LIVE MARKET BENCHMARKS (delayed, indicative — confirm firm levels with the desk):\n${lines.join("\n")}`
  marketCache = { at: Date.now(), text }
  return text
}

async function buildDealsBlock(): Promise<string> {
  let deals
  try {
    deals = await listLiveSpotDeals()
  } catch {
    return "LIVE SPOT DEALS: temporarily unavailable."
  }
  if (!deals || deals.length === 0) {
    return "LIVE SPOT DEALS: none currently published on the board."
  }
  const top = deals.slice(0, 8).map((d) => {
    const cd = dealCountdown(d.expiresAt)
    const qty = d.quantity.toLocaleString("en-US")
    const total = d.totalValue.toLocaleString("en-US", { maximumFractionDigits: 0 })
    return `- [${d.id}] ${qty} ${d.unit} ${d.product} @ ${d.spotPrice} ${d.currency}/${d.unit} (${d.incoterm}, ${d.loadPort}${d.dischargePort ? `→${d.dischargePort}` : ""}) aboard ${d.vesselName} (IMO ${d.vesselImo}); total ${d.currency} ${total}; expires in ${cd.label}`
  })
  const more = deals.length > top.length ? `\n(+${deals.length - top.length} more live offers)` : ""
  return `LIVE SPOT DEALS — limited-time board (${deals.length} active; clients accept via the desk, nothing executes automatically):\n${top.join("\n")}${more}`
}

/**
 * Assemble the real-time platform context block. Never throws; returns a string
 * suitable for appending to NQAi's system prompt.
 */
export async function buildNqaiContext(): Promise<string> {
  const [market, deals] = await Promise.all([buildMarketBlock(), buildDealsBlock()])
  const now = new Date().toISOString().replace("T", " ").slice(0, 16)
  return [
    `LIVE PLATFORM CONTEXT — snapshot at ${now} UTC. Use these real figures when the user asks about current prices, spreads, or available deals. Always label prices as indicative and advise confirming with the desk before execution.`,
    market,
    deals,
  ].join("\n\n")
}
