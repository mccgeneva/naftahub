/**
 * Pure, client-safe evaluation of administrator "outgoing block" restrictions.
 *
 * No "server-only" / DB imports live here so the SAME logic is used by:
 *  - the authoritative server gates (submitApproval, sendInstantTransfer,
 *    applyForInternalLoan), and
 *  - the friendly client pre-check / banner on the money-out pages.
 *
 * An administrator can suspend a SELECTED user's OUTGOING activity for a period
 * of time, with an explanation stored at the moment the block is set. Two
 * independent scopes:
 *   - "payments" — outgoing payments & transfers (money leaving to a third party)
 *   - "trades"   — trading & financing operations (leverage, monetization, PPP,
 *                  trading fund, commodity, project funding, treasury lending,
 *                  internal loans)
 *
 * INCOMING funds and instruments are NEVER affected — the account can always
 * receive. A block optionally expires at `until`; once past that instant it is
 * automatically inactive (no admin action needed).
 */

export type OutgoingBlockScope = "payments" | "trades"

export interface OutgoingBlockConfig {
  blockPayments: boolean
  blockTrades: boolean
  /** Administrator's explanation, shown to the user on every auto-rejection. */
  reason: string
  /** ISO timestamp when the block lifts; null = indefinite (until removed). */
  until: string | null
  createdBy?: string | null
  updatedAt: string | null
}

export interface OutgoingBlockDecision {
  blocked: boolean
  reason: string
  until: string | null
}

const NOT_BLOCKED: OutgoingBlockDecision = { blocked: false, reason: "", until: null }

/** True when the block has an `until` instant that is now in the past. */
export function outgoingBlockExpired(cfg: OutgoingBlockConfig | null, now: number = Date.now()): boolean {
  if (!cfg?.until) return false
  const t = Date.parse(cfg.until)
  return Number.isFinite(t) && t <= now
}

/** Whether ANY scope of the block is currently in force. */
export function outgoingBlockActive(cfg: OutgoingBlockConfig | null, now: number = Date.now()): boolean {
  if (!cfg) return false
  if (!cfg.blockPayments && !cfg.blockTrades) return false
  return !outgoingBlockExpired(cfg, now)
}

/**
 * Decide whether a specific outgoing SCOPE is blocked for a user right now.
 * Returns the stored reason + until so the caller can build the rejection.
 */
export function evaluateOutgoingBlock(
  cfg: OutgoingBlockConfig | null,
  scope: OutgoingBlockScope,
  now: number = Date.now(),
): OutgoingBlockDecision {
  if (!cfg) return NOT_BLOCKED
  if (outgoingBlockExpired(cfg, now)) return NOT_BLOCKED
  const scoped = scope === "payments" ? cfg.blockPayments : cfg.blockTrades
  if (!scoped) return NOT_BLOCKED
  return { blocked: true, reason: cfg.reason || "", until: cfg.until }
}

/**
 * Map an approval/operation kind to the block scope it belongs to, or null when
 * the kind is not an outgoing money/trade action (e.g. a card request, or a
 * risk-reducing leverage switch-off) and must never be blocked.
 */
const TRADE_KINDS = new Set([
  "leverage",
  "monetization",
  "ppp",
  "trading_fund",
  "commodity",
  "project_funding",
  "treasury_lending",
  "internal_loan",
])
export function outgoingScopeForKind(kind: string): OutgoingBlockScope | null {
  if (kind === "payment") return "payments"
  if (TRADE_KINDS.has(kind)) return "trades"
  return null
}

/** Format the `until` instant for user-facing messages (UTC date + time). */
export function formatOutgoingBlockUntil(until: string | null): string {
  if (!until) return ""
  const d = new Date(until)
  if (Number.isNaN(d.getTime())) return ""
  return d.toLocaleString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "UTC",
    timeZoneName: "short",
  })
}

/** Build the standard auto-rejection message shown when an outgoing block bites. */
export function outgoingBlockMessage(
  scope: OutgoingBlockScope,
  reason: string,
  until: string | null,
): string {
  const what =
    scope === "payments"
      ? "Outgoing payments and transfers on your account are currently suspended by the administrator."
      : "Trading and financing operations on your account are currently suspended by the administrator."
  const untilStr = until ? ` This restriction is in place until ${formatOutgoingBlockUntil(until)}.` : ""
  const why = reason && reason.trim() ? ` Reason: ${reason.trim()}` : ""
  return `${what}${untilStr}${why} Incoming funds and instruments are not affected — your account can still receive.`
}
