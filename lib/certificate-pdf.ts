// Generates a professional, bank-style instrument certificate PDF entirely in
// the browser using jsPDF. Used for the "Download Certificate" action on the
// Bank Instruments page.

import { jsPDF } from "jspdf"
import type { CertificateType } from "@/lib/certificates-store"

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

// ===========================================================================
// Official account certificates (Good Standing, Endorsement / Bank Reference,
// Proof of Funds, Ownership). One professional, security-featured template that
// adapts its title, body and balance section to the requested certificate type.
// All figures come from the request's immutable verified snapshot — never demo
// values. Browser-only (jsPDF).
// ===========================================================================

const currencySymbols: Record<string, string> = {
  EUR: "€",
  USD: "$",
  GBP: "£",
  CHF: "CHF ",
  JPY: "¥",
  AUD: "A$",
  CAD: "C$",
  SGD: "S$",
  AED: "AED ",
}

function money(amount: number, currency: string): string {
  const symbol = currencySymbols[currency] || `${currency} `
  return `${symbol}${amount.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`
}

export interface AccountCertificateData {
  type: CertificateType
  reference: string
  verificationCode: string
  issuedDate: string // ISO
  version: number
  accountLabel: string
  purpose?: string
  addressee?: string

  // Certified party + banking (from the account's verified profile snapshot)
  holderName: string
  holderCompany?: string
  bankName?: string
  bankAddress?: string
  beneficiaryAddress?: string
  iban?: string
  bic?: string
  accountEmail?: string

  // Proof of Funds figures
  balances: { currency: string; amount: number }[]
  totalEur: number
  displayCurrency: string
}

const CERT_TITLE: Record<CertificateType, string> = {
  "good-standing": "CERTIFICATE OF GOOD STANDING",
  endorsement: "CERTIFICATE OF ENDORSEMENT",
  "proof-of-funds": "CERTIFICATE OF PROOF OF FUNDS",
  ownership: "CERTIFICATE OF OWNERSHIP",
}

const CERT_SUBTITLE: Record<CertificateType, string> = {
  "good-standing": "Confirmation of Active Account in Good Standing",
  endorsement: "Bank Reference Letter — Lettera di Referenza Bancaria",
  "proof-of-funds": "Verified Statement of Available Cleared Funds",
  ownership: "Confirmation of Legal & Beneficial Account Ownership",
}

