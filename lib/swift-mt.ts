// ---------------------------------------------------------------------------
// SWIFT MT message parser & generator — dependency-free, pure & unit-testable
// ---------------------------------------------------------------------------
//
// This module parses raw SWIFT FIN (MT) messages into structured objects and
// can generate well-formed MT103 / MT202 text for outbound transfers. It is
// intentionally free of "use server" and of any I/O so the logic stays pure
// and testable. The server / UI layers consume the typed output.
//
// Supported inbound parsing: MT103, MT202, MT202 COV, MT760, MT799 (and a
// generic fallback for any other MT type, exposing parsed blocks + fields).
//
// MT760 (Guarantee / Standby Letter of Credit) and MT799 (free-format) are the
// instrument-messaging types used by the bank-instrument monetization desk for
// SBLC/BG issuance, collateral transfer and ready-willing-able (RWA) advice.
//
// References: SWIFT FIN block structure (Block 1 Basic Header, Block 2
// Application Header, Block 3 User Header incl. UETR field 121, Block 4
// Message Text, Block 5 Trailer) and the MT field catalogue (:20:, :32A:,
// :50K:, :59:, :71A:, etc.).

import { validateIban, validateBic } from "@/lib/iban-swift"

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type SwiftMessageType = "MT103" | "MT202" | "MT202COV" | "MT760" | "MT799" | string

/** A single tag/value pair from Block 4 (e.g. tag "32A", value "240617EUR1500,00"). */
export interface SwiftField {
  /** Field tag without colons, e.g. "32A", "50K", "59". */
  tag: string
  /** Raw multi-line value as it appears in the message (newlines preserved). */
  value: string
}

/** The five SWIFT blocks in their raw (string) form. */
export interface SwiftBlocks {
  /** Block 1 — Basic Header (application id, service id, LT address, session, sequence). */
  basicHeader?: string
  /** Block 2 — Application Header (I/O, message type, recipient/sender, priority). */
  applicationHeader?: string
  /** Block 3 — User Header (tags incl. 121 = UETR, 108 = MUR, 111 = service type id). */
  userHeader?: Record<string, string>
  /** Block 4 — Message Text fields (ordered). */
  text: SwiftField[]
  /** Block 5 — Trailer (CHK, MAC, etc.). */
  trailer?: Record<string, string>
}

/** Parsed Basic Header (Block 1). */
export interface BasicHeader {
  applicationId?: string
  serviceId?: string
  /** Logical terminal address (12 chars: BIC + LT + branch). */
  ltAddress?: string
  /** Sender BIC derived from the LT address (first 8 chars). */
  senderBic?: string
  sessionNumber?: string
  sequenceNumber?: string
}

/** Parsed Application Header (Block 2). */
export interface ApplicationHeader {
  direction: "input" | "output" | "unknown"
  messageType?: string
  /** Recipient (input) or sender (output) address. */
  counterpartyAddress?: string
  counterpartyBic?: string
  priority?: string
  inputTime?: string
  outputDate?: string
  outputTime?: string
}

/** A party (ordering/beneficiary/institution) extracted from a party field. */
export interface SwiftParty {
  /** Option letter the party was carried under (A, K, F, etc.). */
  option?: string
  /** Account / IBAN line if present. */
  account?: string
  /** BIC if the option carried one (option A). */
  bic?: string
  /** Free-form name & address lines. */
  nameAndAddress: string[]
}

/** A normalized, business-level view of a parsed payment message. */
export interface ParsedSwiftMessage {
  /** Detected message type. */
  type: SwiftMessageType
  /** True when no structural / business validation errors were found. */
  valid: boolean
  /** Raw blocks. */
  blocks: SwiftBlocks
  basicHeader?: BasicHeader
  applicationHeader?: ApplicationHeader

  // --- Common enriched fields -------------------------------------------------
  /** :20: Sender's reference. */
  senderReference?: string
  /** :21: Related reference (202/COV). */
  relatedReference?: string
  /** UETR (Block 3 field 121) — gpi end-to-end reference. */
  uetr?: string
  /** Service type identifier (Block 3 field 111) — "001" indicates gpi. */
  serviceTypeId?: string
  /** True when the message carries gpi tracking data (UETR present). */
  gpiEnabled: boolean

  /** Value date (ISO yyyy-mm-dd) from :32A: / :32B:. */
  valueDate?: string
  /** ISO currency from :32A: / :32B:. */
  currency?: string
  /** Settlement / interbank amount. */
  amount?: number
  /** :33B: instructed (original) currency, when different. */
  instructedCurrency?: string
  instructedAmount?: number

