// ===========================================================================
// Full operative bank-instrument "hard copy" documents.
//
// Generates the formal, multi-page instrument text that a bank actually issues
// — on issuing-bank letterhead, with the real operative undertaking verbiage
// per ICC standards:
//   - SBLC : ISP98 (ICC Pub. 590) + UCP 600 (ICC Pub. 600)
//   - BG   : URDG 758 (ICC Pub. 758) demand guarantee
//   - MTN  : bearer global note under a EMTN programme (English law)
//
// `buildInstrumentDocument()` is a pure function returning structured content,
// shared by the on-screen preview (React) and the PDF generator so both render
// identical wording. `generateInstrumentDocumentPdf()` is browser-only (jsPDF).
// ===========================================================================

import { jsPDF } from "jspdf"

export interface DocField {
  label: string
  value: string
}

export interface DocClause {
  heading: string
  text: string
}

export interface DocParty {
  /** Role label, e.g. "Issuing Bank", "Beneficiary", "Applicant". */
  role: string
  name: string
  lines: string[]
  bic?: string
}

export interface InstrumentDocumentContent {
  kind: "SBLC" | "BG" | "MTN"
  /** Document title, e.g. "IRREVOCABLE STANDBY LETTER OF CREDIT". */
  title: string
  subtitle: string
  reference: string
  issuerName: string
  issuerAddress: string
  issuerCountry: string
  issuerBic: string
  placeAndDate: string
  amountFigures: string
  amountWords: string
  parties: DocParty[]
  keyTerms: DocField[]
  preamble: string
  clauses: DocClause[]
  rulesClause: string
  governingLaw: string
  deliveryNote: string
  signatories: { name: string; title: string }[]
}

export interface InstrumentLike {
  id: string
  type: string // "SBLC" | "BG" | "MTN"
  typeFull: string
  issuer: string
  faceValue: number
  currency: string
  issuedDate: string
  expiryDate: string
  rating: string
  purpose: string
  assignable: boolean
  monetizable: boolean
  isin?: string
  commonCode?: string
  cusip?: string
  serialNumber?: string
  issuerBic?: string
  issuerAddress?: string
  issuerCountry?: string
  placeOfIssue?: string
  governingLaw?: string
  deliveryMethod?: string
  form?: string
}

export interface BeneficiaryParty {
  name: string
  company?: string
  country?: string
}

const CURRENCY_NAMES: Record<string, string> = {
  EUR: "EURO",
  USD: "US DOLLARS",
  GBP: "POUNDS STERLING",
  CHF: "SWISS FRANCS",
  AED: "UAE DIRHAM",
  SGD: "SINGAPORE DOLLARS",
  JPY: "JAPANESE YEN",
}

const CURRENCY_SYMBOLS: Record<string, string> = {
  EUR: "€",
  USD: "$",
  GBP: "£",
  CHF: "CHF ",
  AED: "AED ",
  SGD: "S$",
  JPY: "¥",
}

function formatMoney(amount: number, currency: string): string {
  const symbol = CURRENCY_SYMBOLS[currency] ?? `${currency} `
  return `${symbol}${amount.toLocaleString("en-US")}`
}

function formatLongDate(value: string): string {
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return value
  return d.toLocaleDateString("en-GB", { day: "2-digit", month: "long", year: "numeric" })
}

// --- Integer to words (supports up to hundreds of billions) ----------------
const ONES = [
  "",
  "ONE",
  "TWO",
  "THREE",
  "FOUR",
  "FIVE",
  "SIX",
  "SEVEN",
  "EIGHT",
  "NINE",
  "TEN",
  "ELEVEN",
  "TWELVE",
  "THIRTEEN",
  "FOURTEEN",
  "FIFTEEN",
  "SIXTEEN",
  "SEVENTEEN",
  "EIGHTEEN",
  "NINETEEN",
]
const TENS = ["", "", "TWENTY", "THIRTY", "FORTY", "FIFTY", "SIXTY", "SEVENTY", "EIGHTY", "NINETY"]

