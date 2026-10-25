// Internal MT103-style SIMULATION builder (training only). Pure + client-safe.
// Every party identifier is replaced with an obviously fictitious placeholder;
// real IBANs, account numbers and bank names are stripped or rejected so the
// output can never be presented as a genuine bank document or SWIFT message.

export const SIMULATION_DISCLAIMER =
  "SIMULATION – NOT A BANK DOCUMENT – NOT A SWIFT MESSAGE – FOR INTERNAL TRAINING ONLY"

export const SIM_SENDER_BIC = "SIMTEST0XXX"
export const SIM_RECEIVER_BIC = "SIMTEST1XXX"
export const SIM_SENDER_ACCOUNT = "SIM-ACCT-ORDERING-0001"
export const SIM_BENEFICIARY_ACCOUNT = "SIM-ACCT-BENEFICIARY-0002"

export const SIM_CHARGE_OPTIONS = ["OUR", "SHA", "BEN"] as const
export type SimChargeOption = (typeof SIM_CHARGE_OPTIONS)[number]

export interface SwiftSimulationInput {
  senderName: string
  senderAddress: string
  beneficiaryName: string
  beneficiaryAddress: string
  amount: string
  currency: string
  valueDate: string
  reference: string
  remittanceInfo: string
  charges: SimChargeOption
}

export interface SwiftSimulationField {
  tag: string
  meaning: string
  value: string
}

export interface SwiftSimulationRecord {
  id: string
  isSimulation: true
  createdAt: string
  createdBy: string
  input: SwiftSimulationInput
  fields: SwiftSimulationField[]
  warnings: string[]
}

export const EMPTY_SIM_INPUT: SwiftSimulationInput = {
  senderName: "",
  senderAddress: "",
  beneficiaryName: "",
  beneficiaryAddress: "",
  amount: "",
  currency: "EUR",
  valueDate: "",
  reference: "",
  remittanceInfo: "",
  charges: "SHA",
}

const IBAN_RE = /\b[A-Z]{2}\d{2}(?:\s?[A-Z0-9]{2,4}){3,8}\b/gi
const LONG_DIGITS_RE = /\d{6,}/g
const BANK_WORD_RE = /\b(bank|banca|banco|banque|bancorp|bankhaus|sparkasse|clearing|swift)\b/i

/** Strip real-looking account identifiers from free text. */
function scrub(text: string, label: string, warnings: string[]): string {
  let out = text.trim().slice(0, 140)
  if (IBAN_RE.test(out)) {
    warnings.push(`${label}: an IBAN-like value was removed.`)
    out = out.replace(IBAN_RE, "[REMOVED]")
  }
  IBAN_RE.lastIndex = 0
  if (LONG_DIGITS_RE.test(out)) {
    warnings.push(`${label}: a long number (possible account) was masked.`)
    out = out.replace(LONG_DIGITS_RE, (m) => "•".repeat(Math.min(m.length, 6)))
  }
  LONG_DIGITS_RE.lastIndex = 0
  return out
}

/** Returns an error string when input is not allowed, else null. */
export function validateSimulationInput(input: SwiftSimulationInput): string | null {
  if (!input.senderName.trim() || !input.beneficiaryName.trim()) {
    return "Ordering customer and beneficiary names are required."
  }
  const amount = Number(input.amount.replace(/,/g, ""))
  if (!Number.isFinite(amount) || amount <= 0) return "Enter a positive amount."
  if (!/^[A-Z]{3}$/.test(input.currency.trim().toUpperCase())) return "Currency must be a 3-letter code."
  for (const [label, v] of [
    ["Ordering customer", input.senderName],
    ["Beneficiary", input.beneficiaryName],
    ["Ordering address", input.senderAddress],
    ["Beneficiary address", input.beneficiaryAddress],
  ] as const) {
    if (BANK_WORD_RE.test(v)) {
      return `${label}: bank names are not allowed in a simulation — use the party name only.`
    }
  }
  return null
}

function formatAmount(amount: string): string {
  const n = Number(amount.replace(/,/g, ""))
  return n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

/** Build the field table. Bank/routing identifiers are ALWAYS fictitious. */
export function buildSimulationFields(input: SwiftSimulationInput): {
  fields: SwiftSimulationField[]
  warnings: string[]
} {
  const warnings: string[] = []
  const ref = scrub(input.reference || "SIM-REF", "Reference", warnings).toUpperCase()
  const fields: SwiftSimulationField[] = [
    { tag: "Header", meaning: "Simulated sender / receiver", value: `${SIM_SENDER_BIC} → ${SIM_RECEIVER_BIC} (fictitious)` },
    { tag: ":20:", meaning: "Sender's reference", value: ref },
    { tag: ":23B:", meaning: "Bank operation code", value: "CRED (simulated)" },
    {
      tag: ":32A:",
      meaning: "Value date / currency / amount",
      value: `${input.valueDate || "—"} · ${input.currency.toUpperCase()} ${formatAmount(input.amount)}`,
    },
    {
      tag: ":50K:",
      meaning: "Ordering customer",
      value: `${SIM_SENDER_ACCOUNT}\n${scrub(input.senderName, "Ordering customer", warnings)}${
        input.senderAddress ? `\n${scrub(input.senderAddress, "Ordering address", warnings)}` : ""
      }`,
    },
    {
      tag: ":59:",
      meaning: "Beneficiary customer",
      value: `${SIM_BENEFICIARY_ACCOUNT}\n${scrub(input.beneficiaryName, "Beneficiary", warnings)}${
        input.beneficiaryAddress ? `\n${scrub(input.beneficiaryAddress, "Beneficiary address", warnings)}` : ""
      }`,
    },
    {
      tag: ":70:",
      meaning: "Remittance information",
      value: input.remittanceInfo ? scrub(input.remittanceInfo, "Remittance info", warnings) : "—",
    },
    { tag: ":71A:", meaning: "Details of charges", value: input.charges },
  ]
  return { fields, warnings }
}

/** Parse pasted "Key: value" payment-note text into input fields. */
export function parsePaymentNote(text: string): Partial<SwiftSimulationInput> {
  const out: Partial<SwiftSimulationInput> = {}
  const map: Array<[RegExp, keyof SwiftSimulationInput]> = [
    [/^(sender|ordering|payer|from)( name)?$/i, "senderName"],
    [/^(sender|ordering|payer) address$/i, "senderAddress"],
    [/^(beneficiary|payee|to)( name)?$/i, "beneficiaryName"],
    [/^(beneficiary|payee) address$/i, "beneficiaryAddress"],
    [/^amount$/i, "amount"],
    [/^(currency|ccy)$/i, "currency"],
    [/^(value date|date)$/i, "valueDate"],
    [/^(reference|ref)$/i, "reference"],
    [/^(remittance|purpose|details|description)( info(rmation)?)?$/i, "remittanceInfo"],
  ]
  for (const line of text.split(/\r?\n/)) {
    const idx = line.indexOf(":")
    if (idx <= 0) continue
    const key = line.slice(0, idx).trim()
    const value = line.slice(idx + 1).trim()
    const hit = map.find(([re]) => re.test(key))
    if (hit && value) (out as Record<string, string>)[hit[1]] = value
  }
  if (out.amount) {
    const m = out.amount.match(/([A-Z]{3})?\s*([\d.,]+)/i)
    if (m) {
      if (m[1] && !out.currency) out.currency = m[1].toUpperCase()
      out.amount = m[2].replace(/,/g, "")
    }
  }
  return out
}