  /** :50a: Ordering customer (MT103). */
  orderingCustomer?: SwiftParty
  /** :52a: Ordering institution. */
  orderingInstitution?: SwiftParty
  /** :57a: Account-with institution. */
  accountWithInstitution?: SwiftParty
  /** :58a: Beneficiary institution (202). */
  beneficiaryInstitution?: SwiftParty
  /** :59a: Beneficiary customer (103). */
  beneficiary?: SwiftParty
  /** :70: Remittance information. */
  remittanceInfo?: string
  /** :71A: Details of charges (OUR / BEN / SHA). */
  chargesDetail?: string
  /** :72: Sender to receiver information. */
  senderToReceiverInfo?: string

  /** For MT799 free-format text (:79:). */
  freeFormatText?: string

  /** Guarantee / SBLC details for MT760 (collateral transfer & issuance). */
  guarantee?: {
    /** :22A: Purpose of the message (ISSU, ICCO, etc.). */
    purpose?: string
    /** :22D: Form of the undertaking (DGAR demand guarantee, STBY standby LC). */
    form?: string
    /** :40C: Applicable rules (URDG, ISPR, etc.). */
    applicableRules?: string
    /** :23B: / :30: issue or effective date when present (ISO yyyy-mm-dd). */
    issueDate?: string
    /** :31E: / :35G: expiry date (ISO yyyy-mm-dd). */
    expiryDate?: string
    /** :32B: undertaking amount currency. */
    currency?: string
    /** :32B: undertaking amount. */
    amount?: number
    /** :50: applicant (instructing party). */
    applicant?: SwiftParty
    /** :59: beneficiary of the undertaking. */
    beneficiary?: SwiftParty
    /** :77C: / :77U: terms and conditions narrative. */
    terms?: string
  }

  /** Underlying customer credit transfer fields for MT202 COV (sequence B). */
  coverPayment?: {
    orderingCustomer?: SwiftParty
    beneficiary?: SwiftParty
    remittanceInfo?: string
  }

  /** Non-fatal warnings (e.g. unrecognized currency, suspicious BIC). */
  warnings: string[]
  /** Fatal structural / business errors. */
  errors: string[]
}

// ---------------------------------------------------------------------------
// Block-level parsing
// ---------------------------------------------------------------------------

/**
 * Split a raw SWIFT message into its `{n:...}` blocks. Handles the nested
 * structure of Block 4 (which is delimited by `-}` and contains `:tag:` lines)
 * and the sub-block structure of Blocks 3 & 5.
 */
export function splitBlocks(raw: string): SwiftBlocks {
  const blocks: SwiftBlocks = { text: [] }
  if (!raw) return blocks

  const text = raw.replace(/\r\n/g, "\n").trim()

  // Match top-level blocks {1:...}, {2:...}, {3:...}, {4:...-}, {5:...}
  // Block 4 ends with "-}" so we capture greedily up to that terminator.
  const blockRegex = /\{(\d):/g
  let match: RegExpExecArray | null
  const indices: { id: string; start: number }[] = []
  while ((match = blockRegex.exec(text)) !== null) {
    // Only treat as a top-level block opener if at string start or preceded
    // by a block close `}` / whitespace (avoid matching inside content).
    const before = text.slice(0, match.index).trimEnd()
    if (match.index === 0 || before.endsWith("}")) {
      indices.push({ id: match[1], start: match.index })
    }
  }

  for (let i = 0; i < indices.length; i++) {
    const { id, start } = indices[i]
    const end = i + 1 < indices.length ? indices[i + 1].start : text.length
    const segment = text.slice(start, end)
    // Strip the leading `{n:` and the matching trailing `}` / `-}`.
    const inner = segment
      .replace(/^\{\d:/, "")
      .replace(/-?\}\s*$/, "")
      .trim()

    switch (id) {
      case "1":
        blocks.basicHeader = inner
        break
      case "2":
        blocks.applicationHeader = inner
        break
      case "3":
        blocks.userHeader = parseSubBlocks(inner)
        break
      case "4":
        blocks.text = parseTextFields(inner)
        break
      case "5":
        blocks.trailer = parseSubBlocks(inner)
        break
    }
  }

  return blocks
}

/** Parse `{121:...}{108:...}` style sub-blocks into a tag→value map. */
function parseSubBlocks(inner: string): Record<string, string> {
  const out: Record<string, string> = {}
  const re = /\{(\w+):([^}]*)\}/g
  let m: RegExpExecArray | null
  while ((m = re.exec(inner)) !== null) {
    out[m[1]] = m[2].trim()
  }
  return out
}

