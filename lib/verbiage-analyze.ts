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
