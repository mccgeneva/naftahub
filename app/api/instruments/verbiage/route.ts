import { type NextRequest, NextResponse } from "next/server"
import { resolveAccountProfileById, resolveCurrentSession } from "@/lib/session-user"
import {
  analyzeVerbiageDocument,
  analyzeVerbiageText,
  autoFixVerbiage,
  unfilledPlaceholders,
} from "@/lib/verbiage-analyze"
import { getVerbiage, insertVerbiage, listVerbiageForUser, newVerbiageId, updateVerbiage } from "@/lib/verbiage-db"
import { transmitVerbiageToBarclays } from "@/lib/verbiage-transmit"
import { VERBIAGE_FIELDS, buildVerbiageText, missingFieldKeys, type VerbiageFieldValues } from "@/lib/verbiage-fields"
import { notifyAllAdminsOfClientRequest } from "@/lib/notify-admins"
import { logActivity } from "@/app/actions/log-activity"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const maxDuration = 180

const MAX_REVISIONS = 8
const MAX_BYTES = 15 * 1024 * 1024
const ALLOWED = new Set(["application/pdf", "image/png", "image/jpeg", "image/webp"])

export async function GET() {
  const session = await resolveCurrentSession()
  if (!session) return NextResponse.json({ ok: false, error: "Not authorized." }, { status: 401 })
  try {
    return NextResponse.json({ ok: true, submissions: await listVerbiageForUser(session.id) })
  } catch {
    return NextResponse.json({ ok: true, submissions: [] })
  }
}

/** Upload + analyse a verbiage document (multipart: file, blobPathname?). */
export async function POST(request: NextRequest) {
  const session = await resolveCurrentSession()
  if (!session) return NextResponse.json({ ok: false, error: "Not authorized." }, { status: 401 })

  let file: File | null = null
  let blobPathname: string | null = null
  try {
    const form = await request.formData()
    const f = form.get("file")
    if (f instanceof File) file = f
    const p = form.get("blobPathname")
    if (typeof p === "string" && p.startsWith("verbiage/")) blobPathname = p
  } catch {
    return NextResponse.json({ ok: false, error: "Could not read the uploaded file." }, { status: 400 })
  }
  if (!file) return NextResponse.json({ ok: false, error: "No document was provided." }, { status: 400 })
  if (file.size > MAX_BYTES) return NextResponse.json({ ok: false, error: "Max file size is 15 MB." }, { status: 400 })
  const type = file.type || "application/pdf"
  if (!ALLOWED.has(type)) {
    return NextResponse.json({ ok: false, error: "Upload a PDF or an image of the verbiage." }, { status: 400 })
  }

  try {
    const analysis = await analyzeVerbiageDocument(Buffer.from(await file.arrayBuffer()), type)
    const profile = await resolveAccountProfileById(session.id).catch(() => null)
    const holderLabel = [profile?.fullName, profile?.company].filter(Boolean).join(" · ") || session.id
    const sub = await insertVerbiage({
      id: newVerbiageId(),
      userId: session.id,
      holderLabel,
      fileName: file.name.slice(0, 200),
      blobPathname,
      analysis,
    })
    return NextResponse.json({ ok: true, submission: sub })
  } catch (err) {
    console.log("[v0] verbiage analyse failed:", err instanceof Error ? err.message : String(err))
    return NextResponse.json(
      { ok: false, error: "The document could not be analysed. Try a clearer PDF." },
      { status: 500 },
    )
  }
}

