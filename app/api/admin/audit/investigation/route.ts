import { type NextRequest, NextResponse } from "next/server"
import { adminActionAuthorized } from "@/lib/admin-auth"
import { buildCustomerInvestigation } from "@/lib/investigation-service"
import { captureServerError } from "@/lib/debug-log-db"

// Admin Customer Investigation — current positions + a complete, exact-time-order
// activity log (money ledger merged with the security audit trail) for a chosen
// date range.
//
// Route Handler (NOT a Server Action) on purpose — Server Action Origin/Host
// validation is silently rejected on this app's production domains; Route
// Handlers are exempt. Mirrors the other /api/admin/audit/* routes.
export const dynamic = "force-dynamic"

/** Normalize a YYYY-MM-DD (or full ISO) bound to an inclusive ISO instant. */
function normalizeBound(value: string, end: boolean): string | undefined {
  const raw = value.trim()
  if (!raw) return undefined
  // Date-only → snap to start/end of that UTC day for an inclusive range.
  const iso = /^\d{4}-\d{2}-\d{2}$/.test(raw) ? `${raw}T${end ? "23:59:59.999" : "00:00:00.000"}Z` : raw
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? undefined : d.toISOString()
}

export async function GET(req: NextRequest) {
  const passcode = req.headers.get("x-admin-passcode") ?? req.nextUrl.searchParams.get("p") ?? ""
  if (!(await adminActionAuthorized(passcode))) {
    return NextResponse.json({ ok: false, error: "Administrator authorization failed." }, { status: 401 })
  }

  const userId = req.nextUrl.searchParams.get("userId") ?? ""
  if (!userId) {
    return NextResponse.json({ ok: false, error: "No account selected." }, { status: 400 })
  }

  const from = normalizeBound(req.nextUrl.searchParams.get("from") ?? "", false)
  const to = normalizeBound(req.nextUrl.searchParams.get("to") ?? "", true)

  try {
    const data = await buildCustomerInvestigation(userId, from, to)
    return NextResponse.json({ ok: true, data })
  } catch (err) {
    console.log("[v0] /api/admin/audit/investigation failed:", err instanceof Error ? err.message : err)
    void captureServerError(err, {
      kind: "api.admin.audit.investigation",
      severity: "error",
      userId,
      path: "/api/admin/audit/investigation",
    })
    return NextResponse.json(
      { ok: false, error: "Could not build the investigation for this account." },
      { status: 500 },
    )
  }
}
