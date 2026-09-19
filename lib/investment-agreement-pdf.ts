// Generates the PRIVATE INVESTMENT AGREEMENT (Project Finance — Equity
// Participation Model) PDF for a project-funding application, faithfully
// adopting the approved MCC template (11 clauses + acceptance/signature blocks
// + recommended annex). The administrator generates this from a client's
// funding request BEFORE approval so the terms and both parties' signature
// blocks can be reviewed and executed.
//
// Runs in the browser (jsPDF) like every other PDF generator and is opened via
// the shared PDF viewer (usePdfViewer().show()).

import { jsPDF } from "jspdf"
import { BRAND, formatDate, makeDocRef, money, type GeneratedPdf } from "@/lib/pdf-core"
import { drawBrandMark } from "@/lib/pdf-logos"

export interface InvestmentAgreementInput {
  date?: Date
  // Parties — Investor (MCC) is fixed by the template.
  investorName: string
  investorAddress: string
  investorSignatory: string
  investorTitle: string
  // Client / Project Owner
  clientName: string
  clientJurisdiction: string
  clientAddress: string
  clientContact: string
  clientTitle: string
  clientCompany: string
  clientEmail: string
  // Project
  projectName: string
  sector: string
  // Financials
  currency: string
  investmentAmount: number
  equityPct: number
  equityAmount: number
  rangeMin: number
  rangeMax: number
  /** Upfront cash portion as a % of total equity, or null when set as a fixed
   *  amount (special conditions) — in which case only the amount is printed. */
  upfrontPct: number | null
  upfrontAmount: number
  /** Required equity-asset portion as a % of total equity, or null when set as
   *  a fixed amount — in which case only the amount is printed. */
  remainingPct: number | null
  remainingAmount: number
  fundingEntity: string
  roiLabel: string
  tenorLabel: string
  gracePeriod?: string
  /** Optional debt-facility note appended to Investment Terms. */
  facilityNote?: string
  governingLaw: string
}

const dash = (v: string | undefined | null) => (v && v.trim() ? v.trim() : "—")

// ---- integer-to-words (for the "amount in words" template field) ----------
const ONES = [
  "", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten",
  "eleven", "twelve", "thirteen", "fourteen", "fifteen", "sixteen", "seventeen", "eighteen", "nineteen",
]
const TENS = ["", "", "twenty", "thirty", "forty", "fifty", "sixty", "seventy", "eighty", "ninety"]
const SCALES = ["", "thousand", "million", "billion", "trillion"]

function threeToWords(n: number): string {
  const parts: string[] = []
  const h = Math.floor(n / 100)
  const r = n % 100
  if (h) parts.push(`${ONES[h]} hundred`)
  if (r) {
    if (r < 20) parts.push(ONES[r])
    else {
      const t = Math.floor(r / 10)
      const o = r % 10
      parts.push(o ? `${TENS[t]}-${ONES[o]}` : TENS[t])
    }
  }
  return parts.join(" ")
}

function intToWords(value: number): string {
  const n = Math.floor(Math.abs(value))
  if (n === 0) return "zero"
  const groups: number[] = []
  let rest = n
  while (rest > 0) {
    groups.push(rest % 1000)
    rest = Math.floor(rest / 1000)
  }
  if (groups.length > SCALES.length) return "" // beyond trillions — skip words
  const chunks: string[] = []
  for (let i = groups.length - 1; i >= 0; i--) {
    const g = groups[i]
    if (!g) continue
    chunks.push(SCALES[i] ? `${threeToWords(g)} ${SCALES[i]}` : threeToWords(g))
  }
  return chunks.join(" ")
}

const CURRENCY_WORDS: Record<string, string> = {
  USD: "US Dollars",
  EUR: "Euros",
  GBP: "Pounds Sterling",
  CHF: "Swiss Francs",
}

