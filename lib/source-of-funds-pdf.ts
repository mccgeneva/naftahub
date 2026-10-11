import { jsPDF } from "jspdf"
import { BRAND, money, formatDate, formatDateTime, type GeneratedPdf } from "@/lib/pdf-core"

export type SofPdfDocument = { kind: string; name: string; uploadedAt: string }

export interface SofPdfInput {
  id: string
  holderLabel: string
  amount: number
  currency: string
  valueDate: string | null
  senderName: string
  senderCountry: string
  senderBank: string
  senderAccount: string
  reference: string
  declaration: { purpose: string; sourceOfFunds: string; relationship: string; signedBy: string; signedAt: string | null }
  checklist: Record<string, boolean>
  documents: SofPdfDocument[]
  status: string
  decisionNote: string
  decidedAt: string | null
  createdAt: string
}

const DOC_LABELS: Record<string, string> = {
  mt103: "SWIFT MT103 payment advice",
  sender_passport: "Sender passport / ID",
  sender_address: "Sender proof of address",
  sender_company: "Sender company documents",
  existing_contract: "Pre-existing contract / invoice",
  correspondence: "Correspondence",
  delivery_evidence: "Evidence of goods / services delivered",
  other: "Other supporting document",
}

const CHECK_LABELS: Record<string, string> = {
  senderIdentityVerified: "Sender identity verified against KYC documents",
  sanctionsScreened: "Sender screened against sanctions / PEP lists",
  documentsMatchPayment: "Supporting documents match the payment details",
  amountFitsPurpose: "Amount is consistent with the stated purpose",
  declarationSigned: "Source of Funds declaration signed by the sender",
}

const STATUS_LABELS: Record<string, string> = {
  open: "Under review",
  cleared: "Cleared",
  hold: "On hold",
  returned: "Return to sender",
}

export function generateSourceOfFundsPdf(input: SofPdfInput): GeneratedPdf {
  const doc = new jsPDF({ unit: "pt", format: "a4" })
  const W = doc.internal.pageSize.getWidth()
  const H = doc.internal.pageSize.getHeight()
  const M = 44
  const CW = W - M * 2
  let y = 0

  const header = () => {
    doc.setFillColor(...BRAND.ink)
    doc.rect(0, 0, W, 64, "F")
    doc.setTextColor(...BRAND.white)
    doc.setFont("helvetica", "bold")
    doc.setFontSize(13)
    doc.text("SOURCE OF FUNDS FILE", M, 30)
    doc.setFont("helvetica", "normal")
    doc.setFontSize(9)
    doc.text(`${BRAND.name} — Compliance`, M, 46)
    doc.text(input.id, W - M, 30, { align: "right" })
    y = 92
  }

  const ensure = (h: number) => {
    if (y + h > H - 56) {
      doc.addPage()
      header()
    }
  }

  const section = (title: string) => {
    ensure(34)
    doc.setTextColor(...BRAND.gold)
    doc.setFont("helvetica", "bold")
    doc.setFontSize(10)
    doc.text(title.toUpperCase(), M, y)
    doc.setDrawColor(...BRAND.line)
    doc.line(M, y + 6, W - M, y + 6)
    y += 22
  }

  const row = (label: string, value: string) => {
    const lines = doc.splitTextToSize(value || "—", CW - 170) as string[]
    ensure(lines.length * 13 + 6)
    doc.setFont("helvetica", "normal")
    doc.setFontSize(9)
    doc.setTextColor(...BRAND.slate)
    doc.text(label, M, y)
    doc.setTextColor(...BRAND.ink)
    doc.text(lines, M + 170, y)
    y += lines.length * 13 + 5
  }

  const para = (text: string) => {
    const lines = doc.splitTextToSize(text || "—", CW) as string[]
    ensure(lines.length * 13 + 8)
    doc.setFont("helvetica", "normal")
    doc.setFontSize(9)
    doc.setTextColor(...BRAND.ink)
    doc.text(lines, M, y)
    y += lines.length * 13 + 8
  }

  header()

  section("Payment received")
  row("Receiving client", input.holderLabel)
  row("Amount", money(input.amount, input.currency))
  row("Value date", input.valueDate ? formatDate(input.valueDate) : "—")
  row("Payment reference", input.reference)

  section("Sender (ordering customer)")
  row("Name", input.senderName)
  row("Country", input.senderCountry)
  row("Ordering bank", input.senderBank)
  row("Account / IBAN", input.senderAccount)

  section("Sender's Source of Funds declaration")
  row("Purpose of payment", input.declaration.purpose)
  row("Origin of the funds", input.declaration.sourceOfFunds)
  row("Relationship to client", input.declaration.relationship)
  row("Signed by", input.declaration.signedBy)
  row("Signed on", input.declaration.signedAt ? formatDate(input.declaration.signedAt) : "Not yet signed")

  section("Supporting documents on file")
  if (input.documents.length === 0) {
    para("No documents uploaded.")
  } else {
    input.documents.forEach((d, i) => {
      row(`${i + 1}. ${DOC_LABELS[d.kind] ?? d.kind}`, `${d.name} (uploaded ${formatDate(d.uploadedAt)})`)
    })
  }

  section("Compliance checklist")
  Object.entries(CHECK_LABELS).forEach(([key, label]) => {
    row(input.checklist[key] ? "[X] Done" : "[ ] Pending", label)
  })

  section("Decision")
  row("Status", STATUS_LABELS[input.status] ?? input.status)
  row("Decided on", input.decidedAt ? formatDateTime(input.decidedAt) : "—")
  row("Reason / note", input.decisionNote)

  ensure(60)
  y += 8
  para(
    "This file records only documents and statements actually provided by the sender and the client, together with the compliance review performed on them. It does not create or replace any agreement between the parties.",
  )

  const pages = doc.getNumberOfPages()
  for (let p = 1; p <= pages; p++) {
    doc.setPage(p)
    doc.setFontSize(8)
    doc.setTextColor(...BRAND.slate)
    doc.text(`Opened ${formatDate(input.createdAt)} · Generated ${formatDateTime(new Date())}`, M, H - 28)
    doc.text(`Page ${p} of ${pages}`, W - M, H - 28, { align: "right" })
  }

  return { doc, filename: `Source-of-Funds-${input.id}.pdf`, title: `Source of Funds — ${input.id}` }
}