/** Parse Block 4 message text into an ordered list of `:tag:value` fields. */
function parseTextFields(inner: string): SwiftField[] {
  const fields: SwiftField[] = []
  const lines = inner.split("\n")
  let current: SwiftField | null = null

  for (const line of lines) {
    const tagMatch = line.match(/^:([0-9]{2}[A-Z]?):(.*)$/)
    if (tagMatch) {
      if (current) fields.push(current)
      current = { tag: tagMatch[1], value: tagMatch[2] }
    } else if (current) {
      // Continuation line of the current field.
      if (line.trim() === "-") continue
      current.value += (current.value ? "\n" : "") + line
    }
  }
  if (current) fields.push(current)
  return fields
}

// ---------------------------------------------------------------------------
// Header parsing
// ---------------------------------------------------------------------------

function parseBasicHeader(raw?: string): BasicHeader | undefined {
  if (!raw) return undefined
  // Format: F01BANKBEBBAXXX0000000000  (appId[1] serviceId[2] LT[12] session[4] seq[6])
  const appId = raw.slice(0, 1)
  const serviceId = raw.slice(1, 3)
  const ltAddress = raw.slice(3, 15)
  const sessionNumber = raw.slice(15, 19)
  const sequenceNumber = raw.slice(19, 25)
  return {
    applicationId: appId || undefined,
    serviceId: serviceId || undefined,
    ltAddress: ltAddress || undefined,
    senderBic: ltAddress ? ltAddress.slice(0, 8) : undefined,
    sessionNumber: sessionNumber || undefined,
    sequenceNumber: sequenceNumber || undefined,
  }
}

function parseApplicationHeader(raw?: string): ApplicationHeader | undefined {
  if (!raw) return undefined
  const dirChar = raw.charAt(0).toUpperCase()
  const direction = dirChar === "I" ? "input" : dirChar === "O" ? "output" : "unknown"
  const messageType = raw.slice(1, 4) || undefined

  if (direction === "input") {
    // I + MT(3) + destinationAddress(12) + priority(1) + ...
    const counterpartyAddress = raw.slice(4, 16) || undefined
    const priority = raw.slice(16, 17) || undefined
    return {
      direction,
      messageType,
      counterpartyAddress,
      counterpartyBic: counterpartyAddress ? counterpartyAddress.slice(0, 8) : undefined,
      priority,
    }
  }
  if (direction === "output") {
    // O + MT(3) + inputTime(4) + MIR(28) + outputDate(6) + outputTime(4) + priority(1)
    const inputTime = raw.slice(4, 8) || undefined
    const senderAddress = raw.slice(12, 24) || undefined
    return {
      direction,
      messageType,
      inputTime,
      counterpartyAddress: senderAddress,
      counterpartyBic: senderAddress ? senderAddress.slice(0, 8) : undefined,
    }
  }
  return { direction, messageType }
}

// ---------------------------------------------------------------------------
// Field value parsing helpers
// ---------------------------------------------------------------------------

/** Parse a SWIFT decimal ("1500,00" / "1.500,00") into a JS number. */
export function parseSwiftAmount(raw: string): number | undefined {
  if (!raw) return undefined
  // SWIFT uses comma as the decimal separator and no thousands separators.
  const cleaned = raw.trim().replace(/\./g, "").replace(",", ".")
  const n = Number(cleaned)
  return Number.isFinite(n) ? n : undefined
}

/** Parse a SWIFT YYMMDD date into an ISO yyyy-mm-dd string. */
export function parseSwiftDate(yymmdd: string): string | undefined {
  const m = yymmdd.match(/^(\d{2})(\d{2})(\d{2})$/)
  if (!m) return undefined
  const [, yy, mm, dd] = m
  const year = Number(yy) + (Number(yy) <= 79 ? 2000 : 1900)
  const month = Number(mm)
  const day = Number(dd)
  if (month < 1 || month > 12 || day < 1 || day > 31) return undefined
  return `${year}-${mm}-${dd}`
}

/**
 * Parse a value-date/currency/amount field (:32A: = date+ccy+amount,
 * :32B: / :33B: = ccy+amount only).
 */
function parseAmountField(value: string, withDate: boolean): {
  valueDate?: string
  currency?: string
  amount?: number
} {
  const v = value.trim()
  if (withDate) {
    const m = v.match(/^(\d{6})([A-Z]{3})([\d.,]+)$/)
    if (!m) return {}
    return { valueDate: parseSwiftDate(m[1]), currency: m[2], amount: parseSwiftAmount(m[3]) }
  }
  const m = v.match(/^([A-Z]{3})([\d.,]+)$/)
  if (!m) return {}
  return { currency: m[1], amount: parseSwiftAmount(m[2]) }
}

