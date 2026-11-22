import { NextResponse } from "next/server"
import { resolveCurrentSession, resolveFinancialMemberIds } from "@/lib/session-user"
import { listMandatesForUsers } from "@/lib/managed-mandates-db"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/** Read-only: the signed-in client's own managed mandates. */
export async function GET() {
  const session = await resolveCurrentSession()
  if (!session) return NextResponse.json({ ok: false, mandates: [] }, { status: 401 })
  try {
    const ids = await resolveFinancialMemberIds(session.id)
    const mandates = (await listMandatesForUsers(ids)).map((m) => ({
      id: m.id,
      title: m.title,
      currency: m.currency,
      deposit: m.deposit,
      leverageRatio: m.leverageRatio,
      borrowed: m.borrowed,
      annualInterestRate: m.annualInterestRate,
      status: m.status,
      activatedAt: m.activatedAt,
      closedAt: m.closedAt,
      distributions: m.distributions
        .filter((d) => d.status === "credited")
        .map((d) => ({ id: d.id, periodLabel: d.periodLabel, amount: d.amount, interestCharged: d.interestCharged, approvedAt: d.approvedAt })),
    }))
    return NextResponse.json({ ok: true, mandates })
  } catch (err) {
    console.log("[v0] mandates GET failed:", err)
    return NextResponse.json({ ok: false, mandates: [] }, { status: 500 })
  }
}
