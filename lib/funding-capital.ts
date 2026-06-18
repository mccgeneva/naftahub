import { AES_ANNUAL_COST_RATE } from "@/lib/aes"
import type { LedgerEntry } from "@/lib/ledger-store"
import type { ProjectFundingRequest } from "@/lib/project-funding-store"

/**
 * Project Funding -> Master Account integration.
 *
 * When an AES project funding application is APPROVED, two things must reflect
 * on the client's master account ledger:
 *
 *   1. The approved facility capital is CREDITED to the balance (once).
 *   2. The 1.8% annual cost of capital is CHARGED monthly — i.e. a DEBIT of
 *      `facility * 1.8% / 12` posted at the end of each calendar month for as
 *      long as the facility is active.
 *
 * Because this is a client-side ledger with no scheduler, charges are accrued
 * lazily: every time the data is reconciled we post any month-end charges that
 * have come due since approval but are not yet on the ledger. All entries use
 * deterministic ids so reconciliation is fully idempotent (re-running never
 * double-posts).
 */

/** Monthly cost-of-capital rate: 1.8% annual, charged in twelfths. */
export const MONTHLY_COST_RATE = AES_ANNUAL_COST_RATE / 12

/** One month's cost-of-capital charge on a facility. */
export function monthlyCostOfCapital(facility: number): number {
  return Math.max(0, facility) * MONTHLY_COST_RATE
}

/** Deterministic ledger id for an approved facility's capital credit. */
export function fundingCapitalCreditId(requestId: string): string {
  return `FND-CAP-${requestId}`
}

/** Deterministic ledger id for a single month's cost-of-capital charge. */
export function fundingChargeId(requestId: string, yearMonth: string): string {
  return `FND-ROI-${requestId}-${yearMonth}`
}

/** Format a Date as `YYYY-MM` (calendar month key). */
function yearMonthKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`
}

/** Last instant of the calendar month that `year`/`monthIndex` (0-based) falls in. */
function endOfMonth(year: number, monthIndex: number): Date {
  // Day 0 of the next month = last day of this month.
  return new Date(year, monthIndex + 1, 0, 23, 59, 59, 999)
}

/**
 * Every calendar month-end strictly after `start` and on/before `now`.
 * These are the month-ends at which a cost-of-capital charge is due.
 */
export function dueMonthEnds(start: Date, now: Date): Date[] {
  const ends: Date[] = []
  if (!(start instanceof Date) || Number.isNaN(start.getTime())) return ends
  let year = start.getFullYear()
  let month = start.getMonth()
  // Walk month-ends forward until we pass `now`.
  for (let i = 0; i < 1200; i++) {
    const monthEnd = endOfMonth(year, month)
    if (monthEnd > now) break
    if (monthEnd > start) ends.push(monthEnd)
    month += 1
    if (month > 11) {
      month = 0
      year += 1
    }
  }
  return ends
}

export interface PendingLedgerPost {
  direction: LedgerDirectionLike
  entry: Omit<LedgerEntry, "direction">
}

type LedgerDirectionLike = "credit" | "debit"

/**
 * Build every ledger post that an approved funding request implies but that is
 * not yet present on the ledger (checked against `existingIds`).
 *
 * Returns capital credits and any due monthly charges, oldest charge first so
 * the resulting ledger reads chronologically.
 */
export function buildFundingLedgerPosts(
  requests: ProjectFundingRequest[],
  existingIds: Set<string>,
  now: Date = new Date(),
): PendingLedgerPost[] {
  const posts: PendingLedgerPost[] = []

  for (const r of requests) {
    if (r.status !== "approved" || !r.facility || r.facility <= 0) continue
    const approvedAt = r.decidedAt ? new Date(r.decidedAt) : new Date(r.submittedAt)
    if (Number.isNaN(approvedAt.getTime())) continue

    // 1. Capital credit (once).
    const creditId = fundingCapitalCreditId(r.id)
    if (!existingIds.has(creditId)) {
      posts.push({
        direction: "credit",
        entry: {
          id: creditId,
          amount: r.facility,
          currency: r.currency,
          status: "completed",
          date: approvedAt.toISOString(),
          counterparty: "MCC Capital — AES Facility Drawdown",
          reference: r.id,
          category: "Project Funding",
          comment: `Approved AES facility for "${r.projectName}" credited to the master account.`,
        },
      })
    }

    // 2. Monthly cost-of-capital charges at each elapsed calendar month-end.
    const charge = monthlyCostOfCapital(r.facility)
    if (charge > 0) {
      for (const monthEnd of dueMonthEnds(approvedAt, now)) {
        const ym = yearMonthKey(monthEnd)
        const chargeId = fundingChargeId(r.id, ym)
        if (existingIds.has(chargeId)) continue
        posts.push({
          direction: "debit",
          entry: {
            id: chargeId,
            amount: charge,
            currency: r.currency,
            status: "completed",
            date: monthEnd.toISOString(),
            counterparty: "MCC Capital — AES Cost of Capital",
            reference: r.id,
            category: "Cost of Capital",
            comment: `Monthly cost of capital (1.8% p.a. ÷ 12) on "${r.projectName}" facility for ${ym}.`,
          },
        })
      }
    }
  }

  // Oldest first so chronological order is preserved when prepended/merged.
  return posts.sort((a, b) => new Date(a.entry.date).getTime() - new Date(b.entry.date).getTime())
}