// Build the body paragraphs for each certificate type from the snapshot data.
function certificateBody(data: AccountCertificateData): string[] {
  const who = data.holderName + (data.holderCompany && data.holderCompany !== data.holderName ? ` (${data.holderCompany})` : "")
  const acct = data.iban ? `account IBAN ${data.iban}` : "the account held with us"
  const bank = data.bankName ? `${data.bankName}${data.bankAddress ? `, ${data.bankAddress}` : ""}` : "our institution"

  switch (data.type) {
    case "good-standing":
      return [
        `This is to certify that ${who} maintains a banking relationship with MCC Capital, settled through ${bank}.`,
        `The above-named account holder operates ${acct}${data.bic ? ` (SWIFT/BIC ${data.bic})` : ""} which is active and in good standing as of the date of issuance.`,
        `The relationship has been conducted in a satisfactory manner and, to the best of our knowledge, the account holder has met all obligations to this institution. The account is not subject to any liens, encumbrances, blocks or adverse findings, and the holder remains fully compliant with our KYC and AML requirements.`,
        `This certificate is issued at the request of the account holder for the purpose of ${data.purpose || "their general business requirements"} and without any responsibility or liability on the part of MCC Capital or its correspondent banks.`,
      ]
    case "endorsement":
      return [
        `We are pleased to provide this banking reference in respect of ${who}, who maintains ${acct} with MCC Capital, settled through ${bank}.`,
        `The account holder has maintained their banking relationship with us in a manner that is entirely satisfactory. Their account has been operated within agreed arrangements and we have found the relationship to be sound, reliable and conducted in good faith.`,
        `We consider the account holder to be a reputable and trustworthy party, suitable to be entered into normal business and banking engagements of the size and nature consistent with their established activity.`,
        `This reference is furnished in confidence, at the request of the account holder, for the purpose of ${data.purpose || "their business introductions"}, and is given without any responsibility or liability whatsoever on the part of MCC Capital or its officers.`,
      ]
    case "proof-of-funds":
      return [
        `This is to certify that ${who} is the holder of ${acct}${data.bic ? ` (SWIFT/BIC ${data.bic})` : ""} maintained with MCC Capital and settled through ${bank}.`,
        `As of the date of issuance, the above account holds the cleared and unencumbered funds set out below, which are good, clean, of non-criminal origin and freely available to the account holder.`,
        `The funds are held free of any lien, encumbrance or third-party interest and are immediately available subject to the holder's lawful instructions. This confirmation is issued for the purpose of ${data.purpose || "proof of funds verification"}.`,
        `This certificate is issued at the request of the account holder, reflects the verified balance recorded on our books, and is given without any responsibility or liability on the part of MCC Capital or its correspondent banks.`,
      ]
    case "ownership":
      return [
        `This is to certify that ${who} is the sole legal and beneficial owner of ${acct}${data.bic ? ` (SWIFT/BIC ${data.bic})` : ""} maintained with MCC Capital and settled through ${bank}.`,
        `All funds and assets held within the said account belong exclusively to the named account holder. No other person or entity holds any legal or beneficial interest, lien, charge or claim over the account or its contents.`,
        `The account holder has full and unrestricted authority to operate, instruct and dispose of the account and the assets therein, subject only to applicable law and our standard terms.`,
        `This certificate is issued at the request of the account holder for the purpose of ${data.purpose || "confirmation of ownership"} and without any responsibility or liability on the part of MCC Capital.`,
      ]
  }
}

// Draws a circular official seal/stamp using vector primitives.
function drawSeal(doc: jsPDF, cx: number, cy: number, r: number) {
  doc.setDrawColor(...BRAND.gold)
  doc.setLineWidth(1.5)
  doc.circle(cx, cy, r)
  doc.setLineWidth(0.5)
  doc.circle(cx, cy, r - 5)
  doc.setTextColor(...BRAND.gold)
  doc.setFont("helvetica", "bold")
  doc.setFontSize(7)
  doc.text("MCC CAPITAL", cx, cy - 4, { align: "center" })
  doc.setFont("helvetica", "normal")
  doc.setFontSize(5.5)
  doc.text("GENEVA · SWITZERLAND", cx, cy + 3, { align: "center" })
  doc.setFontSize(5)
  doc.text("OFFICIAL SEAL", cx, cy + 10, { align: "center" })
}

