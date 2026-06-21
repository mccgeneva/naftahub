import { NextResponse } from "next/server"
import { getMyTreasury } from "@/app/actions/treasury"
import { emptyTreasuryAccount } from "@/lib/treasury-store"

// Read through a Route Handler (not a Server Action) so this background fetch is
// never serialized with — and can never freeze — client navigation. See
// app/api/ledger/route.ts for the full rationale.
export const runtime = "nodejs"
export const dynamic = "force-dynamic"

// GET /api/treasury -> the signed-in user's treasury record.
export async function GET() {
  try {
    const account = await getMyTreasury()
    return NextResponse.json({ ok: true, account })
  } catch {
    return NextResponse.json({ ok: true, account: emptyTreasuryAccount() })
  }
}
