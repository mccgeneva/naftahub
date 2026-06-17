// Generates a professional, multi-page bank-style ACCOUNT STATEMENT PDF in the
// browser using jsPDF. Statements are always scoped to a single user's ledger
// (the caller passes that user's identity + entries), so there is no shared or
// cross-user data. Shares the brand styling used by lib/receipt-pdf.ts.

import { jsPDF } from "jspdf"

export interface StatementEntry {
  id: string
  date: string // ISO
  direction: "credit" | "debit"
  amount: number // always positive
  currency: string
  status: string // "completed" | "hold" | ...
  counterparty: string
  reference?: string
  category?: string
}

export interface StatementInput {
  /** Account holder display name (legal/representative name). */
  holderName: string
  /** Entity / company name. */
  holderCompany?: string
  bankName?: string
  iban?: string
  bic?: string
  accountEmail?: string
  /** Optional statement period. When omitted the statement covers all entries. */
  periodFrom?: Date
  periodTo?: Date
  /** The user's ledger entries (already scoped to this user). */
  entries: StatementEntry[]
}

const BRAND = {
  name: "MCC Capital",
  tagline: "MCC Banking & Trade Platform",
  address: "Rue du Rhone 14, 1204 Geneva, Switzerland",
  email: "support@mcc-capital.com",
  gold: [197, 160, 71] as [number, number, number],
  ink: [17, 17, 17] as [number, number, number],
  slate: [110, 116, 128] as [number, number, number],
  line: [225, 227, 231] as [number, number, number],
  light: [248, 249, 250] as [number, number, number],
  white: [255, 255, 255] as [number, number, number],
  green: [22, 140, 90] as [number, number, number],
  red: [193, 60, 60] as [number, number, number],
}

const currencySymbols: Record<string, string> = {
  EUR: "€",
  USD: "$",
  GBP: "£",
  CHF: "CHF ",
  JPY: "¥",
  AUD: "A$",
  CAD: "C$",
  SGD: "S$",
}

function money(amount: number, currency: string): string {
  const symbol = currencySymbols[currency] || `${currency} `
  return `${symbol}${amount.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`
}

function formatDate(value: string | Date): string {
  const d = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(d.getTime())) return String(value)
  return d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })
}

