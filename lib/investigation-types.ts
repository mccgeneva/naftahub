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
  /** Normalized event category from the fixed investigation taxonomy. */
  category: InvestigationCategory
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
  /** Pocket id this money movement belongs to: "main" or a sub-account id. Empty for audit events. */
  compartmentId: string
  /** Human label for the pocket ("Main account" / sub-account label). Empty for audit events. */
  compartment: string
}

/** Per-pocket (master vs each sub-account) current balance split. */
export interface InvestigationCompartment {
  /** "main" for the master account, else the sub-account id. */
  id: string
  /** "Main account" or the sub-account's label. */
  label: string
  /** Per-currency current balances for this pocket. */
  balances: InvestigationBalance[]
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
  /** Current balances split per pocket (master + each sub-account). */
  compartments: InvestigationCompartment[]
  facilities: InvestigationFacility[]
  /** Chronological, exact-time-order reconstruction of the customer's activity. */
  timeline: TimelineItem[]
  counts: { total: number; ledger: number; activity: number }
  /** Count of timeline events per normalized category, most-frequent first. */
  byCategory: { category: InvestigationCategory; count: number }[]
  /** True if the merged timeline was truncated to the cap. */
  truncated: boolean
  generatedAt: string
}

// ---------------------------------------------------------------------------
// Event-type taxonomy — the fixed set of categories every timeline event is
// classified into, so the log can be filtered, summarised and exported by the
// exact event types the investigation cares about. Pure + dependency-free so
// server (service), client (component) and the PDF builder all agree.
// ---------------------------------------------------------------------------

export const INVESTIGATION_CATEGORIES = [
  "Transaction",
  "Debit",
  "Fee",
  "Cashback",
  "Block / Hold",
  "Approval",
  "Instrument",
  "Leverage",
  "Trading / cTrader",
  "Document",
  "Authentication",
  "Navigation",
  "Other",
] as const

export type InvestigationCategory = (typeof INVESTIGATION_CATEGORIES)[number]

/**
 * Classify one event into the taxonomy from its section/type/description plus
 * money direction. Keyword order matters (cashback/fee before plain money;
 * auth before instrument, etc.). Pure — safe on both server and client.
 */
export function classifyEvent(item: {
  source: "Ledger" | "Activity"
  section: string
  type: string
  description: string
  amount: number | null
  status: string | null
}): InvestigationCategory {
  if (item.status === "hold") return "Block / Hold"
  const hay = `${item.section} ${item.type} ${item.description}`.toLowerCase()
  if (/cashback/.test(hay)) return "Cashback"
  if (/\bfees?\b|commission|arrangement|premium|\binterest\b|\bcharges?\b|charged|audit fee|management fee/.test(hay))
    return "Fee"
  if (/ctrader|\bmt5\b|\bmt4\b|terminal|\bposition\b|\border\b|\btrade[ds]?\b|\blots?\b/.test(hay))
    return "Trading / cTrader"
  if (/certificate|document|\bpdf\b|statement|receipt|dossier|agreement|generated|downloaded/.test(hay))
    return "Document"
  if (
    /log ?in|log ?out|sign[- ]?in|sign[- ]?out|authenticat|passcode|password|\bface\b|biometric|verif|\bkyc\b|\botp\b|session/.test(
      hay,
    )
  )
    return "Authentication"
  if (/instrument|mt760|sblc|\bbg\b|\bdlc\b|guarantee|monetiz|\bskr\b|\bbond\b|\bmtn\b|emtn/.test(hay))
    return "Instrument"
  if (/leverage|margin|debit line|switch[- ]?off|unwind/.test(hay)) return "Leverage"
  if (/approv|reject|declin|decision|await|consent/.test(hay)) return "Approval"
  if (/\bblock|freeze|frozen|suspend|reserv/.test(hay)) return "Block / Hold"
  if (/navigat|viewed|opened|\bpage\b|dashboard|\btab\b/.test(hay)) return "Navigation"
  if (item.source === "Ledger" && item.amount !== null) return item.amount >= 0 ? "Transaction" : "Debit"
  return "Other"
}