function threeDigitsToWords(n: number): string {
  let str = ""
  const hundreds = Math.floor(n / 100)
  const rest = n % 100
  if (hundreds) str += `${ONES[hundreds]} HUNDRED`
  if (rest) {
    if (str) str += " "
    if (rest < 20) {
      str += ONES[rest]
    } else {
      str += TENS[Math.floor(rest / 10)]
      if (rest % 10) str += `-${ONES[rest % 10]}`
    }
  }
  return str
}

function integerToWords(num: number): string {
  if (num === 0) return "ZERO"
  const scales = ["", " THOUSAND", " MILLION", " BILLION", " TRILLION"]
  const groups: number[] = []
  let n = Math.floor(num)
  while (n > 0) {
    groups.push(n % 1000)
    n = Math.floor(n / 1000)
  }
  const parts: string[] = []
  for (let i = groups.length - 1; i >= 0; i--) {
    if (groups[i] === 0) continue
    parts.push(threeDigitsToWords(groups[i]) + scales[i])
  }
  return parts.join(" ").trim()
}

function amountInWords(amount: number, currency: string): string {
  const currencyWord = CURRENCY_NAMES[currency] ?? currency
  return `${currencyWord} ${integerToWords(amount)} ONLY`
}

/**
 * Builds the full operative instrument document content for a given instrument.
 * Pure — safe to call on server or client.
 */
