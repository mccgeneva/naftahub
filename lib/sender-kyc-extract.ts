import "server-only"
import { generateText, Output } from "ai"
import * as z from "zod"
import { docAnalysisModel, nqaiChatModel } from "@/lib/ai-models"
import { detectMediaType } from "@/lib/kyc-analyze"

// Reads a sender's identity / KYC document (passport, ID card, proof of
// address, company registration extract, bank letter) and recovers only the
// fields printed on it. Transcription only — never invents a value; the admin
// checks everything before saving.

export const senderKycSchema = z.object({
  documentType: z
    .enum(["passport", "id_card", "proof_of_address", "company_registration", "bank_letter", "other"])
    .describe("What kind of document this is."),
  fullName: z.string().describe("Person's full name as printed (given names + surname). Empty if absent."),
  companyName: z.string().describe("Registered company name if this is a company document. Empty if absent."),
  country: z
    .string()
    .describe("Country of the person/company in English (nationality, issuing country, or registered country). Empty if absent."),
  documentNumber: z.string().describe("Passport / ID / company registration number. Empty if absent."),
  dateOfBirth: z.string().describe("Date of birth as YYYY-MM-DD if present, else empty."),
  expiryDate: z.string().describe("Document expiry as YYYY-MM-DD if present, else empty."),
  address: z.string().describe("Postal address as printed, one line. Empty if absent."),
  bankName: z.string().describe("Bank name if a bank letter/statement. Empty if absent."),
  bic: z.string().describe("BIC/SWIFT code if printed. Empty if absent."),
  iban: z.string().describe("IBAN or account number if printed. Empty if absent."),
})

export type SenderKycExtraction = z.infer<typeof senderKycSchema>

const PROMPT = `You are reading an identity / KYC document for a compliance file.
Transcribe ONLY what is printed on the document. Never guess or invent a value — use an empty string when a field is absent or unreadable.
For passports and ID cards, read the visual zone and the MRZ; prefer the visual zone spelling for names.
Return the country in plain English (e.g. "Germany", "United Kingdom").`

async function attempt(model: ReturnType<typeof docAnalysisModel>, buffer: Buffer, mediaType: string) {
  const { output } = await generateText({
    model,
    output: Output.object({ schema: senderKycSchema }),
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
  if (!output) throw new Error("Empty analysis.")
  return output
}

export async function extractSenderKyc(buffer: Buffer, fallbackType: string): Promise<SenderKycExtraction> {
  const mediaType = detectMediaType(buffer, fallbackType)
  const errors: string[] = []
  for (const model of [docAnalysisModel(), nqaiChatModel()]) {
    try {
      return await attempt(model, buffer, mediaType)
    } catch (err) {
      errors.push(err instanceof Error ? err.message : String(err))
    }
  }
  console.log("[v0] Sender KYC extraction failed:", errors)
  throw new Error("Could not read the document automatically.")
}
