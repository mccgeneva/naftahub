import * as z from "zod"

export const verbiageAnalysisSchema = z.object({
  instrumentType: z
    .string()
    .describe('The instrument type the verbiage describes, e.g. "Bank Guarantee", "SBLC", "DLC", "MTN", "Bond". Empty if unclear.'),
  swiftMessageType: z.string().describe('Intended SWIFT message, e.g. "MT760", "MT700", "MT799". Empty if not stated.'),
  issuingBank: z.string().describe("Issuing bank named in the verbiage. Empty if none."),
  issuingBankBic: z.string().describe("Issuing bank BIC. Empty if none."),
  applicant: z.string().describe("Applicant / ordering party. Empty if none."),
  beneficiary: z.string().describe("Beneficiary named in the verbiage. Empty if none."),
  beneficiaryBank: z.string().describe("Beneficiary / receiving bank and BIC. Empty if none."),
  currency: z.string().describe('Currency code, e.g. "EUR". Empty if none.'),
  faceValue: z.string().describe("Face value as digits only, no separators. Empty if none."),
  tenor: z.string().describe('Tenor / validity, e.g. "1 year and 1 day". Empty if none.'),
  expiryDate: z.string().describe("Expiry date as written. Empty if none."),
  governingRules: z.string().describe('Governing rules, e.g. "URDG 758", "ISP98", "UCP 600". Empty if none.'),
  paymentTerms: z.string().describe("How and when the instrument pays, as stated. Empty if none."),
  keyClauses: z.array(z.string()).describe("Each operative clause, summarised in one short sentence."),
  missingElements: z
    .array(z.string())
    .describe("Standard elements a bank needs to issue this instrument that are absent or incomplete."),
  risks: z
    .array(z.string())
    .describe("Wording that is ambiguous, non-standard, contradictory or commonly rejected by issuing banks."),
  complianceScore: z
    .number()
    .describe("0-100: how ready this verbiage is for a bank to issue it as written. 80+ ready, 50-79 needs edits, <50 not issuable."),
  verdict: z
    .enum(["ready", "needs_revision", "not_issuable"])
    .describe("ready = can be sent for issuance; needs_revision = fixable gaps; not_issuable = fundamental problems."),
  summary: z.string().describe("Two or three plain-English sentences describing the instrument and the overall assessment."),
})

export type VerbiageAnalysis = z.infer<typeof verbiageAnalysisSchema>

export const VERBIAGE_STATUS_LABELS: Record<string, string> = {
  analyzed: "Awaiting your approval",
  override_requested: "Force approval requested — awaiting administrator",
  awaiting_transmission: "Approved — queued for Barclays",
  transmitted: "Sent to Barclays for execution",
  issued: "Instrument issued",
  rejected: "Declined",
  withdrawn: "Withdrawn",
}

export const VERBIAGE_VERDICT_LABELS: Record<VerbiageAnalysis["verdict"], string> = {
  ready: "Ready for issuance",
  needs_revision: "Needs revision",
  not_issuable: "Not issuable as written",
}
