// Shared house-style constants + helpers for every MCC Capital PDF document.
// Centralising these keeps the account statement, receipt, certificate,
// handbook, instrument document, and the new tabular list exports visually
// consistent (same brand band, gold mark, Geneva footer, typography).
//
// Generators build a jsPDF `doc` and RETURN it (they no longer call doc.save()
// directly) so the caller can either preview it in-browser or download it via
// the shared PDF viewer (see lib/pdf-viewer.tsx).

import { jsPDF } from "jspdf"

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
