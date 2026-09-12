// Generates the full professional document set that carries a commodity deal
// from ICPO through to execution/performance, in the same NAFTAhub commodity
// house style as the Full Corporate Offer (lib/fco-pdf.ts):
//
//   ICPO  → Irrevocable Corporate Purchase Order (buyer → seller)
//   FCO   → Full Corporate Offer (reuses generateFcoPdf via dealToFcoInput)
//   SPA   → Sales & Purchase Agreement — working draft
//   POP   → Proof of Product — DRAFT TEMPLATE (seller)   [watermarked]
//   POF   → Proof of Funds — DRAFT TEMPLATE (buyer's bank) [watermarked]
//   EXEC  → Execution & Performance record
//
// COMPLIANCE GUARDRAIL (mirrors the FCO): every issuable document enshrines the
// same anti-advance-fee spine — no payment is due and no bank account is
// disclosed before a signed SPA; any performance deposit and the fixed
// due-diligence cost-recovery amount are terms of that SPA and are credited in
// full; inspection and title transfer precede MT103 payment; no upfront trading
// fee is ever payable by the buyer. POP/POF are produced only as clearly
// watermarked DRAFT TEMPLATES — never a platform-issued instrument — and are
// separate from the real evidence uploaded under the POP/POF modules.
//
// Runs in the browser (jsPDF) like every other generator and is opened via the
// shared PDF viewer (usePdfViewer().show()).

import { jsPDF } from "jspdf"
import { BRAND, formatDate, makeDocRef, money, type GeneratedPdf } from "@/lib/pdf-core"
import { drawBrandMark, BRAND_LABELS, type PdfBrand } from "@/lib/pdf-logos"
import { generateFcoPdf, type FcoInput } from "@/lib/fco-pdf"

// Canonical MCC Oil & Gas seller identity — single source of truth, also
// imported by the commodity page so the seller coordinates can never drift.
export const MCC_OIL_GAS_SELLER = {
  name: "MCC Oil & Gas",
  address: "Rue du Rhône 8, 1204 Geneva, Switzerland",
  email: "sales@mccoilgas.com",
}

// Payment model imposed by the SELLER (never taken from the buyer's LOI/ICPO):
// a 2% commitment deposit, then 100% by SWIFT MT103 at delivery after
// independent inspection, against which the buyer withdraws the product.
export const SELLER_PAYMENT_INSTRUMENT =
  "Buyer remits a 2% commitment deposit; 100% of the cargo value is paid by SWIFT MT103 telegraphic transfer at destination after independent inspection (SGS Full POP), against which the Buyer withdraws the product. The 2% deposit is credited in full against the final invoice."

// The structural subset of a CommodityDeal these generators consume. A full
// CommodityDeal is assignable to this (all fields optional), so the page passes
// the deal directly.
export interface DealDocInput {
  id: string
  uetr?: string
  title?: string
  category?: string
  tradeStructure?: string
  commodity?: string
  quantity?: string
  approxValue?: number
  currency?: string
  buyerName?: string
  sellerName?: string
  sendingBank?: string
  sendingBankBic?: string
  receivingBank?: string
  receivingBankBic?: string
  instrumentType?: string
  originCountry?: string
  destinationCountry?: string
  mt103Ref?: string
  mt202Ref?: string
  mt799Ref?: string
  notes?: string
  vessel?: { name?: string; imo?: string; flag?: string; location?: string } | null
  stage?: string
  status?: string
  submittedAt?: string
}

type RGB = [number, number, number]

const dash = (v: string | number | undefined | null): string => {
  if (v == null) return "—"
  const s = String(v).trim()
  return s ? s : "—"
}

const valueStr = (deal: DealDocInput): string =>
  deal.approxValue != null && Number.isFinite(deal.approxValue)
    ? money(deal.approxValue, deal.currency || "USD")
    : "—"

