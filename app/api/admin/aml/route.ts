import { NextResponse } from "next/server"
import { get } from "@vercel/blob"
import { adminActionAuthorized } from "@/lib/admin-auth"
import { listDynamicUsers, getDynamicUserById } from "@/lib/admin-users-db"
import {
  type AmlCase,
  type AmlCaseStatus,
  type AmlDocument,
  type AmlMeasure,
  type AmlMeasureCategory,
  type AmlMeasureStatus,
  type AmlRiskLevel,
  type AmlSource,
  countOpenAmlCases,
  deleteAmlCase,
  getAmlCase,
  listAmlCases,
  newAmlId,
  saveAmlCase,
} from "@/lib/aml-cases-db"
import { extractAmlLetter } from "@/lib/aml-letter-extract"
import { listInstrumentsForAml, revokeInstrument, setInstrumentFlag } from "@/lib/instrument-revocation"
import { logActivity } from "@/app/actions/log-activity"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const maxDuration = 60

const SOURCES: AmlSource[] = ["auditor", "compliance_office", "regulator", "bank_partner", "other"]
const RISKS: AmlRiskLevel[] = ["low", "medium", "high", "critical"]
const STATUSES: AmlCaseStatus[] = ["open", "under_review", "actions_in_progress", "reported", "closed"]
const CATEGORIES: AmlMeasureCategory[] = [
  "enhanced_due_diligence",
  "request_documents",
  "restrict_outgoing",
  "freeze_account",
  "monitor_transactions",
  "file_sar",
  "close_account",
  "other",
]
const MEASURE_STATUSES: AmlMeasureStatus[] = ["planned", "in_progress", "done", "cancelled"]

const ADMIN_LABEL = "Administrator"

function pick<T extends string>(v: unknown, allowed: T[], fallback: T): T {
  return allowed.includes(v as T) ? (v as T) : fallback
}
function str(v: unknown, max = 4000): string {
  return typeof v === "string" ? v.trim().slice(0, max) : ""
}
function dateOrNull(v: unknown): string | null {
  const s = str(v, 20)
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null
}

function sanitizeMeasure(m: Partial<AmlMeasure>, existing?: AmlMeasure): AmlMeasure {
  const now = new Date().toISOString()
  const status = pick(m.status, MEASURE_STATUSES, existing?.status ?? "planned")
  return {
    id: existing?.id ?? newAmlId("MSR"),
    category: pick(m.category, CATEGORIES, existing?.category ?? "other"),
    text: str(m.text, 1000) || existing?.text || "",
    status,
    dueDate: m.dueDate === undefined ? (existing?.dueDate ?? null) : dateOrNull(m.dueDate),
    assignee: m.assignee === undefined ? (existing?.assignee ?? "") : str(m.assignee, 120),
    createdAt: existing?.createdAt ?? now,
    completedAt: status === "done" ? (existing?.completedAt ?? now) : null,
  }
}

function sanitizeDocuments(docs: unknown): AmlDocument[] {
  if (!Array.isArray(docs)) return []
  return docs
    .map((d) => d as Partial<AmlDocument>)
    .filter((d) => typeof d.pathname === "string" && d.pathname.startsWith("aml/"))
    .map((d) => ({
      pathname: d.pathname as string,
      name: str(d.name, 200) || "letter",
      contentType: str(d.contentType, 120) || "application/octet-stream",
      sizeBytes: Number(d.sizeBytes) || 0,
      uploadedAt: str(d.uploadedAt, 40) || new Date().toISOString(),
      uploadedBy: str(d.uploadedBy, 120) || ADMIN_LABEL,
    }))
}

function holderLabelFor(u: { email: string; profile?: { fullName?: string; company?: string } }): string {
  const name = u.profile?.fullName?.trim() || u.email
  const company = u.profile?.company?.trim()
  return company ? `${name} · ${company}` : name
}

const STATUS_LABEL: Record<AmlCaseStatus, string> = {
  open: "Open",
  under_review: "Under review",
  actions_in_progress: "Actions in progress",
  reported: "Reported to authority",
  closed: "Closed",
}

