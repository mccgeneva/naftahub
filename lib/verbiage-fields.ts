import type { VerbiageAnalysis } from "@/lib/verbiage-types"

export type VerbiageFieldKey =
  | "instrumentType"
  | "issuingBank"
  | "issuingBankBic"
  | "applicant"
  | "beneficiary"
  | "beneficiaryBank"
  | "beneficiaryBankBic"
  | "currency"
  | "faceValue"
  | "issueDate"
  | "expiryDate"
  | "expiryPlace"
  | "governingRules"
  | "paymentTerms"
  | "governingLaw"

export type VerbiageFieldDef = {
  key: VerbiageFieldKey
  label: string
  placeholder: string
  inputMode?: "text" | "decimal"
}

export const VERBIAGE_FIELDS: VerbiageFieldDef[] = [
  { key: "instrumentType", label: "Instrument type", placeholder: "e.g. Standby Letter of Credit" },
  { key: "issuingBank", label: "Issuing bank", placeholder: "e.g. Barclays Bank PLC, London" },
  { key: "issuingBankBic", label: "Issuing bank BIC", placeholder: "e.g. BARCGB22" },
  { key: "applicant", label: "Applicant (name & address)", placeholder: "Ordering party" },
  { key: "beneficiary", label: "Beneficiary (name & address)", placeholder: "Who receives the undertaking" },
  { key: "beneficiaryBank", label: "Beneficiary bank", placeholder: "e.g. Barclays Bank PLC" },
  { key: "beneficiaryBankBic", label: "Beneficiary bank BIC", placeholder: "e.g. BARCGB22" },
  { key: "currency", label: "Currency", placeholder: "e.g. EUR" },
  { key: "faceValue", label: "Amount", placeholder: "e.g. 500000000", inputMode: "decimal" },
  { key: "issueDate", label: "Issue date", placeholder: "YYYY-MM-DD" },
  { key: "expiryDate", label: "Expiry date", placeholder: "YYYY-MM-DD" },
  { key: "expiryPlace", label: "Place of expiry", placeholder: "e.g. London, United Kingdom" },
  { key: "governingRules", label: "Governing rules", placeholder: "URDG 758 or ISP98 (one only)" },
  { key: "paymentTerms", label: "Payment terms", placeholder: "When the bank pays a complying demand" },
  { key: "governingLaw", label: "Governing law & jurisdiction", placeholder: "e.g. English law, courts of England" },
]

export type VerbiageFieldValues = Record<VerbiageFieldKey, string>

const clean = (v: string | undefined | null) => {
  const s = (v ?? "").trim()
  return /^\[.*\]$/.test(s) ? "" : s
}

/** Prefill the form from the analysis, with bank-standard defaults where safe. */
export function fieldsFromAnalysis(a: VerbiageAnalysis): VerbiageFieldValues {
  const isStandby = /standby|sblc/i.test(a.instrumentType || "")
  const rules = clean(a.governingRules)
  return {
    instrumentType: clean(a.instrumentType),
    issuingBank: clean(a.issuingBank),
    issuingBankBic: clean(a.issuingBankBic),
    applicant: clean(a.applicant),
    beneficiary: clean(a.beneficiary),
    beneficiaryBank: clean(a.beneficiaryBank),
    beneficiaryBankBic: "",
    currency: clean(a.currency).toUpperCase(),
    faceValue: clean(a.faceValue).replace(/[^\d.]/g, ""),
    issueDate: "",
    expiryDate: clean(a.expiryDate),
    expiryPlace: "",
    // A mixed "URDG 758 / UCP 600" citation is a defect — offer one set only.
    governingRules: rules && !/\/|\band\b|,/i.test(rules) ? rules : isStandby ? "ISP98" : "URDG 758",
    paymentTerms:
      clean(a.paymentTerms) ||
      "Payment within five (5) banking days after receipt of a complying demand",
    governingLaw: "English law, with the exclusive jurisdiction of the courts of England and Wales",
  }
}

