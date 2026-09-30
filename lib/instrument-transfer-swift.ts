// Builds the SWIFT FIN printout for a bank-instrument transfer executed from the
// client portfolio, in either of two message types:
//
// - MT760 (Guarantee / Standby Letter of Credit, SR2021 layout) — for bank
//   guarantees, SBLCs and other undertakings: the instrument is re-issued /
//   assigned in favour of the MCC Treasury instruments account at Barclays for
//   further credit to the final recipient.
// - MT542 (Deliver Free, ISO 15022) — for securitised instruments (MTN, EMTN,
//   bonds, anything carrying an ISIN): the position is delivered free of payment
//   to the MCC Treasury safekeeping account at Barclays, for further credit.
//
// Layout follows the standard FIN envelope ({1:} basic header, {2:} application
// header, {3:} user header with MUR, {4:} text block closed by "-}") with
// SWIFT character-set rules: uppercase, max 35 chars per narrative line, comma
// decimal amounts, YYMMDD / YYYYMMDD dates. Rendered via
// `generateSwiftMessagePdf`, which labels it a system-generated transmission
// copy and deliberately does not fabricate block-5 network authentication
// (MAC/CHK) or a MIR.

import type { SwiftMessagePdfData } from "@/lib/swift-message-pdf"

export type InstrumentTransferMtType = "MT760" | "MT542"

export interface InstrumentTransferSwiftInput {
  mtType: InstrumentTransferMtType
  instrumentId: string
  instrumentType: string
  instrumentTypeFull?: string
  issuer?: string
  issuerBic?: string
  faceValue: number
  currency: string
  isin?: string
  issuedDate?: string
  expiryDate?: string
  /** Transferring client (applicant / delivering party). */
  orderingName: string
  /** Beneficiary bank account (the MCC Treasury instruments account). */
  beneficiaryName: string
  beneficiaryIban: string
  beneficiaryBic: string
  beneficiaryBank: string
  beneficiaryAddress?: string
  /** Final recipient the instrument is credited on to. */
  furtherCreditName: string
  furtherCreditEmail?: string
  /** Execution timestamp (defaults to now). */
  executedAt?: Date
}

/** Default message type: securities (ISIN / notes / bonds) → MT542, else MT760. */
export function defaultTransferMtType(type: string, isin?: string): InstrumentTransferMtType {
  const t = (type || "").toUpperCase()
  if (isin || /MTN|EMTN|BOND|NOTE|EUROBOND|CD/.test(t)) return "MT542"
  return "MT760"
}

const SAFE = /[^A-Z0-9/\-?:().,'+ ]/g

/** Uppercase, strip characters outside the SWIFT X character set, wrap to 35. */
function lines(text: string, max = 4): string[] {
  const clean = (text || "").toUpperCase().replace(SAFE, " ").replace(/\s+/g, " ").trim()
  if (!clean) return []
  const out: string[] = []
  let cur = ""
  for (const word of clean.split(" ")) {
    const next = cur ? `${cur} ${word}` : word
    if (next.length > 35) {
      if (cur) out.push(cur)
      cur = word.slice(0, 35)
    } else cur = next
    if (out.length >= max) break
  }
  if (cur && out.length < max) out.push(cur)
  return out
}

function bic11(bic: string | undefined, fallback: string): string {
  const b = (bic || "").toUpperCase().replace(/[^A-Z0-9]/g, "")
  if (b.length === 8) return `${b}XXX`
  if (b.length === 11) return b
  return fallback
}

function amount(n: number): string {
  return n
    .toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2, useGrouping: false })
    .replace(".", ",")
}

function yymmdd(d: Date): string {
  return `${String(d.getUTCFullYear()).slice(-2)}${String(d.getUTCMonth() + 1).padStart(2, "0")}${String(d.getUTCDate()).padStart(2, "0")}`
}

function yyyymmdd(d: Date): string {
  return `${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, "0")}${String(d.getUTCDate()).padStart(2, "0")}`
}

function parseDate(v: string | undefined): Date | null {
  if (!v) return null
  const d = new Date(v)
  return Number.isNaN(d.getTime()) ? null : d
}

/** Deterministic 16-char transaction reference (field :20: / :20C::SEME//). */
function txnRef(prefix: string, id: string): string {
  return `${prefix}${id.toUpperCase().replace(/[^A-Z0-9]/g, "")}`.slice(0, 16)
}

function uuidV4(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID()
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0
    return (c === "x" ? r : (r & 0x3) | 0x8).toString(16)
  })
}