export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null
  if (!body || !(await adminActionAuthorized(String(body.passcode ?? "")))) {
    return NextResponse.json({ ok: false, error: "Administrator authorization failed." }, { status: 401 })
  }
  const op = String(body.op ?? "")

  try {
    if (op === "count") {
      return NextResponse.json({ ok: true, count: await countOpenAmlCases() })
    }

    if (op === "list") {
      const [users, cases] = await Promise.all([listDynamicUsers(), listAmlCases()])
      const clients = users
        .map((u) => ({ id: u.id, label: holderLabelFor(u), email: u.email }))
        .sort((a, b) => a.label.localeCompare(b.label))
      return NextResponse.json({ ok: true, clients, cases })
    }

    if (op === "instruments") {
      const [users, rows] = await Promise.all([listDynamicUsers(), listInstrumentsForAml()])
      const labels = new Map(users.map((u) => [u.id, holderLabelFor(u)]))
      return NextResponse.json({
        ok: true,
        instruments: rows.map((r) => ({ ...r, holderLabel: labels.get(r.userId) ?? r.userId })),
      })
    }

    if (op === "flag-instrument" || op === "unflag-instrument") {
      const approvalId = str(body.approvalId, 120)
      const reason = str(body.reason, 1000)
      if (op === "flag-instrument" && !reason) {
        return NextResponse.json({ ok: false, error: "Describe why the instrument is irregular." }, { status: 400 })
      }
      const done = await setInstrumentFlag(
        approvalId,
        op === "flag-instrument" ? { flaggedAt: new Date().toISOString(), flaggedBy: ADMIN_LABEL, reason } : null,
      )
      if (!done) return NextResponse.json({ ok: false, error: "Instrument not found." }, { status: 404 })
      void logActivity({
        action: `${op === "flag-instrument" ? "Flagged" : "Cleared flag on"} bank instrument ${approvalId}`,
        category: "Administration / AML",
        details: { approvalId, reason },
      }).catch(() => {})
      return NextResponse.json({ ok: true })
    }

    if (op === "revoke-instrument") {
      const approvalId = str(body.approvalId, 120)
      const reason = str(body.reason, 1000)
      if (!reason) {
        return NextResponse.json({ ok: false, error: "A reason is required to revoke an instrument." }, { status: 400 })
      }
      const res = await revokeInstrument(approvalId, reason, ADMIN_LABEL)
      if (!res.ok) return NextResponse.json(res, { status: 400 })
      void logActivity({
        action: `Force-revoked bank instrument ${res.outcome.instrumentId} (${res.outcome.mode === "ppi_replacement" ? "replaced by Lloyds Bank BG under PPI" : "facilities collapsed into master account"})`,
        category: "Administration / AML",
        details: {
          approvalId,
          reason,
          mode: res.outcome.mode,
          replacement: res.outcome.replacementInstrumentId ?? "",
          facilities: res.outcome.engagements.map((e) => `${e.label}: ${e.result}${e.debited ? ` (${e.currency} ${e.debited})` : ""}`).join("; "),
        },
      }).catch(() => {})
      return NextResponse.json(res)
    }

    if (op === "analyze") {
      const pathname = str(body.pathname, 400)
      if (!pathname.startsWith("aml/")) {
        return NextResponse.json({ ok: false, error: "Invalid document path." }, { status: 400 })
      }
      const result = await get(pathname, { access: "public" })
      if (!result || result.statusCode !== 200) {
        return NextResponse.json({ ok: false, error: "Uploaded letter not found." }, { status: 404 })
      }
      const buffer = Buffer.from(await new Response(result.stream).arrayBuffer())
      const extraction = await extractAmlLetter(buffer, result.blob.contentType)
      return NextResponse.json({ ok: true, extraction })
    }

    if (op === "save") {
      const input = (body.case ?? {}) as Partial<AmlCase>
      const existing = input.id ? await getAmlCase(String(input.id)) : null
      const userId = str(input.userId, 80) || existing?.userId || ""
      if (!userId) return NextResponse.json({ ok: false, error: "Choose the customer." }, { status: 400 })
      const user = await getDynamicUserById(userId)
      if (!user) return NextResponse.json({ ok: false, error: "Customer not found." }, { status: 404 })

      const now = new Date().toISOString()
      const status = pick(input.status, STATUSES, existing?.status ?? "open")
      const existingMeasures = new Map((existing?.measures ?? []).map((m) => [m.id, m]))
      const measures = Array.isArray(input.measures)
        ? input.measures
            .map((m) => sanitizeMeasure(m, m.id ? existingMeasures.get(m.id) : undefined))
            .filter((m) => m.text)
        : (existing?.measures ?? [])

      const timeline = [...(existing?.timeline ?? [])]
      if (!existing) timeline.push({ at: now, by: ADMIN_LABEL, text: "Case opened." })
      else if (existing.status !== status) {
        timeline.push({ at: now, by: ADMIN_LABEL, text: `Status changed to ${STATUS_LABEL[status]}.` })
      }
      const docs = input.documents === undefined ? (existing?.documents ?? []) : sanitizeDocuments(input.documents)
      const added = docs.filter((d) => !(existing?.documents ?? []).some((e) => e.pathname === d.pathname))
      for (const d of added) timeline.push({ at: now, by: ADMIN_LABEL, text: `Letter uploaded: ${d.name}.` })
      const note = str(body.note, 2000)
      if (note) timeline.push({ at: now, by: ADMIN_LABEL, text: note })

      const saved = await saveAmlCase({
        id: existing?.id ?? newAmlId(),
        userId,
        holderLabel: holderLabelFor(user),
        subject: str(input.subject, 200) || existing?.subject || "AML review",
        source: pick(input.source, SOURCES, existing?.source ?? "auditor"),
        authorName: input.authorName === undefined ? (existing?.authorName ?? "") : str(input.authorName, 200),
        letterReference:
          input.letterReference === undefined ? (existing?.letterReference ?? "") : str(input.letterReference, 120),
        letterDate: input.letterDate === undefined ? (existing?.letterDate ?? null) : dateOrNull(input.letterDate),
        riskLevel: pick(input.riskLevel, RISKS, existing?.riskLevel ?? "medium"),
        status,
        summary: input.summary === undefined ? (existing?.summary ?? "") : str(input.summary, 4000),
        findings: input.findings === undefined ? (existing?.findings ?? "") : str(input.findings, 8000),
        documents: docs,
        measures,
        timeline,
        createdAt: existing?.createdAt ?? now,
        updatedAt: now,
        closedAt: status === "closed" ? (existing?.closedAt ?? now) : null,
        createdBy: existing?.createdBy ?? ADMIN_LABEL,
      })

      await logActivity({
        action: `${existing ? "Updated" : "Opened"} AML case ${saved.id} for ${saved.holderLabel}`,
        category: "Administration / Compliance",
        details: {
          summary: `${saved.subject} — ${STATUS_LABEL[saved.status]}, risk ${saved.riskLevel}, ${saved.measures.length} measure(s).`,
          referenceId: saved.id,
        },
      }).catch(() => {})
      return NextResponse.json({ ok: true, case: saved })
    }

    if (op === "delete") {
      const removed = await deleteAmlCase(str(body.id, 80))
      if (!removed) return NextResponse.json({ ok: false, error: "Case not found." }, { status: 404 })
      await logActivity({
        action: `Deleted AML case ${removed.id} for ${removed.holderLabel}`,
        category: "Administration / Compliance",
        details: { summary: removed.subject, referenceId: removed.id },
      }).catch(() => {})
      return NextResponse.json({ ok: true })
    }

    return NextResponse.json({ ok: false, error: "Unknown operation." }, { status: 400 })
  } catch (err) {
    console.log("[v0] AML route error:", err instanceof Error ? err.message : err)
    const message = err instanceof Error ? err.message : "Request failed."
    return NextResponse.json({ ok: false, error: message }, { status: 500 })
  }
}
