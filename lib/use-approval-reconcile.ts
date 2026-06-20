"use client"

import { useEffect, useRef } from "react"
import { reconcileFromDb, type Reconcilable, type ReconcileOptions } from "@/lib/approval-sync"
import type { ApprovalKind } from "@/lib/approval-kinds"

/**
 * Polls the DB-backed approvals backbone for administrator decisions on the
 * signed-in user's requests of a given `kind` and merges them back into a
 * legacy localStorage request store.
 *
 * This is the client half of the cross-client bridge: requests are mirrored to
 * the DB on submit (so the admin sees them across clients) and decisions are
 * reconciled back here (so the client sees the outcome). Decision sync only —
 * any balance/ledger side effects remain the store's own responsibility to
 * avoid double counting.
 *
 * @param onNewlyApproved optional callback for records that flipped
 *        pending → approved, invoked once per record so the caller can apply a
 *        local side effect (e.g. activating an investment) exactly once.
 */
export function useApprovalReconcile<T extends Reconcilable>(
  kind: ApprovalKind,
  hydrated: boolean,
  records: T[],
  setRecords: (next: T[]) => void,
  onNewlyApproved?: (records: T[]) => void,
  options?: ReconcileOptions,
): void {
  // Keep the latest records & setter in refs so the polling timer doesn't need
  // to re-subscribe on every change.
  const recordsRef = useRef<T[]>(records)
  const setRef = useRef(setRecords)
  const onApprovedRef = useRef(onNewlyApproved)
  const optionsRef = useRef(options)
  useEffect(() => {
    recordsRef.current = records
  }, [records])
  useEffect(() => {
    setRef.current = setRecords
  }, [setRecords])
  useEffect(() => {
    onApprovedRef.current = onNewlyApproved
  }, [onNewlyApproved])
  useEffect(() => {
    optionsRef.current = options
  }, [options])

  useEffect(() => {
    if (!hydrated) return
    let cancelled = false

    const sync = async () => {
      const current = recordsRef.current
      // Nothing to reconcile unless we have a mirrored, still-pending request.
      const pending = optionsRef.current?.pendingStatuses ?? ["pending"]
      if (!current.some((r) => pending.includes(r.status) && r.approvalId)) return
      const { records: next, changed, newlyApproved } = await reconcileFromDb(
        kind,
        current,
        optionsRef.current,
      )
      if (cancelled || !changed) return
      setRef.current(next)
      if (newlyApproved.length && onApprovedRef.current) {
        onApprovedRef.current(newlyApproved)
      }
    }

    void sync()
    // NOTE: We deliberately do NOT re-sync on `window.focus`. Next.js executes
    // Server Actions sequentially and queues client navigations behind any
    // in-flight action. With ~12 stores each mounting this hook, a single focus
    // event (which fires after closing a dialog, dismissing a toast, or simply
    // returning to the tab) would dispatch a burst of serialized server calls
    // and freeze navigation until a hard refresh. A periodic interval is enough
    // to pick up administrator decisions shortly after they happen.
    const id = setInterval(sync, 30000)
    return () => {
      cancelled = true
      clearInterval(id)
    }
  }, [kind, hydrated])
}
