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
  investorRegNo?: string
  investorOperativeAddress?: string
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
  // ---- AES funding-scenario model (defaults from the MCC Capital AES sheet) ----
  deploymentLabel?: string
  earlyRedemptionLabel?: string
  dueDiligenceBody?: string
  bankingBeneficiary?: string
  bankingInstitution?: string
  bankingIban?: string
  bankingBic?: string
}

// ---- AES tiered equity model (MCC Capital AES product sheet) ---------------
// Progressive, tranche-based: each band's rate applies only to the portion of
// the facility that falls within that band; total equity is the sum of tranche
// obligations (NOT a flat rate).
const AES_TIERS: Array<{ upper: number; rate: number; label: string }> = [
  { upper: 10_000_000, rate: 0.05, label: "1M – 10M" },
  { upper: 25_000_000, rate: 0.04, label: "10M – 25M" },
  { upper: 100_000_000, rate: 0.03, label: "25M – 100M" },
  { upper: 500_000_000, rate: 0.02, label: "100M – 500M" },
  { upper: Number.POSITIVE_INFINITY, rate: 0.01, label: "Above 500M" },
]

interface AesTrancheRow {
  band: string
  rate: number
  amountInBand: number
  equity: number
}

function computeAesEquity(facility: number): { rows: AesTrancheRow[]; total: number } {
  const rows: AesTrancheRow[] = []
  let total = 0
  let lower = 0
  for (const tier of AES_TIERS) {
    if (facility <= lower) break
    const capped = Math.min(facility, tier.upper)
    const amountInBand = capped - lower
    if (amountInBand > 0) {
      const equity = amountInBand * tier.rate
      total += equity
      rows.push({ band: tier.label, rate: tier.rate, amountInBand, equity })
    }
    lower = tier.upper
  }
  return { rows, total }
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

  const table = (headers: string[], rows: string[][], widths: number[]) => {
    const rowH = 15
    ensureSpace(rowH * (rows.length + 1) + 12)
    const startY = y - 11
    doc.setFillColor(...BRAND.ink)
    doc.rect(margin, startY, contentWidth, rowH, "F")
    doc.setFont("helvetica", "bold")
    doc.setFontSize(8)
    doc.setTextColor(...BRAND.white)
    let cx = margin + 6
    headers.forEach((h, i) => {
      doc.text(h, cx, y)
      cx += widths[i]
    })
    y += rowH
    doc.setFont("helvetica", "normal")
    doc.setFontSize(8.5)
    doc.setTextColor(...BRAND.ink)
    rows.forEach((r, ri) => {
      if (ri % 2 === 1) {
        doc.setFillColor(...BRAND.light)
        doc.rect(margin, y - 11, contentWidth, rowH, "F")
      }
      cx = margin + 6
      r.forEach((c, i) => {
        doc.text(c, cx, y)
        cx += widths[i]
      })
      y += rowH
    })
    doc.setDrawColor(...BRAND.line)
    doc.setLineWidth(0.75)
    doc.rect(margin, startY, contentWidth, rowH * (rows.length + 1))
    y += 12
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

  paragraph(`1. ${input.investorName.toUpperCase()}`, { bold: true, size: 10 })
  paragraph(
    `MCC Holding S.A. (trading under the brand names MCC Capital and MCC \u00AE\u2122), incorporated in Switzerland under registration no. ${
      input.investorRegNo || "CHE-110.027.662"
    }, with registered address at ${dash(input.investorAddress)}, and operative address at ${
      input.investorOperativeAddress || "Rue du Rhône 14, 1204 Geneva, Switzerland"
    } (hereinafter the "Investor" or "MCC").`,
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

  // ===== 2. Investment Structure — Adaptive Equity System (AES) =====
  sectionTitle("2. Investment Structure — Adaptive Equity System (AES)")
  paragraph(
    "MCC operates under the proprietary Adaptive Equity System (AES): a progressive, tranche-based equity participation model — not a lending facility. Equity is computed progressively across financing tranches and aggregated; each tranche carries its own rate, applied only to the portion of the facility falling within that band.",
  )
  table(
    ["Financing tranche", "Equity rate", "Accepted instruments"],
    [
      [`${ccy} 1M – 10M`, "5.00%", "Assets / BG / SBLC / MTN / Cash"],
      [`${ccy} 10M – 25M`, "4.00%", "Assets / BG / SBLC / MTN / Cash"],
      [`${ccy} 25M – 100M`, "3.00%", "Assets / BG / SBLC / MTN / Cash"],
      [`${ccy} 100M – 500M`, "2.00%", "Assets / BG / SBLC / MTN / Cash"],
      [`Above ${ccy} 500M`, "1.00%", "Assets / BG / SBLC / MTN / Cash"],
    ],
    [110, 80, 300],
  )
  const aes = computeAesEquity(input.investmentAmount)
  if (aes.rows.length) {
    paragraph(
      `Progressive computation applied to the requested facility of ${money(input.investmentAmount, ccy)}:`,
      { size: 9 },
    )
    table(
      ["Tranche", "Rate", "Amount in band", "Tranche equity"],
      aes.rows.map((r) => [
        `${ccy} ${r.band}`,
        `${(r.rate * 100).toFixed(2)}%`,
        money(r.amountInBand, ccy),
        money(r.equity, ccy),
      ]),
      [130, 55, 150, 156],
    )
    paragraph(`AES aggregate equity requirement on the facility: ${money(aes.total, ccy)}.`, {
      bold: true,
      size: 9,
    })
  }
  kvRows([
    ["Equity % (agreed)", `${(input.equityPct * 100).toFixed(2)}%`],
    ["Equity amount (agreed)", money(input.equityAmount, ccy)],
  ])
  paragraph(
    `Total Equity Participation Required (as agreed for this transaction): ${money(input.equityAmount, ccy)}.`,
    { bold: true },
  )

  // ===== 3. Equity Contribution Terms =====
  sectionTitle("3. Equity Contribution Terms")
  paragraph("3.1 Upfront Commitment", { bold: true })
  paragraph(
    input.upfrontPct != null
      ? `The Client shall provide an initial down-payment equal to ${input.upfrontPct}% of the project facility (${money(
          input.investmentAmount,
          ccy,
        )}) — ${money(
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
      ? `A further ${input.remainingPct}% of the project facility (${money(
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
  paragraph("3.3 Mandatory Upfront Cash Commitment", { bold: true })
  paragraph(
    `Within the total equity obligation, a defined liquid cash component is required prior to funding activation — serving as commitment validation, a risk-alignment signal, and the activation trigger. It is bounded at a minimum of 0.10% of the total financing facility and a maximum of 10% of the total equity obligation, with the applicable rate set by the independent due-diligence risk score (scale 0–10).${
      input.investmentAmount > 0 && input.investmentAmount <= 1_000_000
        ? ` As the facility is at or below ${money(1_000_000, ccy)}, a fixed cash commitment of EUR 2,860 applies, payable upon execution of this Agreement.`
        : ""
    }`,
  )
  paragraph(
    "All cash commitments are remitted by bank wire transfer and confirmed via MT103 SWIFT receipt within 24 hours of issuance.",
    { color: BRAND.slate, size: 9 },
  )

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
    ["Cost of Capital / Annual Return", dash(input.roiLabel)],
    ["Payment Obligation", "Payable annually to MCC"],
    ["Financing Tenor", dash(input.tenorLabel)],
    ["Capital Deployment", input.deploymentLabel || "Approximately 5 business days post-activation"],
    [
      "Early Redemption Premium",
      input.earlyRedemptionLabel || "70% of the residual investment balance on early exit",
    ],
    ["Grace Period", dash(input.gracePeriod)],
  ])
  paragraph(
    "The stated cost of capital is the sole cost to the project. No management fees, arrangement fees, or performance levies are imposed by MCC outside the terms of this Agreement, and the structure carries no tax liability on the financing arrangement as constituted.",
    { color: BRAND.slate, size: 9 },
  )
  if (input.facilityNote) {
    paragraph(input.facilityNote, { color: BRAND.slate, size: 9 })
  }

  // ===== 6. Fund Management & Disbursement =====
  sectionTitle("6. Fund Management & Controlled Disbursement")
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
  paragraph(
    "MCC administers its institutional treasury through a dedicated corporate banking relationship. All equity cash receipts and controlled disbursements are processed through regulated banking channels subject to full AML and KYC compliance:",
    { size: 9 },
  )
  kvRows([
    ["Beneficiary", input.bankingBeneficiary || "MCC Capital, Rue du Rhône 14, 1204 Geneva, Switzerland"],
    ["Banking institution", input.bankingInstitution || "HSBC — Geneva, Switzerland"],
    ["IBAN", input.bankingIban || "CH89 0023 0LYJ Q5P6 1QKW H"],
    ["BIC / SWIFT", input.bankingBic || "5P61QKWH"],
    ["Proof of payment", "MT103 SWIFT confirmation required within 24 hours of wire execution"],
  ])

  // ===== 7. Management & Control =====
  sectionTitle("7. Management & Control")
  bullets([
    "The Client retains full operational control of the project.",
    "MCC does not interfere in daily management.",
    "MCC maintains oversight strictly for financial compliance, risk control, and capital allocation.",
  ])

  // ===== 8. Due Diligence & Risk Scoring =====
  sectionTitle("8. Due Diligence & Risk Scoring")
  paragraph(
    `All AES-governed transactions are subject to independent external due diligence conducted by ${dash(
      input.dueDiligenceBody,
    )}, discharged at no cost to the Client. The scope encompasses legal-entity verification, financial statement analysis, compliance screening, counterparty credibility, and project viability review.`,
  )
  paragraph(
    "The process produces a formal risk score on a scale of 0 to 10, which directly determines the applicable upfront cash commitment rate. All equity-asset verifications (tangible assets and bank instruments) are conducted as part of this mandatary process.",
    { color: BRAND.slate, size: 9 },
  )

  // ===== 9. AES Operational Lifecycle =====
  sectionTitle("9. AES Operational Lifecycle (8 Stages)")
  bullets([
    "01 — Project Submission: the Client submits the formal project dossier for preliminary assessment.",
    "02 — External Due Diligence: independent legal, financial, and compliance review.",
    "03 — Risk Scoring & Approval: a formal risk score (0–10) is issued and approval confirmed in writing.",
    "04 — AES Equity Calculation: the tiered equity matrix is applied progressively to the requested facility.",
    "05 — Equity Structuring: the Client designates the equity composition (assets, bank instruments and/or cash).",
    "06 — Upfront Cash Commitment: the mandatory liquid commitment is remitted (min 0.1% of facility; max 10% of equity).",
    "07 — Funding Activation: capital is sourced via the MCC institutional credit line and deployed within approximately 5 business days.",
    "08 — Controlled Disbursement: funds are released exclusively to verified suppliers, contractors, and project beneficiaries.",
  ])

  // ===== 10. Investor & Project Principal Protections =====
  sectionTitle("10. Investor & Project Principal Protections")
  bullets([
    "Identity Confidentiality: the Client's identity is not disclosed to the lending institution; external banking is conducted under the MCC fiduciary umbrella.",
    "Asset Non-Encumbrance: beyond the structural security expressly agreed in clause 3.2, MCC takes no ownership of and places no additional charge on the Client's equity assets, which remain under the Client's ownership and operational control throughout the lifecycle.",
    "No Hidden Fees: the stated annual cost of capital is the sole cost to the project.",
    "Zero Tax Liability: the structure is engineered to carry no tax liability on the financing arrangement as constituted.",
    "Early Redemption: a Client electing to terminate or refinance prior to tenor remits 70% of the residual investment balance as an early redemption settlement.",
    "Dispute Resolution: all disputes are subject to the exclusive jurisdiction of the courts of the Canton of Geneva, Switzerland.",
  ])

  // ===== 11. Conditions Precedent =====
  sectionTitle("11. Conditions Precedent")
  paragraph("This Agreement is subject to:")
  bullets([
    "Successful completion of Due Diligence.",
    "Validation by MCC's external legal counsel.",
    "Acceptance of the asset collateral structure.",
    "Receipt of the upfront equity contribution.",
  ])

  // ===== 12. Confidentiality =====
  sectionTitle("12. Confidentiality")
  paragraph(
    "Both parties agree to maintain strict confidentiality regarding the financial structure, project details, and investment terms. Any breach may result in immediate termination.",
  )

  // ===== 13. Governing Law =====
  sectionTitle("13. Governing Law")
  paragraph(
    `This Agreement shall be governed exclusively by ${dash(
      input.governingLaw,
    )}. Any dispute shall be subject to the jurisdiction of Geneva, Switzerland.`,
  )

  // ===== 14. Acceptance & signatures =====
  sectionTitle("14. Acceptance")
  paragraph("By signing below, both parties acknowledge and accept the terms of this Agreement.")
  paragraph(
    "TIME IS OF THE ESSENCE IN THIS INVESTMENT AGREEMENT. IN WITNESS WHEREOF, the parties have duly affixed their signatures under hand and seal as of the Execution Date first written above.",
    { size: 9 },
  )
  ensureSpace(210)
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
    "FUND MANAGER (THE INVESTOR)",
    [
      ["Name", dash(input.investorSignatory)],
      ["Title", dash(input.investorTitle)],
      ["On behalf of", "MCC Holding S.A. (MCC Capital \u00A9)"],
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