export function generateAccountCertificate(data: AccountCertificateData): void {
  if (typeof window === "undefined") return

  const doc = new jsPDF({ unit: "pt", format: "a4" })
  const pageWidth = doc.internal.pageSize.getWidth()
  const pageHeight = doc.internal.pageSize.getHeight()
  const margin = 48
  const contentWidth = pageWidth - margin * 2

  // --- Watermark (diagonal repeated brand text) -----------------------------
  doc.setTextColor(247, 247, 247)
  doc.setFont("helvetica", "bold")
  doc.setFontSize(40)
  for (let row = 0; row < 9; row++) {
    for (let col = 0; col < 3; col++) {
      doc.text("MCC CAPITAL", 40 + col * 200, 120 + row * 90, { angle: 32 })
    }
  }

  // --- Decorative double border ---------------------------------------------
  doc.setDrawColor(...BRAND.gold)
  doc.setLineWidth(2)
  doc.rect(margin / 2, margin / 2, pageWidth - margin, pageHeight - margin)
  doc.setLineWidth(0.5)
  doc.rect(margin / 2 + 6, margin / 2 + 6, pageWidth - margin - 12, pageHeight - margin - 12)

  let y = margin + 26

  // --- Letterhead -----------------------------------------------------------
  doc.setTextColor(...BRAND.ink)
  doc.setFont("helvetica", "bold")
  doc.setFontSize(22)
  doc.text(BRAND.name, pageWidth / 2, y, { align: "center" })

  y += 16
  doc.setFont("helvetica", "normal")
  doc.setFontSize(9)
  doc.setTextColor(...BRAND.slate)
  doc.text(BRAND.tagline, pageWidth / 2, y, { align: "center" })
  y += 12
  doc.text(BRAND.address, pageWidth / 2, y, { align: "center" })

  y += 22
  doc.setDrawColor(...BRAND.gold)
  doc.setLineWidth(1)
  doc.line(margin + 60, y, pageWidth - margin - 60, y)

  // --- Title ----------------------------------------------------------------
  y += 30
  doc.setTextColor(...BRAND.gold)
  doc.setFont("helvetica", "bold")
  doc.setFontSize(17)
  doc.text(CERT_TITLE[data.type], pageWidth / 2, y, { align: "center" })

  y += 16
  doc.setTextColor(...BRAND.slate)
  doc.setFont("helvetica", "italic")
  doc.setFontSize(9.5)
  doc.text(CERT_SUBTITLE[data.type], pageWidth / 2, y, { align: "center" })

  y += 16
  doc.setFont("helvetica", "normal")
  doc.setFontSize(9)
  doc.setTextColor(...BRAND.ink)
  doc.text(`Reference: ${data.reference}`, pageWidth / 2, y, { align: "center" })
  y += 12
  doc.setTextColor(...BRAND.slate)
  doc.text(
    `Date of Issuance: ${formatDate(data.issuedDate)}${data.version > 1 ? `  ·  Revision ${data.version}` : ""}`,
    pageWidth / 2,
    y,
    { align: "center" },
  )

  // --- Addressee (reference letters / POF) ----------------------------------
  y += 26
  if (data.addressee && (data.type === "endorsement" || data.type === "proof-of-funds")) {
    doc.setTextColor(...BRAND.ink)
    doc.setFont("helvetica", "bold")
    doc.setFontSize(9.5)
    doc.text("To:", margin, y)
    doc.setFont("helvetica", "normal")
    doc.text(data.addressee, margin + 24, y)
    y += 18
  } else {
    doc.setTextColor(...BRAND.slate)
    doc.setFont("helvetica", "italic")
    doc.setFontSize(9.5)
    doc.text("To Whom It May Concern,", margin, y)
    y += 18
  }

  // --- Body -----------------------------------------------------------------
  doc.setTextColor(...BRAND.ink)
  doc.setFont("helvetica", "normal")
  doc.setFontSize(10)
  const paragraphs = certificateBody(data)
  paragraphs.forEach((p) => {
    const lines = doc.splitTextToSize(p, contentWidth)
    doc.text(lines, margin, y, { lineHeightFactor: 1.4 })
    y += lines.length * 13 + 8
  })

  // --- Proof of Funds balances box ------------------------------------------
  if (data.type === "proof-of-funds") {
    y += 2
    const boxH = 52 + Math.max(data.balances.length, 1) * 18
    doc.setFillColor(255, 247, 237)
    doc.setDrawColor(...BRAND.line)
    doc.roundedRect(margin, y, contentWidth, boxH, 6, 6, "FD")

    doc.setTextColor(...BRAND.slate)
    doc.setFont("helvetica", "normal")
    doc.setFontSize(8.5)
    doc.text("AVAILABLE CLEARED FUNDS", margin + 14, y + 18)

    let by = y + 36
    doc.setFontSize(10)
    if (data.balances.length === 0) {
      doc.setTextColor(...BRAND.ink)
      doc.text("No cleared balance recorded.", margin + 14, by)
    } else {
      data.balances.forEach((b) => {
        doc.setTextColor(...BRAND.slate)
        doc.setFont("helvetica", "normal")
        doc.text(`${b.currency} Account`, margin + 14, by)
        doc.setTextColor(...BRAND.ink)
        doc.setFont("helvetica", "bold")
        doc.text(money(b.amount, b.currency), pageWidth - margin - 14, by, { align: "right" })
        by += 18
      })
    }
    // Aggregate
    doc.setDrawColor(...BRAND.line)
    doc.setLineWidth(0.5)
    doc.line(margin + 14, by - 6, pageWidth - margin - 14, by - 6)
    doc.setTextColor(...BRAND.slate)
    doc.setFont("helvetica", "normal")
    doc.setFontSize(9)
    doc.text("Aggregate value (converted)", margin + 14, by + 8)
    doc.setTextColor(...BRAND.ink)
    doc.setFont("helvetica", "bold")
    doc.setFontSize(13)
    doc.text(money(data.totalEur, "EUR"), pageWidth - margin - 14, by + 9, { align: "right" })
    y += boxH + 16
  }

  // --- Account particulars table --------------------------------------------
  const rows: [string, string][] = [
    ["Account Holder", data.holderName || "—"],
    ...(data.holderCompany && data.holderCompany !== data.holderName
      ? ([["Entity", data.holderCompany]] as [string, string][])
      : []),
    ["Settlement Bank", data.bankName || "MCC Capital"],
    ...(data.bankAddress ? ([["Bank Address", data.bankAddress]] as [string, string][]) : []),
    ...(data.iban ? ([["IBAN", data.iban]] as [string, string][]) : []),
    ...(data.bic ? ([["BIC / SWIFT", data.bic]] as [string, string][]) : []),
    ["Account", data.accountLabel],
  ]

  doc.setFontSize(9.5)
  rows.forEach((row, i) => {
    const rowY = y + i * 20
    if (i % 2 === 0) {
      doc.setFillColor(250, 250, 251)
      doc.rect(margin, rowY - 13, contentWidth, 20, "F")
    }
    doc.setTextColor(...BRAND.slate)
    doc.setFont("helvetica", "normal")
    doc.text(row[0], margin + 12, rowY)
    doc.setTextColor(...BRAND.ink)
    doc.setFont("helvetica", "bold")
    doc.text(row[1], pageWidth - margin - 12, rowY, { align: "right" })
  })
  y += rows.length * 20 + 14

  // --- Signature + seal -----------------------------------------------------
  const sigY = Math.min(y + 30, pageHeight - margin - 96)
  doc.setDrawColor(...BRAND.ink)
  doc.setLineWidth(0.5)
  doc.line(margin, sigY, margin + 190, sigY)
  doc.setTextColor(...BRAND.ink)
  doc.setFont("helvetica", "bold")
  doc.setFontSize(9)
  doc.text("Authorised Signatory", margin, sigY + 14)
  doc.setFont("helvetica", "normal")
  doc.setFontSize(8)
  doc.setTextColor(...BRAND.slate)
  doc.text("MCC Capital — Compliance Office", margin, sigY + 26)

  drawSeal(doc, pageWidth - margin - 56, sigY + 2, 42)

  // --- Security footer ------------------------------------------------------
  const footY = pageHeight - margin - 30
  doc.setDrawColor(...BRAND.line)
  doc.setLineWidth(0.5)
  doc.line(margin, footY - 14, pageWidth - margin, footY - 14)
  doc.setTextColor(...BRAND.slate)
  doc.setFont("helvetica", "normal")
  doc.setFontSize(7)
  const security = `Security features: unique reference ${data.reference} · verification code ${data.verificationCode} · issued ${new Date().toLocaleString("en-GB")}. This document is electronically generated and watermarked; verify its authenticity by quoting the reference and verification code to your MCC Capital relationship manager.`
  const secLines = doc.splitTextToSize(security, contentWidth)
  doc.text(secLines, margin, footY)

  doc.save(`${data.reference}.pdf`)
}
