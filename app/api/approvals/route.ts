import { type NextRequest, NextResponse } from "next/server"
import { submitApproval, listMyApprovals, type SubmitApprovalInput } from "@/app/actions/approvals"
import { KIND_LABELS, type ApprovalKind } from "@/lib/approval-kinds"

// Route Handlers are NOT serialized with client navigations the way Server
// Actions are. Mirroring submissions and reconciling decisions through this
// endpoint (instead of invoking the Server Actions directly from the client)
// means a slow or unreachable database can never freeze in-app navigation —
// it just makes this background fetch slow. This mirrors the same decision
// already made for activity logging (`/api/log-activity`).
export const runtime = "nodejs"

// GET /api/approvals?kind=payment -> the signed-in user's approvals for a kind.
export async function GET(req: NextRequest) {
  const kindParam = req.nextUrl.searchParams.get("kind") ?? undefined
  const kind = kindParam && KIND_LABELS[kindParam as ApprovalKind] ? (kindParam as ApprovalKind) : undefined
  try {
    const items = await listMyApprovals(kind)
    return NextResponse.json({ ok: true, items })
  } catch {
    return NextResponse.json({ ok: true, items: [] })
  }
}

// POST /api/approvals -> submit a new request for administrator decision.
export async function POST(req: NextRequest) {
  let input: SubmitApprovalInput
  try {
    input = (await req.json()) as SubmitApprovalInput
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_body" }, { status: 400 })
  }
  try {
    const res = await submitApproval(input)
    return NextResponse.json(res)
  } catch {
    return NextResponse.json({ ok: false, error: "submit_failed" }, { status: 200 })
  }
}
