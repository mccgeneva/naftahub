import { NextResponse } from "next/server"
import { getMyLedger } from "@/app/actions/ledger"
import { reconcileMyApprovedCredits } from "@/app/actions/approvals"

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
export async function GET() {
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