// Compliance clauses shared by every issuable document — the same anti-advance-
// fee spine as the FCO (see the file header).
const COMPLIANCE = {
  payment:
    "No payment is due and no bank account is disclosed before a Sales & Purchase Agreement (SPA) is signed by both parties. Any performance deposit and the fixed due-diligence cost-recovery amount become due only as terms of the signed SPA, and both are credited in full against the final invoice.",
  inspection:
    "Quantity and quality are verified by an independent inspector (SGS or agreed equivalent) at the destination before full payment. The Buyer may contact the inspector directly to confirm the Full Proof of Product before remitting payment.",
  title:
    "The full cargo value is paid by SWIFT MT103 after issuance of the Full Proof of Product; legal title passes to the Buyer only upon written confirmation of cleared funds. Inspection and title transfer precede payment, and no upfront trading fee is payable by the Buyer.",
  nonBinding:
    "This document is a draft / offer and does not constitute a binding commitment until a mutual Sales & Purchase Agreement is executed by both parties.",
}

interface DocMeta {
  docTitle: string
  refPrefix: string
  footerLabel: string
  /** Draws the diagonal DRAFT watermark on every page. */
  watermark?: boolean
}

/** The drawing API handed to each document's render callback. */
interface DocApi {
  ref: string
  sectionTitle: (text: string) => void
  paragraph: (text: string, opts?: { color?: RGB; size?: number; bold?: boolean }) => void
  kvRows: (rows: Array<[string, string]>) => void
  bullets: (items: string[]) => void
  noticeBox: (title: string, body: string, tone?: "warn" | "info") => void
  signatures: (left: string, right: string) => void
  spacer: (n?: number) => void
}

const BRAND_KEY: PdfBrand = "naftahub"