function amountInWords(amount: number, currency: string): string {
  const whole = Math.floor(Math.abs(amount))
  const words = intToWords(whole)
  if (!words) return ""
  const unit = CURRENCY_WORDS[currency] || currency
  const cents = Math.round((Math.abs(amount) - whole) * 100)
  const capital = words.charAt(0).toUpperCase() + words.slice(1)
  return cents > 0 ? `${capital} ${unit} and ${cents}/100` : `${capital} ${unit}`
}

export function generateInvestmentAgreementPdf(input: InvestmentAgreementInput): GeneratedPdf {
  const doc = new jsPDF({ unit: "pt", format: "a4" })
  const pageWidth = doc.internal.pageSize.getWidth()
  const pageHeight = doc.internal.pageSize.getHeight()
  const margin = 52
  const contentWidth = pageWidth - margin * 2
  const bottomLimit = pageHeight - 60

  const docRef = makeDocRef("PIA")
  const issue = input.date ?? new Date()
  const ccy = input.currency || "USD"

  let y = 0
  let pageNo = 0

  const drawFooter = () => {
    doc.setDrawColor(...BRAND.line)
    doc.setLineWidth(1)
    doc.line(margin, bottomLimit + 16, pageWidth - margin, bottomLimit + 16)
    doc.setFont("helvetica", "normal")
    doc.setFontSize(7.5)
    doc.setTextColor(...BRAND.slate)
    doc.text(`${input.investorName} · Private Investment Agreement · ${docRef}`, margin, bottomLimit + 30)
    doc.text("CONFIDENTIAL — FOR THE PARTIES ONLY", pageWidth - margin, bottomLimit + 30, { align: "right" })
    doc.text(`Page ${pageNo}`, pageWidth - margin, bottomLimit + 42, { align: "right" })
  }

  const drawHeaderBand = () => {
    doc.setFillColor(...BRAND.ink)
    doc.rect(0, 0, pageWidth, 44, "F")
    const markW = drawBrandMark(doc, "capital", margin, 7, 72, 30, { panel: true, radius: 4 })
    doc.setTextColor(...BRAND.white)
    doc.setFont("helvetica", "bold")
    doc.setFontSize(10)
    doc.text(input.investorName.toUpperCase(), margin + markW + 12, 26)
    doc.setTextColor(...BRAND.gold)
    doc.setFont("helvetica", "bold")
    doc.setFontSize(9)
    doc.text("PRIVATE INVESTMENT AGREEMENT", pageWidth - margin, 26, { align: "right" })
  }

  const newPage = () => {
    doc.addPage()
    pageNo += 1
    drawHeaderBand()
    drawFooter()
    y = 64
  }

  const ensureSpace = (needed: number) => {
    if (y + needed > bottomLimit) newPage()
  }

  const sectionTitle = (text: string) => {
    ensureSpace(34)
    y += 6
    doc.setFont("helvetica", "bold")
    doc.setFontSize(11.5)
    doc.setTextColor(...BRAND.ink)
    doc.text(text, margin, y)
    y += 8
    doc.setDrawColor(...BRAND.gold)
    doc.setLineWidth(1.5)
    doc.line(margin, y, margin + 30, y)
    y += 12
  }

  const paragraph = (
    text: string,
    opts?: { color?: [number, number, number]; size?: number; bold?: boolean; indent?: number },
  ) => {
    if (!text) return
    const indent = opts?.indent ?? 0
    doc.setFont("helvetica", opts?.bold ? "bold" : "normal")
    doc.setFontSize(opts?.size ?? 9.5)
    doc.setTextColor(...(opts?.color ?? BRAND.ink))
    const lines = doc.splitTextToSize(text, contentWidth - indent) as string[]
    lines.forEach((ln) => {
      ensureSpace(14)
      doc.text(ln, margin + indent, y)
      y += 14
    })
    y += 4
  }

  const bullets = (items: string[]) => {
    doc.setFont("helvetica", "normal")
    doc.setFontSize(9.5)
    doc.setTextColor(...BRAND.ink)
    items.forEach((item) => {
      const lines = doc.splitTextToSize(item, contentWidth - 16) as string[]
      ensureSpace(lines.length * 13 + 2)
      doc.setFillColor(...BRAND.gold)
      doc.circle(margin + 3, y - 3, 1.6, "F")
      lines.forEach((ln, i) => doc.text(ln, margin + 14, y + i * 13))
      y += lines.length * 13 + 2
    })
    y += 4
  }

  const kvRows = (rows: Array<[string, string]>) => {
    const labelW = 170
    const valueX = margin + labelW + 10
    const valueW = contentWidth - labelW - 10
    const lineHeight = 13
    rows.forEach(([label, value]) => {
      const vLines = doc.splitTextToSize(value || "—", valueW) as string[]
      const rowH = Math.max(lineHeight, vLines.length * lineHeight) + 6
      ensureSpace(rowH)
      doc.setFont("helvetica", "bold")
      doc.setFontSize(9)
      doc.setTextColor(...BRAND.slate)
      doc.text(label, margin, y)
      doc.setFont("helvetica", "normal")
      doc.setFontSize(9.5)
      doc.setTextColor(...BRAND.ink)
      vLines.forEach((ln, i) => doc.text(ln, valueX, y + i * lineHeight))
      y += rowH
    })
    y += 4
  }

  // ===== Title page header =====
  pageNo = 1
  drawHeaderBand()
  drawFooter()
  y = 70

  doc.setFont("helvetica", "bold")
  doc.setFontSize(19)
  doc.setTextColor(...BRAND.ink)
  doc.text("PRIVATE INVESTMENT AGREEMENT", margin, y)
  y += 20
  doc.setFont("helvetica", "normal")
  doc.setFontSize(10)
  doc.setTextColor(...BRAND.slate)
  doc.text("Project Finance — Equity Participation Model", margin, y)
  y += 18

  // Meta box
  doc.setDrawColor(...BRAND.line)
  doc.setFillColor(...BRAND.light)
  const metaH = 58
  doc.rect(margin, y, contentWidth, metaH, "FD")
  const colW = contentWidth / 3
  const metas: Array<[string, string]> = [
    ["Document Ref", docRef],
    ["Date", formatDate(issue)],
    ["Classification", "CONFIDENTIAL"],
  ]
  metas.forEach(([label, value], i) => {
    const cx = margin + i * colW + 12
    doc.setFont("helvetica", "bold")
    doc.setFontSize(7.5)
    doc.setTextColor(...BRAND.slate)
    doc.text(label.toUpperCase(), cx, y + 22)
    doc.setFont("helvetica", "bold")
    doc.setFontSize(9.5)
    doc.setTextColor(...BRAND.ink)
    doc.text(value, cx, y + 38)
  })
  y += metaH + 14

  paragraph(`This Agreement is made on ${formatDate(issue)}, between:`, { size: 9.5 })

  paragraph("1. MCC HOLDING SA", { bold: true, size: 10 })
  paragraph(
    `A company incorporated under the laws of Switzerland, with registered office at ${dash(
      input.investorAddress,
    )} (hereinafter the "Investor" or "MCC").`,
    { color: BRAND.slate, size: 9.5, indent: 12 },
  )
  paragraph(`2. ${dash(input.clientName)}`, { bold: true, size: 10 })
  paragraph(
    `Registered under the laws of ${dash(input.clientJurisdiction)}, with registered address at ${dash(
      input.clientAddress,
    )} (hereinafter the "Client" or "Project Owner").`,
    { color: BRAND.slate, size: 9.5, indent: 12 },
  )

  // ===== 1. Purpose =====
  sectionTitle("1. Purpose of Agreement")
  paragraph(
    "This Agreement defines the terms under which MCC shall provide project financing through equity participation for the Client's project.",
  )
  const words = amountInWords(input.investmentAmount, ccy)
  paragraph(
    `The Client has formally requested funding for the project "${dash(input.projectName)}"${
      dash(input.sector) !== "—" ? ` (${input.sector})` : ""
    } in the amount of: ${money(input.investmentAmount, ccy)}${words ? ` (${words})` : ""}.`,
    { bold: true },
  )

  // ===== 2. Investment Structure =====
  sectionTitle("2. Investment Structure")
  paragraph(
    "MCC operates under a progressive equity-based financing model, not as a lending institution. The applicable equity participation, computed at submission, is:",
  )
  kvRows([
    [
      "Investment range",
      input.rangeMin > 0 || input.rangeMax > 0
        ? `${money(input.rangeMin, ccy)} – ${money(input.rangeMax, ccy)}`
        : money(input.investmentAmount, ccy),
    ],
    ["Equity %", `${(input.equityPct * 100).toFixed(2)}%`],
    ["Equity amount", money(input.equityAmount, ccy)],
  ])
  paragraph(`Total Equity Participation Required: ${money(input.equityAmount, ccy)}.`, { bold: true })

  // ===== 3. Equity Contribution Terms =====
  sectionTitle("3. Equity Contribution Terms")
  paragraph("3.1 Upfront Commitment", { bold: true })
  paragraph(
    input.upfrontPct != null
      ? `The Client shall provide an initial down-payment equal to ${input.upfrontPct}% of the total equity — ${money(
          input.upfrontAmount,
          ccy,
        )} — payable via bank wire transfer. This payment constitutes proof of commitment, activation of the structuring process, and allocation of internal resources.`
      : `The Client shall provide an initial cash down-payment of ${money(
          input.upfrontAmount,
          ccy,
        )}, payable via bank wire transfer. This payment constitutes proof of commitment, activation of the structuring process, and allocation of internal resources.`,
  )
  paragraph("3.2 Remaining Equity (Asset-Based Contribution)", { bold: true })
  paragraph(
    input.remainingPct != null
      ? `The remaining ${input.remainingPct}% of the equity (${money(
          input.remainingAmount,
          ccy,
        )}) may be covered through tangible or financial assets, including real estate, land holdings, project-owned infrastructure or equipment, and bank instruments (subject to approval).`
      : `A further ${money(
          input.remainingAmount,
          ccy,
        )} of the equity may be covered through tangible or financial assets, including real estate, land holdings, project-owned infrastructure or equipment, and bank instruments (subject to approval).`,
  )
  paragraph("Security condition — all such assets shall be:", { bold: true, size: 9 })
  bullets([
    "Formally pledged",
    "Legally documented",
    "Blocked in favour of MCC Holding SA",
  ])
  paragraph("This serves as collateralization and risk alignment within the investment structure.", {
    color: BRAND.slate,
    size: 9,
  })

  // ===== 4. Nature of Relationship =====
  sectionTitle("4. Nature of Relationship")
  bullets([
    "MCC acts strictly as a private investor.",
    "This Agreement does not constitute a loan.",
    "No debt instruments or lending mechanisms are involved.",
    "No insurance structures (including PPI) are used.",
  ])

  // ===== 5. Investment Terms =====
  sectionTitle("5. Investment Terms")
  kvRows([
    ["Funding Entity", dash(input.fundingEntity)],
    ["Investment Amount", money(input.investmentAmount, ccy)],
    ["Annual Return (ROI)", dash(input.roiLabel)],
    ["Payment Obligation", "ROI payable yearly to MCC"],
    ["Tenor", dash(input.tenorLabel)],
    ["Grace Period", dash(input.gracePeriod)],
  ])
  if (input.facilityNote) {
    paragraph(input.facilityNote, { color: BRAND.slate, size: 9 })
  }

  // ===== 6. Fund Management & Disbursement =====
  sectionTitle("6. Fund Management & Disbursement")
  paragraph("For compliance and control purposes:")
  bullets([
    "Funds are not transferred directly to the Client.",
    "MCC manages capital deployment internally.",
    "Payments are executed directly toward suppliers, contractors, and project-related expenses.",
  ])
  paragraph("All disbursements are invoice-based, verified, and approved within MCC's compliance framework.", {
    color: BRAND.slate,
    size: 9,
  })

  // ===== 7. Management & Control =====
  sectionTitle("7. Management & Control")
  bullets([
    "The Client retains full operational control of the project.",
    "MCC does not interfere in daily management.",
    "MCC maintains oversight strictly for financial compliance, risk control, and capital allocation.",
  ])

  // ===== 8. Conditions Precedent =====
  sectionTitle("8. Conditions Precedent")
  paragraph("This Agreement is subject to:")
  bullets([
    "Successful completion of Due Diligence.",
    "Validation by MCC's external legal counsel.",
    "Acceptance of the asset collateral structure.",
    "Receipt of the upfront equity contribution.",
  ])

  // ===== 9. Confidentiality =====
  sectionTitle("9. Confidentiality")
  paragraph(
    "Both parties agree to maintain strict confidentiality regarding the financial structure, project details, and investment terms. Any breach may result in immediate termination.",
  )

  // ===== 10. Governing Law =====
  sectionTitle("10. Governing Law")
  paragraph(
    `This Agreement shall be governed exclusively by ${dash(
      input.governingLaw,
    )}. Any dispute shall be subject to the jurisdiction of Geneva, Switzerland.`,
  )

  // ===== 11. Acceptance & signatures =====
  sectionTitle("11. Acceptance")
  paragraph("By signing below, both parties acknowledge and accept the terms of this Agreement.")
  ensureSpace(200)
  y += 6
  const halfW = contentWidth / 2 - 10
  const blockTop = y

  const drawSignBlock = (
    x: number,
    heading: string,
    prefilled: Array<[string, string]>,
    lineLabels: string[],
  ) => {
    doc.setFont("helvetica", "bold")
    doc.setFontSize(9)
    doc.setTextColor(...BRAND.ink)
    doc.text(heading, x, blockTop)
    let ly = blockTop + 20
    prefilled.forEach(([label, value]) => {
      doc.setFont("helvetica", "bold")
      doc.setFontSize(8.5)
      doc.setTextColor(...BRAND.slate)
      doc.text(`${label}:`, x, ly)
      doc.setFont("helvetica", "normal")
      doc.setTextColor(...BRAND.ink)
      const vLines = doc.splitTextToSize(value || "—", halfW - 46) as string[]
      vLines.forEach((ln, i) => doc.text(ln, x + 46, ly + i * 11))
      ly += Math.max(14, vLines.length * 11 + 3)
    })
    ly += 12
    doc.setFont("helvetica", "normal")
    doc.setFontSize(9)
    doc.setTextColor(...BRAND.slate)
    lineLabels.forEach((label) => {
      doc.setDrawColor(...BRAND.line)
      doc.setLineWidth(0.75)
      doc.line(x, ly, x + halfW, ly)
      doc.text(label, x, ly + 12)
      ly += 40
    })
  }

  drawSignBlock(
    margin,
    "FOR MCC HOLDING SA",
    [
      ["Name", dash(input.investorSignatory)],
      ["Title", dash(input.investorTitle)],
    ],
    ["Signature", "Date"],
  )
  drawSignBlock(
    margin + contentWidth / 2 + 10,
    "FOR THE CLIENT",
    [
      ["Name", dash(input.clientContact)],
      ["Title", dash(input.clientTitle)],
      ["Company", dash(input.clientCompany)],
    ],
    ["Signature", "Date"],
  )
  y = blockTop + 210

  // ===== Annex =====
  sectionTitle("Annex (Recommended)")
  bullets([
    "Asset Declaration Form",
    "Bank Wire Instructions",
    "Due Diligence Checklist",
    "Project Summary",
  ])

  const safeName = dash(input.clientName) === "—" ? "Client" : input.clientName.trim().replace(/[^\w.\- ]+/g, "").replace(/\s+/g, "-").slice(0, 40)
  return {
    doc,
    filename: `Private-Investment-Agreement-${safeName}-${docRef}.pdf`,
    title: `Private Investment Agreement — ${dash(input.clientName) === "—" ? input.investorName : input.clientName.trim()}`,
  }
}
