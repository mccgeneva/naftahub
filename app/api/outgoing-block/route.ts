import { NextResponse } from "next/server"
import { resolveCurrentSession } from "@/lib/session-user"
import { getOutgoingBlock } from "@/lib/outgoing-blocks-db"
import { evaluateOutgoingBlock } from "@/lib/outgoing-blocks-eval"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/**
 * Session read of the CURRENT user's outgoing-block status, per scope.
 *
 * Lives under /api (not behind the /dashboard proxy) so a friendly client
 * pre-check / banner gets real JSON even when the session's signed meta cookie
 * is judged stale by the proxy. Returns the active decision for both scopes;
 * enforcement is still authoritative server-side in the submit paths. Never
 * throws — an error resolves to "not blocked" so the money-out UI keeps working.
 */
export async function GET() {
  try {
    const session = await resolveCurrentSession()
    if (!session) {
      return NextResponse.json({ ok: true, payments: { blocked: false }, trades: { blocked: false } })
    }
    const cfg = await getOutgoingBlock(session.id)
    return NextResponse.json({
      ok: true,
      payments: evaluateOutgoingBlock(cfg, "payments"),
      trades: evaluateOutgoingBlock(cfg, "trades"),
    })
  } catch {
    return NextResponse.json({ ok: true, payments: { blocked: false }, trades: { blocked: false } })
  }
}
