import { NextResponse } from "next/server"
import { adminActionAuthorized } from "@/lib/admin-auth"
import {
  countVerbiageAwaitingAdmin,
  getBarclaysExecutionEmail,
  getVerbiage,
  listAllVerbiage,
  setBarclaysExecutionEmail,
  updateVerbiage,
} from "@/lib/verbiage-db"
import { transmitVerbiageToBarclays } from "@/lib/verbiage-transmit"
import { insertNotification } from "@/lib/notifications-db"
import { logActivity } from "@/app/actions/log-activity"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const maxDuration = 60

const EMAIL_RE = /^[^\s@,;]+@[^\s@,;]+\.[^\s@,;]+$/

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>
  if (!(await adminActionAuthorized(String(body.pin ?? "")))) {
    return NextResponse.json({ ok: false, error: "Not authorized." }, { status: 401 })
  }
  const op = String(body.op ?? "")

  try {
    if (op === "list") {
      const [submissions, barclaysEmail] = await Promise.all([listAllVerbiage(), getBarclaysExecutionEmail()])
      return NextResponse.json({ ok: true, submissions, barclaysEmail })
    }
    if (op === "count") {
      return NextResponse.json({ ok: true, count: await countVerbiageAwaitingAdmin() })
    }
    if (op === "set-email") {
      const email = String(body.email ?? "").trim().toLowerCase()
      if (email && !EMAIL_RE.test(email)) {
        return NextResponse.json({ ok: false, error: "Enter a valid email address." }, { status: 400 })
      }
      await setBarclaysExecutionEmail(email)
      return NextResponse.json({ ok: true, barclaysEmail: email })
    }

    const sub = await getVerbiage(String(body.id ?? ""))
    if (!sub) return NextResponse.json({ ok: false, error: "Submission not found." }, { status: 404 })

    if (op === "force-approve") {
      if (sub.status !== "override_requested" && sub.status !== "analyzed") {
        return NextResponse.json({ ok: false, error: "This submission is not awaiting approval." }, { status: 400 })
      }
      const justification = String(body.note ?? "").trim().slice(0, 1000)
      if (justification.length < 10) {
        return NextResponse.json(
          { ok: false, error: "Enter a justification for forcing the approval (it is kept in the audit trail)." },
          { status: 400 },
        )
      }
      const approved = await updateVerbiage(sub.id, {
        status: "awaiting_transmission",
        approvedAt: new Date().toISOString(),
        forcedBy: justification,
      })
      if (!approved) return NextResponse.json({ ok: false, error: "Could not save approval." }, { status: 500 })
      const res = await transmitVerbiageToBarclays(approved, String(body.email ?? "").trim() || undefined)
      await logActivity({
        action: `Verbiage ${sub.id} FORCE-APPROVED by administrator${res.ok ? " and transmitted" : " (transmission failed)"}`,
        category: "Administration / Verbiage",
        details: {
          verdict: sub.analysis.verdict,
          score: sub.analysis.complianceScore,
          justification,
          customerReason: sub.overrideReason,
          to: res.ok ? res.to : null,
          error: res.ok ? null : res.error,
        },
      }).catch(() => undefined)
      await insertNotification({
        userId: sub.userId,
        tone: res.ok ? "success" : "warning",
        title: res.ok ? "Verbiage force-approved & sent to Barclays" : "Verbiage force-approved",
        body: res.ok
          ? `The administrator approved your ${sub.analysis.instrumentType || "instrument"} verbiage and transmitted it to Barclays for execution.`
          : `The administrator approved your verbiage. It is queued and will be transmitted to Barclays shortly.`,
        href: "/dashboard/instruments",
      }).catch(() => undefined)
      return NextResponse.json({ ok: true, submission: await getVerbiage(sub.id), transmitted: res.ok, error: res.ok ? null : res.error })
    }

    if (op === "transmit") {
      if (sub.status !== "awaiting_transmission" && sub.status !== "transmitted") {
        return NextResponse.json({ ok: false, error: "The client hasn't approved this verbiage yet." }, { status: 400 })
      }
      const res = await transmitVerbiageToBarclays(sub, String(body.email ?? "").trim() || undefined)
      await logActivity({
        action: `Verbiage ${sub.id} ${res.ok ? "transmitted" : "transmission failed"}`,
        category: "Administration / Verbiage",
        details: { to: res.ok ? res.to : null, error: res.ok ? null : res.error },
      }).catch(() => undefined)
      if (!res.ok) return NextResponse.json({ ok: false, error: res.error }, { status: 502 })
      return NextResponse.json({ ok: true, submission: await getVerbiage(sub.id) })
    }

    if (op === "issued") {
      const ref = String(body.instrumentRef ?? "").trim().slice(0, 120)
      if (!ref) return NextResponse.json({ ok: false, error: "Enter the issued instrument reference." }, { status: 400 })
      const updated = await updateVerbiage(sub.id, {
        status: "issued",
        issuedInstrumentRef: ref,
        issuedAt: new Date().toISOString(),
      })
      await insertNotification({
        userId: sub.userId,
        tone: "success",
        title: "Bank instrument issued",
        body: `Barclays issued your ${sub.analysis.instrumentType || "instrument"} (ref. ${ref}). It will appear in your Bank Instruments once booked.`,
        href: "/dashboard/instruments",
      }).catch(() => undefined)
      return NextResponse.json({ ok: true, submission: updated })
    }

    if (op === "reject") {
      const note = String(body.note ?? "").trim().slice(0, 1000)
      const updated = await updateVerbiage(sub.id, { status: "rejected", adminNote: note || null })
      await insertNotification({
        userId: sub.userId,
        tone: "warning",
        title: "Verbiage declined",
        body: note || "Your verbiage submission was declined. Please contact the administrator.",
        href: "/dashboard/instruments",
      }).catch(() => undefined)
      return NextResponse.json({ ok: true, submission: updated })
    }

    return NextResponse.json({ ok: false, error: "Unknown action." }, { status: 400 })
  } catch (err) {
    console.log("[v0] admin verbiage error:", err instanceof Error ? err.message : String(err))
    return NextResponse.json({ ok: false, error: "Request failed." }, { status: 500 })
  }
}
