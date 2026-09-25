// Builds the field set + raw FIN block 4 for an MT103 RETURN OF FUNDS printout,
// produced when the beneficiary bank rejects an outgoing payment and returns the
// money to the platform's master account at UBS Switzerland (Geneva).
//
// Direction of the return: FROM the beneficiary's bank/account BACK TO the fixed
// platform master account (ISSUER_BANK — every client's outgoing funds leave via
// this single UBS account, and returns come back to it). The client's own
// dedicated IBANs are receive-only, so they are never the return destination.
//
// This is a pure client-safe builder returning `SwiftMessagePdfData`; the caller
// renders it with `generateSwiftMessagePdf` (the guardrailed FIN-copy renderer),
// so the printout is explicitly a system-generated transmission copy and does
// NOT fabricate SWIFT network authentication.

import { ISSUER_BANK } from "@/lib/issuer-bank"
import { paymentReturnReason } from "@/lib/payment-return-reasons"
import type { SwiftMessagePdfData } from "@/lib/swift-message-pdf"

export interface PaymentReturnMt103Input {
  /** The original payment approval id (used to derive the return reference). */
  id: string
  /** Amount returned (the full total the sender was debited). */
  amount: number
  currency: string
  /** Original beneficiary that received the funds and is returning them. */
  beneficiaryName: string
  beneficiaryIban?: string
  /** BIC of the beneficiary's bank (the returning/ordering institution). */
  beneficiaryBankBic?: string
  beneficiaryCountry?: string
  /** Original payment reference / UETR. */
  reference?: string
  uetr?: string
  /** Return reason code + optional free-text note. */
  reasonCode: string
  note?: string
}

/** SWIFT :32A:/:33B: amount: comma decimal, no thousands separators. */
function swiftAmount(amount: number): string {
  return amount.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
    useGrouping: false,
  }).replace(".", ",")
}

/** SWIFT value date YYMMDD. */
function swiftDate(d: Date): string {
  const yy = String(d.getFullYear()).slice(-2)
  const mm = String(d.getMonth() + 1).padStart(2, "0")
  const dd = String(d.getDate()).padStart(2, "0")
  return `${yy}${mm}${dd}`
}

export function buildPaymentReturnMt103(input: PaymentReturnMt103Input): SwiftMessagePdfData {
  const reason = paymentReturnReason(input.reasonCode)
  const reasonLabel = reason?.label ?? "Returned by beneficiary bank"
  const now = new Date()
  const ccy = (input.currency || "EUR").toUpperCase()
  const amt = swiftAmount(input.amount)
  const senderBic = (input.beneficiaryBankBic || "").toUpperCase().replace(/[^A-Z0-9]/g, "") || "RETNBANK"
  const returnRef = `RETN${(input.reference || input.id).replace(/[^A-Za-z0-9]/g, "").slice(0, 12).toUpperCase()}`
  const beneficiaryIban = (input.beneficiaryIban || "").replace(/\s+/g, "").toUpperCase()

  // Raw FIN block 4 — an MT103 return: ordering = the beneficiary's bank/account,
  // credit account = the platform master at UBS Geneva.
  const rawLines = [
    "{4:",
    `:20:${returnRef}`,
    ":23B:CRED",
    `:32A:${swiftDate(now)}${ccy}${amt}`,
    `:33B:${ccy}${amt}`,
    `:50K:/${beneficiaryIban || "NOTPROVIDED"}`,
    (input.beneficiaryName || "BENEFICIARY").toUpperCase(),
    ...(input.beneficiaryCountry && input.beneficiaryCountry !== "—"
      ? [input.beneficiaryCountry.toUpperCase()]
      : []),
    `:52A:${senderBic}`,
    `:57A:${ISSUER_BANK.swift}`,
    `:59:/${ISSUER_BANK.iban}`,
    "MCC CAPITAL — MASTER ACCOUNT",
    `${ISSUER_BANK.name.toUpperCase()}, GENEVA`,
    `:70:RETURN OF FUNDS /REF ${input.reference || input.id}`,
    ":71A:OUR",
    `:72:/RETN/${input.reasonCode}`,
    ...wrapWords(reasonLabel.toUpperCase(), 33).slice(0, 2).map((l) => `//${l}`),
    ...(input.note ? wrapWords(input.note.toUpperCase(), 33).slice(0, 3).map((l) => `//${l}`) : []),
    "-}",
  ]

  return {
    id: returnRef,
    type: "MT103",
    direction: "return",
    status: "returned",
    sender: senderBic,
    receiver: ISSUER_BANK.swift,
    amount: amt,
    currency: ccy,
    beneficiary: `MCC Capital — Master Account · ${ISSUER_BANK.name}, Geneva`,
    beneficiaryAccount: ISSUER_BANK.iban,
    orderingCustomer: `${input.beneficiaryName}${beneficiaryIban ? ` · ${beneficiaryIban}` : ""}`,
    reference: returnRef,
    valueDate: now.toLocaleDateString("en-GB"),
    uetr: input.uetr,
    returnReason: `${reasonLabel}${input.note ? ` — ${input.note}` : ""}`,
    raw: rawLines.join("\n"),
  }
}

/**
 * Word-boundary wrap for SWIFT continuation lines: breaks on spaces so words are
 * never cut mid-way (the old fixed-slice produced "MISMAT" from "MISMATCH").
 * Only a single word longer than `width` is hard-broken.
 */
function wrapWords(text: string, width: number): string[] {
  const words = text.replace(/\s+/g, " ").trim().split(" ").filter(Boolean)
  const lines: string[] = []
  let cur = ""
  const pushLong = (w: string) => {
    let rest = w
    while (rest.length > width) {
      lines.push(rest.slice(0, width))
      rest = rest.slice(width)
    }
    cur = rest
  }
  for (const w of words) {
    if (!cur) {
      if (w.length <= width) cur = w
      else pushLong(w)
    } else if (cur.length + 1 + w.length <= width) {
      cur += ` ${w}`
    } else {
      lines.push(cur)
      cur = ""
      if (w.length <= width) cur = w
      else pushLong(w)
    }
  }
  if (cur) lines.push(cur)
  return lines
}
