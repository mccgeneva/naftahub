// ---------------------------------------------------------------------------
// Payment reconciliation — pure matching engine
// ---------------------------------------------------------------------------
//
// This module is intentionally free of "use server" and of any I/O so the
// matching logic stays pure and unit-testable. The server action layer
// (app/actions/reconciliation.ts) reads the active gateway accounts, calls
// `matchPayment` here, and acts on the classification it returns.

import type { GatewayAccount } from "@/lib/gateway-store"

/** A single inbound payment the administrator keys in for reconciliation. */
export interface IncomingPayment {
  id: string
  /** Positive monetary amount. */
  amount: number
  /** ISO currency code, upper-cased. */
  currency: string
  /** Ordering customer / payer name as it appears on the wire. */
  payer: string
  /** Remittance reference quoted by the sender (the key matching signal). */
  reference: string
  /** Optional sender IBAN (validated upstream). */
  senderIban?: string
  /** Optional sender BIC (validated upstream). */
  senderBic?: string
  /** Value date (ISO string). */
  valueDate?: string
  /** SWIFT gpi UETR (Block 3 field 121), when sourced from an MT message. */
  uetr?: string
  /** Detected SWIFT message type (e.g. "MT103"), when parsed from raw FIN. */
  swiftType?: string
  /** Raw SWIFT FIN message text, retained for audit when parsed. */
  swiftRaw?: string
}

export type ReconciliationStatus =
  | "reconciled"
  | "needs_review"
  | "unmatched"
  | "ignored"

/** One possible target account, scored against the incoming payment. */
export interface ReconciliationCandidate {
  userId: string
  requestId: string
  accountHolder: string
  company?: string
  partnerBankName?: string
  reference?: string
  currency: string
  /** 0-100 confidence the payment belongs to this account. */
  score: number
  /** Human-readable explanation of the score. */
  reason: string
  referenceMatch: "exact" | "partial" | "none"
  currencyMatch: boolean
}

export interface MatchResult {
  classification: Exclude<ReconciliationStatus, "ignored">
  candidates: ReconciliationCandidate[]
  /** Set only when classification is "reconciled" — the unique confident match. */
  confident?: ReconciliationCandidate
  summary: string
}

/** Strip everything but A-Z/0-9 and upper-case, so "REF 12/34-AB" -> "REF1234AB". */
export function normalizeReference(raw: string | undefined | null): string {
  return (raw ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "")
}

// References shorter than this are too generic to use for "contains" matching.
const MIN_PARTIAL_REF_LEN = 5

/**
 * Score an incoming payment against every active gateway account and classify
 * the outcome. Pure function — deterministic for a given input.
 */
export function matchPayment(
  payment: IncomingPayment,
  accounts: GatewayAccount[],
): MatchResult {
  const payRef = normalizeReference(payment.reference)
  const payCurrency = (payment.currency || "").toUpperCase()

  const active = accounts.filter(
    (a) => a.status === "active" && a.coordinates?.reference,
  )

  const candidates: ReconciliationCandidate[] = []

  for (const account of active) {
    const accRef = normalizeReference(account.coordinates?.reference)
    if (!accRef) continue

    let referenceMatch: ReconciliationCandidate["referenceMatch"] = "none"
    if (payRef && accRef && payRef === accRef) {
      referenceMatch = "exact"
    } else if (
      payRef &&
      accRef.length >= MIN_PARTIAL_REF_LEN &&
      (payRef.includes(accRef) || accRef.includes(payRef))
    ) {
      referenceMatch = "partial"
    }

    // Without any reference relationship there is nothing tying this payment to
    // this account — skip it entirely so the review queue stays meaningful.
    if (referenceMatch === "none") continue

    const currencyMatch = payCurrency === (account.currency || "").toUpperCase()

    let score = 0
    let reason = ""
    if (referenceMatch === "exact" && currencyMatch) {
      score = 100
      reason = "Exact reference and currency match."
    } else if (referenceMatch === "exact" && !currencyMatch) {
      score = 70
      reason = `Reference matches but currency differs (payment ${payCurrency} vs account ${account.currency}).`
    } else if (referenceMatch === "partial" && currencyMatch) {
      score = 60
      reason = "Partial reference match with matching currency."
    } else {
      score = 40
      reason = `Partial reference match with currency mismatch (payment ${payCurrency} vs account ${account.currency}).`
    }

    candidates.push({
      userId: account.userId,
      requestId: account.id,
      accountHolder: account.accountHolder,
      company: account.company,
      partnerBankName: account.coordinates?.partnerBankName,
      reference: account.coordinates?.reference,
      currency: account.currency,
      score,
      reason,
      referenceMatch,
      currencyMatch,
    })
  }

  candidates.sort((a, b) => b.score - a.score)

  if (candidates.length === 0) {
    return {
      classification: "unmatched",
      candidates,
      summary:
        "No active gateway account quotes a reference matching this payment. Route to manual review or assign a destination.",
    }
  }

  // A confident auto-credit requires a *single* perfect match (exact reference
  // + currency). If two accounts share an exact-currency match, or the only
  // matches are partial / currency-mismatched, fall back to manual review.
  const perfect = candidates.filter((c) => c.score === 100)
  if (perfect.length === 1) {
    return {
      classification: "reconciled",
      candidates,
      confident: perfect[0],
      summary: `Confident match to ${perfect[0].accountHolder} (reference ${perfect[0].reference}). Auto-credited to the Master Account.`,
    }
  }

  if (perfect.length > 1) {
    return {
      classification: "needs_review",
      candidates,
      summary: `${perfect.length} active accounts share this exact reference and currency — admin must choose the correct destination.`,
    }
  }

  return {
    classification: "needs_review",
    candidates,
    summary:
      "No exact reference + currency match. The closest candidates are listed for admin review.",
  }
}
