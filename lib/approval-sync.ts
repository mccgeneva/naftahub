"use client"

import type { ApprovalKind } from "@/lib/approval-kinds"
import type { LedgerEffect } from "@/lib/approvals-db"

/**
 * Shared client-side bridge between the legacy per-user request stores
 * (localStorage) and the DB-backed approvals backbone.
 *
 * Why this exists: the request stores were per-browser, so the administrator
 * could never see another client's pending requests. Rather than rewrite every
 * store and page at once, each store now MIRRORS its submissions into the
 * `approval_requests` table (so the admin sees them cross-client and decides
 * there) and RECONCILES admin decisions back into its local records (so the
 * client sees the approve/reject outcome). The DB is the source of truth for
 * the decision; the local store remains the client's fast read model.
 */

export interface MirrorInput {
  kind: ApprovalKind
  title: string
  summary: string
  amount?: number | null
  currency?: string | null
  payload?: Record<string, unknown>
  ledgerEffect?: LedgerEffect | null
}

/**
 * Mirror a freshly-submitted local request into the DB. Fire-and-forget from
 * the caller's perspective: returns the new approval id (to store on the local
 * record for later reconciliation) or null if the DB write didn't happen
 * (e.g. no DB configured). Never throws.
 */
export async function mirrorSubmission(input: MirrorInput): Promise<string | null> {
  try {
    // POST to a Route Handler instead of invoking the Server Action directly.
    // Server Actions are serialized with client navigations by Next.js, so a
    // slow/unreachable DB on submit would freeze navigation until a hard
    // refresh. A plain fetch has no such coupling.
    const res = await fetch("/api/approvals", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    })
    if (!res.ok) return null
    const data = (await res.json()) as { ok: boolean; request?: { id: string } }
    return data.ok && data.request ? data.request.id : null
  } catch {
    return null
  }
}

/** A local record that has been mirrored carries the DB approval id + status. */
export interface Reconcilable {
  approvalId?: string
  status: string
  decidedAt?: string
  decisionNote?: string
}

export interface ReconcileResult<T> {
  records: T[]
  /** True if any record's decision changed (caller should persist). */
  changed: boolean
  /** Records that flipped pending → approved (caller may apply side effects). */
  newlyApproved: T[]
}

export interface ReconcileOptions {
  /** Local status value a DB approval maps to. Defaults to "approved". */
  approvedStatus?: string
  /** Local status value a DB rejection maps to. Defaults to "rejected". */
  rejectedStatus?: string
  /** Local status value(s) considered "still awaiting a decision". Defaults to ["pending"]. */
  pendingStatuses?: string[]
}

/**
 * Pull the signed-in user's decisions for `kind` from the DB and merge them
 * into the local records by approval id. By default maps DB status → store
 * status: approved → "approved", rejected → "rejected"; pass `options` to map
 * onto a store's own vocabulary (e.g. instruments use "active" for approved).
 * Returns updated records plus which ones newly became approved so the caller
 * can apply local side effects (e.g. a ledger debit) exactly once.
 */
export async function reconcileFromDb<T extends Reconcilable>(
  kind: ApprovalKind,
  records: T[],
  options?: ReconcileOptions,
): Promise<ReconcileResult<T>> {
  const approvedStatus = options?.approvedStatus ?? "approved"
  const rejectedStatus = options?.rejectedStatus ?? "rejected"
  const pendingStatuses = options?.pendingStatuses ?? ["pending"]
  let changed = false
  const newlyApproved: T[] = []
  try {
    // Read decisions via a Route Handler (see mirrorSubmission for why). This
    // poll runs in ~12 stores on an interval; if it were a Server Action a slow
    // DB read could block navigation each time it fired.
    const res = await fetch(`/api/approvals?kind=${encodeURIComponent(kind)}`)
    if (!res.ok) return { records, changed, newlyApproved }
    const data = (await res.json()) as {
      ok: boolean
      items: { id: string; status: string; decidedAt?: string; decisionNote?: string }[]
    }
    const remote = data.items ?? []
    if (!remote.length) return { records, changed, newlyApproved }
    const byId = new Map(remote.map((r) => [r.id, r]))
    const next = records.map((rec) => {
      if (!rec.approvalId || !pendingStatuses.includes(rec.status)) return rec
      const match = byId.get(rec.approvalId)
      if (!match || match.status === "pending") return rec
      if (match.status === "approved") {
        changed = true
        const updated = {
          ...rec,
          status: approvedStatus,
          decidedAt: match.decidedAt ?? new Date().toISOString(),
        }
        newlyApproved.push(updated)
        return updated
      }
      if (match.status === "rejected") {
        changed = true
        return {
          ...rec,
          status: rejectedStatus,
          decidedAt: match.decidedAt ?? new Date().toISOString(),
          decisionNote: match.decisionNote ?? rec.decisionNote,
        }
      }
      return rec
    })
    return { records: next, changed, newlyApproved }
  } catch {
    return { records, changed, newlyApproved }
  }
}