export function buildInstrumentDocument(
  inst: InstrumentLike,
  beneficiary: BeneficiaryParty,
): InstrumentDocumentContent {
  const kind = (inst.type?.toUpperCase() as "SBLC" | "BG" | "MTN") || "SBLC"
  const issuerName = inst.issuer || "Issuing Bank"
  const issuerAddress = inst.issuerAddress || "—"
  const issuerCountry = inst.issuerCountry || ""
  const issuerBic = inst.issuerBic || "—"
  const reference = inst.serialNumber || inst.id
  const amountFigures = formatMoney(inst.faceValue, inst.currency)
  const amountWords = amountInWords(inst.faceValue, inst.currency)
  const place = inst.placeOfIssue || issuerCountry || "London, United Kingdom"
  const placeAndDate = `Issued at ${place} on ${formatLongDate(inst.issuedDate)}`
  const governingLaw =
    inst.governingLaw ||
    (kind === "MTN" ? "English Law" : kind === "BG" ? "URDG 758 / English Law" : "ISP98 / UCP 600")

  const beneficiaryName = beneficiary.company || beneficiary.name || "The Beneficiary"
  const beneficiaryLines = [beneficiary.name, beneficiary.country].filter(Boolean) as string[]

  const issuerParty: DocParty = {
    role: kind === "MTN" ? "Issuer" : kind === "BG" ? "Guarantor" : "Issuing Bank",
    name: issuerName,
    lines: [issuerAddress, issuerCountry].filter(Boolean) as string[],
    bic: issuerBic,
  }

  const applicantParty: DocParty = {
    role: "Applicant / Instructing Party",
    name: "MCC Capital Group Inc.",
    lines: ["Rue du Rhône 14, 1204 Geneva", "Switzerland"],
    bic: "MCCGCHGG",
  }

  const beneficiaryParty: DocParty = {
    role: "Beneficiary",
    name: beneficiaryName,
    lines: beneficiaryLines.length ? beneficiaryLines : ["—"],
  }

  const advisingParty: DocParty = {
    role: "Advising / Confirming Bank",
    name: "Barclays Bank PLC",
    lines: ["1 Churchill Place, London E14 5HP", "United Kingdom"],
    bic: "BARCGB22XXX",
  }

  const deliveryNote =
    inst.deliveryMethod && /MT7|SWIFT/i.test(inst.deliveryMethod)
      ? `This instrument is operative and has been delivered bank-to-bank by authenticated SWIFT ${inst.deliveryMethod.replace(/.*\b(MT\d{3})\b.*/i, "$1") || "MT760"}.`
      : "This instrument is operative upon issuance and delivered to the advising bank for authentication."

  const signatories = [
    { name: "Authorised Signatory", title: `For and on behalf of ${issuerName}` },
    { name: "Authorised Signatory", title: `For and on behalf of ${issuerName}` },
  ]

  if (kind === "MTN") {
    return {
      kind,
      title: "MEDIUM TERM NOTE",
      subtitle: "Permanent Bearer Global Note — issued under a Euro Medium Term Note Programme",
      reference,
      issuerName,
      issuerAddress,
      issuerCountry,
      issuerBic,
      placeAndDate,
      amountFigures,
      amountWords,
      parties: [issuerParty, beneficiaryParty],
      keyTerms: [
        { label: "Series / Reference No.", value: reference },
        { label: "ISIN", value: inst.isin || "—" },
        { label: "Common Code", value: inst.commonCode || "—" },
        ...(inst.cusip ? [{ label: "CUSIP", value: inst.cusip }] : []),
        { label: "Aggregate Nominal Amount", value: amountFigures },
        { label: "Specified Currency", value: inst.currency },
        { label: "Issue Date", value: formatLongDate(inst.issuedDate) },
        { label: "Maturity Date", value: formatLongDate(inst.expiryDate) },
        { label: "Form", value: inst.form || "Bearer Global Note" },
        { label: "Status", value: "Senior, unsecured, unsubordinated" },
        { label: "Denomination", value: amountFigures },
        { label: "Rating", value: inst.rating },
        { label: "Governing Law", value: governingLaw },
      ],
      preamble: `This Global Note certifies that ${issuerName} (the "Issuer") is indebted and hereby unconditionally and irrevocably promises to pay to the bearer the Aggregate Nominal Amount of ${amountWords} (${amountFigures}) on the Maturity Date specified above, together with interest accrued thereon, subject to and in accordance with the Terms and Conditions set out below and the Issuer's Euro Medium Term Note Programme.`,
      clauses: [
        {
          heading: "1. Promise to Pay",
          text: `The Issuer unconditionally and irrevocably promises to pay to the bearer of this Note the principal sum of ${amountFigures} on the Maturity Date, and to pay interest on the said principal sum in accordance with the Conditions until the principal is repaid in full.`,
        },
        {
          heading: "2. Status of the Notes",
          text: `This Note constitutes a direct, general, unconditional, unsubordinated and (subject to the negative pledge) unsecured obligation of the Issuer and ranks pari passu, without any preference among themselves, with all other present and future outstanding unsecured and unsubordinated obligations of the Issuer, save for such obligations as may be preferred by mandatory provisions of law.`,
        },
        {
          heading: "3. Form, Denomination and Title",
          text: `The Notes are issued in bearer form in the Specified Denomination. Title to the Notes passes by delivery. This permanent Global Note is held by a common depositary on behalf of Euroclear Bank SA/NV and Clearstream Banking S.A. and is exchangeable for definitive Notes only in the limited circumstances set out in the Conditions.`,
        },
        {
          heading: "4. Interest",
          text: `The Notes bear interest from the Issue Date at the rate specified in the applicable Final Terms, payable in arrear on each Interest Payment Date. Each Note will cease to bear interest from the date of redemption unless payment of principal is improperly withheld or refused.`,
        },
        {
          heading: "5. Settlement and Transfer",
          text: `Interests in this Global Note are transferable in book-entry form through the records of Euroclear and Clearstream under Common Code ${inst.commonCode || "—"} and ISIN ${inst.isin || "—"}, in accordance with the rules and procedures of the relevant clearing system.`,
        },
        {
          heading: "6. Redemption",
          text: `Unless previously redeemed or purchased and cancelled, the Notes will be redeemed by the Issuer at their principal amount on the Maturity Date.`,
        },
      ],
      rulesClause: `This Note is issued under the Issuer's Euro Medium Term Note Programme and is subject to the Terms and Conditions thereof. This Note is governed by, and shall be construed in accordance with, English law.`,
      governingLaw,
      deliveryNote: "This Note is constituted by this Global Note and held within the international clearing systems.",
      signatories,
    }
  }

  if (kind === "BG") {
    const partial = inst.assignable ? "permitted" : "not permitted"
    return {
      kind,
      title: "IRREVOCABLE DEMAND GUARANTEE",
      subtitle: "Bank Guarantee subject to URDG 758 (ICC Publication No. 758)",
      reference,
      issuerName,
      issuerAddress,
      issuerCountry,
      issuerBic,
      placeAndDate,
      amountFigures,
      amountWords,
      parties: [issuerParty, applicantParty, beneficiaryParty],
      keyTerms: [
        { label: "Guarantee No.", value: reference },
        { label: "ISIN", value: inst.isin || "—" },
        { label: "Guaranteed Amount", value: amountFigures },
        { label: "Currency", value: inst.currency },
        { label: "Date of Issue", value: formatLongDate(inst.issuedDate) },
        { label: "Expiry Date", value: formatLongDate(inst.expiryDate) },
        { label: "Underlying Purpose", value: inst.purpose },
        { label: "Assignment of Proceeds", value: partial },
        { label: "Governing Rules", value: "URDG 758" },
        { label: "Governing Law", value: governingLaw },
      ],
      preamble: `At the request of the Applicant, we, ${issuerName}, ${issuerAddress} (the "Guarantor"), hereby issue this irrevocable Demand Guarantee No. ${reference} in favour of ${beneficiaryName} (the "Beneficiary") in respect of the underlying relationship described above.`,
      clauses: [
        {
          heading: "1. Guarantee Undertaking",
          text: `We, the Guarantor, hereby irrevocably and unconditionally undertake to pay to the Beneficiary any sum or sums not exceeding in aggregate ${amountWords} (${amountFigures}) (the "Guaranteed Amount") upon receipt of the Beneficiary's first written demand for payment complying with the terms of this Guarantee.`,
        },
        {
          heading: "2. Requirements of a Complying Demand",
          text: `A demand for payment under this Guarantee must be in writing and must be accompanied by the Beneficiary's signed statement indicating that the Applicant is in breach of its obligations under the underlying relationship and the respect in which the Applicant is in breach. The demand and statement must be presented at our counters at the address stated above on or before the Expiry Date.`,
        },
        {
          heading: "3. Reduction and Payment",
          text: `The Guaranteed Amount shall be reduced by any amount paid by us under this Guarantee. Payment shall be made in the Specified Currency to the account designated by the Beneficiary, free and clear of, and without deduction for, any present or future taxes or charges.`,
        },
        {
          heading: "4. Expiry",
          text: `This Guarantee shall expire at our counters on ${formatLongDate(inst.expiryDate)} (the "Expiry Date"). Any demand must be received by us on or before the Expiry Date, after which our liability hereunder shall cease and become null and void whether or not this Guarantee document is returned to us.`,
        },
        {
          heading: "5. Assignment and Transfer",
          text: `This Guarantee is ${partial === "permitted" ? "" : "not "}assignable. The Beneficiary ${partial === "permitted" ? "may assign any proceeds to which it may be or may become entitled under this Guarantee" : "may not transfer this Guarantee, but proceeds may be assigned to the extent permitted by applicable law"}.`,
        },
        {
          heading: "6. Charges",
          text: `All charges of the Guarantor in connection with the issuance of this Guarantee are for the account of the Applicant. All charges of any other bank are for the account of the Beneficiary.`,
        },
      ],
      rulesClause: `This Guarantee is subject to the Uniform Rules for Demand Guarantees (URDG), 2010 Revision, ICC Publication No. 758. Save as otherwise expressly stated herein, the URDG 758 shall apply.`,
      governingLaw,
      deliveryNote,
      signatories,
    }
  }

  // Default: SBLC
  const partialDrawings = inst.assignable ? "permitted" : "not permitted"
  return {
    kind: "SBLC",
    title: "IRREVOCABLE STANDBY LETTER OF CREDIT",
    subtitle: "Standby Letter of Credit subject to ISP98 (ICC Pub. 590) and UCP 600 (ICC Pub. 600)",
    reference,
    issuerName,
    issuerAddress,
    issuerCountry,
    issuerBic,
    placeAndDate,
    amountFigures,
    amountWords,
    parties: [issuerParty, applicantParty, beneficiaryParty, advisingParty],
    keyTerms: [
      { label: "Credit No.", value: reference },
      { label: "ISIN", value: inst.isin || "—" },
      { label: "Credit Amount", value: amountFigures },
      { label: "Currency", value: inst.currency },
      { label: "Date of Issue", value: formatLongDate(inst.issuedDate) },
      { label: "Date and Place of Expiry", value: `${formatLongDate(inst.expiryDate)} at our counters` },
      { label: "Available With / By", value: `${issuerName} by payment at sight` },
      { label: "Partial Drawings", value: partialDrawings },
      { label: "Transferable / Assignable", value: inst.assignable ? "Yes" : "No" },
      { label: "Confirmation", value: "Without (may be added by advising bank)" },
      { label: "Governing Rules", value: "ISP98 + UCP 600" },
    ],
    preamble: `We, ${issuerName}, ${issuerAddress} (the "Issuing Bank"), hereby issue our irrevocable Standby Letter of Credit No. ${reference} in favour of ${beneficiaryName} (the "Beneficiary") for an aggregate amount not exceeding ${amountWords} (${amountFigures}) (the "Credit"), available with ourselves by payment at sight.`,
    clauses: [
      {
        heading: "1. Undertaking to Honour",
        text: `We irrevocably undertake to honour any complying presentation by payment at sight of the amount demanded, not exceeding the Credit amount, upon receipt at our counters of the Beneficiary's signed and dated demand for payment stating that the amount claimed is due and owing to the Beneficiary.`,
      },
      {
        heading: "2. Documents Required for Presentation",
        text: `Presentation under this Credit shall comprise: (a) the Beneficiary's signed demand for payment quoting the Credit number; and (b) the Beneficiary's signed statement that the Applicant has failed to meet its obligations. Documents may be presented in paper form at our counters or by authenticated SWIFT message to our address above.`,
      },
      {
        heading: "3. Partial and Multiple Drawings",
        text: `Partial and multiple drawings are ${partialDrawings} under this Credit, provided that the aggregate of all drawings shall not exceed the Credit amount.`,
      },
      {
        heading: "4. Transfer and Assignment",
        text: `This Credit is ${inst.assignable ? "transferable and assignable in whole or in part upon our endorsement" : "not transferable, but the Beneficiary may assign any proceeds to which it is entitled hereunder"}, in accordance with applicable law and the rules to which this Credit is subject.`,
      },
      {
        heading: "5. Charges",
        text: `All charges of the Issuing Bank are for the account of the Applicant. All charges of the advising and/or any other bank are for the account of the Beneficiary.`,
      },
      {
        heading: "6. Expiry",
        text: `This Credit expires at our counters on ${formatLongDate(inst.expiryDate)}. Demands for payment must be received by us on or before the date of expiry. This Credit shall thereafter become null and void.`,
      },
    ],
    rulesClause: `Except so far as otherwise expressly stated, this Standby Letter of Credit is subject to the International Standby Practices 1998 (ISP98), International Chamber of Commerce Publication No. 590, and, to the extent not inconsistent therewith, to the Uniform Customs and Practice for Documentary Credits, 2007 Revision, ICC Publication No. 600 (UCP 600).`,
    governingLaw,
    deliveryNote,
    signatories,
  }
}

