import { type NextRequest, NextResponse } from "next/server"
import {
  getMyNotifications,
  markMyNotificationsRead,
  type NotificationsSnapshot,
} from "@/app/actions/notifications"

// Route Handlers are NOT serialized with client navigations the way Server
// Actions are. The dashboard header polls notifications on a 30s interval; if
// that poll invoked the Server Action directly, a slow/cold serverless DB call
// would hold the Server Action queue and freeze every in-app navigation
// (Link/router.push) until a hard refresh. Polling this endpoint with a plain
// fetch decouples it from that queue entirely. Mirrors `/api/log-activity` and
// `/api/approvals`.
export const runtime = "nodejs"

// GET /api/notifications -> the signed-in user's latest notifications + unread.
export async function GET() {
  try {
    const snapshot = await getMyNotifications()
    return NextResponse.json({ ok: true, ...snapshot })
  } catch {
    const empty: NotificationsSnapshot = { items: [], unread: 0 }
    return NextResponse.json({ ok: true, ...empty })
  }
}

// POST /api/notifications -> mark some (or all) notifications read.
export async function POST(req: NextRequest) {
  let ids: string[] | undefined
  try {
    const body = (await req.json()) as { ids?: string[] }
    ids = Array.isArray(body?.ids) ? body.ids : undefined
  } catch {
    ids = undefined
  }
  try {
    const res = await markMyNotificationsRead(ids)
    return NextResponse.json(res)
  } catch {
    return NextResponse.json({ ok: false }, { status: 200 })
  }
}
