import { NextResponse } from "next/server"
import { resolveCurrentSession } from "@/lib/session-user"
import { getTreasuryBankAccounts } from "@/lib/treasury-bank-accounts-db"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

// Plain /api route (not a Server Action) so the /dashboard session proxy can't 401 it.
export async function GET() {
  const session = await resolveCurrentSession().catch(() => null)
  if (!session) return NextResponse.json({ ok: false, error: "Not signed in" }, { status: 401 })
  const accounts = await getTreasuryBankAccounts()
  return NextResponse.json({ ok: true, accounts })
}
