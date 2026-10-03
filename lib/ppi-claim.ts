import "server-only"
import { readLedgerEntries, upsertLedgerEntry, deleteLedgerEntry } from "@/lib/ledger-db"
import { convertCurrency } from "@/lib/fx"
import { consumePpiPolicy } from "@/lib/ppi-insurance-db"
import { PPI_CURRENCY, PPI_INSURER, effectivePpiStatus, type PpiPolicy } from "@/lib/ppi-insurance"

const round2 = (n: number) => Math.round(n * 100) / 100

export type PpiDeficit = { currency: string; amount: number }

/**
 * Natural settled balance per currency on the Master Account: completed rows only,
 * excluding sub-account compartments and the internal FX auto-cover rebalancing
 * (which only moves value between pockets to hide a deficit). A negative figure
 * is a real debit the PPI must clear.
 */
export async function readPpiDeficits(ownerId: string): Promise<PpiDeficit[]> {
  const entries = await readLedgerEntries(ownerId)
  const byCcy = new Map<string, number>()
  for (const e of entries) {
    if (e.status !== "completed" || e.subAccountId || e.id.startsWith("FX-COVER-")) continue
    const signed = e.direction === "credit" ? e.amount : -e.amount
    byCcy.set(e.currency, (byCcy.get(e.currency) ?? 0) + signed)
  }
  return [...byCcy.entries()]
    .map(([currency, bal]) => ({ currency, amount: round2(-bal) }))
    .filter((d) => d.amount > 0.01)
    .sort((a, b) => a.currency.localeCompare(b.currency))
}

export function deficitsTotalEur(deficits: PpiDeficit[]): number {
  return round2(deficits.reduce((s, d) => s + convertCurrency(d.amount, d.currency, PPI_CURRENCY), 0))
}

export type PpiConsolidationResult =
  | { ok: true; totalEur: number; deficits: PpiDeficit[]; policy: PpiPolicy }
  | { ok: false; error: string }

/**
 * Single-use PPI claim: credits every negative currency pocket back to exactly
 * zero, then terminates the policy as used. The policy is consumed first under a
 * status guard so two concurrent triggers can never pay out twice; if a credit
 * fails, the posted credits are removed and the claim is refused.
 */
export async function consolidateDebitWithPpi(policy: PpiPolicy, triggeredBy: string): Promise<PpiConsolidationResult> {
  if (effectivePpiStatus(policy) !== "active") {
    return { ok: false, error: "The PPI policy is not active, so it cannot be used." }
  }
  const deficits = await readPpiDeficits(policy.ownerId)
  if (deficits.length === 0) return { ok: false, error: "The Master Account has no negative balance to clear." }
  const totalEur = deficitsTotalEur(deficits)

  const consumed = await consumePpiPolicy(policy.id, totalEur)
  if (!consumed) return { ok: false, error: "The policy changed or was already used. Nothing was credited." }

  const stamp = Date.now().toString(36).toUpperCase()
  const posted: string[] = []
  try {
    for (const d of deficits) {
      const id = `PPI-CLAIM-${policy.id}-${d.currency}-${stamp}`
      await upsertLedgerEntry(policy.ownerId, {
        id,
        direction: "credit",
        amount: d.amount,
        currency: d.currency,
        status: "completed",
        date: new Date().toISOString(),
        counterparty: `${PPI_INSURER} — Payment Protection Insurance`,
        reference: policy.id,
        category: "PPI Insurance Claim",
        comment: `${d.currency} debit consolidated to zero by PPI policy ${policy.id} (triggered by ${triggeredBy}). Single-use policy now terminated.`,
      })
      posted.push(id)
    }
  } catch (err) {
    await Promise.all(posted.map((id) => deleteLedgerEntry(policy.ownerId, id).catch(() => null)))
    const { restorePpiPolicy } = await import("@/lib/ppi-insurance-db")
    await restorePpiPolicy(policy.id).catch(() => null)
    return { ok: false, error: (err as Error)?.message ?? "The consolidation failed. Nothing was credited." }
  }

  return { ok: true, totalEur, deficits, policy: consumed }
}
