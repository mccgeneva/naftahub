import "server-only"
import { generateText, Output } from "ai"
import { docAnalysisModel, nqaiChatModel } from "@/lib/ai-models"
import { detectMediaType } from "@/lib/kyc-analyze"
import { verbiageAnalysisSchema, type VerbiageAnalysis } from "@/lib/verbiage-types"

const PROMPT =
  "You are a senior trade-finance documentation officer at an issuing bank. The attached file is a DRAFT VERBIAGE " +
  "(the proposed wording) for a bank instrument — typically a Bank Guarantee or SBLC to be sent as SWIFT MT760, " +
  "or an LC (MT700), MTN or bond — that a client wants a bank to issue.\n\n" +
  "Read it carefully and produce a structured review: extract the parties, amount, currency, tenor, governing " +
  "rules and payment terms exactly as written; list each operative clause; list the standard elements a bank " +
  "needs that are missing; and flag wording that is ambiguous, contradictory, non-standard or that banks commonly " +
  "reject (e.g. 'irrevocable and revocable', missing expiry, no governing rules, unclear demand conditions, " +
  "unrealistic yields, names that are not real banks).\n\n" +
  "RULES: transcribe only what the document says — never invent banks, BICs, amounts or dates. Use an empty " +
  "string or empty list when something is absent. Score readiness honestly."

async function attempt(model: ReturnType<typeof docAnalysisModel>, buffer: Buffer, mediaType: string) {
  const { output } = await generateText({
    model,
    output: Output.object({ schema: verbiageAnalysisSchema }),
    messages: [
      {
        role: "user",
        content: [
          { type: "text", text: PROMPT },
          { type: "file" as const, data: new Uint8Array(buffer), mediaType },
        ],
      },
    ],
  })
  if (!output?.summary?.trim()) throw new Error("Empty analysis.")
  return output
}

export async function analyzeVerbiageDocument(buffer: Buffer, declaredType: string): Promise<VerbiageAnalysis> {
  const mediaType = detectMediaType(buffer, declaredType)
  const errors: string[] = []
  for (const model of [docAnalysisModel(), nqaiChatModel()]) {
    try {
      const out = await attempt(model, buffer, mediaType)
      return { ...out, complianceScore: Math.max(0, Math.min(100, Math.round(out.complianceScore || 0))) }
    } catch (err) {
      errors.push(err instanceof Error ? err.message : String(err))
    }
  }
  console.log("[v0] Verbiage analysis failed on every model:", errors)
  throw new Error("The document could not be analysed.")
}

/** Re-runs the same review on plain-text wording (the auto-fixed or edited draft). */
export async function analyzeVerbiageText(text: string): Promise<VerbiageAnalysis> {
  const errors: string[] = []
  for (const model of [docAnalysisModel(), nqaiChatModel()]) {
    try {
      const { output } = await generateText({
        model,
        output: Output.object({ schema: verbiageAnalysisSchema }),
        prompt:
          PROMPT.replace("The attached file is", "The text below is") +
          "\n\nAny text in [SQUARE BRACKETS] is an unfilled placeholder — treat that element as MISSING." +
          `\n\n--- VERBIAGE ---\n${text}`,
      })
      if (!output?.summary?.trim()) throw new Error("Empty analysis.")
      return { ...output, complianceScore: Math.max(0, Math.min(100, Math.round(output.complianceScore || 0))) }
    } catch (err) {
      errors.push(err instanceof Error ? err.message : String(err))
    }
  }
  console.log("[v0] Verbiage text analysis failed:", errors)
  throw new Error("The corrected wording could not be analysed.")
}

const FIX_PROMPT =
  "You are a senior trade-finance documentation officer. Rewrite the draft bank-instrument verbiage below into " +
  "clean, bank-standard wording that resolves every listed MISSING ELEMENT and RISK.\n\n" +
  "Fix drafting defects: remove contradictions (e.g. 'irrevocable and revocable', conflicting drawing rules), " +
  "add standard clauses (irrevocability, governing rules such as URDG 758 / ISP98 / UCP 600, demand/presentation " +
  "conditions, payment within a stated number of banking days after a complying presentation, expiry date and " +
  "place, transferability, reduction, charges, governing law and jurisdiction).\n\n" +
  "STRICT RULES:\n" +
  "- Keep every real fact from the draft exactly (parties, amounts, currency, dates, BICs).\n" +
  "- NEVER invent a bank, BIC, person, company, account, amount or date. Where a required fact is missing, " +
  "insert an UPPERCASE placeholder in square brackets, e.g. [ISSUING BANK NAME], [ISSUING BANK BIC], [EXPIRY DATE].\n" +
  "- Do not promise yields, returns or guaranteed profits, and do not add wording whose purpose is to make an " +
  "unverifiable counterparty look legitimate.\n" +
  "- Output ONLY the corrected verbiage text, laid out as SWIFT-style fields (e.g. :40A:, :20:, :31C:, :32B:, :77U:). " +
  "No commentary, no markdown fences."

/** Drafts corrected wording from the review; missing facts become [PLACEHOLDERS] the customer fills in. */
export async function autoFixVerbiage(analysis: VerbiageAnalysis, currentText?: string | null): Promise<string> {
  const source = currentText?.trim()
    ? `CURRENT DRAFT TEXT:\n${currentText}`
    : [
        "DRAFT (as extracted from the uploaded document):",
        `Instrument: ${analysis.instrumentType} ${analysis.swiftMessageType}`,
        `Issuing bank: ${analysis.issuingBank} ${analysis.issuingBankBic}`,
        `Applicant: ${analysis.applicant}`,
        `Beneficiary: ${analysis.beneficiary} / ${analysis.beneficiaryBank}`,
        `Face value: ${analysis.currency} ${analysis.faceValue}`,
        `Tenor: ${analysis.tenor}  Expiry: ${analysis.expiryDate}`,
        `Governing rules: ${analysis.governingRules}`,
        `Payment terms: ${analysis.paymentTerms}`,
        "Operative clauses:",
        ...analysis.keyClauses.map((c, i) => `${i + 1}. ${c}`),
      ].join("\n")
  const issues = [
    "MISSING ELEMENTS:",
    ...analysis.missingElements.map((m) => `- ${m}`),
    "RISKS:",
    ...analysis.risks.map((r) => `- ${r}`),
  ].join("\n")

  const errors: string[] = []
  for (const model of [docAnalysisModel(), nqaiChatModel()]) {
    try {
      const { text } = await generateText({ model, prompt: `${FIX_PROMPT}\n\n${source}\n\n${issues}` })
      const clean = text.replace(/^```[a-z]*\n?|```$/gim, "").trim()
      if (clean.length < 40) throw new Error("Empty rewrite.")
      return clean.slice(0, 20000)
    } catch (err) {
      errors.push(err instanceof Error ? err.message : String(err))
    }
  }
  console.log("[v0] Verbiage auto-fix failed:", errors)
  throw new Error("The wording could not be corrected automatically.")
}

/** Placeholders like [ISSUING BANK NAME] still waiting to be filled. */
export function unfilledPlaceholders(text: string): string[] {
  return Array.from(new Set(text.match(/\[[A-Z0-9][A-Z0-9 /&.,'()-]{1,60}\]/g) ?? []))
}
