// Builds the field set + raw FIN block 4 for the ORIGINAL OUTGOING MT103 of a
// client payment — the "SWIFT printout receipt" a customer downloads once their
// funds are delivering or delivered.
//
// Direction: FROM the fixed platform master account at UBS Switzerland, Geneva
// (ISSUER_BANK — every client's outgoing funds leave via this single account)
// TO the beneficiary's account at the beneficiary bank, optionally cleared
// through a correspondent / intermediary bank (:56A:).
//
// Pure, client-safe builder returning `SwiftMessagePdfData`; the caller renders
// it with `generateSwiftMessagePdf` (the guardrailed FIN-copy renderer), so the
// printout is explicitly a system-generated transmission COPY and does NOT
// fabricate SWIFT network authentication (ACK/MAC/PKI trailers, MIR).

import { ISSUER_BANK } from "@/lib/issuer-bank"
import type { SwiftMessagePdfData } from "@/lib/swift-message-pdf"

export interface OutgoingPaymentMt103Input {
  /** Payment id (used to derive the transaction reference when none is set). */
  id: string
  /** Amount sent (the principal the beneficiary receives), numeric. */
  amount: number
  currency: string
  /** Beneficiary that received / is receiving the funds. */
  beneficiaryName: string
  beneficiaryIban?: string
  /** BIC of the beneficiary's bank (account-with institution, :57A:). */
  beneficiaryBankBic?: string
  beneficiaryCountry?: string
  /** Ordering customer — the paying client / account holder. */
  orderingCustomer: string
  orderingAddress?: string
  /** Correspondent / intermediary bank the payment was routed through (:56A:). */
  routedBankName?: string
  routedBankBic?: string
  /** Payment reference and gpi UETR. */
  reference?: string
  uetr?: string
  /** Human display value date, e.g. "25/09/2026". */
  valueDate?: string
  /** ISO base date the value date is derived from (for the :32A: YYMMDD). */
  baseDate?: string
  /** true once funds are credited to the beneficiary; false while in delivery. */
  delivered?: boolean
}

/** SWIFT :32A:/:33B: amount: comma decimal, no thousands separators. */
function swiftAmount(amount: number): string {
  return amount
    .toLocaleString("en-US", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
      useGrouping: false,
    })
    .replace(".", ",")
}

/** SWIFT value date YYMMDD. */
function swiftDate(d: Date): string {
  const yy = String(d.getFullYear()).slice(-2)
  const mm = String(d.getMonth() + 1).padStart(2, "0")
  const dd = String(d.getDate()).padStart(2, "0")
  return `${yy}${mm}${dd}`
}

export function buildOutgoingPaymentMt103(input: OutgoingPaymentMt103Input): SwiftMessagePdfData {
  const ccy = (input.currency || "EUR").toUpperCase()
  const amt = swiftAmount(input.amount)
  const valueDateObj = input.baseDate ? new Date(input.baseDate) : new Date()
  const valueDay = Number.isNaN(valueDateObj.getTime()) ? new Date() : valueDateObj

  const receiverBic =
    (input.beneficiaryBankBic || "").toUpperCase().replace(/[^A-Z0-9]/g, "") || "BENEFICIARY"
  const routedBic = (input.routedBankBic || "").toUpperCase().replace(/[^A-Z0-9]/g, "")
  const txnRef = `MCC${(input.reference && input.reference !== "—" ? input.reference : input.id)
    .replace(/[^A-Za-z0-9]/g, "")
    .slice(0, 13)
    .toUpperCase()}`
  const beneficiaryIban = (input.beneficiaryIban || "").replace(/\s+/g, "").toUpperCase()
  const orderingName = (input.orderingCustomer || "MCC CAPITAL CLIENT").toUpperCase()

  // Raw FIN block 4 — an MT103 credit transfer: ordering = the paying client
  // (funds leaving the MCC master at UBS Geneva), credit = the beneficiary.
  const rawLines = [
    "{4:",
    `:20:${txnRef}`,
    ":23B:CRED",
    `:32A:${swiftDate(valueDay)}${ccy}${amt}`,
    `:33B:${ccy}${amt}`,
    `:50K:/${ISSUER_BANK.iban}`,
    orderingName,
    ...(input.orderingAddress ? [input.orderingAddress.toUpperCase().slice(0, 35)] : []),
    "C/O MCC CAPITAL, GENEVA",
    `:52A:${ISSUER_BANK.swift}`,
    ...(routedBic ? [`:56A:${routedBic}`] : []),
    `:57A:${receiverBic}`,
    `:59:/${beneficiaryIban || "NOTPROVIDED"}`,
    (input.beneficiaryName || "BENEFICIARY").toUpperCase(),
    ...(input.beneficiaryCountry && input.beneficiaryCountry !== "—"
      ? [input.beneficiaryCountry.toUpperCase()]
      : []),
    `:70:/REF ${input.reference && input.reference !== "—" ? input.reference : input.id}`,
    ":71A:OUR",
  ]
  if (input.uetr) rawLines.push(`:121:${input.uetr}`)
  rawLines.push("-}")

  const routedVia = input.routedBankName
    ? `${input.routedBankName}${routedBic ? ` · ${routedBic}` : ""}`
    : undefined

  return {
    id: txnRef,
    type: "MT103",
    direction: "outgoing",
    status: input.delivered ? "delivered — funds credited" : "in delivery",
    sender: ISSUER_BANK.swift,
    receiver: receiverBic,
    amount: amt,
    currency: ccy,
    beneficiary: `${input.beneficiaryName}${
      input.beneficiaryCountry && input.beneficiaryCountry !== "—" ? ` · ${input.beneficiaryCountry}` : ""
    }`,
    beneficiaryAccount: beneficiaryIban || undefined,
    orderingCustomer: `${input.orderingCustomer} · ${ISSUER_BANK.name}, Geneva (${ISSUER_BANK.iban})`,
    reference: input.reference && input.reference !== "—" ? input.reference : txnRef,
    valueDate: input.valueDate,
    uetr: input.uetr,
    returnReason: routedVia ? `Routed via ${routedVia}` : undefined,
    raw: rawLines.join("\n"),
  }
}
