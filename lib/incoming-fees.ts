// Platform-wide INCOMING-TRANSACTION FEE.
//
// A flat 2% fee is charged on every inbound credit to a customer's Master
// Account — SWIFT-uploaded credits, gateway (Collect-funds) deposits,
// registered-account deposits, master-IBAN matches and reconciled inbound
// payments. It is DEDUCTED FROM THE CREDIT (the customer receives the net),
// and it applies IN ADDITION TO the 0.5% FX fee when the payment is also a
// currency conversion.
//
// Pure + framework-free so it can be imported by "use server" modules (which
// may only export async functions) — the rate/label/helper live here, not in
// the server action files.
//
// The fee is now MARGINAL TIERED (see lib/tiered-fees.ts): each portion of the
// amount is charged at its own bracket rate. The 2% below is only the headline
// entry-tier rate (the first €0–€100k bracket) kept for display/legacy refs.

import { calculateTieredFee, type FeeTier } from "@/lib/tiered-fees"

export const INCOMING_TRANSACTION_FEE_RATE = 0.02
export const INCOMING_TRANSACTION_FEE_LABEL = "up to 2%"

/**
 * The incoming-transaction fee, computed on the amount (already converted into
 * the account currency) that is being credited, using the marginal tiered
 * table. Rounded to 2 decimals. Returns 0 for a non-positive / non-finite base
 * so it can never manufacture a negative credit. Pass the live `tiers` on the
 * server (DB-backed); omit to use the default table.
 */
export function incomingTransactionFee(grossInAccountCurrency: number, tiers?: FeeTier[]): number {
  return calculateTieredFee(grossInAccountCurrency, tiers).totalFee
}

// Platform-wide INTERNAL P2P TRANSFER FEE.
//
// A flat 2% fee is charged on internal account-to-account transfers between two
// MCC accounts (the /dashboard/send flow). It is BORNE BY THE SENDER (added on
// top): the recipient receives the FULL amount and the sender is debited
// amount + fee. (Outgoing EXTERNAL/SWIFT payments carry their own separate
// platform fee charged on top of the amount — same principle, unrelated code.)

export const INTERNAL_TRANSFER_FEE_RATE = 0.02
export const INTERNAL_TRANSFER_FEE_LABEL = "up to 2%"

/**
 * The internal-transfer fee, computed on the transfer amount using the marginal
 * tiered table, charged on top of the amount to the SENDER. Rounded to 2
 * decimals. Returns 0 for a non-positive / non-finite base. Pass the live
 * `tiers` on the server; omit for the default.
 */
export function internalTransferFee(amount: number, tiers?: FeeTier[]): number {
  return calculateTieredFee(amount, tiers).totalFee
}

/**
 * Largest amount a sender can transfer so that `amount + internalTransferFee(amount)`
 * still fits within `available` — i.e. the "Max" the client can send while
 * leaving enough to cover the on-top tiered fee. Because the fee is added on
 * top and each marginal bracket rate is < 1, `total(A) = A + fee(A)` is strictly
 * increasing, so we binary-search then floor to 2 decimals and step down until
 * the rounded amount + its fee is guaranteed ≤ available (never leaves the
 * sender short). Returns 0 for a non-positive / non-finite balance.
 */
export function maxSendableAfterTransferFee(available: number, tiers?: FeeTier[]): number {
  if (!Number.isFinite(available) || available <= 0) return 0
  let lo = 0
  let hi = available
  for (let i = 0; i < 60; i++) {
    const mid = (lo + hi) / 2
    if (mid + internalTransferFee(mid, tiers) <= available) lo = mid
    else hi = mid
  }
  let amt = Math.floor(lo * 100) / 100
  while (amt > 0 && amt + internalTransferFee(amt, tiers) > available + 1e-9) {
    amt = Math.round((amt - 0.01) * 100) / 100
  }
  return amt < 0 ? 0 : amt
}