// ---------------------------------------------------------------------------
// PDF generation (browser-only, jsPDF)
// ---------------------------------------------------------------------------

const BRAND = {
  registrar: "MCC Capital — MCC Banking & Trade Platform",
  ink: [17, 17, 17] as [number, number, number],
  slate: [110, 116, 128] as [number, number, number],
  line: [205, 208, 214] as [number, number, number],
  navy: [23, 37, 70] as [number, number, number],
  gold: [176, 132, 38] as [number, number, number],
  watermark: [243, 244, 246] as [number, number, number],
}

export function generateInstrumentDocumentPdf(content: InstrumentDocumentContent): void {
  if (typeof window === "undefined") return

  const doc = new jsPDF({ unit: "pt", format: "a4" })
  const pageWidth = doc.internal.pageSize.getWidth()
  const pageHeight = doc.internal.pageSize.getHeight()
  const margin = 56
  const contentWidth = pageWidth - margin * 2
  const bottomLimit = pageHeight - 64
  let y = 0
  let page = 1

  const drawWatermark = () => {
    doc.setTextColor(...BRAND.watermark)
    doc.setFont("helvetica", "bold")
    doc.setFontSize(78)
    // diagonal watermark
    doc.text(content.kind, pageWidth / 2, pageHeight / 2 + 120, { align: "center", angle: 32 })
  }

  const drawPageFrame = () => {
    drawWatermark()
    doc.setDrawColor(...BRAND.navy)
    doc.setLineWidth(1.4)
    doc.rect(margin / 2, margin / 2, pageWidth - margin, pageHeight - margin)
    doc.setLineWidth(0.4)
    doc.setDrawColor(...BRAND.gold)
    doc.rect(margin / 2 + 5, margin / 2 + 5, pageWidth - margin - 10, pageHeight - margin - 10)
    // footer
    doc.setFont("helvetica", "normal")
    doc.setFontSize(7.5)
    doc.setTextColor(...BRAND.slate)
    doc.text(
      `Registered & held via ${BRAND.registrar}`,
      margin,
      pageHeight - 40,
    )
    doc.text(`Ref ${content.reference}`, pageWidth - margin, pageHeight - 40, { align: "right" })
  }

  const newPage = () => {
    doc.addPage()
    page += 1
    drawPageFrame()
    y = margin + 18
    doc.setTextColor(...BRAND.slate)
    doc.setFont("helvetica", "italic")
    doc.setFontSize(8)
    doc.text(`${content.title} — continued`, margin, y)
    y += 18
  }

  const ensure = (needed: number) => {
    if (y + needed > bottomLimit) newPage()
  }

  const paragraph = (text: string, opts?: { size?: number; bold?: boolean; gap?: number; color?: [number, number, number] }) => {
    const size = opts?.size ?? 9.5
    doc.setFont("helvetica", opts?.bold ? "bold" : "normal")
    doc.setFontSize(size)
    doc.setTextColor(...(opts?.color ?? BRAND.ink))
    const lines = doc.splitTextToSize(text, contentWidth) as string[]
    const lineH = size * 1.45
    for (const line of lines) {
      ensure(lineH)
      doc.text(line, margin, y)
      y += lineH
    }
    y += opts?.gap ?? 6
  }

  // ---- Page 1 frame + letterhead ----
  drawPageFrame()
  y = margin + 26

  doc.setTextColor(...BRAND.navy)
  doc.setFont("helvetica", "bold")
  doc.setFontSize(17)
  doc.text(content.issuerName, pageWidth / 2, y, { align: "center" })
  y += 15
  doc.setFont("helvetica", "normal")
  doc.setFontSize(8.5)
  doc.setTextColor(...BRAND.slate)
  const addr = [content.issuerAddress, content.issuerCountry].filter(Boolean).join(", ")
  if (addr) {
    doc.text(addr, pageWidth / 2, y, { align: "center" })
    y += 11
  }
  doc.text(`SWIFT/BIC: ${content.issuerBic}`, pageWidth / 2, y, { align: "center" })
  y += 16

  doc.setDrawColor(...BRAND.gold)
  doc.setLineWidth(1)
  doc.line(margin + 40, y, pageWidth - margin - 40, y)
  y += 22

  doc.setTextColor(...BRAND.ink)
  doc.setFont("helvetica", "bold")
  doc.setFontSize(14)
  const titleLines = doc.splitTextToSize(content.title, contentWidth) as string[]
  for (const line of titleLines) {
    doc.text(line, pageWidth / 2, y, { align: "center" })
    y += 17
  }
  doc.setFont("helvetica", "normal")
  doc.setFontSize(8.5)
  doc.setTextColor(...BRAND.slate)
  const subLines = doc.splitTextToSize(content.subtitle, contentWidth) as string[]
  for (const line of subLines) {
    doc.text(line, pageWidth / 2, y, { align: "center" })
    y += 11
  }
  y += 4
  doc.setTextColor(...BRAND.ink)
  doc.setFont("helvetica", "bold")
  doc.setFontSize(9.5)
  doc.text(content.placeAndDate, pageWidth / 2, y, { align: "center" })
  y += 22

  // ---- Parties ----
  paragraph("PARTIES", { bold: true, size: 10, gap: 4, color: BRAND.navy })
  for (const party of content.parties) {
    ensure(46)
    doc.setFont("helvetica", "bold")
    doc.setFontSize(8.5)
    doc.setTextColor(...BRAND.slate)
    doc.text(party.role.toUpperCase(), margin, y)
    y += 12
    doc.setFont("helvetica", "bold")
    doc.setFontSize(9.5)
    doc.setTextColor(...BRAND.ink)
    doc.text(party.name, margin, y)
    y += 12
    doc.setFont("helvetica", "normal")
    doc.setFontSize(9)
    doc.setTextColor(...BRAND.slate)
    for (const line of party.lines) {
      doc.text(line, margin, y)
      y += 11
    }
    if (party.bic) {
      doc.text(`SWIFT/BIC: ${party.bic}`, margin, y)
      y += 11
    }
    y += 6
  }
  y += 4

  // ---- Key terms table ----
  ensure(40)
  paragraph("KEY TERMS", { bold: true, size: 10, gap: 6, color: BRAND.navy })
  const rowH = 18
  const labelX = margin + 8
  const valueX = pageWidth - margin - 8
  content.keyTerms.forEach((term, i) => {
    ensure(rowH)
    if (i % 2 === 0) {
      doc.setFillColor(248, 249, 251)
      doc.rect(margin, y - 12, contentWidth, rowH, "F")
    }
    doc.setFont("helvetica", "normal")
    doc.setFontSize(9)
    doc.setTextColor(...BRAND.slate)
    doc.text(term.label, labelX, y)
    doc.setFont("helvetica", "bold")
    doc.setTextColor(...BRAND.ink)
    doc.text(term.value, valueX, y, { align: "right" })
    y += rowH
  })
  y += 14

  // ---- Operative preamble ----
  ensure(30)
  paragraph("OPERATIVE TEXT", { bold: true, size: 10, gap: 6, color: BRAND.navy })
  paragraph(content.preamble, { gap: 10 })

  // ---- Clauses ----
  for (const clause of content.clauses) {
    ensure(28)
    paragraph(clause.heading, { bold: true, size: 9.5, gap: 3 })
    paragraph(clause.text, { gap: 9 })
  }

  // ---- Rules ----
  ensure(30)
  paragraph("APPLICABLE RULES", { bold: true, size: 10, gap: 6, color: BRAND.navy })
  paragraph(content.rulesClause, { gap: 8 })
  paragraph(`Governing Law: ${content.governingLaw}.`, { gap: 6 })
  paragraph(content.deliveryNote, { size: 8.5, color: BRAND.slate, gap: 14 })

  // ---- Signatures ----
  ensure(90)
  doc.setDrawColor(...BRAND.line)
  doc.setLineWidth(0.5)
  doc.line(margin, y, pageWidth - margin, y)
  y += 24
  const colWidth = contentWidth / 2
  content.signatories.forEach((sig, i) => {
    const x = margin + i * colWidth
    doc.setDrawColor(...BRAND.ink)
    doc.setLineWidth(0.6)
    doc.line(x, y, x + colWidth - 40, y)
    doc.setFont("helvetica", "bold")
    doc.setFontSize(9)
    doc.setTextColor(...BRAND.ink)
    doc.text(sig.name, x, y + 14)
    doc.setFont("helvetica", "normal")
    doc.setFontSize(8)
    doc.setTextColor(...BRAND.slate)
    doc.text(sig.title, x, y + 26)
  })
  y += 44
  doc.setFontSize(7.5)
  doc.setTextColor(...BRAND.slate)
  doc.text(
    `This document is generated electronically by ${BRAND.registrar} and is valid as an operative instrument copy. Verify authenticity by quoting reference ${content.reference} to your relationship manager. Generated ${new Date().toLocaleString("en-GB")}.`,
    margin,
    y,
    { maxWidth: contentWidth },
  )

  doc.save(`MCC-${content.kind}-${content.reference}.pdf`)
}