export function buildInstrumentTransferSwift(input: InstrumentTransferSwiftInput): SwiftMessagePdfData {
  const now = input.executedAt ?? new Date()
  const ccy = (input.currency || "EUR").toUpperCase()
  const amt = amount(input.faceValue)
  const sender = bic11(input.issuerBic, "MCCCCHGGXXX")
  const receiver = bic11(input.beneficiaryBic, "BARCGB22XXX")
  const iban = input.beneficiaryIban.replace(/\s+/g, "").toUpperCase()
  const mtNum = input.mtType === "MT760" ? "760" : "542"
  const ref = txnRef(input.mtType === "MT760" ? "GTE" : "DLV", input.instrumentId)
  const uetr = uuidV4()
  const ffc = `${input.furtherCreditName}${input.furtherCreditEmail ? ` ${input.furtherCreditEmail}` : ""}`

  const header = [
    `{1:F01${sender}0000000000}`,
    `{2:I${mtNum}${receiver}N}`,
    `{3:{108:${ref.slice(0, 16)}}{121:${uetr}}}`,
    "{4:",
  ]

  let body: string[]
  if (input.mtType === "MT760") {
    const expiry = parseDate(input.expiryDate)
    const isStandby = /SBLC|STANDBY/i.test(`${input.instrumentType} ${input.instrumentTypeFull ?? ""}`)
    body = [
      ":15A:",
      ":27:1/1",
      ":22A:ISSU",
      ":15B:",
      `:20:${ref}`,
      `:30:${yymmdd(now)}`,
      `:22D:${isStandby ? "STBY" : "DGAR"}`,
      ":40D:NONE",
      `:23B:${expiry ? "FIXD" : "OPEN"}`,
      ...(expiry ? [`:31E:${yymmdd(expiry)}`] : []),
      ":50:",
      ...lines(input.orderingName, 4),
      `:52A:${sender}`,
      `:59:/${iban}`,
      ...lines(input.beneficiaryName, 1),
      ...lines(input.beneficiaryBank, 1),
      ...lines(input.beneficiaryAddress ?? "", 2),
      `:32B:${ccy}${amt}`,
      ":77U:",
      ...lines(
        `ASSIGNMENT OF ${input.instrumentTypeFull || input.instrumentType} REF ${input.instrumentId}` +
          `${input.isin ? ` ISIN ${input.isin}` : ""} ISSUED BY ${input.issuer ?? sender}.` +
          ` WE HEREBY ASSIGN THIS UNDERTAKING IN FAVOUR OF THE BENEFICIARY ACCOUNT ABOVE` +
          ` FOR FURTHER CREDIT TO ${ffc}.`,
        12,
      ),
      ":45L:",
      ...lines(`BANK INSTRUMENT TRANSFER FFC ${ffc}`, 3),
    ]
  } else {
    const trade = now
    body = [
      ":16R:GENL",
      `:20C::SEME//${ref}`,
      ":23G:NEWM",
      `:98C::PREP//${yyyymmdd(now)}${String(now.getUTCHours()).padStart(2, "0")}${String(now.getUTCMinutes()).padStart(2, "0")}00`,
      ":16S:GENL",
      ":16R:TRADDET",
      `:98A::TRAD//${yyyymmdd(trade)}`,
      `:98A::SETT//${yyyymmdd(trade)}`,
      `:35B:${input.isin ? `ISIN ${input.isin.toUpperCase()}` : `/XX/${input.instrumentId.toUpperCase().slice(0, 30)}`}`,
      ...lines(`${input.instrumentTypeFull || input.instrumentType} ${input.issuer ?? ""}`, 3),
      ":16S:TRADDET",
      ":16R:FIAC",
      `:36B::SETT//FAMT/${amt}`,
      `:97A::SAFE//${input.instrumentId.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 35)}`,
      ":16S:FIAC",
      ":16R:SETDET",
      ":22F::SETR//TRAD",
      ":16R:SETPRTY",
      `:95P::DEAG//${sender}`,
      ":16S:SETPRTY",
      ":16R:SETPRTY",
      `:95P::REAG//${receiver}`,
      `:97A::SAFE//${iban}`,
      ":16S:SETPRTY",
      ":16R:SETPRTY",
      ":95Q::BUYR//" + (lines(input.beneficiaryName, 1)[0] ?? "MCC TREASURY"),
      ...lines(`FFC ${ffc}`, 3),
      ":16S:SETPRTY",
      ":16R:SETPRTY",
      `:95P::PSET//${receiver}`,
      ":16S:SETPRTY",
      ":16S:SETDET",
    ]
  }

  const raw = [...header, ...body, "-}"].join("\n")

  return {
    id: ref,
    type: input.mtType,
    direction: "outgoing",
    status: "transfer executed — instrument assigned",
    sender,
    receiver,
    amount: amt,
    currency: ccy,
    beneficiary: `${input.beneficiaryName} · ${input.beneficiaryBank}`,
    beneficiaryAccount: iban,
    orderingCustomer: input.orderingName,
    reference: `${input.instrumentType} ${input.instrumentId} — FFC ${ffc}`,
    valueDate: now.toISOString().slice(0, 10),
    date: now.toISOString(),
    uetr,
    raw,
  }
}
