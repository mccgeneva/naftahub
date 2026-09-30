import { NextResponse } from "next/server"
import { resolveCurrentSession } from "@/lib/session-user"
import { readMasterBankingFor } from "@/lib/my-master-banking"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function GET() {
  try {
    const session = await resolveCurrentSession()
    if (!session) return NextResponse.json({ error: "unauthenticated" }, { status: 401 })
    const banking = await readMasterBankingFor(session)
    return NextResponse.json(banking, { headers: { "Cache-Control": "no-store" } })
  } catch (err) {
    console.log("[v0] /api/my-banking failed:", (err as Error).message)
    return NextResponse.json({ error: "unavailable" }, { status: 500 })
  }
}
