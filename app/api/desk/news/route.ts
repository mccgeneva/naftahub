import { NextResponse } from "next/server"
import { resolveCurrentSession } from "@/lib/session-user"

// Keyword news search for the Trading Desk (company, sector, commodity or bank
// name). Proxies Yahoo Finance's public search endpoint server-side so the
// browser never calls a third-party host directly.
export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0 Safari/537.36"

type YahooNews = {
  uuid?: string
  title?: string
  publisher?: string
  link?: string
  providerPublishTime?: number
  relatedTickers?: string[]
}

export async function GET(request: Request) {
  const session = await resolveCurrentSession()
  if (!session?.id) return NextResponse.json({ ok: false, results: [] }, { status: 401 })

  const q = (new URL(request.url).searchParams.get("q") ?? "").trim().slice(0, 80)
  if (q.length < 2) return NextResponse.json({ ok: true, results: [] })

  for (const host of ["query1.finance.yahoo.com", "query2.finance.yahoo.com"]) {
    try {
      const res = await fetch(
        `https://${host}/v1/finance/search?q=${encodeURIComponent(q)}&quotesCount=0&newsCount=20&listsCount=0`,
        { headers: { "User-Agent": UA, Accept: "application/json" }, cache: "no-store" },
      )
      if (!res.ok) continue
      const json = (await res.json()) as { news?: YahooNews[] }
      const results = (json.news ?? [])
        .filter((n) => n.title && n.link && /^https?:\/\//.test(n.link))
        .map((n) => ({
          id: n.uuid ?? n.link!,
          title: n.title!,
          publisher: n.publisher ?? "",
          link: n.link!,
          publishedAt: n.providerPublishTime ? new Date(n.providerPublishTime * 1000).toISOString() : null,
          tickers: (n.relatedTickers ?? []).slice(0, 4),
        }))
      return NextResponse.json({ ok: true, results })
    } catch {
      // try the fallback host
    }
  }
  return NextResponse.json({ ok: true, results: [] })
}
