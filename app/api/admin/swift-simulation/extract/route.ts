import { NextResponse } from "next/server"
import { generateText, Output, type LanguageModel, type ModelMessage } from "ai"
import * as z from "zod"
import mammoth from "mammoth"
import { adminActionAuthorized } from "@/lib/admin-auth"
import { docAnalysisModel, nqaiChatModel } from "@/lib/ai-models"

export const runtime = "nodejs"
export const maxDuration = 60

const MAX_BYTES = 15 * 1024 * 1024
const DOCX_TYPE = "application/vnd.openxmlformats-officedocument.wordprocessingml.document"

const fieldsSchema = z.object({
  senderName: z.string().describe("Ordering customer / payer / sender name. Empty string if absent."),
  senderAddress: z.string().describe("Ordering customer address. Empty string if absent."),
  beneficiaryName: z.string().describe("Beneficiary / payee name. Empty string if absent."),
  beneficiaryAddress: z.string().describe("Beneficiary address. Empty string if absent."),
  amount: z.string().describe("Payment amount, digits and decimal point only (e.g. 25000.00). Empty if absent."),
  currency: z.string().describe("ISO 4217 currency code, e.g. EUR. Empty if absent."),
  valueDate: z.string().describe("Value or payment date as YYYY-MM-DD. Empty if absent."),
  reference: z.string().describe("Payment / invoice / transaction reference. Empty if absent."),
  remittanceInfo: z.string().describe("Remittance information / purpose of payment. Empty if absent."),
  charges: z.string().describe("Charges option: OUR, SHA or BEN. Empty if absent."),
})

const INSTRUCTIONS =
  "Extract the payment details from this document for an internal training worksheet. " +
  "Transcribe only what the document states; never invent values. Use an empty string for anything absent. " +
  "Do not output bank account numbers, IBANs or BIC codes in any field."

async function extractWith(model: LanguageModel, content: ModelMessage[]) {
  const { output } = await generateText({
    model,
    output: Output.object({ schema: fieldsSchema }),
    messages: content,
  })
  return output
}

export async function POST(req: Request) {
  try {
    const form = await req.formData()
    if (!(await adminActionAuthorized(String(form.get("passcode") ?? "")))) {
      return NextResponse.json({ ok: false, error: "Not authorized." }, { status: 401 })
    }
    const file = form.get("file")
    if (!(file instanceof File)) return NextResponse.json({ ok: false, error: "No file uploaded." }, { status: 400 })
    if (file.size > MAX_BYTES) return NextResponse.json({ ok: false, error: "File is larger than 15 MB." }, { status: 400 })

    const name = file.name.toLowerCase()
    const isPdf = file.type === "application/pdf" || name.endsWith(".pdf")
    const isDocx = file.type === DOCX_TYPE || name.endsWith(".docx")
    if (!isPdf && !isDocx) {
      return NextResponse.json({ ok: false, error: "Upload a PDF or DOCX document." }, { status: 400 })
    }

    const buffer = Buffer.from(await file.arrayBuffer())
    let text = ""
    let messages: ModelMessage[]

    if (isDocx) {
      text = (await mammoth.extractRawText({ buffer })).value.trim()
      if (!text) return NextResponse.json({ ok: false, error: "The document contains no readable text." }, { status: 400 })
      messages = [{ role: "user", content: `${INSTRUCTIONS}\n\nDocument text:\n${text.slice(0, 40000)}` }]
    } else {
      messages = [
        {
          role: "user",
          content: [
            { type: "text", text: INSTRUCTIONS },
            { type: "file", data: new Uint8Array(buffer), mediaType: "application/pdf" },
          ],
        },
      ]
    }

    let fields: z.infer<typeof fieldsSchema> | null = null
    let lastError: unknown = null
    for (const model of [docAnalysisModel(), nqaiChatModel()]) {
      try {
        fields = await extractWith(model, messages)
        if (fields) break
      } catch (err) {
        lastError = err
      }
    }
    if (!fields) {
      console.error("[swift-simulation] extraction failed:", lastError)
      return NextResponse.json({ ok: false, error: "Couldn't read the document. Try another file or paste the note." }, { status: 502 })
    }

    const cleaned = Object.fromEntries(Object.entries(fields).filter(([, v]) => typeof v === "string" && v.trim()))
    return NextResponse.json({ ok: true, fields: cleaned, text })
  } catch (err) {
    console.error("[swift-simulation] extract route error:", err)
    return NextResponse.json({ ok: false, error: "Couldn't read the document." }, { status: 500 })
  }
}