/**
 * Parse a party field (50A/50K/50F, 52A/52D, 57A/57D, 58A/58D, 59/59A/59F).
 * Option A carries a BIC; the first line may be an /account. Remaining lines
 * are name & address.
 */
function parseParty(tag: string, value: string): SwiftParty {
  const option = tag.length > 2 ? tag.slice(2) : undefined
  const lines = value.split("\n").map((l) => l.trim()).filter(Boolean)
  const party: SwiftParty = { option, nameAndAddress: [] }

  if (lines.length && lines[0].startsWith("/")) {
    party.account = lines.shift()!.slice(1)
  }

  if (option === "A" && lines.length) {
    // Option A: the (remaining) first line is a BIC.
    const candidate = lines[0].replace(/^\/+/, "").trim()
    if (/^[A-Z0-9]{8}([A-Z0-9]{3})?$/.test(candidate)) {
      party.bic = candidate
      lines.shift()
    }
  }

  // Option F / K: structured or free name & address lines remain.
  party.nameAndAddress = lines
  return party
}

const findField = (fields: SwiftField[], tag: string): SwiftField | undefined =>
  fields.find((f) => f.tag === tag)

const findByPrefix = (fields: SwiftField[], prefix: string): SwiftField | undefined =>
  fields.find((f) => f.tag.startsWith(prefix))

// ---------------------------------------------------------------------------
// Message type detection
// ---------------------------------------------------------------------------

/** Detect the MT type from the application header and/or field signature. */
export function detectMessageType(blocks: SwiftBlocks): SwiftMessageType {
  const appHeader = blocks.applicationHeader
  let mt: string | undefined
  if (appHeader) {
    const m = appHeader.match(/^[IO](\d{3})/i)
    if (m) mt = m[1]
  }
  // MT202 COV is an MT202 carrying a sequence B (cover) with :50a:/:59a:.
  if (mt === "202") {
    const hasCoverSeq =
      !!findByPrefix(blocks.text, "50") && !!findByPrefix(blocks.text, "59")
    return hasCoverSeq ? "MT202COV" : "MT202"
  }
  if (mt === "103") return "MT103"
  if (mt === "760") return "MT760"
  if (mt === "799") return "MT799"
  if (mt) return `MT${mt}`

  // Fall back to field-signature heuristics when no app header was supplied.
  if (findField(blocks.text, "79")) return "MT799"
  // MT760 carries undertaking-specific fields (form/purpose) and no :32A:.
  if (findField(blocks.text, "22A") || findField(blocks.text, "22D") || findField(blocks.text, "40C")) {
    return "MT760"
  }
  if (findByPrefix(blocks.text, "59")) return "MT103"
  if (findByPrefix(blocks.text, "58")) return "MT202"
  return "UNKNOWN"
}

// ---------------------------------------------------------------------------
// Top-level parse
// ---------------------------------------------------------------------------

/**
 * Parse a raw SWIFT MT message into a structured, enriched object with
 * validation. Never throws — structural problems surface as `errors`.
 */
