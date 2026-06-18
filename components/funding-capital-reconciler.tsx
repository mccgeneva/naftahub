"use client"

import { useEffect } from "react"
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

  useEffect(() => {
    if (!fundingHydrated || !ledgerHydrated) return
    const approved = requests.filter((r) => r.status === "approved")
    if (approved.length === 0) return

    const existingIds = new Set(entries.map((e) => e.id))
    const posts = buildFundingLedgerPosts(approved, existingIds)
    if (posts.length === 0) return

    for (const post of posts) {
      if (post.direction === "credit") addReceipt(post.entry)
      else addDebit(post.entry)
    }
    // `entries` is intentionally a dependency: after posting, ids exist and the
    // next run is a no-op. Re-runs also catch newly-due month-end charges.
  }, [requests, entries, fundingHydrated, ledgerHydrated, addReceipt, addDebit])

  return null
}
