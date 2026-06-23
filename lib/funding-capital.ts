import { AES_ANNUAL_COST_RATE } from "@/lib/aes"
import type { LedgerEntry } from "@/lib/ledger-store"
import type { ProjectFundingRequest } from "@/lib/project-funding-store"
import {
  accruedInterestToDate,
  monthlyInterestAmount,
  monthlyInterestCharges,
} from "@/lib/interest-accrual"

/**
 * Project Funding -> Master Account integration.
 *
 * When an AES project funding application is APPROVED, two things must reflect
 * on the client's master account ledger:
 *
 *   1. The approved facility capital is CREDITED to the balance (once).
 *   2. The 1.8% annual debit interest (cost of capital) is CHARGED monthly —
 *      i.e. a DEBIT of `facility * 1.8% / 12` posted at the end of each calendar
 *      month for as long as the facility is active. Accrual begins on the EXACT
 *      day the capital is credited, so the first (and any settlement) month is
 *      PRO-RATED to the active days in that month.
 *
 * Because this is a client-side ledger with no scheduler, charges are accrued
 * lazily: every time the data is reconciled we post any month-end charges that
 * have come due since approval but are not yet on the ledger. All entries use
 * deterministic ids so reconciliation is fully idempotent (re-running never
 * double-posts).
 */

/** Annual debit interest rate on a project funding facility (1.8%). */
export const FUNDING_ANNUAL_RATE = AES_ANNUAL_COST_RATE

/** Monthly cost-of-capital rate: 1.8% annual, charged in twelfths. */
export const MONTHLY_COST_RATE = AES_ANNUAL_COST_RATE / 12

/** One full month's cost-of-capital charge on a facility. */
export function monthlyCostOfCapital(facility: number): number {
  return monthlyInterestAmount(Math.max(0, facility), FUNDING_ANNUAL_RATE)
}

/** Cost of capital accrued to date (continuous, includes the current month). */
export function accruedCostOfCapital(facility: number, start: Date, asOf: Date = new Date()): number {
  return accruedInterestToDate(Math.max(0, facility), FUNDING_ANNUAL_RATE, start, asOf)
}

/** Deterministic ledger id for an approved facility's capital credit. */
export function fundingCapitalCreditId(requestId: string): string {
  return `FND-CAP-${requestId}`
}

/** Deterministic ledger id for a single month's cost-of-capital charge. */
export function fundingChargeId(requestId: string, yearMonth: string): string {
  return `FND-ROI-${requestId}-${yearMonth}`
}

/** The date a request's capital is credited (and from which interest accrues). */
export function fundingCreditDate(r: ProjectFundingRequest): Date {
  return r.decidedAt ? new Date(r.decidedAt) : new Date(r.submittedAt)
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
    const approvedAt = fundingCreditDate(r)
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

    // 2. Monthly cost-of-capital charges at each elapsed calendar month-end,
    //    accruing from the credit date with the first month pro-rated.
    for (const charge of monthlyInterestCharges(r.facility, FUNDING_ANNUAL_RATE, approvedAt, now)) {
      const chargeId = fundingChargeId(r.id, charge.yearMonth)
      if (existingIds.has(chargeId)) continue
      const proNote = charge.prorated
        ? ` (pro-rated ${(charge.fraction * 100).toFixed(0)}% — accrual began on the funding date)`
        : ""
      posts.push({
        direction: "debit",
        entry: {
          id: chargeId,
          amount: charge.amount,
          currency: r.currency,
          status: "completed",
          date: charge.date.toISOString(),
          counterparty: "MCC Capital — AES Cost of Capital",
          reference: r.id,
          category: "Cost of Capital",
          comment: `Monthly debit interest (1.8% p.a. ÷ 12) on "${r.projectName}" facility for ${charge.yearMonth}${proNote}.`,
        },
      })
    }
  }

  // Oldest first so chronological order is preserved when prepended/merged.
  return posts.sort((a, b) => new Date(a.entry.date).getTime() - new Date(b.entry.date).getTime())
}
