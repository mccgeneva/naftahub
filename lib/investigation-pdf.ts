// ---------------------------------------------------------------------------
// Customer Investigation — client-side PDF builder.
//
// Produces a print-ready compliance file for one customer: header + current
// positions, then a COMPLETE chronological activity table (each transaction,
// debit, and related event in exact time order). Returns a jsPDF doc so the
// admin can preview / download / print it through the shared PdfPreviewModal.
// ---------------------------------------------------------------------------

import { jsPDF } from "jspdf"
import { BRAND, money, formatDateTime, formatDate } from "@/lib/pdf-core"
import type { CustomerInvestigation, TimelineItem } from "@/lib/investigation-types"

const PAGE_W = 210
const PAGE_H = 297
const M = 12
const CW = PAGE_W - M * 2

function signedMoney(amount: number | null, currency: string | null): string {
  if (amount === null || currency === null) return "—"
  const sign = amount > 0 ? "+" : amount < 0 ? "-" : ""
  return `${sign}${money(Math.abs(amount), currency)}`
}

/** Build the investigation PDF. */
export function buildInvestigationDoc(data: CustomerInvestigation): jsPDF {
  const doc = new jsPDF({ unit: "mm", format: "a4" })
  let y = M

  // --- Brand band ----------------------------------------------------------
  doc.setFillColor(...BRAND.ink)
  doc.rect(0, 0, PAGE_W, 26, "F")
  doc.setFillColor(...BRAND.gold)
  doc.rect(0, 26, PAGE_W, 1.2, "F")
  doc.setTextColor(...BRAND.white)
  doc.setFont("helvetica", "bold")
  doc.setFontSize(15)
  doc.text("Customer Investigation File", M, 13)
  doc.setFont("helvetica", "normal")
  doc.setFontSize(9)
  doc.text(`${BRAND.name} — Compliance & Audit · Administrator use only`, M, 20)
  y = 34

  // --- Subject -------------------------------------------------------------
  doc.setTextColor(...BRAND.ink)
  doc.setFont("helvetica", "bold")
  doc.setFontSize(12)
  doc.text(data.account, M, y)
  y += 5
  doc.setFont("helvetica", "normal")
  doc.setFontSize(8.5)
  doc.setTextColor(...BRAND.slate)
  const subLines = [
    [data.company, data.email].filter(Boolean).join("  ·  "),
    [
      data.accountBadge && `Tier: ${data.accountBadge}`,
      data.relationship && `Relationship: ${data.relationship}`,
      `Account id: ${data.userId}`,
    ]
      .filter(Boolean)
      .join("  ·  "),
    `Members in pool: ${data.memberIds.length}`,
    `Period: ${data.range.from ? formatDate(data.range.from) : "start"} → ${data.range.to ? formatDate(data.range.to) : "now"}`,
    `Generated: ${formatDateTime(data.generatedAt)}`,
  ].filter(Boolean)
  for (const line of subLines) {
    doc.text(line, M, y)
    y += 4.2
  }
  y += 2

  // --- Current positions ---------------------------------------------------
  doc.setTextColor(...BRAND.ink)
  doc.setFont("helvetica", "bold")
  doc.setFontSize(10.5)
  doc.text("Current Positions", M, y)
  y += 5
  doc.setFontSize(8)
  if (data.balances.length === 0) {
    doc.setFont("helvetica", "italic")
    doc.setTextColor(...BRAND.slate)
    doc.text("No ledger balances on file.", M, y)
    y += 5
  } else {
    // Balance table header
    doc.setFont("helvetica", "bold")
    doc.setTextColor(...BRAND.slate)
    doc.text("Currency", M, y)
    doc.text("Available", M + 55, y, { align: "right" })
    doc.text("Blocked / on hold", M + 110, y, { align: "right" })
    doc.text("Equity saving", M + CW, y, { align: "right" })
    y += 3
    doc.setDrawColor(...BRAND.line)
    doc.line(M, y, M + CW, y)
    y += 3.5
    doc.setFont("helvetica", "normal")
    doc.setTextColor(...BRAND.ink)
    for (const b of data.balances) {
      doc.text(b.currency, M, y)
      doc.text(money(b.available, b.currency), M + 55, y, { align: "right" })
      doc.text(money(b.onHold, b.currency), M + 110, y, { align: "right" })
      doc.text(money(b.equitySaving, b.currency), M + CW, y, { align: "right" })
      y += 4.6
    }
    y += 1
  }

  // Live facilities / exposures
  if (data.facilities.length) {
    doc.setFont("helvetica", "bold")
    doc.setFontSize(9.5)
    doc.setTextColor(...BRAND.ink)
    doc.text("Open facilities & exposures", M, y)
    y += 4.6
    doc.setFont("helvetica", "normal")
    doc.setFontSize(8)
    for (const f of data.facilities) {
      doc.setTextColor(...BRAND.ink)
      doc.text(`${f.label}: ${f.liveCount} live`, M, y)
      y += 4.2
      doc.setTextColor(...BRAND.slate)
      for (const item of f.items.slice(0, 8)) {
        const amt = item.amount !== null && item.currency ? `  ${money(item.amount, item.currency)}` : ""
        const line = doc.splitTextToSize(`• ${item.title}${amt}  (${formatDate(item.createdAt)})`, CW - 4)
        doc.text(line, M + 4, y)
        y += line.length * 3.8
        if (y > PAGE_H - 20) {
          doc.addPage()
          y = M
        }
      }
      y += 1
    }
  }
  y += 3

  // --- Chronological activity log ------------------------------------------
  const COL = { time: M, section: M + 30, event: M + 52, amount: M + 148, balance: M + CW }
  const drawHeader = () => {
    doc.setFillColor(...BRAND.light)
    doc.rect(M, y - 4, CW, 6, "F")
    doc.setFont("helvetica", "bold")
    doc.setFontSize(7.5)
    doc.setTextColor(...BRAND.slate)
    doc.text("Date / time", COL.time, y)
    doc.text("Section", COL.section, y)
    doc.text("Event", COL.event, y)
    doc.text("Amount", COL.amount, y, { align: "right" })
    doc.text("Balance", COL.balance, y, { align: "right" })
    y += 5
    doc.setDrawColor(...BRAND.line)
    doc.line(M, y - 2.5, M + CW, y - 2.5)
  }

  doc.setTextColor(...BRAND.ink)
  doc.setFont("helvetica", "bold")
  doc.setFontSize(10.5)
  doc.text(`Activity Log — ${data.counts.total} events (${data.counts.ledger} ledger, ${data.counts.activity} activity)`, M, y)
  y += 6
  if (data.truncated) {
    doc.setFont("helvetica", "italic")
    doc.setFontSize(7.5)
    doc.setTextColor(...BRAND.red)
    doc.text("Note: the log was capped — narrow the date range for the complete sequence.", M, y)
    y += 5
  }
  drawHeader()

  doc.setFont("helvetica", "normal")
  doc.setFontSize(7.5)
  const rowFor = (ev: TimelineItem) => {
    const eventText = [ev.type, ev.description].filter(Boolean).join(" — ")
    const eventLines = doc.splitTextToSize(eventText || "—", COL.amount - COL.event - 3) as string[]
    const rowH = Math.max(eventLines.length * 3.4 + 2.4, 6)
    if (y + rowH > PAGE_H - 12) {
      doc.addPage()
      y = M
      drawHeader()
      doc.setFont("helvetica", "normal")
      doc.setFontSize(7.5)
    }
    doc.setTextColor(...BRAND.ink)
    const when = new Date(ev.at)
    doc.text(Number.isNaN(when.getTime()) ? ev.at : when.toLocaleString("en-GB", {
      day: "2-digit",
      month: "short",
      year: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    }), COL.time, y)
    doc.setTextColor(...BRAND.slate)
    doc.text(doc.splitTextToSize(ev.section || "—", COL.event - COL.section - 2) as string[], COL.section, y)
    doc.setTextColor(...BRAND.ink)
    doc.text(eventLines, COL.event, y)
    // Amount (green credit / red debit)
    if (ev.amount !== null && ev.currency) {
      if (ev.amount > 0) doc.setTextColor(...BRAND.green)
      else if (ev.amount < 0) doc.setTextColor(...BRAND.red)
      else doc.setTextColor(...BRAND.ink)
      doc.text(signedMoney(ev.amount, ev.currency), COL.amount, y, { align: "right" })
    } else {
      doc.setTextColor(...BRAND.slate)
      doc.text("—", COL.amount, y, { align: "right" })
    }
    doc.setTextColor(...BRAND.ink)
    doc.text(
      ev.balanceAfter !== null && ev.currency ? money(ev.balanceAfter, ev.currency) : "—",
      COL.balance,
      y,
      { align: "right" },
    )
    y += rowH
    doc.setDrawColor(...BRAND.line)
    doc.setLineWidth(0.1)
    doc.line(M, y - 2.2, M + CW, y - 2.2)
  }

  if (data.timeline.length === 0) {
    doc.setFont("helvetica", "italic")
    doc.setTextColor(...BRAND.slate)
    doc.text("No recorded activity in the selected period.", M, y + 2)
  } else {
    for (const ev of data.timeline) rowFor(ev)
  }

  // --- Footer (page numbers) ----------------------------------------------
  const pages = doc.getNumberOfPages()
  for (let p = 1; p <= pages; p++) {
    doc.setPage(p)
    doc.setFont("helvetica", "normal")
    doc.setFontSize(7)
    doc.setTextColor(...BRAND.slate)
    doc.text(`${BRAND.name} · Confidential — Administrator investigation file`, M, PAGE_H - 6)
    doc.text(`Page ${p} / ${pages}`, M + CW, PAGE_H - 6, { align: "right" })
  }

  return doc
}
