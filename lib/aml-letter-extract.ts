import "server-only"
import { generateText, Output } from "ai"
import * as z from "zod"
import { docAnalysisModel, nqaiChatModel } from "@/lib/ai-models"
import { detectMediaType } from "@/lib/kyc-analyze"

// Reads an auditor / compliance-office letter about a customer and proposes a
// structured case file: who wrote it, what it found, the risk level, and the
// measures it asks for. The administrator always reviews and edits the result
// before anything is saved — this is a drafting aid, not a decision.

export const amlLetterSchema = z.object({
  subject: z.string().describe("Short case title, e.g. 'Unexplained source of funds — inbound USD wires'."),
  source: z
    .enum(["auditor", "compliance_office", "regulator", "bank_partner", "other"])
    .describe("Who issued the letter."),
  authorName: z.string().describe("Issuing firm / office and signatory as written. Empty if absent."),
  letterReference: z.string().describe("The letter's own reference number. Empty if absent."),
  letterDate: z.string().describe("Letter date as YYYY-MM-DD if determinable, else empty."),
  riskLevel: z.enum(["low", "medium", "high", "critical"]).describe("Risk level stated or clearly implied by the letter."),
  summary: z.string().describe("Two or three sentence plain-English summary of the letter."),
  findings: z.string().describe("The concerns / findings raised, as a short bullet list (one per line, starting with '- ')."),
  measures: z
    .array(
      z.object({
        category: z.enum([
          "enhanced_due_diligence",
          "request_documents",
          "restrict_outgoing",
          "freeze_account",
          "monitor_transactions",
          "file_sar",
          "close_account",
          "other",
        ]),
        text: z.string().describe("The concrete action requested or recommended."),
        dueDate: z.string().describe("Deadline as YYYY-MM-DD if the letter sets one, else empty."),
      }),
    )
    .describe("Actions the letter requests or recommends on this account. Empty array if none."),
})

export type AmlLetterExtraction = z.infer<typeof amlLetterSchema>

const PROMPT =
  "You are an AML compliance officer at a Swiss fiduciary platform. The attached file is a letter from the " +
  "platform's auditors or compliance office (or a regulator / partner bank) concerning one customer account.\n\n" +
  "Extract a structured case file. Rules: report ONLY what the letter says or clearly implies. Do not invent " +
  "names, references, amounts or deadlines — use empty strings when absent. List every action the letter asks " +
  "for (enhanced due diligence, document requests, restricting payments, freezing, monitoring, filing a " +
  "suspicious activity report, closing the account) as a separate measure."

async function attempt(model: ReturnType<typeof docAnalysisModel>, buffer: Buffer, mediaType: string) {
  const { output } = await generateText({
    model,
    output: Output.object({ schema: amlLetterSchema }),
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

export async function extractAmlLetter(buffer: Buffer, fallbackType: string): Promise<AmlLetterExtraction> {
  const mediaType = detectMediaType(buffer, fallbackType)
  const errors: string[] = []
  for (const model of [docAnalysisModel(), nqaiChatModel()]) {
    try {
      return await attempt(model, buffer, mediaType)
    } catch (err) {
      errors.push(err instanceof Error ? err.message : String(err))
    }
  }
  console.log("[v0] AML letter analysis failed:", errors)
  throw new Error("Could not read the letter automatically.")
}
