// "Instrument Reference Certificate": certifies the identifier data the desk
// retrieved for an ISIN (registry match, decoded fields, platform listing).
// It is a reference-data certificate, NOT a certificate of title or ownership.

import { jsPDF } from "jspdf"
import { BRAND, formatDate, formatDateTime, makeDocRef, money, type GeneratedPdf } from "@/lib/pdf-core"
import { drawBrandMark } from "@/lib/pdf-logos"
import type { InstrumentInspection } from "@/lib/instrument-inspection"

export function generateInstrumentReferencePdf(data: InstrumentInspection, holderName?: string): GeneratedPdf {
  const doc = new jsPDF({ unit: "pt", format: "a4" })
  const W = doc.internal.pageSize.getWidth()
  const H = doc.internal.pageSize.getHeight()
  const m = 48
  const cw = W - m * 2
  const ref = makeDocRef("IRC")
  const primary = data.registry.matches[0]

  doc.setFillColor(...BRAND.ink)
  doc.rect(0, 0, W, 96, "F")
  drawBrandMark(doc, "capital", m, 30, 36, 36, { panel: true, radius: 4 })
  doc.setTextColor(...BRAND.white)
  doc.setFont("helvetica", "bold")
  doc.setFontSize(15)
  doc.text("INSTRUMENT REFERENCE CERTIFICATE", m + 50, 48)
  doc.setFont("helvetica", "normal")
  doc.setFontSize(9)
  doc.text(`${BRAND.name} · Trading Desk · Ref ${ref}`, m + 50, 64)

  let y = 128
  doc.setTextColor(...BRAND.ink)
  doc.setFont("helvetica", "bold")
  doc.setFontSize(20)
  doc.text(data.isin, m, y)
  y += 20
  doc.setFont("helvetica", "normal")
  doc.setFontSize(11)
  const title = primary?.name ?? data.platform?.typeFull ?? "Identifier not found in registry"
  doc.text(doc.splitTextToSize(title, cw), m, y)
  y += 26

  const section = (heading: string, rows: Array<[string, string]>) => {
    if (y > H - 160) {
      doc.addPage()
      y = 60
    }
    doc.setFillColor(...BRAND.light)
    doc.rect(m, y - 12, cw, 20, "F")
    doc.setFont("helvetica", "bold")
    doc.setFontSize(10)
    doc.setTextColor(...BRAND.gold)
    doc.text(heading.toUpperCase(), m + 8, y + 2)
    y += 22
    doc.setFontSize(10)
    rows.forEach(([k, v], i) => {
      const lines = doc.splitTextToSize(v || "—", cw * 0.6)
      if (y + lines.length * 13 > H - 90) {
        doc.addPage()
        y = 60
      }
      if (i % 2 === 1) {
        doc.setFillColor(252, 252, 253)
        doc.rect(m, y - 10, cw, lines.length * 13 + 4, "F")
      }
      doc.setFont("helvetica", "normal")
      doc.setTextColor(...BRAND.slate)
      doc.text(k, m + 8, y)
      doc.setTextColor(...BRAND.ink)
      doc.text(lines, m + cw * 0.38, y)
      y += lines.length * 13 + 4
    })
    y += 14
  }

  section("Identifier", [
    ["ISIN", data.isin],
    ["National security number", data.nsin],
    ["Check digit", data.checkDigitValid ? "Valid (ISO 6166)" : "INVALID — verify the ISIN"],
    ["Issuing code", `${data.issuingCountryCode} · ${data.issuingCountry}`],
    ["CUSIP", data.cusip ?? "—"],
  ])

  if (primary) {
    section("Bloomberg compatible terminal record", [
      ["Name", primary.name ?? "—"],
      ["Ticker", primary.ticker ?? "—"],
      ["FIGI", primary.figi],
      ["Security type", [primary.securityType, primary.securityType2].filter(Boolean).join(" · ") || "—"],
      ["Market sector", primary.marketSector ?? "—"],
      ["Exchange", primary.exchCode ?? "—"],
      ["Coupon", data.terms.coupon != null ? `${data.terms.coupon}%` : "—"],
      ["Maturity", data.terms.maturity ? formatDate(data.terms.maturity) : "—"],
      ["Registry listings", String(data.registry.matches.length)],
    ])
  } else {
    section("Bloomberg compatible terminal record", [
      [
        "Status",
        data.registry.available
          ? "Not exchange-listed. Normal for bilateral instruments (SBLC, BG, private MTN) — verify with the issuing bank."
          : "Registry temporarily unavailable at time of check.",
      ],
    ])
  }

  if (data.platform) {
    const p = data.platform
    section("Platform listing", [
      ["Instrument", `${p.type} · ${p.typeFull}`],
      ["Issuing bank", `${p.bankName}${p.bankBic ? ` (${p.bankBic})` : ""}`],
      ["Bank country", p.bankCountry],
      ["Face value", money(p.faceValue, p.currency)],
      ["Rating", p.rating || "—"],
      ["Tenor", p.tenorMonths ? `${p.tenorMonths} months` : "—"],
      ["Issue date", p.issueDate ? formatDate(p.issueDate) : "—"],
      ["Maturity date", p.maturityDate ? formatDate(p.maturityDate) : "—"],
      ["Assignable / Monetizable", `${p.assignable ? "Yes" : "No"} / ${p.monetizable ? "Yes" : "No"}`],
      ["Verification", p.verifiedSource ?? "Not independently verified"],
    ])
  }

  section("Certification", [
    ["Checked on", formatDateTime(data.checkedAt)],
    ["Requested by", holderName ?? "Desk user"],
    ["Document reference", ref],
  ])

  if (y > H - 130) {
    doc.addPage()
    y = 60
  }
  doc.setFont("helvetica", "italic")
  doc.setFontSize(8.5)
  doc.setTextColor(...BRAND.slate)
  const note =
    "This certificate confirms the identifier and reference data retrieved for the ISIN above at the time shown. " +
    "It is not a certificate of title, ownership, custody or value, and does not evidence that any party holds " +
    "the instrument. Confirm terms and holdings with the issuer, paying agent or custodian before relying on them."
  doc.text(doc.splitTextToSize(note, cw), m, y)

  const pages = doc.getNumberOfPages()
  for (let i = 1; i <= pages; i++) {
    doc.setPage(i)
    doc.setDrawColor(...BRAND.line)
    doc.line(m, H - 44, W - m, H - 44)
    doc.setFont("helvetica", "normal")
    doc.setFontSize(8)
    doc.setTextColor(...BRAND.slate)
    doc.text(`${BRAND.name} · ${BRAND.address}`, m, H - 30)
    doc.text(`Page ${i} of ${pages}`, W - m, H - 30, { align: "right" })
  }

  return {
    doc,
    filename: `MCC-Instrument-Reference-${data.isin}.pdf`,
    title: `Instrument Reference — ${data.isin}`,
  }
}