// Shared layout engine — mirrors the FCO's header band, gold-rule section
// titles, wrapping paragraphs, label/value rows and Geneva footer so the whole
// ICPO→Execution set is visually identical to the existing FCO.
function buildDocument(meta: DocMeta, render: (api: DocApi) => void): GeneratedPdf {
  const doc = new jsPDF({ unit: "pt", format: "a4" })
  const pageWidth = doc.internal.pageSize.getWidth()
  const pageHeight = doc.internal.pageSize.getHeight()
  const margin = 52
  const contentWidth = pageWidth - margin * 2
  const bottomLimit = pageHeight - 60
  const docRef = makeDocRef(meta.refPrefix)
  const brandName = BRAND_LABELS[BRAND_KEY].name

  let y = 0
  let pageNo = 0

  const drawWatermark = () => {
    if (!meta.watermark) return
    doc.setTextColor(232, 234, 238)
    doc.setFont("helvetica", "bold")
    doc.setFontSize(96)
    doc.text("DRAFT", pageWidth / 2, pageHeight / 2 + 30, { align: "center", angle: 38 })
  }

  const drawFooter = () => {
    doc.setDrawColor(...BRAND.line)
    doc.setLineWidth(1)
    doc.line(margin, bottomLimit + 16, pageWidth - margin, bottomLimit + 16)
    doc.setFont("helvetica", "normal")
    doc.setFontSize(7.5)
    doc.setTextColor(...BRAND.slate)
    doc.text(`${brandName} · ${meta.footerLabel} · ${docRef}`, margin, bottomLimit + 30)
    doc.text("CONFIDENTIAL — FOR ADDRESSEE ONLY", pageWidth - margin, bottomLimit + 30, { align: "right" })
    doc.text(`Page ${pageNo}`, pageWidth - margin, bottomLimit + 42, { align: "right" })
  }

  const drawHeaderBand = () => {
    doc.setFillColor(...BRAND.ink)
    doc.rect(0, 0, pageWidth, 44, "F")
    const markW = drawBrandMark(doc, BRAND_KEY, margin, 7, 72, 30, { panel: true, radius: 4 })
    doc.setTextColor(...BRAND.white)
    doc.setFont("helvetica", "bold")
    doc.setFontSize(10)
    doc.text(brandName.toUpperCase(), margin + markW + 12, 26)
    doc.setTextColor(...BRAND.gold)
    doc.setFont("helvetica", "bold")
    doc.setFontSize(9)
    doc.text(meta.docTitle, pageWidth - margin, 26, { align: "right" })
  }

  const newPage = () => {
    doc.addPage()
    pageNo += 1
    drawWatermark()
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
    doc.setFontSize(12)
    doc.setTextColor(...BRAND.ink)
    doc.text(text, margin, y)
    y += 8
    doc.setDrawColor(...BRAND.gold)
    doc.setLineWidth(1.5)
    doc.line(margin, y, margin + 30, y)
    y += 12
  }

  const paragraph = (text: string, opts?: { color?: RGB; size?: number; bold?: boolean }) => {
    if (!text) return
    doc.setFont("helvetica", opts?.bold ? "bold" : "normal")
    doc.setFontSize(opts?.size ?? 9.5)
    doc.setTextColor(...(opts?.color ?? BRAND.ink))
    const lines = doc.splitTextToSize(text, contentWidth) as string[]
    lines.forEach((ln) => {
      ensureSpace(14)
      doc.text(ln, margin, y)
      y += 14
    })
    y += 4
  }

  const kvRows = (rows: Array<[string, string]>) => {
    const labelW = 150
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

  const bullets = (items: string[]) => {
    items.forEach((it) => {
      const lines = doc.splitTextToSize(it, contentWidth - 16) as string[]
      ensureSpace(lines.length * 13 + 3)
      doc.setFillColor(...BRAND.gold)
      doc.circle(margin + 3, y - 3.5, 1.6, "F")
      doc.setFont("helvetica", "normal")
      doc.setFontSize(9.5)
      doc.setTextColor(...BRAND.ink)
      lines.forEach((ln, i) => doc.text(ln, margin + 12, y + i * 13))
      y += lines.length * 13 + 3
    })
    y += 3
  }

  const noticeBox = (title: string, body: string, tone: "warn" | "info" = "info") => {
    const border = tone === "warn" ? BRAND.red : BRAND.gold
    const bodyLines = doc.splitTextToSize(body, contentWidth - 24) as string[]
    const h = 20 + bodyLines.length * 12 + 8
    ensureSpace(h + 8)
    doc.setFillColor(...BRAND.light)
    doc.setDrawColor(...border)
    doc.setLineWidth(1)
    doc.roundedRect(margin, y, contentWidth, h, 4, 4, "FD")
    doc.setFont("helvetica", "bold")
    doc.setFontSize(8.5)
    doc.setTextColor(...border)
    doc.text(title, margin + 12, y + 15)
    doc.setFont("helvetica", "normal")
    doc.setFontSize(8.5)
    doc.setTextColor(...BRAND.ink)
    bodyLines.forEach((ln, i) => doc.text(ln, margin + 12, y + 29 + i * 12))
    y += h + 10
  }

  const signatures = (left: string, right: string) => {
    ensureSpace(70)
    y += 22
    const colW = (contentWidth - 30) / 2
    const lineY = y + 20
    doc.setDrawColor(...BRAND.slate)
    doc.setLineWidth(0.8)
    doc.line(margin, lineY, margin + colW, lineY)
    doc.line(margin + colW + 30, lineY, margin + colW + 30 + colW, lineY)
    doc.setFont("helvetica", "bold")
    doc.setFontSize(8.5)
    doc.setTextColor(...BRAND.ink)
    doc.text(left, margin, lineY + 14)
    doc.text(right, margin + colW + 30, lineY + 14)
    doc.setFont("helvetica", "normal")
    doc.setFontSize(7.5)
    doc.setTextColor(...BRAND.slate)
    doc.text("Authorized signature / Name / Title / Date", margin, lineY + 25)
    doc.text("Authorized signature / Name / Title / Date", margin + colW + 30, lineY + 25)
    y = lineY + 40
  }

  const spacer = (n = 6) => {
    y += n
  }

  newPage()
  render({ ref: docRef, sectionTitle, paragraph, kvRows, bullets, noticeBox, signatures, spacer })

  return { doc, filename: `NAFTAhub-${meta.refPrefix}-${docRef}.pdf`, title: meta.docTitle }
}

// Common derived party/commodity rows reused across documents.
function commodityRows(deal: DealDocInput): Array<[string, string]> {
  return [
    ["Commodity / Grade", dash(deal.commodity)],
    ["Quantity", dash(deal.quantity)],
    ["Delivery term", dash(deal.tradeStructure)],
    ["Origin", dash(deal.originCountry)],
    ["Destination", dash(deal.destinationCountry)],
    ["Total cargo value", valueStr(deal)],
    ["Currency", dash(deal.currency)],
  ]
}

// ---------------------------------------------------------------------------
// 1. ICPO — Irrevocable Corporate Purchase Order (issued by the Buyer)
// ---------------------------------------------------------------------------
export function generateIcpoPdf(deal: DealDocInput): GeneratedPdf {
  return buildDocument(
    { docTitle: "IRREVOCABLE CORPORATE PURCHASE ORDER", refPrefix: "ICPO", footerLabel: "Irrevocable Corporate Purchase Order" },
    (api) => {
      api.paragraph(`Date of issue: ${formatDate(new Date())}    ·    Reference: ${api.ref}    ·    Deal: ${dash(deal.id)}`, {
        color: BRAND.slate,
        size: 8.5,
      })
      api.paragraph(
        `We, the undersigned Buyer, hereby issue this Irrevocable Corporate Purchase Order (ICPO) to the Seller for the purchase of the commodity specified below, on the terms and conditions herein and subject to the execution of a mutual Sales & Purchase Agreement (SPA).`,
      )

      api.sectionTitle("1. Parties")
      api.kvRows([
        ["Buyer", dash(deal.buyerName)],
        ["Seller", deal.sellerName?.trim() || MCC_OIL_GAS_SELLER.name],
        ["Buyer's bank", dash(deal.sendingBank)],
        ["Buyer's bank SWIFT/BIC", dash(deal.sendingBankBic)],
      ])

      api.sectionTitle("2. Product & Commercial Terms")
      api.kvRows(commodityRows(deal))
      api.kvRows([["Payment", SELLER_PAYMENT_INSTRUMENT]])

      api.sectionTitle("3. Buyer's Undertaking")
      api.bullets([
        "The Buyer confirms it is ready, willing and able to purchase the commodity in the quantity and on the delivery basis stated above.",
        "The Buyer will provide a Proof of Funds / Bank Comfort Letter (BCL) from its principal bank on the bank's letterhead evidencing financial capacity for the transaction value.",
        "The Buyer will execute the Seller's Sales & Purchase Agreement (SPA) and provide corporate KYC documents (registration, signatory ID, board resolution).",
        "This ICPO is issued in good faith and is valid for acceptance for a period of ten (10) banking days from the date of issue.",
      ])

      api.sectionTitle("4. Standard Conditions")
      api.paragraph(COMPLIANCE.payment)
      api.paragraph(COMPLIANCE.inspection)
      api.paragraph(COMPLIANCE.title)
      api.paragraph(COMPLIANCE.nonBinding, { color: BRAND.slate, size: 8.5 })

      api.signatures("For and on behalf of the BUYER", "Accepted for the SELLER")
    },
  )
}

// ---------------------------------------------------------------------------
// 2. SPA — Sales & Purchase Agreement (working draft)
// ---------------------------------------------------------------------------
export function generateSpaPdf(deal: DealDocInput): GeneratedPdf {
  return buildDocument(
    { docTitle: "SALES & PURCHASE AGREEMENT (DRAFT)", refPrefix: "SPA", footerLabel: "Sales & Purchase Agreement (Draft)" },
    (api) => {
      api.paragraph(`Date: ${formatDate(new Date())}    ·    Reference: ${api.ref}    ·    Deal: ${dash(deal.id)}`, {
        color: BRAND.slate,
        size: 8.5,
      })
      api.noticeBox(
        "WORKING DRAFT",
        "This Sales & Purchase Agreement is a working draft for negotiation. It becomes binding only when executed by authorized signatories of both parties. Figures are drawn from the tracked deal and should be confirmed before signature.",
        "info",
      )

      api.sectionTitle("Article 1 — Parties")
      api.kvRows([
        ["Seller", deal.sellerName?.trim() || MCC_OIL_GAS_SELLER.name],
        ["Seller address", MCC_OIL_GAS_SELLER.address],
        ["Buyer", dash(deal.buyerName)],
      ])

      api.sectionTitle("Article 2 — Commodity, Quantity & Delivery")
      api.kvRows([...commodityRows(deal), ["Assigned vessel", dash(deal.vessel?.name)]])

      api.sectionTitle("Article 3 — Price, Payment & Cost Recovery")
      api.paragraph(SELLER_PAYMENT_INSTRUMENT)
      api.bullets([
        "A 2% performance deposit of the total cargo value is a term of this SPA, credited in full against the final invoice and refundable if the Seller fails to deliver Partial or Full POP within the timeframes stated herein.",
        "A fixed due-diligence cost-recovery amount of EUR 20,000 (unless higher documented third-party costs are agreed in writing) covers the Seller's independent legal, KYC, AML and sanctions-screening costs and is credited in full against the final invoice.",
        "Full payment of 100% of the cargo value is made by SWIFT MT103 within three (3) business days of issuance of the Full Proof of Product.",
      ])

      api.sectionTitle("Article 4 — Inspection & Title")
      api.paragraph(COMPLIANCE.inspection)
      api.paragraph(COMPLIANCE.title)

      api.sectionTitle("Article 5 — Banking Coordinates")
      api.paragraph(
        "The Seller's designated payment account is disclosed within this signed SPA and only within it. No account is disclosed, and no payment is requested, before both parties have executed this Agreement.",
        { color: BRAND.slate, size: 8.5 },
      )
      api.kvRows([
        ["Receiving bank", dash(deal.receivingBank)],
        ["Receiving bank SWIFT/BIC", dash(deal.receivingBankBic)],
      ])

      api.sectionTitle("Article 6 — Governing Law")
      api.paragraph(
        "This Agreement is governed by and construed in accordance with the laws of Switzerland. Any dispute arising out of or in connection with it shall be finally settled under the Rules of Arbitration of the International Chamber of Commerce (ICC).",
      )

      api.signatures("For and on behalf of the SELLER", "For and on behalf of the BUYER")
    },
  )
}

// ---------------------------------------------------------------------------
// 3. POP — Proof of Product (DRAFT TEMPLATE, watermarked)
// ---------------------------------------------------------------------------
export function generatePopDraftPdf(deal: DealDocInput): GeneratedPdf {
  return buildDocument(
    { docTitle: "PROOF OF PRODUCT (DRAFT)", refPrefix: "POP", footerLabel: "Proof of Product (Draft Template)", watermark: true },
    (api) => {
      api.noticeBox(
        "DRAFT TEMPLATE — NOT A PLATFORM-ISSUED INSTRUMENT",
        "This is a drafting template only. The authoritative Proof of Product is the SGS / independent inspection report and dip-test authorisation issued by the Seller's refinery or inspector and uploaded under the POP module. This template carries no financial value on its own.",
        "warn",
      )
      api.paragraph(`Date: ${formatDate(new Date())}    ·    Reference: ${api.ref}    ·    Deal: ${dash(deal.id)}`, {
        color: BRAND.slate,
        size: 8.5,
      })

      api.sectionTitle("Product & Allocation")
      api.kvRows([
        ["Product owner / Seller", deal.sellerName?.trim() || MCC_OIL_GAS_SELLER.name],
        ["Commodity / Grade", dash(deal.commodity)],
        ["Allocated quantity", dash(deal.quantity)],
        ["Origin / Refinery", dash(deal.originCountry)],
        ["Destination", dash(deal.destinationCountry)],
      ])

      api.sectionTitle("Carriage & Inspection")
      api.kvRows([
        ["Nominated vessel", dash(deal.vessel?.name)],
        ["Vessel IMO", dash(deal.vessel?.imo)],
        ["SGS inspection reference", "________________________"],
        ["Dip test authorisation", "________________________"],
      ])

      api.sectionTitle("Seller's Statement")
      api.bullets([
        "The product described above is available, unencumbered, and allocated to this transaction under the Seller's active refinery mandate.",
        "Independent inspection (SGS or agreed equivalent) will verify quantity and quality; the Buyer may confirm the Full POP with the inspector directly before payment.",
      ])

      api.signatures("Issued for the SELLER", "Verified by INSPECTOR (SGS)")
    },
  )
}

// ---------------------------------------------------------------------------
// 4. POF — Proof of Funds (DRAFT TEMPLATE for the buyer's bank, watermarked)
// ---------------------------------------------------------------------------
export function generatePofDraftPdf(deal: DealDocInput): GeneratedPdf {
  return buildDocument(
    { docTitle: "PROOF OF FUNDS (DRAFT)", refPrefix: "POF", footerLabel: "Proof of Funds (Draft Template)", watermark: true },
    (api) => {
      api.noticeBox(
        "DRAFT TEMPLATE — FOR THE BUYER'S BANK TO ISSUE",
        "This is suggested wording for the Buyer's own bank to issue on its official letterhead. It is NOT a platform-issued financial instrument and is not, by itself, evidence of funds. Do not remit any payment on the strength of this template.",
        "warn",
      )
      api.paragraph(`Date: ${formatDate(new Date())}    ·    Reference: ${api.ref}    ·    Deal: ${dash(deal.id)}`, {
        color: BRAND.slate,
        size: 8.5,
      })

      api.paragraph("[ To be reproduced on the issuing bank's letterhead ]", { color: BRAND.slate, size: 8.5, bold: true })
      api.paragraph(
        `We, ${dash(deal.sendingBank)}, hereby confirm that our client, ${dash(deal.buyerName)}, maintains with us cleared funds and/or an available credit facility sufficient to cover the transaction value of ${valueStr(deal)} in respect of the purchase of ${dash(deal.commodity)} (${dash(deal.quantity)}) from ${deal.sellerName?.trim() || MCC_OIL_GAS_SELLER.name}.`,
      )

      api.sectionTitle("Applicant (Buyer)")
      api.kvRows([
        ["Buyer", dash(deal.buyerName)],
        ["Issuing bank", dash(deal.sendingBank)],
        ["Issuing bank SWIFT/BIC", dash(deal.sendingBankBic)],
      ])

      api.sectionTitle("Beneficiary (Seller)")
      api.kvRows([
        ["Seller", deal.sellerName?.trim() || MCC_OIL_GAS_SELLER.name],
        ["Receiving bank", dash(deal.receivingBank)],
        ["Receiving bank SWIFT/BIC", dash(deal.receivingBankBic)],
      ])

      api.sectionTitle("Amount & Purpose")
      api.kvRows([
        ["Transaction value", valueStr(deal)],
        ["Purpose", `Purchase of ${dash(deal.commodity)} (${dash(deal.quantity)})`],
      ])

      api.paragraph(COMPLIANCE.payment, { color: BRAND.slate, size: 8.5 })
      api.signatures("Authorized Bank Officer", "Bank stamp / Date")
    },
  )
}

// ---------------------------------------------------------------------------
// 5. Execution & Performance record
// ---------------------------------------------------------------------------
export function generateExecutionPdf(deal: DealDocInput): GeneratedPdf {
  return buildDocument(
    { docTitle: "EXECUTION & PERFORMANCE RECORD", refPrefix: "EXEC", footerLabel: "Execution & Performance Record" },
    (api) => {
      api.paragraph(`Date: ${formatDate(new Date())}    ·    Reference: ${api.ref}`, { color: BRAND.slate, size: 8.5 })
      api.paragraph(
        "This record documents the administrator-authorized execution status of the transaction referenced below within the NAFTAhub platform. Execution and shipment proceed only under administrator authorization — nothing executes automatically.",
      )

      api.sectionTitle("Transaction Reference")
      api.kvRows([
        ["Deal reference", dash(deal.id)],
        ["Title", dash(deal.title)],
        ["Category", dash(deal.category)],
        ["UETR (SWIFT gpi)", dash(deal.uetr)],
        ["Current stage", dash(deal.stage)],
        ["Status", dash(deal.status)],
      ])

      api.sectionTitle("Parties")
      api.kvRows([
        ["Buyer", dash(deal.buyerName)],
        ["Seller", deal.sellerName?.trim() || MCC_OIL_GAS_SELLER.name],
      ])

      api.sectionTitle("Commodity & Logistics")
      api.kvRows([
        ...commodityRows(deal),
        ["Instrument", dash(deal.instrumentType)],
        ["Assigned vessel", dash(deal.vessel?.name)],
        ["Vessel IMO", dash(deal.vessel?.imo)],
      ])

      api.sectionTitle("Settlement References (SWIFT)")
      api.kvRows([
        ["MT103 (customer credit transfer)", dash(deal.mt103Ref)],
        ["MT202 / MT202 COV", dash(deal.mt202Ref)],
        ["MT799 (pre-advice)", dash(deal.mt799Ref)],
      ])

      api.sectionTitle("Performance Summary")
      api.paragraph(COMPLIANCE.title)
      api.paragraph(
        "On written confirmation of cleared funds, legal title passes to the Buyer, who is authorized to withdraw the product; a final independent quantity verification is undertaken at the point of withdrawal.",
      )

      api.signatures("Authorized by ADMINISTRATOR", "Acknowledged by CLIENT")
    },
  )
}

// ---------------------------------------------------------------------------
// FCO — reuse the existing Full Corporate Offer generator, fed from the deal.
// ---------------------------------------------------------------------------
export function dealToFcoInput(deal: DealDocInput): FcoInput {
  const value =
    deal.approxValue != null && Number.isFinite(deal.approxValue) ? String(deal.approxValue) : ""
  return {
    sellerName: MCC_OIL_GAS_SELLER.name,
    sellerAddress: MCC_OIL_GAS_SELLER.address,
    sellerEmail: MCC_OIL_GAS_SELLER.email,
    sellerAttn: "",
    buyerName: deal.buyerName?.trim() || "",
    buyerAddress: "",
    buyerRegNo: "",
    buyerAttn: "",
    buyerEmail: "",
    transmittedVia: "",
    inResponseTo: deal.id ? `Deal reference ${deal.id}` : "",
    product: deal.commodity?.trim() || "",
    specificationStandard: "",
    keyParameters: "",
    inspectionAgency: "",
    certification: "",
    trialQuantity: deal.quantity?.trim() || "",
    contractQuantity: "",
    contractDuration: "",
    deliveryTerm: deal.tradeStructure?.trim() || "",
    loadPort: "",
    originsAvailable: "",
    paymentInstrument: SELLER_PAYMENT_INSTRUMENT,
    incotermsVersion: "Incoterms 2020",
    offerValidityDays: 7,
    currency: deal.currency || "USD",
    unitPrice: "",
    trialCargoValue: value,
    contractPeriodValue: "",
    annualContractValue: "",
    originCountry: deal.originCountry?.trim() || "",
    destinationCountry: deal.destinationCountry?.trim() || "",
    governingLaw: "Switzerland (ICC arbitration)",
  }
}

// ---------------------------------------------------------------------------
// The clickable stage → document registry consumed by the deal document suite.
// One entry per stage of the "Standard transaction sequence".
// ---------------------------------------------------------------------------
export interface DealDocBuilder {
  key: string
  label: string
  description: string
  /** Marks POP/POF (and the SPA) as drafts in the UI. */
  draft?: boolean
  build: (deal: DealDocInput) => GeneratedPdf
}

export const DEAL_DOC_BUILDERS: DealDocBuilder[] = [
  { key: "icpo", label: "ICPO", description: "Irrevocable Corporate Purchase Order (buyer → seller)", build: generateIcpoPdf },
  { key: "fco", label: "FCO", description: "Full Corporate Offer & contract draft (seller → buyer)", build: (d) => generateFcoPdf(dealToFcoInput(d)) },
  { key: "contract", label: "Contract (SPA)", description: "Sales & Purchase Agreement — working draft", draft: true, build: generateSpaPdf },
  { key: "pop", label: "POP", description: "Proof of Product — draft template (seller)", draft: true, build: generatePopDraftPdf },
  { key: "pof", label: "POF", description: "Proof of Funds — draft template (buyer's bank)", draft: true, build: generatePofDraftPdf },
  { key: "execution", label: "Execution", description: "Execution & performance record", build: generateExecutionPdf },
]
