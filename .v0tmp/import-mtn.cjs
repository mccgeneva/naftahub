const { Pool } = require("pg")
const fs = require("fs")

const csvPath = "/vercel/share/v0-project/user_read_only_context/text_attachments/Bank-MTN-Note-OTC-List-–-Enriched-Instrument-Data---Instruments-jWQuo.csv"

function parseCsv(text) {
  const rows = []
  let row = [], cell = "", q = false
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (q) {
      if (c === '"' && text[i + 1] === '"') { cell += '"'; i++ }
      else if (c === '"') q = false
      else cell += c
    } else if (c === '"') q = true
    else if (c === ",") { row.push(cell); cell = "" }
    else if (c === "\n") { row.push(cell); rows.push(row); row = []; cell = "" }
    else if (c !== "\r") cell += c
  }
  if (cell || row.length) { row.push(cell); rows.push(row) }
  return rows
}

const BANKS = [
  [/Bank of America|Merrill/i, "BOFAUS3N", "United States"],
  [/Barclays/i, "BARCGB22", "United Kingdom"],
  [/BNP/i, "BNPAFRPP", "France"],
  [/Citigroup/i, "CITIUS33", "United States"],
  [/Deutsche Bank/i, "DEUTDEFF", "Germany"],
  [/Goldman/i, "GOLDUS33", "United States"],
  [/HSBC/i, "MIDLGB22", "United Kingdom"],
  [/JPMorgan/i, "CHASUS33", "United States"],
  [/KfW/i, "KFWIDEFF", "Germany"],
  [/Lloyds/i, "LOYDGB2L", "United Kingdom"],
  [/Morgan Stanley/i, "MSNYUS33", "United States"],
  [/Wells Fargo/i, "WFBIUS6S", "United States"],
]

const today = new Date("2026-11-14")
function toIsoDate(dmy) {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(dmy.trim())
  return m ? `${m[3]}-${m[2]}-${m[1]}` : null
}

const [header, ...data] = parseCsv(fs.readFileSync(csvPath, "utf8")).filter((r) => r.length > 5)
const idx = Object.fromEntries(header.map((h, i) => [h.trim(), i]))
const g = (r, k) => (r[idx[k]] ?? "").trim()

const items = data.map((r) => {
  const isin = g(r, "ISIN")
  const issuer = g(r, "Issuer (verified)")
  const [, bic, country] = BANKS.find(([re]) => re.test(issuer)) ?? [null, "", ""]
  const sheetType = g(r, "Type (per sheet)").toUpperCase()
  const ccy = g(r, "Ccy")
  let type = "BANKB", typeFull = "Bank / Financial Bond"
  if (sheetType === "MTN") {
    if (ccy !== "USD") { type = "EMTN"; typeFull = "Euro Medium Term Note" }
    else { type = "MTN"; typeFull = "Medium Term Note" }
  } else if (sheetType === "GLOBAL NOTE") { type = "GLBN"; typeFull = "Global Note" }
  const maturity = toIsoDate(g(r, "Maturity (verified)"))
  const tenor = maturity
    ? Math.max(1, Math.round((new Date(maturity) - today) / (1000 * 60 * 60 * 24 * 30.4375)))
    : 12
  const otherIds = g(r, "Other IDs")
  const ccMatch = /Common Code (\d{9})/.exec(otherIds)
  const cusipRaw = g(r, "CUSIP")
  const cusip = /^[0-9A-Z]{9}$/.test(cusipRaw) ? cusipRaw : null
  const wknRaw = g(r, "WKN")
  const wkn = /^[0-9A-Z]{6}$/.test(wknRaw) ? wknRaw : null
  const notes = [
    `Coupon ${g(r, "Coupon")}`,
    `Ranking: ${g(r, "Ranking")}`,
    `Structure: ${g(r, "Structure / call")}`,
    `Issued: ${g(r, "Issued / priced")}`,
    `OTC price ${g(r, "OTC price (sheet)")} vs market ${g(r, "Market price (sheet)")} (gap ${g(r, "Gap (pts)")} pts)`,
    wkn ? `WKN ${wkn}` : null,
    otherIds ? `Other IDs: ${otherIds}` : null,
    `Data check: ${g(r, "Differences vs the sheet")}`,
  ].filter(Boolean).join(" · ")
  return {
    isin, cusip, commonCode: ccMatch ? ccMatch[1] : null, issuer, bic, country, type, typeFull,
    face: Number(g(r, "Amount issued").replace(/,/g, "")), ccy, tenor,
    rating: g(r, "Rating (per sheet)"), figi: g(r, "FIGI") || null, maturity, notes,
    issuerDetails: `${issuer} — ${g(r, "Ranking")}, coupon ${g(r, "Coupon")}`,
    law: ccy === "USD" ? "New York law" : ccy === "GBP" ? "English law" : "German law",
  }
})

async function main() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL || process.env.POSTGRES_URL })
  const { rows: existing } = await pool.query("SELECT isin, cusip FROM marketplace_instruments")
  const seenIsin = new Set(existing.map((e) => e.isin))
  const seenCusip = new Set(existing.map((e) => e.cusip).filter(Boolean))
  let added = 0
  const skipped = []
  for (const it of items) {
    if (seenIsin.has(it.isin) || (it.cusip && seenCusip.has(it.cusip))) { skipped.push(it.isin); continue }
    const id = `MKT-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`
    await pool.query(
      `INSERT INTO marketplace_instruments (
         id, isin, cusip, common_code, bank_name, bank_bic, bank_country, type, type_full,
         face_value, currency, tenor_months, rating, assignable, monetizable, available,
         verified_source, verified_figi, verified_name, verified_at, attested_bloomberg,
         maturity_date, issuer_details, delivery_method, governing_law, notes, created_by, created_at, updated_at
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,true,true,true,
         'bloomberg',$14,$15,now(),now(),$16,$17,'Euroclear / DTC book-entry',$18,$19,
         'Administrator bulk import (OTC list)',now(),now())`,
      [id, it.isin, it.cusip, it.commonCode, it.issuer, it.bic, it.country, it.type, it.typeFull,
        it.face, it.ccy, it.tenor, it.rating, it.figi, it.issuer, it.maturity, it.issuerDetails, it.law, it.notes],
    )
    seenIsin.add(it.isin)
    if (it.cusip) seenCusip.add(it.cusip)
    added++
  }
  console.log(JSON.stringify({ parsed: items.length, added, skipped }))
  await pool.end()
}
main().catch((e) => { console.error(e.message); process.exit(1) })
