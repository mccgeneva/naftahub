import { scopedKey } from "@/lib/user-scope"

// Central list of the base localStorage keys that make up an account's data:
// balances / transactions (ledger), payment requests, Yield/PPP requests, bank
// instruments, beneficiaries, and the trading-desk requests. Each real key is
// namespaced per user (see lib/user-scope), so resetting clears only the
// signed-in user's data and leaves every other user untouched.
export const ACCOUNT_DATA_KEYS = [
  "mcc.ledger.v1",
  "mcc.payment-requests.v1",
  "mcc.ppp-requests.v1",
  "mcc.project-funding-requests.v1",
  "mcc.fiduciary-requests.v1",
  "mcc.instruments.v1",
  "mcc.beneficiaries.v1",
  "mcc.dof-requests.v1",
  "mcc.dtc-requests.v1",
  "mcc.commodity-deals.v1",
  "mcc.leverage-requests.v1",
] as const

/**
 * Wipe every piece of stored account data for the CURRENT user only. After
 * calling this the caller should reload the page so all in-memory stores
 * re-hydrate from their (now empty) defaults — zero balances, no transactions,
 * no beneficiaries, no requests. Other users' data is never touched.
 */
export function resetAccountData() {
  if (typeof window === "undefined") return
  for (const base of ACCOUNT_DATA_KEYS) {
    try {
      // Remove the per-user namespaced key. Also remove the un-namespaced base
      // key to clean up any legacy single-user data from before multi-user.
      window.localStorage.removeItem(scopedKey(base))
      window.localStorage.removeItem(base)
    } catch {
      // ignore availability errors
    }
  }
}
