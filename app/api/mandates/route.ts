import { NextResponse } from "next/server"
import { resolveCurrentSession, resolveFinancialMemberIds } from "@/lib/session-user"
import { getMandate, listMandatesForUsers, updateMandate } from "@/lib/managed-mandates-db"
import { notifyAllAdminsOfClientRequest } from "@/lib/notify-admins"

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
      exchangeRequestedAt: m.exchangeRequestedAt,
      exchangedAt: m.exchangedAt,
      bondReference: m.bondReference,
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

/** Client asks to exchange a mandate for an HSBC Hong Kong treasury bond (or withdraws the request). */
export async function POST(req: Request) {
  const session = await resolveCurrentSession()
  if (!session) return NextResponse.json({ ok: false, error: "Sign in again." }, { status: 401 })
  const body = (await req.json().catch(() => ({}))) as { op?: string; id?: string }
  const m = body.id ? await getMandate(body.id) : null
  const ids = await resolveFinancialMemberIds(session.id)
  if (!m || !ids.includes(m.userId)) return NextResponse.json({ ok: false, error: "Mandate not found." }, { status: 404 })
  if (m.status === "closed" || m.status === "cancelled") {
    return NextResponse.json({ ok: false, error: "This mandate is no longer open." }, { status: 400 })
  }
  if (m.exchangedAt) return NextResponse.json({ ok: false, error: "This mandate has already been exchanged." }, { status: 400 })

  if (body.op === "withdraw_exchange") {
    await updateMandate(m.id, { exchangeRequestedAt: null })
    return NextResponse.json({ ok: true })
  }
  if (body.op !== "request_exchange") return NextResponse.json({ ok: false, error: "Unknown operation." }, { status: 400 })
  if (m.exchangeRequestedAt) return NextResponse.json({ ok: true })

  await updateMandate(m.id, { exchangeRequestedAt: new Date().toISOString() })
  const faceValue = m.deposit * m.leverageRatio
  await notifyAllAdminsOfClientRequest({
    customerName: m.holderLabel,
    title: "Mandate exchange requested",
    body: `${m.holderLabel} asked to exchange mandate "${m.title}" for a ${m.currency} ${faceValue.toLocaleString("en-US")} HSBC Hong Kong Treasury Bond.`,
    href: "/dashboard/admin?view=mandates",
    excludeIds: [session.id],
  })
  return NextResponse.json({ ok: true })
}
