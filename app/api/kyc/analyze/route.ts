import { type NextRequest, NextResponse } from "next/server"
import { put } from "@vercel/blob"
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
    fullName: z.string().describe("Full legal name of the individual account holder / principal."),
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

function uniquePrefix(): string {
  const rand = Math.random().toString(36).slice(2, 10)
  return `kyc/${Date.now()}-${rand}`
}

export async function POST(request: NextRequest) {
  try {
    const form = await request.formData()

    // Gate behind the admin passcode — same secret used by the admin actions.
    if ((form.get("passcode") as string) !== ADMIN_PASSCODE) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const pdf = form.get("pdf") as File | null
    const pageFiles = form.getAll("pages").filter((p): p is File => p instanceof File)

    if (!pdf) return NextResponse.json({ error: "No PDF provided" }, { status: 400 })
    if (pageFiles.length === 0) {
      return NextResponse.json({ error: "No rendered pages provided" }, { status: 400 })
    }

    const prefix = uniquePrefix()

    // 1) Store the original PDF (private).
    const pdfBuffer = Buffer.from(await pdf.arrayBuffer())
    const pdfBlob = await put(`${prefix}/original.pdf`, pdfBuffer, {
      access: "private",
      contentType: "application/pdf",
      addRandomSuffix: false,
    })

    // 2) Store each rendered page image (private) and keep its buffer for the model.
    const pageBuffers: Buffer[] = []
    const pagePathnames: string[] = []
    for (let i = 0; i < pageFiles.length; i++) {
      const buf = Buffer.from(await pageFiles[i].arrayBuffer())
      pageBuffers.push(buf)
      const blob = await put(`${prefix}/page-${i + 1}.png`, buf, {
        access: "private",
        contentType: "image/png",
        addRandomSuffix: false,
      })
      pagePathnames.push(blob.pathname)
    }

    // 3) Analyse all pages in a single multimodal call.
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
                "You are a KYC analyst for a financial institution. The following images are the pages, in order, of a single client onboarding / KYC PDF. " +
                "Extract the account holder's identity details to pre-fill an onboarding form, read any passport or identity document bio-data, and classify EACH page. " +
                "Use empty strings for fields you cannot find. Page numbers are 1-based and must match the order shown.",
            },
            ...pageBuffers.map((buf) => ({
              type: "image" as const,
              image: new Uint8Array(buf),
            })),
          ],
        },
      ],
    })

    // 4) Map the model's per-page classifications back to stored blob pathnames.
    const documents: KycDocument[] = []
    for (const page of output.pages) {
      const idx = page.pageNumber - 1
      if (idx < 0 || idx >= pagePathnames.length) continue
      if (!page.isDocument) continue
      documents.push({
        pathname: pagePathnames[idx],
        type: page.type as KycDocumentType,
        label: page.label || "Document",
        pageNumber: page.pageNumber,
      })
    }

    // Prefer a passport page for the headline identity image, then an ID card,
    // then fall back to the first detected document.
    const passportDoc =
      documents.find((d) => d.type === "passport") ??
      documents.find((d) => d.type === "id_card") ??
      documents[0] ??
      null

    const result: KycAnalysisResult = {
      fields: output.fields,
      passportMeta: output.passport,
      passportImagePathname: passportDoc ? passportDoc.pathname : null,
      documents,
      pdfPathname: pdfBlob.pathname,
    }

    return NextResponse.json(result)
  } catch (error) {
    console.error("[v0] KYC analyze error:", error)
    return NextResponse.json({ error: "Failed to analyze the KYC document." }, { status: 500 })
  }
}
