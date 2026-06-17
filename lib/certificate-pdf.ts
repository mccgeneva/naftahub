// Generates a professional, bank-style instrument certificate PDF entirely in
// the browser using jsPDF. Used for the "Download Certificate" action on the
// Bank Instruments page.

import { jsPDF } from "jspdf"

export interface InstrumentCertificateData {
  id: string
  type: string
  typeFull: string
  issuer: string
  faceValue: string // pre-formatted, e.g. "€50,000,000"
  currency: string
  status: string
  rating: string
  purpose: string
  issuedDate: string
  expiryDate: string
  assignable: boolean
  monetizable: boolean
}

const BRAND = {
  name: "MCC Capital",
  tagline: "MCC Banking & Trade Platform",
  address: "Rue du Rhone 14, 1204 Geneva, Switzerland",
  gold: [245, 140, 0] as [number, number, number],
  ink: [17, 17, 17] as [number, number, number],
  slate: [110, 116, 128] as [number, number, number],
  line: [225, 227, 231] as [number, number, number],
}

function formatDate(value: string): string {
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return value
  return d.toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  })
}

export function generateInstrumentCertificate(data: InstrumentCertificateData): void {
  if (typeof window === "undefined") return

  const doc = new jsPDF({ unit: "pt", format: "a4" })
  const pageWidth = doc.internal.pageSize.getWidth()
  const pageHeight = doc.internal.pageSize.getHeight()
  const margin = 48
  const contentWidth = pageWidth - margin * 2

  // Outer decorative border
  doc.setDrawColor(...BRAND.gold)
  doc.setLineWidth(2)
  doc.rect(margin / 2, margin / 2, pageWidth - margin, pageHeight - margin)
  doc.setLineWidth(0.5)
  doc.rect(margin / 2 + 6, margin / 2 + 6, pageWidth - margin - 12, pageHeight - margin - 12)

  let y = margin + 28

  // Header
  doc.setTextColor(...BRAND.ink)
  doc.setFont("helvetica", "bold")
  doc.setFontSize(22)
  doc.text(BRAND.name, pageWidth / 2, y, { align: "center" })

  y += 18
  doc.setFont("helvetica", "normal")
  doc.setFontSize(10)
  doc.setTextColor(...BRAND.slate)
  doc.text(BRAND.tagline, pageWidth / 2, y, { align: "center" })

  y += 30
  doc.setDrawColor(...BRAND.gold)
  doc.setLineWidth(1)
  doc.line(margin + 60, y, pageWidth - margin - 60, y)

  y += 36
  doc.setTextColor(...BRAND.gold)
  doc.setFont("helvetica", "bold")
  doc.setFontSize(16)
  doc.text("CERTIFICATE OF BANK INSTRUMENT", pageWidth / 2, y, { align: "center" })

  y += 22
  doc.setTextColor(...BRAND.ink)
  doc.setFont("helvetica", "bold")
  doc.setFontSize(13)
  doc.text(data.typeFull, pageWidth / 2, y, { align: "center" })

  y += 16
  doc.setFont("helvetica", "normal")
  doc.setFontSize(10)
  doc.setTextColor(...BRAND.slate)
  doc.text(`Reference: ${data.id}`, pageWidth / 2, y, { align: "center" })

  // Face value highlight
  y += 40
  doc.setFillColor(255, 247, 237)
  doc.setDrawColor(...BRAND.line)
  doc.roundedRect(margin, y, contentWidth, 64, 6, 6, "FD")
  doc.setTextColor(...BRAND.slate)
  doc.setFont("helvetica", "normal")
  doc.setFontSize(9)
  doc.text("FACE VALUE", pageWidth / 2, y + 22, { align: "center" })
  doc.setTextColor(...BRAND.ink)
  doc.setFont("helvetica", "bold")
  doc.setFontSize(24)
  doc.text(data.faceValue, pageWidth / 2, y + 48, { align: "center" })

  // Details table
  y += 92
  const rows: [string, string][] = [
    ["Instrument Type", `${data.type} — ${data.typeFull}`],
    ["Issuing Bank", data.issuer],
    ["Credit Rating", data.rating],
    ["Purpose", data.purpose],
    ["Status", data.status.charAt(0).toUpperCase() + data.status.slice(1)],
    ["Issued Date", formatDate(data.issuedDate)],
    ["Expiry Date", formatDate(data.expiryDate)],
    ["Assignable", data.assignable ? "Yes" : "No"],
    ["Monetizable", data.monetizable ? "Yes" : "No"],
  ]

  doc.setFontSize(10)
  rows.forEach((row, i) => {
    const rowY = y + i * 26
    if (i % 2 === 0) {
      doc.setFillColor(250, 250, 251)
      doc.rect(margin, rowY - 16, contentWidth, 26, "F")
    }
    doc.setTextColor(...BRAND.slate)
    doc.setFont("helvetica", "normal")
    doc.text(row[0], margin + 12, rowY)
    doc.setTextColor(...BRAND.ink)
    doc.setFont("helvetica", "bold")
    doc.text(row[1], pageWidth - margin - 12, rowY, { align: "right" })
  })

  y += rows.length * 26 + 30
  doc.setDrawColor(...BRAND.line)
  doc.setLineWidth(0.5)
  doc.line(margin, y, pageWidth - margin, y)

  // Footer / authentication
  y += 28
  doc.setTextColor(...BRAND.slate)
  doc.setFont("helvetica", "normal")
  doc.setFontSize(8)
  const disclaimer =
    "This certificate is issued by MCC Capital as a record of the above bank instrument held on the MCC Banking & Trade Platform. It is generated electronically and is valid without signature. Verify authenticity through your relationship manager."
  const lines = doc.splitTextToSize(disclaimer, contentWidth)
  doc.text(lines, margin, y)

  // Signature line
  const sigY = pageHeight - margin - 36
  doc.setDrawColor(...BRAND.ink)
  doc.setLineWidth(0.5)
  doc.line(margin, sigY, margin + 180, sigY)
  doc.setTextColor(...BRAND.slate)
  doc.setFontSize(8)
  doc.text("Authorised Signatory — MCC Capital", margin, sigY + 14)

  doc.setTextColor(...BRAND.slate)
  doc.text(
    `Generated ${new Date().toLocaleString("en-GB")}`,
    pageWidth - margin,
    sigY + 14,
    { align: "right" },
  )

  doc.save(`MCC-Certificate-${data.id}.pdf`)
}