export function missingFieldKeys(v: Partial<VerbiageFieldValues>): VerbiageFieldKey[] {
  return VERBIAGE_FIELDS.filter((f) => !(v[f.key] ?? "").trim()).map((f) => f.key)
}

/** Deterministically assemble bank-standard MT760 wording from the completed fields. */
export function buildVerbiageText(v: VerbiageFieldValues, reference: string): string {
  const amount = Number(v.faceValue.replace(/,/g, ""))
  const amountFin = Number.isFinite(amount) ? amount.toFixed(2).replace(".", ",") : v.faceValue
  const amountWords = Number.isFinite(amount) ? amount.toLocaleString("en-US", { minimumFractionDigits: 2 }) : v.faceValue
  const ccy = v.currency.toUpperCase()
  const type = v.instrumentType.toUpperCase()
  return [
    "MT760 — ISSUE OF A DEMAND GUARANTEE / STANDBY LETTER OF CREDIT",
    `SENDER: ${v.issuingBank} (BIC ${v.issuingBankBic.toUpperCase()})`,
    `RECEIVER: ${v.beneficiaryBank} (BIC ${v.beneficiaryBankBic.toUpperCase()})`,
    "",
    ":27: 1/1",
    `:20: ${reference}`,
    `:23: ISSUE OF ${type}`,
    ":40A: IRREVOCABLE",
    `:31C: ${v.issueDate}`,
    `:40C: ${v.governingRules.toUpperCase()}`,
    `:31E: ${v.expiryDate} AT ${v.expiryPlace.toUpperCase()}`,
    `:50: ${v.applicant}`,
    `:52A: ${v.issuingBankBic.toUpperCase()}`,
    `:59: ${v.beneficiary}`,
    `:32B: ${ccy}${amountFin}`,
    ":77U: UNDERTAKING",
    `AT THE REQUEST OF ${v.applicant.toUpperCase()} (THE APPLICANT), WE, ${v.issuingBank.toUpperCase()}, HEREBY ISSUE ` +
      `OUR IRREVOCABLE ${type} NO. ${reference} IN FAVOUR OF ${v.beneficiary.toUpperCase()} (THE BENEFICIARY) ` +
      `FOR A MAXIMUM AGGREGATE AMOUNT OF ${ccy} ${amountWords}.`,
    `WE IRREVOCABLY UNDERTAKE TO PAY THE BENEFICIARY ANY SUM OR SUMS NOT EXCEEDING IN TOTAL THE ABOVE AMOUNT UPON ` +
      `RECEIPT OF THE BENEFICIARY'S FIRST WRITTEN DEMAND, AUTHENTICATED BY SWIFT THROUGH ${v.beneficiaryBank.toUpperCase()}, ` +
      `STATING THAT THE APPLICANT IS IN BREACH OF ITS OBLIGATIONS. ${v.paymentTerms.toUpperCase()}.`,
    `THIS UNDERTAKING EXPIRES ON ${v.expiryDate} AT ${v.expiryPlace.toUpperCase()}. ANY DEMAND MUST BE RECEIVED ` +
      "BY US ON OR BEFORE THAT DATE, AFTER WHICH THIS UNDERTAKING BECOMES NULL AND VOID WHETHER OR NOT RETURNED.",
    "THE AMOUNT IS REDUCED AUTOMATICALLY BY ANY PAYMENT MADE HEREUNDER. ALL CHARGES OF THE ISSUING BANK ARE FOR " +
      "THE ACCOUNT OF THE APPLICANT; ALL OTHER CHARGES ARE FOR THE ACCOUNT OF THE BENEFICIARY. THIS UNDERTAKING IS NOT " +
      "TRANSFERABLE OR ASSIGNABLE WITHOUT OUR PRIOR WRITTEN CONSENT.",
    `THIS UNDERTAKING IS SUBJECT TO ${v.governingRules.toUpperCase()} AND IS GOVERNED BY ${v.governingLaw.toUpperCase()}.`,
    "THIS MESSAGE IS THE OPERATIVE INSTRUMENT. NO MAIL CONFIRMATION WILL FOLLOW.",
  ].join("\n")
}
