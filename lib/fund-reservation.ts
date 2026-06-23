import { convertCurrency } from "@/lib/fx"

/**
 * Pure, side-effect-free fund-reservation planner.
 *
 * Given a client's AVAILABLE balances per currency and a required reservation
 * (amount + deal currency), it decides whether the reservation can be fully
 * covered and, if cross-currency funding is needed, produces the exact FX legs
 * to execute — each one CAPPED at the source currency's available balance so a
 * reservation can NEVER drive any balance negative.
 *
 * This module has no I/O and no "server-only" import, so it is trivially unit
 * testable and safe to use from anywhere. The actual ledger writes (and the
 * accept/auto-reject decision) live in the approvals workflow that calls this.
 */

/** A penny of slack absorbs floating-point noise from FX math. */
const EPSILON = 0.01

export interface FxFundingLeg {
  /** Currency being SOLD to fund the reservation. */
  fromCurrency: string
  /** Amount of `fromCurrency` sold (never exceeds its available balance). */
  sellAmount: number
  /** Amount of deal currency bought with this leg. */
  buyAmount: number
  /** Human-readable rate, e.g. "1 USD = 0.9181 EUR". */
  rateLabel: string
}

export interface ReservationPlan {
  /** True only if the FULL reservation can be covered with no negative balance. */
  feasible: boolean
  needCurrency: string
  needAmount: number
  /** Spendable balance already held in the deal currency. */
  directAvailable: number
  /** Portion of the need not covered by the deal currency directly. */
  shortfall: number
  /** Amount of the shortfall the FX legs actually fund. */
  fundedShortfall: number
  /**
   * Deal-currency amount that still cannot be covered after exhausting every
   * other currency. Zero when feasible; > 0 means the request must be rejected.
   */
  uncovered: number
  /** Cross-currency funding legs to post (settled), in execution order. */
  legs: FxFundingLeg[]
  /** Total spendable funds expressed in the deal currency (for messaging). */
  totalAvailableInNeedCurrency: number
}

function round2(n: number): number {
  return Math.round(n * 100) / 100
}

/**
 * Plan a reservation of `needAmount` in `needCurrency` against `available`
 * balances. Other currencies are drawn in descending order of USD value, each
 * capped at its own balance, until the shortfall is covered or all are
 * exhausted. `feasible` is true only when the entire amount is covered.
 */
export function planReservation(
  available: Record<string, number>,
  needCurrency: string,
  needAmount: number,
): ReservationPlan {
  const need = Math.max(0, Number(needAmount) || 0)
  const directAvailable = Math.max(available[needCurrency] ?? 0, 0)

  // Total spendable funds, valued in the deal currency, for messaging + a quick
  // global feasibility read independent of per-leg rounding.
  let totalAvailableInNeedCurrency = 0
  for (const [cur, bal] of Object.entries(available)) {
    if (bal > 0) totalAvailableInNeedCurrency += convertCurrency(bal, cur, needCurrency)
  }
  totalAvailableInNeedCurrency = round2(totalAvailableInNeedCurrency)

  const shortfall = round2(Math.max(need - directAvailable, 0))

  if (shortfall <= EPSILON) {
    return {
      feasible: true,
      needCurrency,
      needAmount: need,
      directAvailable: round2(directAvailable),
      shortfall: 0,
      fundedShortfall: 0,
      uncovered: 0,
      legs: [],
      totalAvailableInNeedCurrency,
    }
  }

  // Fund the shortfall from other currencies, richest (by USD value) first.
  const sources = Object.entries(available)
    .filter(([cur, bal]) => cur !== needCurrency && bal > EPSILON)
    .sort((a, b) => convertCurrency(b[1], b[0], "USD") - convertCurrency(a[1], a[0], "USD"))

  const legs: FxFundingLeg[] = []
  let remaining = shortfall

  for (const [cur, bal] of sources) {
    if (remaining <= EPSILON) break
    // How much deal currency this source could produce if fully spent.
    const maxBuyFromCur = convertCurrency(bal, cur, needCurrency)
    const buy = Math.min(remaining, maxBuyFromCur)
    // Cost in the source currency, hard-capped at its balance so it can never
    // be overdrawn even if rounding nudges the cost above the balance.
    const sell = Math.min(convertCurrency(buy, needCurrency, cur), bal)
    const rateLabel = `1 ${needCurrency} = ${convertCurrency(1, needCurrency, cur).toFixed(4)} ${cur}`
    legs.push({
      fromCurrency: cur,
      sellAmount: round2(sell),
      buyAmount: round2(buy),
      rateLabel,
    })
    remaining = round2(remaining - buy)
  }

  const uncovered = round2(Math.max(remaining, 0))
  const fundedShortfall = round2(shortfall - uncovered)

  return {
    feasible: uncovered <= EPSILON,
    needCurrency,
    needAmount: need,
    directAvailable: round2(directAvailable),
    shortfall,
    fundedShortfall,
    uncovered,
    legs,
    totalAvailableInNeedCurrency,
  }
}

/** Format a currency amount for client/admin messaging. */
export function formatMoney(amount: number, currency: string): string {
  return `${currency} ${Number(amount).toLocaleString("en-US", { maximumFractionDigits: 2 })}`
}
