"use client"

import { useEffect, useRef } from "react"
import { useLedger } from "@/lib/ledger-store"
import { useProjectFunding } from "@/lib/project-funding-store"
import { buildFundingLedgerPosts } from "@/lib/funding-capital"

/**
 * Headless reconciler that keeps the master account ledger in sync with
 * approved AES project funding.
 *
 * On every dashboard mount (and whenever funding requests or the ledger
 * change) it posts any missing capital credits and any monthly cost-of-capital
 * charges that have come due. All posts are idempotent (deterministic ids), so
 * this never double-posts. Running it centrally means the credited capital and
 * accrued charges reflect on the balance everywhere — dashboard home, accounts,
 * and the funding page — without each surface re-implementing the logic.
 */
export function FundingCapitalReconciler() {
  const { requests, hydrated: fundingHydrated } = useProjectFunding()
  const { entries, addReceipt, addDebit, hydrated: ledgerHydrated } = useLedger()

  // Ids we have ALREADY posted (or attempted) this session. This is the loop
  // breaker: posts are written optimistically AND persisted via a Server Action
  // (which auto-revalidates the route). A background ledger refetch can briefly
  // return server data that does not yet include a just-written row, which used
  // to make this effect see the post as "missing" and write it again — an
  // endless write→revalidate→refetch storm that hammered /api/ledger ~10x/sec
  // and crashed the dashboard. Tracking attempts in a ref (not state, so it
  // never triggers a render) guarantees each id is posted at most once per
  // session regardless of what `entries` momentarily contains. Server upserts
  // are idempotent, so durability is unaffected; new month-end charge ids are
  // still posted the first time they come due.
  const attemptedRef = useRef<Set<string>>(new Set())

  useEffect(() => {
    if (!fundingHydrated || !ledgerHydrated) return
    const approved = requests.filter((r) => r.status === "approved")
    if (approved.length === 0) return

    // An id is "already present" if it is on the ledger OR we have posted it in
    // this session — either way we must not post it again.
    const existingIds = new Set(entries.map((e) => e.id))
    for (const id of attemptedRef.current) existingIds.add(id)

    const posts = buildFundingLedgerPosts(approved, existingIds)
    if (posts.length === 0) return

    for (const post of posts) {
      // Mark attempted BEFORE writing so a re-render mid-flight cannot re-post.
      attemptedRef.current.add(post.entry.id)
      if (post.direction === "credit") addReceipt(post.entry)
      else addDebit(post.entry)
    }
  }, [requests, entries, fundingHydrated, ledgerHydrated, addReceipt, addDebit])

  return null
}
