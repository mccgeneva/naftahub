import { NextResponse } from "next/server"

// Proxies Yahoo Finance's public symbol-search endpoint so the trading desk can
// let a client search the entire market (stocks, ETFs, futures/commodities, FX,
// indices, crypto) and add any instrument to their preferred signal watchlist.
// The returned symbols are real Yahoo tickers, so they resolve to live quotes
// through /api/market (which passes unknown symbols straight to Yahoo).
export const runtime = "nodejs"

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0 Safari/537.36"

// Map Yahoo quote types onto the platform's asset-class categories.
const TYPE_TO_CATEGORY: Record<string, string> = {
  EQUITY: "Equities",
  ETF: "Equities",
  MUTUALFUND: "Equities",
  INDEX: "Indices",
  FUTURE: "Commodities",
  CURRENCY: "Forex",
  CRYPTOCURRENCY: "Crypto",
}

type YahooSearchQuote = {
  symbol?: string
  shortname?: string
  longname?: string
  quoteType?: string
  exchDisp?: string
  isYahooFinance?: boolean
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const q = (searchParams.get("q") ?? "").trim()
  if (q.length < 2) return NextResponse.json({ results: [] })

  const hosts = ["query1.finance.yahoo.com", "query2.finance.yahoo.com"]
  for (const host of hosts) {
    try {
      const res = await fetch(
        `https://${host}/v1/finance/search?q=${encodeURIComponent(q)}&quotesCount=15&newsCount=0&listsCount=0`,
        { headers: { "User-Agent": UA, Accept: "application/json" }, cache: "no-store" },
      )
      if (!res.ok) continue
      const json = (await res.json()) as { quotes?: YahooSearchQuote[] }
      const results = (json.quotes ?? [])
        .filter(
          (it) =>
            it.isYahooFinance !== false &&
            Boolean(it.symbol) &&
            Boolean(it.quoteType) &&
            Boolean(TYPE_TO_CATEGORY[it.quoteType as string]),
        )
        .map((it) => ({
          symbol: it.symbol as string,
          name: it.longname || it.shortname || (it.symbol as string),
          category: TYPE_TO_CATEGORY[it.quoteType as string],
          type: it.quoteType,
          exchange: it.exchDisp ?? "",
        }))
      return NextResponse.json(
        { results },
        { headers: { "Cache-Control": "public, s-maxage=30, stale-while-revalidate=120" } },
      )
    } catch {
      // try the fallback host
    }
  }
  return NextResponse.json({ results: [] })
}
