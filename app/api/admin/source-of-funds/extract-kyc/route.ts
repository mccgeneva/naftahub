import { type NextRequest, NextResponse } from "next/server"
import { adminActionAuthorized } from "@/lib/admin-auth"
import { extractSenderKyc } from "@/lib/sender-kyc-extract"

export const runtime = "nodejs"
export const maxDuration = 60

const MAX_BYTES = 15 * 1024 * 1024
const ALLOWED = ["application/pdf", "image/png", "image/jpeg", "image/webp", "image/heic", "image/heif"]

export async function POST(req: NextRequest) {
  try {
    const form = await req.formData()
    const pin = String(form.get("passcode") ?? "")
    if (!(await adminActionAuthorized(pin))) {
      return NextResponse.json({ ok: false, error: "Not authorized." }, { status: 401 })
    }
    const file = form.get("file")
    if (!(file instanceof File)) {
      return NextResponse.json({ ok: false, error: "No file uploaded." }, { status: 400 })
    }
    if (file.size > MAX_BYTES) {
      return NextResponse.json({ ok: false, error: "File is larger than 15 MB." }, { status: 400 })
    }
    const type = file.type || "application/octet-stream"
    if (type !== "application/octet-stream" && !ALLOWED.includes(type)) {
      return NextResponse.json({ ok: false, error: "Upload a PDF or an image." }, { status: 400 })
    }
    const buffer = Buffer.from(await file.arrayBuffer())
    const data = await extractSenderKyc(buffer, type)
    return NextResponse.json({ ok: true, data })
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "Could not read the document." },
      { status: 500 },
    )
  }
}
