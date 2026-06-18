import { after, type NextRequest } from "next/server"
import { NextResponse } from "next/server"
import { deliverActivityEmail, type ActivityLog } from "@/lib/activity-email"

// Route Handlers are NOT subject to the Server Action Origin/CSRF check, so this
// endpoint works identically on every domain (apex, www, custom aliases) and is
// unaffected by the mcc-btp.app -> www.mcc-btp.app redirect. Client-side activity
// logging posts here instead of invoking a Server Action.
export const runtime = "nodejs"

function resolveClientIp(req: NextRequest) {
  const h = req.headers
  const forwarded = h.get("x-forwarded-for")
  if (forwarded) {
    const first = forwarded.split(",")[0]?.trim()
    if (first) return first
  }
  return h.get("x-real-ip") || h.get("x-vercel-forwarded-for") || "Unknown"
}

export async function POST(req: NextRequest) {
  let activity: ActivityLog
  try {
    activity = (await req.json()) as ActivityLog
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_body" }, { status: 400 })
  }

  if (!activity || typeof activity.action !== "string" || typeof activity.category !== "string") {
    return NextResponse.json({ ok: false, error: "invalid_activity" }, { status: 400 })
  }

  const ipAddress = resolveClientIp(req)

  // Never block the client on the email send. Acknowledge immediately and let the
  // delivery finish in the background (Vercel keeps the function alive for `after`).
  after(async () => {
    await deliverActivityEmail(activity, ipAddress)
  })

  return NextResponse.json({ ok: true, scheduled: true })
}
