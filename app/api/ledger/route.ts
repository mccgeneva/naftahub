import { NextResponse } from "next/server"
import { getMyLedger } from "@/app/actions/ledger"
import { reconcileMyApprovedCredits } from "@/app/actions/approvals"
import { resolveCurrentSession } from "@/lib/session-user"
import { touchLastSeen } from "@/lib/last-seen-db"

// Route Handlers are NOT serialized with client navigations the way Server
// Actions are. The dashboard mounts ~20 data providers at once; when several of
// them read through Server Actions on login, those reads queue behind one
// another AND block the user's first navigation (Server Actions and router
// transitions share one queue). Reading the ledger through this GET endpoint
// keeps it off that queue, so a slow database makes only this background fetch
// slow — never the whole UI. Mirrors the decision already made for
// `/api/approvals` and `/api/log-activity`.
export const runtime = "nodejs"
export const dynamic = "force-dynamic"

// GET /api/ledger -> the signed-in user's ledger entries (after reconciling any
// already-approved credits server-side, so the two steps cost one round trip).
export async function GET(req: Request) {
  // "Last active" stamp for the admin investigation view. Skipped while an
  // administrator is acting as the client so maintenance never counts as the
  // client's own activity.
  void resolveCurrentSession()
    .then((s) => {
      if (!s || s.impersonator) return
      const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || req.headers.get("x-real-ip")
      return touchLastSeen(s.id, ip, req.headers.get("user-agent"))
    })
    .catch(() => {})
  try {
    await reconcileMyApprovedCredits().catch(() => {
      // best-effort; reconciliation failure must not block reading the ledger
    })
    const entries = await getMyLedger()
    return NextResponse.json({ ok: true, entries })
  } catch {
    return NextResponse.json({ ok: true, entries: [] })
  }
}