export function generateStatementPdf(input: StatementInput): void {
  if (typeof window === "undefined") return

  const doc = new jsPDF({ unit: "pt", format: "a4" })
  const pageWidth = doc.internal.pageSize.getWidth()
  const pageHeight = doc.internal.pageSize.getHeight()
  const margin = 48
  const contentWidth = pageWidth - margin * 2
  const bottomLimit = pageHeight - 64

  const statementNo = `STM-${new Date().toISOString().slice(0, 10).replace(/-/g, "")}-${Math.floor(
    Math.random() * 9000 + 1000,
  )}`

  // Normalise the period bounds.
  const from = input.periodFrom ? new Date(input.periodFrom) : undefined
  if (from) from.setHours(0, 0, 0, 0)
  const to = input.periodTo ? new Date(input.periodTo) : undefined
  if (to) to.setHours(23, 59, 59, 999)

  const inPeriod = (d: Date) => {
    if (from && d < from) return false
    if (to && d > to) return false
    return true
  }

  // ---- Footer (every page) ----------------------------------------------
  let pageNo = 0
  const drawFooter = () => {
    doc.setDrawColor(...BRAND.line)
    doc.setLineWidth(1)
    doc.line(margin, bottomLimit + 14, pageWidth - margin, bottomLimit + 14)
    doc.setFont("helvetica", "normal")
    doc.setFontSize(7.5)
    doc.setTextColor(...BRAND.slate)
    doc.text(
      "Electronically generated account statement — valid without signature.",
      margin,
      bottomLimit + 28,
    )
    doc.text(`${BRAND.name}  ·  Statement ${statementNo}`, margin, bottomLimit + 39)
    doc.text(`Page ${pageNo}`, pageWidth - margin, bottomLimit + 39, { align: "right" })
  }

  // ---- Header band ------------------------------------------------------
  const drawHeader = () => {
    doc.setFillColor(...BRAND.ink)
    doc.rect(0, 0, pageWidth, 92, "F")
    doc.setFillColor(...BRAND.gold)
    doc.roundedRect(margin, 28, 34, 34, 6, 6, "F")
    doc.setTextColor(...BRAND.ink)
    doc.setFont("helvetica", "bold")
    doc.setFontSize(17)
    doc.text("M", margin + 17, 51, { align: "center" })
    doc.setTextColor(...BRAND.white)
    doc.setFont("helvetica", "bold")
    doc.setFontSize(16)
    doc.text(BRAND.name, margin + 48, 46)
    doc.setFont("helvetica", "normal")
    doc.setFontSize(8.5)
    doc.setTextColor(190, 192, 196)
    doc.text(BRAND.tagline, margin + 48, 61)
    doc.setTextColor(...BRAND.gold)
    doc.setFont("helvetica", "bold")
    doc.setFontSize(13)
    doc.text("ACCOUNT STATEMENT", pageWidth - margin, 46, { align: "right" })
    doc.setTextColor(190, 192, 196)
    doc.setFont("helvetica", "normal")
    doc.setFontSize(8.5)
    doc.text(`No. ${statementNo}`, pageWidth - margin, 61, { align: "right" })
  }

  let y = 0
  const newPage = (withHeader = true) => {
    doc.addPage()
    pageNo += 1
    if (withHeader) {
      drawHeader()
      y = 116
    } else {
      y = margin
    }
    drawFooter()
  }
  const ensureSpace = (needed: number) => {
    if (y + needed > bottomLimit) newPage()
  }

  // ===== First page =====
  pageNo = 1
  drawHeader()
  drawFooter()
  y = 116

  // ---- Account holder + statement meta (two columns) --------------------
  const colGap = 24
  const colWidth = (contentWidth - colGap) / 2
  const rightX = margin + colWidth + colGap
  const blockTop = y

  // Left: account holder
  doc.setTextColor(...BRAND.gold)
  doc.setFont("helvetica", "bold")
  doc.setFontSize(8.5)
  doc.text("ACCOUNT HOLDER", margin, y)
  let ly = y + 16
  doc.setTextColor(...BRAND.ink)
  doc.setFont("helvetica", "bold")
  doc.setFontSize(12)
  doc.text(input.holderName || "—", margin, ly)
  ly += 15
  doc.setFont("helvetica", "normal")
  doc.setFontSize(9)
  doc.setTextColor(...BRAND.slate)
  ;[
    input.holderCompany,
    input.bankName ? `Bank: ${input.bankName}` : "",
    input.iban ? `IBAN: ${input.iban}` : "",
    input.bic ? `BIC/SWIFT: ${input.bic}` : "",
    input.accountEmail,
  ]
    .filter(Boolean)
    .forEach((line) => {
      const wrapped = doc.splitTextToSize(line as string, colWidth)
      wrapped.forEach((w: string) => {
        doc.text(w, margin, ly)
        ly += 13
      })
    })

  // Right: statement details
  doc.setTextColor(...BRAND.gold)
  doc.setFont("helvetica", "bold")
  doc.setFontSize(8.5)
  doc.text("STATEMENT DETAILS", rightX, y)
  let ry = y + 16
  const metaRows: [string, string][] = [
    ["Statement Period", from || to ? `${from ? formatDate(from) : "Beginning"} — ${to ? formatDate(to) : "Present"}` : "All transactions"],
    ["Issue Date", formatDate(new Date())],
    ["Statement No.", statementNo],
  ]
  metaRows.forEach(([label, value]) => {
    doc.setFont("helvetica", "normal")
    doc.setFontSize(9)
    doc.setTextColor(...BRAND.slate)
    doc.text(label, rightX, ry)
    doc.setFont("helvetica", "bold")
    doc.setTextColor(...BRAND.ink)
    doc.text(value, pageWidth - margin, ry, { align: "right" })
    ry += 15
  })

  y = Math.max(ly, ry) + 8
  doc.setDrawColor(...BRAND.line)
  doc.setLineWidth(1)
  doc.line(margin, y, pageWidth - margin, y)
  y += 24
  void blockTop

  // ---- Group entries by currency ----------------------------------------
  const currencies = Array.from(new Set(input.entries.map((e) => e.currency))).sort()

  if (input.entries.length === 0 || currencies.length === 0) {
    doc.setFont("helvetica", "italic")
    doc.setFontSize(10.5)
    doc.setTextColor(...BRAND.slate)
    doc.text("No transactions are recorded for this account.", margin, y)
    doc.save(`MCC-Statement-${statementNo}.pdf`)
    return
  }

  // Column layout for the ledger table.
  const cols = {
    date: margin + 4,
    ref: margin + 78,
    desc: margin + 168,
    debit: margin + contentWidth - 230,
    credit: margin + contentWidth - 120,
    balance: margin + contentWidth - 4,
  }

  const drawTableHead = () => {
    doc.setFillColor(...BRAND.ink)
    doc.rect(margin, y, contentWidth, 22, "F")
    doc.setTextColor(...BRAND.white)
    doc.setFont("helvetica", "bold")
    doc.setFontSize(8.5)
    const ty = y + 14
    doc.text("DATE", cols.date, ty)
    doc.text("REFERENCE", cols.ref, ty)
    doc.text("DESCRIPTION", cols.desc, ty)
    doc.text("DEBIT", cols.debit, ty, { align: "right" })
    doc.text("CREDIT", cols.credit, ty, { align: "right" })
    doc.text("BALANCE", cols.balance, ty, { align: "right" })
    y += 22
  }

  currencies.forEach((currency) => {
    const all = input.entries
      .filter((e) => e.currency === currency)
      .map((e) => ({ ...e, _d: new Date(e.date) }))
      .filter((e) => !Number.isNaN(e._d.getTime()))
      .sort((a, b) => a._d.getTime() - b._d.getTime())

    // Opening balance = completed entries before the period start.
    const opening = all
      .filter((e) => e.status === "completed" && from && e._d < from)
      .reduce((s, e) => s + (e.direction === "credit" ? e.amount : -e.amount), 0)

    const periodEntries = all.filter((e) => inPeriod(e._d))

    // ---- Currency section header ----
    ensureSpace(70)
    doc.setTextColor(...BRAND.ink)
    doc.setFont("helvetica", "bold")
    doc.setFontSize(13)
    doc.text(`${currency} Account`, margin, y)
    doc.setFont("helvetica", "normal")
    doc.setFontSize(9)
    doc.setTextColor(...BRAND.slate)
    doc.text(
      `Opening balance: ${money(opening, currency)}`,
      pageWidth - margin,
      y,
      { align: "right" },
    )
    y += 14

    drawTableHead()

    let running = opening
    let totalCredits = 0
    let totalDebits = 0

    if (periodEntries.length === 0) {
      ensureSpace(22)
      doc.setFont("helvetica", "italic")
      doc.setFontSize(9)
      doc.setTextColor(...BRAND.slate)
      doc.text("No transactions in this period.", cols.date, y + 13)
      y += 22
    }

    periodEntries.forEach((e, i) => {
      const isCredit = e.direction === "credit"
      const counts = e.status === "completed"
      if (counts) {
        running += isCredit ? e.amount : -e.amount
        if (isCredit) totalCredits += e.amount
        else totalDebits += e.amount
      }

      const descLines = doc.splitTextToSize(
        `${e.counterparty}${e.category ? ` · ${e.category}` : ""}${
          e.status !== "completed" ? " (on hold)" : ""
        }`,
        cols.debit - cols.desc - 8,
      ) as string[]
      const rowH = Math.max(20, descLines.length * 11 + 9)
      ensureSpace(rowH)

      if (i % 2 === 0) {
        doc.setFillColor(...BRAND.light)
        doc.rect(margin, y, contentWidth, rowH, "F")
      }
      const ty = y + 13
      doc.setFont("helvetica", "normal")
      doc.setFontSize(8.5)
      doc.setTextColor(...BRAND.ink)
      doc.text(formatDate(e._d), cols.date, ty)
      doc.setTextColor(...BRAND.slate)
      doc.text(e.reference || e.id, cols.ref, ty)
      doc.setTextColor(...BRAND.ink)
      descLines.forEach((ln, li) => doc.text(ln, cols.desc, ty + li * 11))
      doc.setTextColor(...BRAND.red)
      doc.text(!isCredit && counts ? money(e.amount, currency) : "—", cols.debit, ty, { align: "right" })
      doc.setTextColor(...BRAND.green)
      doc.text(isCredit && counts ? money(e.amount, currency) : "—", cols.credit, ty, { align: "right" })
      doc.setTextColor(...BRAND.ink)
      doc.setFont("helvetica", "bold")
      doc.text(counts ? money(running, currency) : "—", cols.balance, ty, { align: "right" })
      y += rowH
    })

    // ---- Closing summary box ----
    ensureSpace(72)
    y += 6
    doc.setFillColor(...BRAND.light)
    doc.roundedRect(margin, y, contentWidth, 58, 4, 4, "F")
    const sy = y + 18
    const summary: [string, string, [number, number, number]][] = [
      ["Opening balance", money(opening, currency), BRAND.ink],
      ["Total credits", `+ ${money(totalCredits, currency)}`, BRAND.green],
      ["Total debits", `- ${money(totalDebits, currency)}`, BRAND.red],
    ]
    summary.forEach(([label, value, color], idx) => {
      const x = margin + 16 + idx * ((contentWidth - 32) / 3)
      doc.setFont("helvetica", "normal")
      doc.setFontSize(8.5)
      doc.setTextColor(...BRAND.slate)
      doc.text(label, x, sy)
      doc.setFont("helvetica", "bold")
      doc.setFontSize(11)
      doc.setTextColor(...color)
      doc.text(value, x, sy + 16)
    })
    doc.setDrawColor(...BRAND.line)
    doc.line(margin + 12, y + 40, pageWidth - margin - 12, y + 40)
    doc.setFont("helvetica", "bold")
    doc.setFontSize(10.5)
    doc.setTextColor(...BRAND.ink)
    doc.text("Closing balance", margin + 16, y + 52)
    doc.setTextColor(...BRAND.gold)
    doc.text(money(running, currency), pageWidth - margin - 16, y + 52, { align: "right" })
    y += 58 + 26
  })

  doc.save(`MCC-Statement-${statementNo}.pdf`)
}
