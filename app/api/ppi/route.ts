import { NextResponse } from "next/server"
import { resolveCurrentSession, resolveDataOwnerIdFor } from "@/lib/session-user"
import { insertNotification } from "@/lib/notifications-db"
import { mirrorPpiMessageToBankeka } from "@/lib/ppi-bankeka-mirror"
import { notifyAllAdminsOfClientRequest } from "@/lib/notify-admins"
import { logActivity } from "@/app/actions/log-activity"
import { listPpiPoliciesForOwner, appendPpiMessage } from "@/lib/ppi-insurance-db"
import { consolidateDebitWithPpi, readPpiDeficits, deficitsTotalEur, type PpiDeficit } from "@/lib/ppi-claim"
import { PPI_CURRENCY, PPI_INSURER, effectivePpiStatus, ppiRemainingCover } from "@/lib/ppi-insurance"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const fmt = (n: number) =>
  `${PPI_CURRENCY} ${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

async function loadState() {
  const session = await resolveCurrentSession()
  if (!session) return null
  const ownerId = await resolveDataOwnerIdFor(session.id)
  const policies = await listPpiPoliciesForOwner(ownerId)
  // Most relevant policy for the client: live cover first, then one being
  // negotiated, then a paused or deactivated one they may want to discuss.
  const pick = (s: string) => policies.find((p) => effectivePpiStatus(p) === s)
  const policy = pick("active") ?? pick("paused") ?? pick("negotiating") ?? pick("used") ?? pick("terminated") ?? null
  let deficits: PpiDeficit[] = []
  try {
    deficits = await readPpiDeficits(ownerId)
  } catch {
    deficits = []
  }
  return { session, ownerId, policy, deficits, negativeEur: deficitsTotalEur(deficits) }
}

export async function GET() {
  const state = await loadState()
  if (!state) return NextResponse.json({ ok: false, error: "Not signed in." })
  const { policy, negativeEur, deficits } = state
  return NextResponse.json({
    ok: true,
    policy: policy ? { ...policy, remainingCover: ppiRemainingCover(policy) } : null,
    negativeEur,
    deficits,
  })
}

/**
 * POST with no body (or op "reconcile") reconciles a debit balance using the
 * active PPI cover; op "message" sends a message to treasury about the policy.
 */
export async function POST(req: Request) {
  let body: { op?: string; text?: string } = {}
  try {
    body = (await req.json()) as typeof body
  } catch {
    body = {}
  }
  const state = await loadState()
  if (!state) return NextResponse.json({ ok: false, error: "Not signed in." })
  const { session, ownerId, policy, negativeEur } = state

  if (body.op === "message") {
    const text = (body.text ?? "").trim().slice(0, 2000)
    if (!text) return NextResponse.json({ ok: false, error: "Write a message first." })
    if (!policy) return NextResponse.json({ ok: false, error: "You have no PPI policy to discuss." })
    const updated = await appendPpiMessage(policy.id, {
      id: `MSG-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
      author: "client",
      authorName: policy.holderLabel,
      text,
      at: new Date().toISOString(),
    })
    if (!updated) return NextResponse.json({ ok: false, error: "This policy is closed to messages." })
    await mirrorPpiMessageToBankeka({ direction: "client-to-treasury", clientId: policy.userId, text })
    await notifyAllAdminsOfClientRequest({
      customerName: policy.holderLabel,
      title: `PPI message from ${policy.holderLabel}`,
      body: text.length > 160 ? `${text.slice(0, 157)}…` : text,
      href: "/dashboard/admin?view=ppi",
      excludeIds: [session.id, ownerId],
    }).catch(() => null)
    return NextResponse.json({ ok: true })
  }

  if (!policy || effectivePpiStatus(policy) !== "active") {
    return NextResponse.json({ ok: false, error: "You have no active PPI policy." })
  }

  const result = await consolidateDebitWithPpi(policy, "the customer")
  if (!result.ok) return NextResponse.json({ ok: false, error: result.error })
  const amount = result.totalEur
  const breakdown = result.deficits.map((d) => `${d.currency} ${d.amount.toLocaleString("en-US", { minimumFractionDigits: 2 })}`).join(", ")

  await insertNotification({
    userId: session.id,
    tone: "success",
    title: "Debit consolidated to zero with PPI",
    body: `Your ${PPI_INSURER} PPI cleared every negative balance on your Master Account (${breakdown}; ≈ ${fmt(amount)}). PPI can be used once, so this policy is now terminated.`,
    href: "/dashboard/debits",
  }).catch(() => null)
  await notifyAllAdminsOfClientRequest({
    customerName: policy.holderLabel,
    title: `PPI used — debit consolidated (${fmt(amount)})`,
    body: `${policy.holderLabel} used PPI policy ${policy.id}: ${breakdown} cleared to zero. Policy terminated as used.`,
    href: "/dashboard/admin?view=ppi",
    excludeIds: [session.id, ownerId],
  }).catch(() => null)
  await logActivity({
    action: `Consolidated debit to zero with PPI (${fmt(amount)})`,
    category: "Insurance",
    details: { summary: `PPI policy ${policy.id} used: ${breakdown}.`, referenceId: policy.id, amount: fmt(amount) },
  })

  return NextResponse.json({ ok: true, amount, deficits: result.deficits })
}
