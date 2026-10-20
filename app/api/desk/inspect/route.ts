import { NextResponse } from "next/server"
import { resolveCurrentSession } from "@/lib/session-user"
import { query } from "@/lib/db"
import { mapIsinServer, type FigiRecord } from "@/lib/openfigi-server"
import { getCountryByCode } from "@/lib/countries"
import type { InstrumentInspection } from "@/lib/instrument-inspection"

// Instrument inspector for the Trading Desk: decodes an ISIN, maps it against
// the OpenFIGI registry and the platform catalogue. Never fabricates terms —
// any field the sources don't provide comes back null.
export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const ISIN_RE = /^[A-Z]{2}[A-Z0-9]{9}\d$/

const PREFIX_NAMES: Record<string, string> = {
  XS: "International (Euroclear / Clearstream)",
  EU: "European Union",
  QS: "International (Euroclear / Clearstream)",
}

function isinCheckDigitValid(isin: string): boolean {
  const digits = isin
    .slice(0, 11)
    .split("")
    .map((c) => (/[A-Z]/.test(c) ? String(c.charCodeAt(0) - 55) : c))
    .join("")
  let sum = 0
  let double = true
  for (let i = digits.length - 1; i >= 0; i--) {
    let n = Number(digits[i])
    if (double) {
      n *= 2
      if (n > 9) n -= 9
    }
    sum += n
    double = !double
  }
  return (10 - (sum % 10)) % 10 === Number(isin[11])
}

function parseCoupon(raw: string): number | null {
  const parts = raw.trim().split(/\s+/)
  let total = 0
  for (const p of parts) {
    if (/^\d+(\.\d+)?$/.test(p)) total += Number(p)
    else if (/^\d+\/\d+$/.test(p)) {
      const [a, b] = p.split("/").map(Number)
      if (b) total += a / b
    } else return null
  }
  return Number.isFinite(total) ? total : null
}

// Bond tickers follow "<ISSUER> <COUPON> <MM/DD/YY>", e.g. "HSBC 7 04/07/38".
function parseBondTicker(ticker?: string): { coupon: number | null; maturity: string | null } {
  if (!ticker) return { coupon: null, maturity: null }
  const m = ticker.match(/^\S+\s+(.+?)\s+(\d{2})\/(\d{2})\/(\d{2,4})\b/)
  if (!m) return { coupon: null, maturity: null }
  const coupon = parseCoupon(m[1])
  const yy = m[4].length === 2 ? Number(m[4]) : Number(m[4]) % 100
  const year = m[4].length === 4 ? Number(m[4]) : yy >= 70 ? 1900 + yy : 2000 + yy
  return { coupon, maturity: `${year}-${m[2]}-${m[3]}` }
}

export async function GET(request: Request) {
  const session = await resolveCurrentSession()
  if (!session?.id) return NextResponse.json({ ok: false, error: "Sign in required." }, { status: 401 })

  const isin = (new URL(request.url).searchParams.get("isin") ?? "").trim().toUpperCase()
  if (!ISIN_RE.test(isin)) {
    return NextResponse.json({ ok: false, error: "Enter a 12-character ISIN, e.g. XS0356452929." }, { status: 400 })
  }

  const prefix = isin.slice(0, 2)
  const country = getCountryByCode(prefix)

  const [registry, platform] = await Promise.all([
    mapIsinServer(isin).catch((err: Error) => ({ listed: false, matches: [] as FigiRecord[], reason: err.message })),
    query(
      `SELECT id, isin, cusip, bank_name, bank_bic, bank_country, type, type_full, face_value, currency,
              tenor_months, rating, assignable, monetizable, verified_source, verified_figi,
              issue_date, maturity_date, available
         FROM marketplace_instruments WHERE UPPER(isin) = $1 LIMIT 1`,
      [isin],
    )
      .then((r) => r.rows[0] as Record<string, unknown> | undefined)
      .catch(() => undefined),
  ])

  const primary = registry.matches[0]
  const parsed = parseBondTicker(primary?.ticker)

  const result: InstrumentInspection = {
    isin,
    nsin: isin.slice(2, 11),
    checkDigitValid: isinCheckDigitValid(isin),
    issuingCountryCode: prefix,
    issuingCountry: PREFIX_NAMES[prefix] ?? country?.name ?? prefix,
    cusip: prefix === "US" || prefix === "CA" ? isin.slice(2, 11) : ((platform?.cusip as string) ?? null),
    registry: {
      available: !registry.reason || registry.matches.length > 0,
      listed: registry.listed,
      reason: registry.reason ?? null,
      matches: registry.matches.map((m) => ({
        figi: m.figi,
        name: m.name ?? null,
        ticker: m.ticker ?? null,
        exchCode: m.exchCode ?? null,
        securityType: m.securityType ?? null,
        securityType2: m.securityType2 ?? null,
        marketSector: m.marketSector ?? null,
        description: m.securityDescription ?? null,
      })),
    },
    terms: { coupon: parsed.coupon, maturity: parsed.maturity },
    platform: platform
      ? {
          id: String(platform.id),
          bankName: String(platform.bank_name ?? ""),
          bankBic: String(platform.bank_bic ?? ""),
          bankCountry: String(platform.bank_country ?? ""),
          type: String(platform.type ?? ""),
          typeFull: String(platform.type_full ?? ""),
          faceValue: Number(platform.face_value ?? 0),
          currency: String(platform.currency ?? ""),
          tenorMonths: Number(platform.tenor_months ?? 0),
          rating: String(platform.rating ?? ""),
          assignable: Boolean(platform.assignable),
          monetizable: Boolean(platform.monetizable),
          verifiedSource: (platform.verified_source as string) ?? null,
          issueDate: platform.issue_date ? String(platform.issue_date).slice(0, 10) : null,
          maturityDate: platform.maturity_date ? String(platform.maturity_date).slice(0, 10) : null,
          available: Boolean(platform.available),
        }
      : null,
    checkedAt: new Date().toISOString(),
  }

  return NextResponse.json({ ok: true, inspection: result })
}
