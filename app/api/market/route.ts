import { NextResponse } from "next/server"
import { YAHOO_SYMBOLS, type MarketQuoteMap } from "@/lib/market-symbols"

// Numeric market data (used by the currency converter and trade tickets) is
// fetched server-side from Yahoo Finance's public *batch* spark endpoint — one
// request returns every requested symbol, which avoids the per-symbol rate
// limiting (HTTP 429) we hit when calling the chart endpoint in parallel.
// Results are cached in-memory for a short window so repeated client polls and
// multiple users share a single upstream call.
export const runtime = "nodejs"

const CACHE_TTL_MS = 15_000
const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0 Safari/537.36"

type SparkResponse = {
  spark?: {
    result?: Array<{
      symbol?: string
      response?: Array<{
        meta?: {
          regularMarketPrice?: number
          chartPreviousClose?: number
          previousClose?: number
        }
      }>
    }>
  }
}

// Module-level cache shared across requests on the same server instance.
const cache = new Map<string, { quote: { price: number; changePct: number }; ts: number }>()

type SparkMeta = NonNullable<
  NonNullable<NonNullable<SparkResponse["spark"]>["result"]>[number]["response"]
>[number]["meta"]

function toQuote(meta: SparkMeta) {
  if (!meta || typeof meta.regularMarketPrice !== "number") return null
  const price = meta.regularMarketPrice
  const prevClose =
    typeof meta.chartPreviousClose === "number"
      ? meta.chartPreviousClose
      : typeof meta.previousClose === "number"
        ? meta.previousClose
        : price
  const changePct = prevClose > 0 ? ((price - prevClose) / prevClose) * 100 : 0
  return { price, changePct: Number(changePct.toFixed(2)) }
}

// Yahoo's spark endpoint silently truncates large symbol lists (it returns only
// ~10 results when 20+ are requested), so we split into small chunks and fetch
// them in parallel. Each chunk retries on the alternate Yahoo host.
const CHUNK_SIZE = 8

async function fetchChunk(yahooSymbols: string[]): Promise<Record<string, { price: number; changePct: number }>> {
  const out: Record<string, { price: number; changePct: number }> = {}
  if (yahooSymbols.length === 0) return out
  const query = yahooSymbols.map((s) => encodeURIComponent(s)).join(",")
  const hosts = ["query1.finance.yahoo.com", "query2.finance.yahoo.com"]

  for (const host of hosts) {
    try {
      const res = await fetch(`https://${host}/v7/finance/spark?symbols=${query}&interval=1d&range=1d`, {
        headers: { "User-Agent": UA, Accept: "application/json" },
        cache: "no-store",
      })
      if (!res.ok) continue
      const json = (await res.json()) as SparkResponse
      const results = json.spark?.result ?? []
      for (const r of results) {
        const meta = r.response?.[0]?.meta
        const quote = toQuote(meta)
        if (r.symbol && quote) out[r.symbol] = quote
      }
      // Got everything we asked for — no need to try the fallback host.
      if (Object.keys(out).length >= yahooSymbols.length) return out
    } catch {
      // try next host
    }
  }
  return out
}

// Fetch every requested Yahoo symbol by chunking the list and merging results.
async function fetchBatch(yahooSymbols: string[]): Promise<Record<string, { price: number; changePct: number }>> {
  if (yahooSymbols.length === 0) return {}
  const chunks: string[][] = []
  for (let i = 0; i < yahooSymbols.length; i += CHUNK_SIZE) {
    chunks.push(yahooSymbols.slice(i, i + CHUNK_SIZE))
  }
  const results = await Promise.all(chunks.map((c) => fetchChunk(c)))
  return Object.assign({}, ...results)
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const requested = (searchParams.get("symbols") ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)

  const displaySymbols = requested.length > 0 ? requested : Object.keys(YAHOO_SYMBOLS)
  const unique = Array.from(new Set(displaySymbols)).filter((s) => YAHOO_SYMBOLS[s])

  const now = Date.now()
  const quotes: MarketQuoteMap = {}
  const staleYahoo: string[] = []

  // Serve fresh cache hits immediately; collect the rest for a batch fetch.
  for (const display of unique) {
    const yahoo = YAHOO_SYMBOLS[display]
    const cached = cache.get(yahoo)
    if (cached && now - cached.ts < CACHE_TTL_MS) {
      quotes[display] = cached.quote
    } else {
      staleYahoo.push(yahoo)
    }
  }

  if (staleYahoo.length > 0) {
    const fetched = await fetchBatch(staleYahoo)
    for (const display of unique) {
      const yahoo = YAHOO_SYMBOLS[display]
      const q = fetched[yahoo]
      if (q) {
        cache.set(yahoo, { quote: q, ts: now })
        quotes[display] = q
      } else {
        // Fall back to the last known value if the upstream omitted it.
        const cached = cache.get(yahoo)
        if (cached) quotes[display] = cached.quote
      }
    }
  }

  return NextResponse.json(
    { quotes, updatedAt: new Date().toISOString() },
    {
      headers: {
        "Cache-Control": "public, s-maxage=15, stale-while-revalidate=60",
      },
    },
  )
}
