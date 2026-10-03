import { NextResponse } from "next/server"
import { resolveCurrentSession, resolveDataOwnerIdFor } from "@/lib/session-user"
import { getOverdraftStatusForOwner } from "@/lib/overdraft"
import { upsertLedgerEntry } from "@/lib/ledger-db"
import { insertNotification } from "@/lib/notifications-db"
import { notifyAllAdminsOfClientRequest } from "@/lib/notify-admins"
import { logActivity } from "@/app/actions/log-activity"
import { listPpiPoliciesForOwner, addPpiClaim, revertPpiClaim } from "@/lib/ppi-insurance-db"
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
  const policy = policies.find((p) => effectivePpiStatus(p) === "active") ?? null
  let negativeEur = 0
  try {
    negativeEur = (await getOverdraftStatusForOwner(ownerId)).negativeEur
  } catch {
    negativeEur = 0
  }
  return { session, ownerId, policy, negativeEur }
}

export async function GET() {
  const state = await loadState()
  if (!state) return NextResponse.json({ ok: false, error: "Not signed in." })
  const { policy, negativeEur } = state
  return NextResponse.json({
    ok: true,
    policy: policy ? { ...policy, remainingCover: ppiRemainingCover(policy) } : null,
    negativeEur,
  })
}

/** Reconcile a debit (negative) balance using the active PPI cover. */
export async function POST() {
  const state = await loadState()
  if (!state) return NextResponse.json({ ok: false, error: "Not signed in." })
  const { session, ownerId, policy, negativeEur } = state
  if (!policy) return NextResponse.json({ ok: false, error: "You have no active PPI policy." })
  if (negativeEur <= 0.01) return NextResponse.json({ ok: false, error: "Your account is not in debit." })

  const amount = Math.round(Math.min(negativeEur, ppiRemainingCover(policy)) * 100) / 100
  if (amount <= 0) return NextResponse.json({ ok: false, error: "Your PPI cover is fully used." })

  const claimed = await addPpiClaim(policy.id, amount)
  if (!claimed) return NextResponse.json({ ok: false, error: "The claim could not be recorded. Please try again." })

  const entryId = `PPI-CLAIM-${policy.id}-${Date.now().toString(36).toUpperCase()}`
  try {
    await upsertLedgerEntry(ownerId, {
      id: entryId,
      direction: "credit",
      amount,
      currency: PPI_CURRENCY,
      status: "completed",
      date: new Date().toISOString(),
      counterparty: `${PPI_INSURER} — Payment Protection Insurance`,
      reference: policy.id,
      category: "PPI Insurance Claim",
      comment: `Debit balance reconciled with PPI cover. Remaining cover ${fmt(ppiRemainingCover(claimed))}.`,
    })
  } catch (err) {
    await revertPpiClaim(policy.id, amount)
    return NextResponse.json({ ok: false, error: (err as Error)?.message ?? "Reconciliation failed." })
  }

  await insertNotification({
    userId: session.id,
    tone: "success",
    title: `Debit reconciled with PPI — ${fmt(amount)}`,
    body: `${fmt(amount)} was credited to your Master Account from your ${PPI_INSURER} PPI cover. Remaining cover ${fmt(ppiRemainingCover(claimed))}.`,
    href: "/dashboard/debits",
  }).catch(() => null)
  await notifyAllAdminsOfClientRequest({
    customerName: policy.holderLabel,
    title: `PPI claim used — ${fmt(amount)}`,
    body: `${policy.holderLabel} reconciled a debit balance of ${fmt(amount)} using PPI policy ${policy.id}.`,
    href: "/dashboard/admin?view=ppi",
    excludeIds: [session.id, ownerId],
  }).catch(() => null)
  await logActivity({
    action: `Reconciled a debit balance with PPI (${fmt(amount)})`,
    category: "Insurance",
    details: { summary: `PPI policy ${policy.id} claim ${fmt(amount)}.`, referenceId: entryId, amount: fmt(amount) },
  })

  return NextResponse.json({ ok: true, amount, remainingCover: ppiRemainingCover(claimed) })
}
