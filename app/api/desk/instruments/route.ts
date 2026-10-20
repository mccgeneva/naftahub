import { NextResponse } from "next/server"
import { resolveCurrentSession } from "@/lib/session-user"
import { query } from "@/lib/db"

// Read-only bank-instrument lookup for the Trading Desk: the published
// (available) marketplace catalogue, filtered by ISIN / bank / type / currency.
// Fails closed to an empty list — never fabricated data.
export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function GET(request: Request) {
  const session = await resolveCurrentSession()
  if (!session?.id) return NextResponse.json({ ok: false, results: [] }, { status: 401 })

  const q = (new URL(request.url).searchParams.get("q") ?? "").trim().slice(0, 60)
  try {
    const like = `%${q}%`
    const { rows } = await query(
      `SELECT id, isin, cusip, bank_name, bank_bic, bank_country, type, type_full, face_value,
              currency, tenor_months, rating, assignable, monetizable, verified_source,
              verified_figi, issue_date, maturity_date
         FROM marketplace_instruments
        WHERE available = true
          AND ($1 = '' OR isin ILIKE $2 OR bank_name ILIKE $2 OR type ILIKE $2
               OR type_full ILIKE $2 OR currency ILIKE $2 OR bank_bic ILIKE $2)
        ORDER BY created_at DESC
        LIMIT 60`,
      [q, like],
    )
    const results = rows.map((r: Record<string, unknown>) => ({
      id: String(r.id),
      isin: String(r.isin ?? ""),
      cusip: (r.cusip as string | null) ?? null,
      bankName: String(r.bank_name ?? ""),
      bankBic: String(r.bank_bic ?? ""),
      bankCountry: String(r.bank_country ?? ""),
      type: String(r.type ?? ""),
      typeFull: String(r.type_full ?? ""),
      faceValue: Number(r.face_value) || 0,
      currency: String(r.currency ?? ""),
      tenorMonths: Number(r.tenor_months) || 0,
      rating: String(r.rating ?? ""),
      assignable: Boolean(r.assignable),
      monetizable: Boolean(r.monetizable),
      verifiedSource: (r.verified_source as string | null) ?? null,
      verifiedFigi: (r.verified_figi as string | null) ?? null,
      maturityDate: r.maturity_date ? String(r.maturity_date).slice(0, 10) : null,
    }))
    return NextResponse.json({ ok: true, results })
  } catch (err) {
    console.log("[v0] desk instruments lookup failed:", (err as Error).message)
    return NextResponse.json({ ok: true, results: [] })
  }
}
