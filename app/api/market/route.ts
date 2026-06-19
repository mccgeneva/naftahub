import { NextResponse } from "next/server"
import { YAHOO_SYMBOLS, type MarketQuoteMap } from "@/lib/market-symbols"

// Live market data is fetched server-side from Yahoo Finance's public chart
// endpoint (no API key required). Fetching on the server avoids browser CORS
// restrictions and lets us cache responses so we don't hammer the upstream.
export const runtime = "nodejs"
// Revalidate the upstream fetches every 20s; quotes are near-real-time.
const REVALIDATE_SECONDS = 20

type YahooChartResponse = {
  chart?: {
    result?: Array<{
      meta?: {
        regularMarketPrice?: number
        chartPreviousClose?: number
        previousClose?: number
      }
    }>
  }
}

async function fetchQuote(yahooSymbol: string): Promise<{ price: number; changePct: number } | null> {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(
    yahooSymbol,
  )}?interval=1d&range=1d`
  try {
    const res = await fetch(url, {
      headers: {
        // Yahoo rejects requests without a browser-like User-Agent.
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36",
        Accept: "application/json",
      },
      next: { revalidate: REVALIDATE_SECONDS },
    })
    if (!res.ok) return null
    const json = (await res.json()) as YahooChartResponse
    const meta = json.chart?.result?.[0]?.meta
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
  } catch {
    return null
  }
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const requested = (searchParams.get("symbols") ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)

  // Default to the full universe when no specific symbols are requested.
  const displaySymbols = requested.length > 0 ? requested : Object.keys(YAHOO_SYMBOLS)

  // De-duplicate and keep only symbols we know how to map.
  const unique = Array.from(new Set(displaySymbols)).filter((s) => YAHOO_SYMBOLS[s])

  const results = await Promise.all(
    unique.map(async (display) => {
      const quote = await fetchQuote(YAHOO_SYMBOLS[display])
      return [display, quote] as const
    }),
  )

  const quotes: MarketQuoteMap = {}
  for (const [display, quote] of results) {
    if (quote) quotes[display] = quote
  }

  return NextResponse.json(
    { quotes, updatedAt: new Date().toISOString() },
    {
      headers: {
        // Allow the CDN/browser to reuse for a short window with SWR semantics.
        "Cache-Control": `public, s-maxage=${REVALIDATE_SECONDS}, stale-while-revalidate=60`,
      },
    },
  )
}