export function parseSwiftMessage(raw: string): ParsedSwiftMessage {
  const warnings: string[] = []
  const errors: string[] = []

  const blocks = splitBlocks(raw)
  if (!blocks.text.length && !blocks.basicHeader) {
    errors.push("No recognizable SWIFT blocks were found. Check the message format.")
  }

  const type = detectMessageType(blocks)
  const basicHeader = parseBasicHeader(blocks.basicHeader)
  const applicationHeader = parseApplicationHeader(blocks.applicationHeader)

  const fields = blocks.text
  const uetr = blocks.userHeader?.["121"]
  const serviceTypeId = blocks.userHeader?.["111"]

  const result: ParsedSwiftMessage = {
    type,
    valid: true,
    blocks,
    basicHeader,
    applicationHeader,
    uetr,
    serviceTypeId,
    gpiEnabled: !!uetr,
    warnings,
    errors,
  }

  // Common references
  result.senderReference = findField(fields, "20")?.value.trim()
  result.relatedReference = findField(fields, "21")?.value.trim()

  // Amount fields — :32A: (date+ccy+amount) preferred, else :32B:.
  const f32a = findField(fields, "32A")
  if (f32a) {
    const parsed = parseAmountField(f32a.value, true)
    result.valueDate = parsed.valueDate
    result.currency = parsed.currency
    result.amount = parsed.amount
  } else {
    const f32b = findField(fields, "32B")
    if (f32b) {
      const parsed = parseAmountField(f32b.value, false)
      result.currency = parsed.currency
      result.amount = parsed.amount
    }
  }
  const f33b = findField(fields, "33B")
  if (f33b) {
    const parsed = parseAmountField(f33b.value, false)
    result.instructedCurrency = parsed.currency
    result.instructedAmount = parsed.amount
  }

  // Parties
  const ordering = findByPrefix(fields, "50")
  if (ordering) result.orderingCustomer = parseParty(ordering.tag, ordering.value)
  const orderingInst = findByPrefix(fields, "52")
  if (orderingInst) result.orderingInstitution = parseParty(orderingInst.tag, orderingInst.value)
  const accountWith = findByPrefix(fields, "57")
  if (accountWith) result.accountWithInstitution = parseParty(accountWith.tag, accountWith.value)
  const beneficiaryInst = findByPrefix(fields, "58")
  if (beneficiaryInst) result.beneficiaryInstitution = parseParty(beneficiaryInst.tag, beneficiaryInst.value)
  const beneficiary = findByPrefix(fields, "59")
  if (beneficiary) result.beneficiary = parseParty(beneficiary.tag, beneficiary.value)

  result.remittanceInfo = findField(fields, "70")?.value.trim()
  result.chargesDetail = findField(fields, "71A")?.value.trim()
  result.senderToReceiverInfo = findField(fields, "72")?.value.trim()
  result.freeFormatText = findField(fields, "79")?.value.trim()

  // MT202 COV underlying customer credit transfer (sequence B).
  if (type === "MT202COV") {
    result.coverPayment = {
      orderingCustomer: result.orderingCustomer,
      beneficiary: result.beneficiary,
      remittanceInfo: result.remittanceInfo,
    }
  }

  // MT760 guarantee / standby letter of credit (issuance & collateral transfer).
  if (type === "MT760") {
    const f32b = findField(fields, "32B")
    let gAmount: number | undefined
    let gCurrency: string | undefined
    if (f32b) {
      const parsed = parseAmountField(f32b.value, false)
      gCurrency = parsed.currency
      gAmount = parsed.amount
    }
    const applicantField = findByPrefix(fields, "50")
    const beneficiaryField = findByPrefix(fields, "59")
    const f30 = findField(fields, "30")?.value.trim()
    const f31e = findField(fields, "31E")?.value.trim()
    // :35G: expiry can be a date (YYMMDD) optionally followed by narrative.
    const f35g = findField(fields, "35G")?.value.trim()
    const f35gDate = f35g?.match(/\d{6}/)?.[0]
    result.guarantee = {
      purpose: findField(fields, "22A")?.value.trim(),
      form: findField(fields, "22D")?.value.trim(),
      applicableRules: findField(fields, "40C")?.value.trim(),
      issueDate: f30 ? parseSwiftDate(f30) : undefined,
      expiryDate: f31e ? parseSwiftDate(f31e) : f35gDate ? parseSwiftDate(f35gDate) : undefined,
      currency: gCurrency,
      amount: gAmount,
      applicant: applicantField ? parseParty(applicantField.tag, applicantField.value) : undefined,
      beneficiary: beneficiaryField ? parseParty(beneficiaryField.tag, beneficiaryField.value) : undefined,
      terms:
        findField(fields, "77C")?.value.trim() ??
        findField(fields, "77U")?.value.trim(),
    }
    // Surface the undertaking amount at the top level for reconciliation/enrichment.
    if (result.amount === undefined && gAmount !== undefined) {
      result.amount = gAmount
      result.currency = gCurrency
    }
  }

  validateBusinessRules(result)
  result.valid = result.errors.length === 0
  return result
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

function validateBusinessRules(msg: ParsedSwiftMessage): void {
  const { type, errors, warnings } = msg

  // :20: Sender reference is mandatory in all supported message types.
  if (!msg.senderReference) {
    errors.push("Missing mandatory field :20: (Sender's Reference).")
  } else if (msg.senderReference.length > 16) {
    errors.push("Field :20: exceeds the 16-character maximum.")
  }

  if (type === "MT103" || type === "MT202" || type === "MT202COV") {
    if (msg.amount === undefined) {
      errors.push("Missing or invalid settlement amount (:32A:).")
    } else if (msg.amount <= 0) {
      errors.push("Settlement amount must be greater than zero.")
    }
    if (!msg.currency) {
      errors.push("Missing settlement currency (:32A:).")
    } else if (!/^[A-Z]{3}$/.test(msg.currency)) {
      warnings.push(`Unusual currency code "${msg.currency}".`)
    }
    if (!msg.valueDate) warnings.push("No value date present in :32A:.")
  }

  if (type === "MT103") {
    if (!msg.orderingCustomer) errors.push("MT103 is missing the ordering customer (:50a:).")
    if (!msg.beneficiary) errors.push("MT103 is missing the beneficiary customer (:59a:).")
    if (!msg.chargesDetail) {
      warnings.push("No charges detail (:71A:) present.")
    } else if (!["OUR", "BEN", "SHA"].includes(msg.chargesDetail)) {
      warnings.push(`Unrecognized charges code "${msg.chargesDetail}" (expected OUR/BEN/SHA).`)
    }
  }

  if (type === "MT202" || type === "MT202COV") {
    if (!msg.relatedReference) warnings.push("No related reference (:21:) present on the 202.")
    if (!msg.beneficiaryInstitution) errors.push("MT202 is missing the beneficiary institution (:58a:).")
  }

  if (type === "MT799") {
    if (!msg.freeFormatText) errors.push("MT799 is missing the free-format narrative (:79:).")
  }

  if (type === "MT760") {
    if (!msg.guarantee?.form && !msg.guarantee?.purpose) {
      warnings.push("MT760 has no undertaking form (:22D:) or purpose (:22A:).")
    }
    if (msg.guarantee?.amount === undefined) {
      warnings.push("MT760 has no undertaking amount (:32B:).")
    } else if (msg.guarantee.amount <= 0) {
      errors.push("MT760 undertaking amount must be greater than zero.")
    }
    if (!msg.guarantee?.beneficiary) {
      warnings.push("MT760 has no beneficiary of the undertaking (:59:).")
    }
  }

  // Validate any IBAN / BIC fields we extracted.
  const ibanCandidates = [
    msg.orderingCustomer?.account,
    msg.beneficiary?.account,
    msg.coverPayment?.beneficiary?.account,
  ].filter(Boolean) as string[]
  for (const acct of ibanCandidates) {
    if (/^[A-Z]{2}\d{2}/.test(acct.replace(/\s/g, ""))) {
      const v = validateIban(acct)
      if (!v.valid) warnings.push(`Account "${acct}" failed IBAN validation: ${v.error ?? "invalid"}.`)
    }
  }
  const bicCandidates = [
    msg.orderingInstitution?.bic,
    msg.accountWithInstitution?.bic,
    msg.beneficiaryInstitution?.bic,
    msg.beneficiary?.bic,
    msg.basicHeader?.senderBic,
  ].filter(Boolean) as string[]
  for (const bic of bicCandidates) {
    const v = validateBic(bic)
    if (!v.valid) warnings.push(`BIC "${bic}" failed validation: ${v.error ?? "invalid"}.`)
  }
}

// ---------------------------------------------------------------------------
// Bridge to the reconciliation engine
// ---------------------------------------------------------------------------

/** A flat view consumed by the reconciliation `IncomingPayment` model. */
export interface SwiftPaymentExtract {
  amount?: number
  currency?: string
  payer: string
  reference: string
  senderIban?: string
  senderBic?: string
  valueDate?: string
  uetr?: string
}

/**
 * Reduce a parsed message to the fields the reconciliation engine matches on.
 * The remittance reference (:70:) is preferred as the matching key, falling
 * back to the related reference (:21:) then the sender's reference (:20:).
 */
export function toReconciliationInput(msg: ParsedSwiftMessage): SwiftPaymentExtract {
  const payerParty = msg.orderingCustomer ?? msg.orderingInstitution
  const payer =
    payerParty?.nameAndAddress?.[0] ??
    payerParty?.bic ??
    msg.applicationHeader?.counterpartyBic ??
    msg.basicHeader?.senderBic ??
    "Unknown sender"

  const reference =
    msg.remittanceInfo?.replace(/\n/g, " ").trim() ||
    msg.relatedReference ||
    msg.senderReference ||
    ""

  return {
    amount: msg.amount,
    currency: msg.currency,
    payer,
    reference,
    senderIban: payerParty?.account,
    senderBic: payerParty?.bic ?? msg.orderingInstitution?.bic ?? msg.basicHeader?.senderBic,
    valueDate: msg.valueDate,
    uetr: msg.uetr,
  }
}

// ---------------------------------------------------------------------------
// Generation (outbound MT103 / MT202)
// ---------------------------------------------------------------------------

export interface GenerateMtInput {
  type: "MT103" | "MT202"
  senderBic: string
  receiverBic: string
  /** :20: max 16 chars. */
  senderReference: string
  /** :21: related reference (202). */
  relatedReference?: string
  valueDate: string // ISO yyyy-mm-dd
  currency: string
  amount: number
  /** Ordering customer (103) or ordering institution (202). */
  ordering?: { account?: string; bic?: string; nameAndAddress?: string[] }
  /** Beneficiary customer (103) or beneficiary institution (202). */
  beneficiary?: { account?: string; bic?: string; nameAndAddress?: string[] }
  remittanceInfo?: string
  /** OUR / BEN / SHA (103 only). */
  chargesDetail?: "OUR" | "BEN" | "SHA"
  /** Provide to embed a gpi UETR (Block 3 field 121); auto-generated if omitted. */
  uetr?: string
  includeGpi?: boolean
}

/** Format an ISO yyyy-mm-dd to SWIFT YYMMDD. */
function toSwiftDate(iso: string): string {
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (!m) return ""
  return `${m[1].slice(2)}${m[2]}${m[3]}`
}

/** Format a JS number to a SWIFT decimal (comma separator, no thousands sep). */
export function formatSwiftAmount(amount: number): string {
  return amount.toFixed(2).replace(".", ",")
}

/** Generate a RFC 4122 v4 UETR (lower-case) for gpi tracking. */
export function generateUetr(): string {
  const bytes = new Uint8Array(16)
  if (typeof globalThis.crypto?.getRandomValues === "function") {
    globalThis.crypto.getRandomValues(bytes)
  } else {
    for (let i = 0; i < 16; i++) bytes[i] = Math.floor(Math.random() * 256)
  }
  bytes[6] = (bytes[6] & 0x0f) | 0x40
  bytes[8] = (bytes[8] & 0x3f) | 0x80
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("")
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}

function formatParty(party?: { account?: string; bic?: string; nameAndAddress?: string[] }): string {
  if (!party) return ""
  const lines: string[] = []
  if (party.account) lines.push(`/${party.account}`)
  if (party.bic) lines.push(party.bic)
  if (party.nameAndAddress) lines.push(...party.nameAndAddress)
  return lines.join("\n")
}

/**
 * Generate a well-formed SWIFT MT103 or MT202 message. Returns the raw FIN
 * text including Blocks 1-5. The result round-trips through `parseSwiftMessage`.
 */
export function generateSwiftMessage(input: GenerateMtInput): { raw: string; uetr: string } {
  const mt = input.type === "MT103" ? "103" : "202"
  const uetr = input.uetr ?? generateUetr()

  const block1 = `{1:F01${padBic(input.senderBic)}0000000000}`
  const block2 = `{2:I${mt}${padBic(input.receiverBic)}N}`
  const block3 = input.includeGpi !== false ? `{3:{121:${uetr}}}` : ""

  const lines: string[] = []
  lines.push(`:20:${input.senderReference.slice(0, 16)}`)
  if (mt === "202" && input.relatedReference) lines.push(`:21:${input.relatedReference.slice(0, 16)}`)
  lines.push(`:32A:${toSwiftDate(input.valueDate)}${input.currency}${formatSwiftAmount(input.amount)}`)

  if (mt === "103") {
    const orderingOption = input.ordering?.bic ? "A" : "K"
    if (input.ordering) lines.push(`:50${orderingOption}:${formatParty(input.ordering)}`)
    const benOption = input.beneficiary?.bic ? "A" : ""
    if (input.beneficiary) lines.push(`:59${benOption}:${formatParty(input.beneficiary)}`)
    if (input.remittanceInfo) lines.push(`:70:${input.remittanceInfo}`)
    lines.push(`:71A:${input.chargesDetail ?? "SHA"}`)
  } else {
    if (input.ordering) lines.push(`:52A:${formatParty(input.ordering)}`)
    if (input.beneficiary) lines.push(`:58A:${formatParty(input.beneficiary)}`)
    if (input.remittanceInfo) lines.push(`:72:/INS/${input.remittanceInfo}`)
  }

  const block4 = `{4:\n${lines.join("\n")}\n-}`
  const raw = `${block1}${block2}${block3}${block4}`
  return { raw, uetr }
}

function padBic(bic: string): string {
  // LT address is 12 chars: 8-char BIC + LT code "X" + 3-char branch "XXX".
  const clean = bic.replace(/\s/g, "").toUpperCase()
  if (clean.length >= 12) return clean.slice(0, 12)
  if (clean.length === 11) return clean + "X"
  if (clean.length === 8) return clean + "XXXX"
  return clean.padEnd(12, "X")
}

// ---------------------------------------------------------------------------
// Generation (instrument messaging — MT760 guarantee / MT799 free format)
// ---------------------------------------------------------------------------

export interface GenerateMt760Input {
  senderBic: string
  receiverBic: string
  /** :20: Transaction reference (max 16 chars). */
  senderReference: string
  /** :23: Related reference / further identification (optional). */
  relatedReference?: string
  /** :22A: Purpose — "ISSU" issuance, "ICCO" collateral, "ISCO" counter, etc. */
  purpose?: string
  /** :22D: Form of undertaking — "DGAR" demand guarantee, "STBY" standby LC. */
  form?: "DGAR" | "STBY" | string
  /** :40C: Applicable rules — "URDG", "ISPR", "NONE". */
  applicableRules?: string
  /** Issue date (ISO yyyy-mm-dd) → :30:. */
  issueDate?: string
  /** Expiry date (ISO yyyy-mm-dd) → :31E:. */
  expiryDate?: string
  currency: string
  /** Undertaking amount → :32B:. */
  amount: number
  /** :50: Applicant / instructing party. */
  applicant?: { account?: string; bic?: string; nameAndAddress?: string[] }
  /** :59: Beneficiary of the undertaking. */
  beneficiary?: { account?: string; bic?: string; nameAndAddress?: string[] }
  /** :77C: Terms and conditions narrative. */
  terms?: string
  /** Embed a gpi UETR (Block 3 field 121); auto-generated unless includeGpi=false. */
  uetr?: string
  includeGpi?: boolean
}

/**
 * Generate a well-formed SWIFT MT760 (Guarantee / Standby Letter of Credit).
 * Used by the instrument desk to issue or collateral-transfer an SBLC/BG. The
 * output round-trips through `parseSwiftMessage` as type "MT760".
 */
export function generateMt760(input: GenerateMt760Input): { raw: string; uetr: string } {
  const uetr = input.uetr ?? generateUetr()
  const block1 = `{1:F01${padBic(input.senderBic)}0000000000}`
  const block2 = `{2:I760${padBic(input.receiverBic)}N}`
  const block3 = input.includeGpi !== false ? `{3:{121:${uetr}}}` : ""

  const lines: string[] = []
  lines.push(`:20:${input.senderReference.slice(0, 16)}`)
  if (input.relatedReference) lines.push(`:23:${input.relatedReference.slice(0, 16)}`)
  if (input.purpose) lines.push(`:22A:${input.purpose}`)
  if (input.form) lines.push(`:22D:${input.form}`)
  if (input.applicableRules) lines.push(`:40C:${input.applicableRules}`)
  if (input.issueDate) lines.push(`:30:${toSwiftDate(input.issueDate)}`)
  if (input.applicant) lines.push(`:50:${formatParty(input.applicant)}`)
  if (input.beneficiary) lines.push(`:59:${formatParty(input.beneficiary)}`)
  lines.push(`:32B:${input.currency}${formatSwiftAmount(input.amount)}`)
  if (input.expiryDate) lines.push(`:31E:${toSwiftDate(input.expiryDate)}`)
  if (input.terms) lines.push(`:77C:${input.terms}`)

  const block4 = `{4:\n${lines.join("\n")}\n-}`
  return { raw: `${block1}${block2}${block3}${block4}`, uetr }
}

export interface GenerateMt799Input {
  senderBic: string
  receiverBic: string
  /** :20: Transaction reference (max 16 chars). */
  senderReference: string
  /** :21: Related reference (optional). */
  relatedReference?: string
  /** :79: Free-format narrative (RWA / pre-advice / confirmation). */
  narrative: string
  uetr?: string
  includeGpi?: boolean
}

/**
 * Generate a well-formed SWIFT MT799 (free-format) message — used for
 * ready-willing-able (RWA) advices and pre-advice confirmations on instrument
 * transactions. Round-trips through `parseSwiftMessage` as type "MT799".
 */
export function generateMt799(input: GenerateMt799Input): { raw: string; uetr: string } {
  const uetr = input.uetr ?? generateUetr()
  const block1 = `{1:F01${padBic(input.senderBic)}0000000000}`
  const block2 = `{2:I799${padBic(input.receiverBic)}N}`
  const block3 = input.includeGpi !== false ? `{3:{121:${uetr}}}` : ""

  const lines: string[] = []
  lines.push(`:20:${input.senderReference.slice(0, 16)}`)
  if (input.relatedReference) lines.push(`:21:${input.relatedReference.slice(0, 16)}`)
  // :79: lines are limited to 50 chars each; wrap the narrative.
  const narrativeLines = input.narrative
    .split("\n")
    .flatMap((line) => line.match(/.{1,50}/g) ?? [""])
  lines.push(`:79:${narrativeLines.join("\n")}`)

  const block4 = `{4:\n${lines.join("\n")}\n-}`
  return { raw: `${block1}${block2}${block3}${block4}`, uetr }
}
