import { NextResponse } from "next/server"

// ---------------------------------------------------------------------------
// OpenFIGI proxy (server-only)
//
// The OpenFIGI API key MUST never reach the browser, so all calls go through
// this route. Two modes:
//   • POST { isin }   → /v3/mapping  : validate & enrich a single ISIN
//   • POST { query }  → /v3/search   : live Bloomberg-style security search
//
// Bilateral bank instruments (SBLC / BG / most private MTNs) are NOT exchange
// listed, so a valid-but-unlisted ISIN returns an empty match — that is the
// honest, expected result and is surfaced as "not exchange-listed".
// ---------------------------------------------------------------------------

export const runtime = "nodejs"

const OPENFIGI_BASE = "https://api.openfigi.com/v3"
const CACHE_TTL_MS = 10 * 60_000 // 10 minutes — identifiers are stable.

interface FigiRecord {
  figi: string
  name?: string
  ticker?: string
  exchCode?: string
  securityType?: string
  securityType2?: string
  marketSector?: string
  securityDescription?: string
}

// Module-level cache shared across requests on the same server instance.
const cache = new Map<string, { ts: number; payload: unknown }>()

function apiKeyHeaders(): Record<string, string> {
  const headers: Record<string, string> = { "Content-Type": "application/json" }
  const key = process.env.OPENFIGI_API_KEY
  if (key) headers["X-OPENFIGI-APIKEY"] = key
  return headers
}

/** A lightly validated ISIN (2 letters + 9 alnum + 1 digit). */
function looksLikeIsin(v: string): boolean {
  return /^[A-Z]{2}[A-Z0-9]{9}\d$/.test(v.trim().toUpperCase())
}

async function mapIsin(isin: string): Promise<{ listed: boolean; matches: FigiRecord[]; reason?: string }> {
  if (!looksLikeIsin(isin)) {
    return { listed: false, matches: [], reason: "Invalid ISIN format" }
  }
  const res = await fetch(`${OPENFIGI_BASE}/mapping`, {
    method: "POST",
    headers: apiKeyHeaders(),
    cache: "no-store",
    body: JSON.stringify([{ idType: "ID_ISIN", idValue: isin.trim().toUpperCase() }]),
  })
  if (!res.ok) {
    return { listed: false, matches: [], reason: `OpenFIGI ${res.status}` }
  }
  const json = (await res.json()) as Array<{ data?: FigiRecord[]; error?: string }>
  const first = json?.[0]
  if (first?.error) {
    return { listed: false, matches: [], reason: first.error }
  }
  const matches = (first?.data ?? []).slice(0, 5)
  return { listed: matches.length > 0, matches }
}

async function search(query: string): Promise<{ matches: FigiRecord[]; reason?: string }> {
  const res = await fetch(`${OPENFIGI_BASE}/search`, {
    method: "POST",
    headers: apiKeyHeaders(),
    cache: "no-store",
    body: JSON.stringify({ query: query.trim() }),
  })
  if (!res.ok) {
    return { matches: [], reason: `OpenFIGI ${res.status}` }
  }
  const json = (await res.json()) as { data?: FigiRecord[]; error?: string }
  if (json?.error) return { matches: [], reason: json.error }
  return { matches: (json?.data ?? []).slice(0, 25) }
}

export async function POST(request: Request) {
  let body: { isin?: string; query?: string }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid request body." }, { status: 400 })
  }

  const isin = body.isin?.trim()
  const query = body.query?.trim()

  if (!isin && !query) {
    return NextResponse.json({ ok: false, error: "Provide an isin or query." }, { status: 400 })
  }

  const cacheKey = isin ? `isin:${isin.toUpperCase()}` : `q:${query!.toLowerCase()}`
  const cached = cache.get(cacheKey)
  if (cached && Date.now() - cached.ts < CACHE_TTL_MS) {
    return NextResponse.json(cached.payload)
  }

  try {
    if (isin) {
      const result = await mapIsin(isin)
      const payload = { ok: true, mode: "mapping", isin: isin.toUpperCase(), ...result }
      cache.set(cacheKey, { ts: Date.now(), payload })
      return NextResponse.json(payload)
    }
    const result = await search(query!)
    const payload = { ok: true, mode: "search", query, ...result }
    cache.set(cacheKey, { ts: Date.now(), payload })
    return NextResponse.json(payload)
  } catch (err) {
    console.log("[v0] openfigi route failed:", (err as Error).message)
    return NextResponse.json(
      { ok: false, error: "OpenFIGI lookup failed. Please try again." },
      { status: 502 },
    )
  }
}
