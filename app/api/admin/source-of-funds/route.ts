import { NextResponse } from "next/server"
import { adminActionAuthorized } from "@/lib/admin-auth"
import { listDynamicUsers } from "@/lib/admin-users-db"
import { logActivity } from "@/app/actions/log-activity"
import {
  listSourceOfFundsFiles,
  getSourceOfFundsFile,
  saveSourceOfFundsFile,
  decideSourceOfFundsFile,
  deleteSourceOfFundsFile,
  type SofEditableFields,
  type SofStatus,
} from "@/lib/source-of-funds-db"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

type Payload =
  | { op: "list"; pin: string }
  | { op: "save"; pin: string; id?: string; file: SofEditableFields }
  | { op: "decide"; pin: string; id: string; status: SofStatus; note?: string }
  | { op: "delete"; pin: string; id: string }

const STATUSES: SofStatus[] = ["open", "cleared", "hold", "returned"]
const STATUS_LABEL: Record<SofStatus, string> = {
  open: "Reopened",
  cleared: "Cleared",
  hold: "On hold",
  returned: "Return to sender",
}

function newId() {
  return `SOF-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`
}

function clean(s: unknown, max = 2000): string {
  return typeof s === "string" ? s.trim().slice(0, max) : ""
}

export async function POST(req: Request) {
  let body: Payload
  try {
    body = (await req.json()) as Payload
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid request body." }, { status: 400 })
  }
  if (!(await adminActionAuthorized(body.pin))) {
    return NextResponse.json({ ok: false, error: "Admin session not recognised. Unlock the panel again." }, { status: 401 })
  }

  try {
    if (body.op === "list") {
      const [files, users] = await Promise.all([listSourceOfFundsFiles(), listDynamicUsers()])
      const clients = users
        .filter((u) => u.status === "active")
        .map((u) => ({ id: u.id, fullName: u.profile.fullName, company: u.profile.company, email: u.email }))
      return NextResponse.json({ ok: true, files, clients })
    }

    if (body.op === "save") {
      const f = body.file
      if (!f?.userId) return NextResponse.json({ ok: false, error: "Choose the receiving client." })
      const amount = Number(f.amount)
      if (!Number.isFinite(amount) || amount <= 0) {
        return NextResponse.json({ ok: false, error: "Enter the amount received." })
      }
      if (body.id) {
        const existing = await getSourceOfFundsFile(body.id)
        if (existing && existing.status !== "open" && existing.status !== "hold") {
          return NextResponse.json({ ok: false, error: "This file is already decided. Reopen it first to edit." })
        }
      }
      const id = body.id || newId()
      const saved = await saveSourceOfFundsFile(id, {
        userId: f.userId,
        holderLabel: clean(f.holderLabel, 200),
        amount,
        currency: clean(f.currency, 3).toUpperCase() || "EUR",
        valueDate: clean(f.valueDate, 20) || null,
        senderName: clean(f.senderName, 200),
        senderCountry: clean(f.senderCountry, 100),
        senderBank: clean(f.senderBank, 200),
        senderAccount: clean(f.senderAccount, 60),
        reference: clean(f.reference, 200),
        declaration: {
          purpose: clean(f.declaration?.purpose),
          sourceOfFunds: clean(f.declaration?.sourceOfFunds),
          relationship: clean(f.declaration?.relationship, 500),
          signedBy: clean(f.declaration?.signedBy, 200),
          signedAt: clean(f.declaration?.signedAt, 40) || null,
        },
        checklist: {
          senderIdentityVerified: !!f.checklist?.senderIdentityVerified,
          sanctionsScreened: !!f.checklist?.sanctionsScreened,
          documentsMatchPayment: !!f.checklist?.documentsMatchPayment,
          amountFitsPurpose: !!f.checklist?.amountFitsPurpose,
          declarationSigned: !!f.checklist?.declarationSigned,
        },
        documents: Array.isArray(f.documents) ? f.documents.slice(0, 40) : [],
      })
      return NextResponse.json({ ok: true, file: saved })
    }

    if (body.op === "decide") {
      if (!STATUSES.includes(body.status)) return NextResponse.json({ ok: false, error: "Unknown decision." })
      const existing = await getSourceOfFundsFile(body.id)
      if (!existing) return NextResponse.json({ ok: false, error: "File not found." })
      if (body.status === "cleared") {
        const c = existing.checklist
        const allChecked =
          c.senderIdentityVerified && c.sanctionsScreened && c.documentsMatchPayment && c.amountFitsPurpose && c.declarationSigned
        if (!allChecked) {
          return NextResponse.json({ ok: false, error: "Complete every checklist item and save before clearing." })
        }
      }
      const note = clean(body.note)
      if ((body.status === "hold" || body.status === "returned") && !note) {
        return NextResponse.json({ ok: false, error: "Write the reason for this decision." })
      }
      const saved = await decideSourceOfFundsFile(body.id, body.status, note, "Administrator")
      void logActivity({
        action: `Source of Funds — ${STATUS_LABEL[body.status]}`,
        category: "Administration / Compliance",
        details: {
          fileId: body.id,
          client: existing.holderLabel,
          amount: `${existing.currency} ${existing.amount}`,
          sender: existing.senderName,
          note,
        },
      }).catch(() => null)
      return NextResponse.json({ ok: true, file: saved })
    }

    if (body.op === "delete") {
      const ok = await deleteSourceOfFundsFile(body.id)
      return NextResponse.json(ok ? { ok: true } : { ok: false, error: "Only open files can be deleted." })
    }

    return NextResponse.json({ ok: false, error: "Unknown operation." }, { status: 400 })
  } catch (error) {
    console.error("[v0] source-of-funds route failed:", error)
    return NextResponse.json({ ok: false, error: "Could not complete the request." }, { status: 500 })
  }
}
