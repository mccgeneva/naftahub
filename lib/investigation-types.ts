// ---------------------------------------------------------------------------
// Customer Investigation — shared types (NO server imports).
//
// Consumed by BOTH the server aggregation service (lib/investigation-service.ts)
// and the client admin component (components/admin/customer-investigation.tsx)
// + the client-side PDF builder (lib/investigation-pdf.ts). Kept dependency-free
// so it is safe to import from a client bundle.
// ---------------------------------------------------------------------------

/** One currency line of the current-positions snapshot. */
export interface InvestigationBalance {
  currency: string
  /** Net settled balance (completed credits − completed debits). */
  available: number
  /** Total amount currently on hold / blocked (all held rows). */
  onHold: number
  /** Portion of the holds specifically segregated as Equity Saving. */
  equitySaving: number
}

/** A live facility / open position summary for one approval kind. */
export interface InvestigationFacility {
  kind: string
  label: string
  liveCount: number
  items: {
    title: string
    amount: number | null
    currency: string | null
    status: string
    createdAt: string
  }[]
}

/** A single chronological event in the reconstructed activity log. */
export interface TimelineItem {
  /** ISO timestamp — the timeline is sorted strictly ascending by this. */
  at: string
  /** "Ledger" (money movement) or "Activity" (audit-trail event). */
  source: "Ledger" | "Activity"
  /** Resolved section / category (e.g. "Treasury", "Authentication"). */
  section: string
  /** Event type — action text, or "Credit" / "Debit" / "Hold" for money. */
  type: string
  /** Human-readable description of what happened. */
  description: string
  /** Signed amount for money movements (credit +, debit −), else null. */
  amount: number | null
  currency: string | null
  status: string | null
  /** Resulting settled balance in that currency after a money movement. */
  balanceAfter: number | null
  /** Reference id (ledger entry id / audit event id). */
  ref: string | null
  ip: string | null
  device: string | null
  /** Which account within the environment acted (name/id) — for shared pools. */
  actor: string | null
}

/** Full investigation payload for one customer over a date range. */
export interface CustomerInvestigation {
  userId: string
  account: string
  company: string
  email: string
  accountBadge: string
  relationship: string
  /** Every account id sharing this customer's financial pool (master + subs + joints). */
  memberIds: string[]
  range: { from: string | null; to: string | null }
  /** Current positions (as of now, independent of the range). */
  balances: InvestigationBalance[]
  facilities: InvestigationFacility[]
  /** Chronological, exact-time-order reconstruction of the customer's activity. */
  timeline: TimelineItem[]
  counts: { total: number; ledger: number; activity: number }
  /** True if the merged timeline was truncated to the cap. */
  truncated: boolean
  generatedAt: string
}
