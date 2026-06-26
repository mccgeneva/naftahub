// Shared house-style constants + helpers for every MCC Capital PDF document.
// Centralising these keeps the account statement, receipt, certificate,
// handbook, instrument document, and the new tabular list exports visually
// consistent (same brand band, gold mark, Geneva footer, typography).
//
// Generators build a jsPDF `doc` and RETURN it (they no longer call doc.save()
// directly) so the caller can either preview it in-browser or download it via
// the shared PDF viewer (see lib/pdf-viewer.tsx).

import { jsPDF } from "jspdf"
import { DEMO_DOCUMENT_NOTICE } from "@/lib/demo-notice"

// Re-exported so existing importers of `pdf-core` keep working unchanged.
export { DEMO_DOCUMENT_NOTICE }

export type PdfDoc = jsPDF

/**
 * Standard result of a PDF generator. Generators build and RETURN this instead
 * of downloading directly, so callers can preview the document in-browser and
 * then download or print it through the shared PDF viewer.
 */
export interface GeneratedPdf {
  doc: PdfDoc
  /** Suggested download filename, e.g. "MCC-Statement-STM-….pdf". */
  filename: string
  /** Human title shown in the preview modal header. */
  title: string
}

export const BRAND = {
  name: "MCC Capital",
  tagline: "MCC Banking & Trade Platform",
  address: "Rue du Rhone 14, 1204 Geneva, Switzerland",
  email: "support@mcc-capital.com",
  gold: [245, 140, 0] as [number, number, number],
  ink: [17, 17, 17] as [number, number, number],
  slate: [110, 116, 128] as [number, number, number],
  line: [225, 227, 231] as [number, number, number],
  light: [248, 249, 250] as [number, number, number],
  white: [255, 255, 255] as [number, number, number],
  green: [22, 140, 90] as [number, number, number],
  red: [193, 60, 60] as [number, number, number],
}

export const currencySymbols: Record<string, string> = {
  EUR: "€",
  USD: "$",
  GBP: "£",
  CHF: "CHF ",
  JPY: "¥",
  AUD: "A$",
  CAD: "C$",
  SGD: "S$",
}

export function money(amount: number, currency: string): string {
  const symbol = currencySymbols[currency] || `${currency} `
  return `${symbol}${amount.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`
}

export function formatDate(value: string | Date): string {
  const d = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(d.getTime())) return String(value)
  return d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })
}

export function formatDateTime(value: string | Date): string {
  const d = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(d.getTime())) return String(value)
  return d.toLocaleString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  })
}

/** A short, human-readable document reference, e.g. MCC-TXN-20240118-4821. */
export function makeDocRef(prefix: string): string {
  const stamp = new Date().toISOString().slice(0, 10).replace(/-/g, "")
  const rand = Math.floor(Math.random() * 9000 + 1000)
  return `${prefix}-${stamp}-${rand}`
}

// Guards against double-stamping if the very same doc is shown more than once.
const demoStamped = new WeakSet<object>()

/**
 * Stamp the demo-only warning banner across the bottom edge of every page of a
 * generated PDF. Called centrally from the shared PDF viewer for the demo
 * account, so preview, print, download, and open-in-tab all carry it.
 *
 * Unit-agnostic: our generators build docs in either points (NQAi documents) or
 * millimetres (statements, receipts, …), so sizing is derived from the page
 * dimensions rather than assuming a unit. The band is drawn last so it sits on
 * top of any footer the generator already placed.
 */
export function stampDemoNotice(doc: PdfDoc, message: string = DEMO_DOCUMENT_NOTICE): void {
  if (demoStamped.has(doc)) return

  const pageWidth = doc.internal.pageSize.getWidth()
  const pageHeight = doc.internal.pageSize.getHeight()
  // A4/Letter widths are ~595–612 in points but ~210–216 in millimetres, so a
  // width above ~400 reliably indicates the document unit is points.
  const isPoints = pageWidth > 400

  const sidePad = isPoints ? 28 : 10
  const bandHeight = isPoints ? 30 : 11
  const lineHeight = isPoints ? 10 : 3.7
  const fontSize = isPoints ? 8 : 7.5

  const pageCount = doc.getNumberOfPages()
  for (let page = 1; page <= pageCount; page++) {
    doc.setPage(page)

    doc.setFillColor(...BRAND.red)
    doc.rect(0, pageHeight - bandHeight, pageWidth, bandHeight, "F")

    doc.setFont("helvetica", "bold")
    doc.setFontSize(fontSize)
    doc.setTextColor(...BRAND.white)

    const lines = doc.splitTextToSize(message, pageWidth - sidePad * 2) as string[]
    const blockHeight = lines.length * lineHeight
    // Vertically centre the wrapped text block within the band.
    let textY = pageHeight - bandHeight + (bandHeight - blockHeight) / 2 + lineHeight * 0.75
    lines.forEach((ln) => {
      doc.text(ln, pageWidth / 2, textY, { align: "center" })
      textY += lineHeight
    })
  }

  demoStamped.add(doc)
}
