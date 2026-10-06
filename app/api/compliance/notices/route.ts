import { NextResponse } from "next/server"
import { resolveCurrentSession } from "@/lib/session-user"
import { listClientComplianceNotices } from "@/lib/aml-cases-db"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

// Compliance notices the administrator explicitly chose to share with this
// customer. Only the shared message (and letters, if enabled) are returned —
// never findings, measures, risk level or the internal timeline.
export async function GET() {
  const session = await resolveCurrentSession()
  if (!session) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 })
  try {
    const ids = Array.from(new Set([session.id, session.dataOwnerId].filter(Boolean)))
    const notices = await listClientComplianceNotices(ids)
    return NextResponse.json({ ok: true, notices })
  } catch (err) {
    console.log("[v0] compliance notices error:", err instanceof Error ? err.message : err)
    return NextResponse.json({ ok: true, notices: [] })
  }
}
