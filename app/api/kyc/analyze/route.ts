import { type NextRequest, NextResponse } from "next/server"
import { get } from "@vercel/blob"
import { generateText, Output } from "ai"
import * as z from "zod"
import { ADMIN_PASSCODE } from "@/lib/admin-config"
import {
  type KycAnalysisResult,
  type KycDocument,
  type KycDocumentType,
} from "@/lib/kyc-types"

// The AI SDK must run on the Node.js runtime (never edge).
export const runtime = "nodejs"
export const maxDuration = 120

const DOCUMENT_TYPES = [
  "passport",
  "id_card",
  "drivers_license",
  "proof_of_address",
  "bank_statement",
  "company_registration",
  "selfie",
  "other",
] as const

// Structured output the model returns: identity fields to pre-fill the form,
// the passport bio-data, and a per-page classification of every PDF page.
const analysisSchema = z.object({
  fields: z.object({
    fullName: z
      .string()
      .describe(
        "Full name of the individual account holder / principal in natural display order " +
          '(given names first, then surname), including any honorific/title and noble designation, e.g. "Dr. Luigi Forino Von Thyssen". ' +
          'Do NOT use the "SURNAME, Given" passport format.',
      ),
    company: z.string().describe("Company or entity name, if any. Empty string if none."),
    role: z.string().describe("Job title or role of the person (e.g. Director). Empty string if unknown."),
    email: z.string().describe("Email address. Empty string if none found."),
    phone: z.string().describe("Phone / mobile number. Empty string if none found."),
    nationality: z.string().describe("Nationality or citizenship (country name). Empty string if unknown."),
    address: z.string().describe("Full residential address. Empty string if none found."),
    website: z.string().describe("Website URL. Empty string if none found."),
  }),
  passport: z
    .object({
      type: z.string().describe('Document type, e.g. "Passport" or "National ID".'),
      passportNo: z.string().describe("Document / passport number."),
      surname: z.string().describe("Surname / family name."),
      givenNames: z.string().describe("Given names."),
      validUntil: z.string().describe("Expiry date as printed (e.g. 12 MAR 2031)."),
      country: z.string().describe("Issuing country."),
    })
    .nullable()
    .describe("Passport / identity-document bio-data, or null if no passport is present."),
  pages: z
    .array(
      z.object({
        pageNumber: z.number().int().describe("1-based page number this classification refers to."),
        type: z.enum(DOCUMENT_TYPES).describe("The kind of document shown on this page."),
        label: z.string().describe('Short human label, e.g. "Passport — bio page" or "Utility bill".'),
        isDocument: z
          .boolean()
          .describe("True if this page is an actual identity/KYC document worth storing; false for cover pages, blank pages, or pure instructions."),
      }),
    )
    .describe("One entry per page of the PDF, in order."),
})

interface AnalyzeRequestBody {
  passcode?: string
  pdfPathname?: string
}

/** Read a private Blob into a Buffer for the multimodal model call. */
async function readBlobBuffer(pathname: string): Promise<Buffer> {
  const result = await get(pathname, { access: "private" })
  if (!result || result.statusCode !== 200 || !result.stream) {
    throw new Error(`Could not read uploaded file: ${pathname}`)
  }
  const arrayBuffer = await new Response(result.stream).arrayBuffer()
  return Buffer.from(arrayBuffer)
}

export async function POST(request: NextRequest) {
  let stage = "parse"
  try {
    const body = (await request.json()) as AnalyzeRequestBody

    // Gate behind the admin passcode — same secret used by the admin actions.
    if (body.passcode !== ADMIN_PASSCODE) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const pdfPathname = body.pdfPathname
    if (!pdfPathname) return NextResponse.json({ error: "No PDF was uploaded." }, { status: 400 })

    // 1) Read the already-uploaded PDF back from Blob.
    stage = "read-blob"
    const pdfBuffer = await readBlobBuffer(pdfPathname)

    // 2) Send the PDF straight to the multimodal model. Gemini reads PDFs
    //    natively, so there is no client-side rendering step to go wrong.
    stage = "ai-analyze"
    const { output } = await generateText({
      model: "google/gemini-3-flash",
      output: Output.object({ schema: analysisSchema }),
      messages: [
        {
          role: "user",
          content: [
            {
              type: "text",
              text:
                "You are a KYC analyst for a financial institution. The attached PDF is a single client onboarding / KYC pack. " +
                "Extract the account holder's identity details to pre-fill an onboarding form, read any passport or identity document bio-data, and classify EACH page of the PDF. " +
                "Use empty strings for fields you cannot find. Page numbers are 1-based, in document order.",
            },
            {
              type: "file" as const,
              data: new Uint8Array(pdfBuffer),
              mediaType: "application/pdf",
            },
          ],
        },
      ],
    })

    // 3) Map the model's per-page classifications to document references. Every
    //    document points back to the stored PDF at its page number.
    stage = "map-documents"
    const documents: KycDocument[] = []
    for (const page of output.pages) {
      if (!page.isDocument) continue
      documents.push({
        pathname: pdfPathname,
        type: page.type as KycDocumentType,
        label: page.label || "Document",
        pageNumber: page.pageNumber,
      })
    }

    const result: KycAnalysisResult = {
      fields: output.fields,
      passportMeta: output.passport,
      passportImagePathname: null,
      documents,
      pdfPathname,
    }

    return NextResponse.json(result)
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error)
    console.error(`[v0] KYC analyze error (stage=${stage}):`, detail)
    return NextResponse.json(
      { error: `Failed to analyze the KYC document (${stage}): ${detail}` },
      { status: 500 },
    )
  }
}