/** Customer decision: { id, op: "approve" | "withdraw" }. */
export async function PATCH(request: NextRequest) {
  const session = await resolveCurrentSession()
  if (!session) return NextResponse.json({ ok: false, error: "Not authorized." }, { status: 401 })
  const body = (await request.json().catch(() => ({}))) as {
    id?: string
    op?: string
    text?: string
    fields?: Record<string, unknown>
  }
  const sub = body.id ? await getVerbiage(body.id) : null
  if (!sub || sub.userId !== session.id) {
    return NextResponse.json({ ok: false, error: "Submission not found." }, { status: 404 })
  }

  if (body.op === "withdraw") {
    if (sub.status !== "analyzed" && sub.status !== "awaiting_transmission" && sub.status !== "override_requested") {
      return NextResponse.json({ ok: false, error: "This submission has already been sent." }, { status: 400 })
    }
    const updated = await updateVerbiage(sub.id, { status: "withdrawn" })
    return NextResponse.json({ ok: true, submission: updated })
  }

  if (body.op === "request-override") {
    if (sub.status !== "analyzed") {
      return NextResponse.json({ ok: false, error: "This submission can no longer be changed." }, { status: 400 })
    }
    const reason = (body.text ?? "").trim().slice(0, 1500)
    if (reason.length < 10) {
      return NextResponse.json(
        { ok: false, error: "Explain why the administrator should approve it (at least a short sentence)." },
        { status: 400 },
      )
    }
    const updated = await updateVerbiage(sub.id, {
      status: "override_requested",
      overrideReason: reason,
      overrideRequestedAt: new Date().toISOString(),
    })
    const amount = sub.analysis.faceValue
      ? ` ${sub.analysis.currency} ${Number(sub.analysis.faceValue).toLocaleString("en-US")}`
      : ""
    await notifyAllAdminsOfClientRequest({
      customerName: sub.holderLabel,
      title: "Force approval requested — verbiage",
      body: `${sub.holderLabel} asks you to force-approve a ${sub.analysis.instrumentType || "bank instrument"} verbiage${amount} (verdict: ${sub.analysis.verdict}, score ${sub.analysis.complianceScore}/100). Reason: ${reason}`,
      href: "/dashboard/admin?view=verbiage",
      excludeIds: [session.id],
    })
    await logActivity({
      action: "Verbiage force approval requested",
      category: "Bank Instruments",
      details: { submission: sub.id, verdict: sub.analysis.verdict, score: sub.analysis.complianceScore },
    }).catch(() => undefined)
    return NextResponse.json({ ok: true, submission: updated })
  }

  if (body.op === "cancel-override") {
    if (sub.status !== "override_requested") {
      return NextResponse.json({ ok: false, error: "There is no pending request to cancel." }, { status: 400 })
    }
    const updated = await updateVerbiage(sub.id, { status: "analyzed", overrideReason: null, overrideRequestedAt: null })
    return NextResponse.json({ ok: true, submission: updated })
  }

  if (body.op === "complete") {
    if (sub.status !== "analyzed") {
      return NextResponse.json({ ok: false, error: "This submission can no longer be changed." }, { status: 400 })
    }
    if (sub.revision >= MAX_REVISIONS) {
      return NextResponse.json(
        { ok: false, error: "Revision limit reached for this submission. Upload a new document." },
        { status: 400 },
      )
    }
    const raw = (body.fields ?? {}) as Record<string, unknown>
    const values = Object.fromEntries(
      VERBIAGE_FIELDS.map((f) => [f.key, String(raw[f.key] ?? "").trim().slice(0, 500)]),
    ) as VerbiageFieldValues
    const missing = missingFieldKeys(values)
    if (missing.length) {
      const labels = VERBIAGE_FIELDS.filter((f) => missing.includes(f.key)).map((f) => f.label)
      return NextResponse.json({ ok: false, error: `Fill in: ${labels.join(", ")}.` }, { status: 400 })
    }
    if (!Number.isFinite(Number(values.faceValue.replace(/,/g, ""))) || Number(values.faceValue.replace(/,/g, "")) <= 0) {
      return NextResponse.json({ ok: false, error: "Enter the amount as a number." }, { status: 400 })
    }
    if (!/^[A-Z]{3}$/i.test(values.currency)) {
      return NextResponse.json({ ok: false, error: "Currency must be a 3-letter code, e.g. EUR." }, { status: 400 })
    }
    for (const k of ["issuingBankBic", "beneficiaryBankBic"] as const) {
      if (!/^[A-Z0-9]{8}([A-Z0-9]{3})?$/i.test(values[k])) {
        return NextResponse.json({ ok: false, error: "A BIC must be 8 or 11 letters/digits." }, { status: 400 })
      }
    }
    const text = buildVerbiageText(values, sub.id)
    try {
      const analysis = await analyzeVerbiageText(text)
      const updated = await updateVerbiage(sub.id, { correctedText: text, analysis, revision: sub.revision + 1 })
      return NextResponse.json({ ok: true, submission: updated, placeholders: [] })
    } catch (err) {
      console.log("[v0] verbiage complete failed:", err instanceof Error ? err.message : String(err))
      // Save the completed wording even if the re-check timed out, so nothing typed is lost.
      const updated = await updateVerbiage(sub.id, { correctedText: text }).catch(() => null)
      return NextResponse.json(
        {
          ok: false,
          submission: updated,
          error: "Your details were saved but the check didn't finish. Tap Re-check wording.",
        },
        { status: 500 },
      )
    }
  }

  if (body.op === "autofix" || body.op === "recheck") {
    if (sub.status !== "analyzed") {
      return NextResponse.json({ ok: false, error: "This submission can no longer be changed." }, { status: 400 })
    }
    if (sub.revision >= MAX_REVISIONS) {
      return NextResponse.json(
        { ok: false, error: "Revision limit reached for this submission. Upload a new document." },
        { status: 400 },
      )
    }
    try {
      let text: string
      if (body.op === "autofix") {
        text = await autoFixVerbiage(sub.analysis, sub.correctedText)
      } else {
        text = (body.text ?? "").trim().slice(0, 20000)
        if (text.length < 40) {
          return NextResponse.json({ ok: false, error: "The wording is too short to check." }, { status: 400 })
        }
      }
      const analysis = await analyzeVerbiageText(text)
      const updated = await updateVerbiage(sub.id, {
        correctedText: text,
        analysis,
        revision: sub.revision + 1,
      })
      return NextResponse.json({ ok: true, submission: updated, placeholders: unfilledPlaceholders(text) })
    } catch (err) {
      console.log("[v0] verbiage", body.op, "failed:", err instanceof Error ? err.message : String(err))
      return NextResponse.json(
        {
          ok: false,
          error:
            body.op === "autofix"
              ? "The wording could not be corrected automatically. Please try again."
              : "The edited wording could not be checked. Please try again.",
        },
        { status: 500 },
      )
    }
  }

  if (body.op !== "approve") return NextResponse.json({ ok: false, error: "Unknown action." }, { status: 400 })
  if (sub.correctedText && unfilledPlaceholders(sub.correctedText).length) {
    return NextResponse.json(
      { ok: false, error: "Fill in every [PLACEHOLDER] in the corrected wording and re-check it first." },
      { status: 400 },
    )
  }
  if (sub.status !== "analyzed") {
    return NextResponse.json({ ok: false, error: "This submission was already approved." }, { status: 400 })
  }
  if (sub.analysis.verdict === "not_issuable") {
    return NextResponse.json(
      { ok: false, error: "This verbiage is not issuable as written. Correct it and upload a new version." },
      { status: 400 },
    )
  }

  const approved = await updateVerbiage(sub.id, {
    status: "awaiting_transmission",
    approvedAt: new Date().toISOString(),
  })
  if (!approved) return NextResponse.json({ ok: false, error: "Could not save approval." }, { status: 500 })

  const sent = await transmitVerbiageToBarclays(approved)
  const amount = sub.analysis.faceValue ? `${sub.analysis.currency} ${Number(sub.analysis.faceValue).toLocaleString("en-US")}` : ""

  await notifyAllAdminsOfClientRequest({
    customerName: sub.holderLabel,
    title: sent.ok ? "Verbiage sent to Barclays" : "Verbiage awaiting Barclays transmission",
    body: sent.ok
      ? `${sub.holderLabel} approved a ${sub.analysis.instrumentType || "bank instrument"} verbiage ${amount}; it was transmitted to Barclays (${sent.to}).`
      : `${sub.holderLabel} approved a ${sub.analysis.instrumentType || "bank instrument"} verbiage ${amount}. Transmission failed: ${sent.error}`,
    href: "/dashboard/admin?view=verbiage",
    excludeIds: [session.id],
  })
  await logActivity({
    action: "Verbiage approved",
    category: "Bank Instruments",
    details: { submission: sub.id, transmitted: sent.ok, to: sent.ok ? sent.to : null },
  }).catch(() => undefined)

  return NextResponse.json({
    ok: true,
    submission: await getVerbiage(sub.id),
    transmitted: sent.ok,
  })
}
