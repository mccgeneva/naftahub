"use server"

import { ADMIN_PASSCODE } from "@/lib/admin-config"
import { query } from "@/lib/db"
import { getDynamicUserById } from "@/lib/admin-users-db"

/**
 * Every server-side table that holds per-account data, all keyed by `user_id`.
 * Wiping these rows for a single account restores it to a brand-new state on the
 * SERVER — the authoritative source the in-memory stores hydrate from.
 * (Clearing localStorage alone is not enough: balances, transactions, requests,
 * beneficiaries, etc. live in Neon and would otherwise reappear after login.)
 */
const PER_USER_TABLES = [
  "ledger_entries", // balances + transaction history
  "approval_requests", // payments / commodity / leverage / Yield-PPP / DOF / DTC requests
  "client_beneficiaries", // beneficiaries
  "client_skr_records", // SKR records
  "client_skr_requests", // SKR requests
  "certificate_requests", // bank instruments / certificate requests
  "swift_routing_requests", // SWIFT routing queue items
  "user_notifications", // notification feed
] as const

export type ResetAccountResult =
  | { ok: true; cleared: number; targetName: string; targetEmail: string }
  | { ok: false; error: string }

/**
 * Administrator Danger-Zone reset of ONE specific account's server-side data.
 *
 * Isolation guarantee: the wipe is scoped STRICTLY to the selected account's own
 * `user_id`. It deliberately does NOT expand to a shared-data owner (a
 * sub-account's Master), because deleting the Master's rows would also wipe the
 * balance/history shared with the Master and its other sub-accounts. Restricting
 * the DELETE to the chosen id guarantees no other user's data is ever affected.
 */
export async function resetServerAccountDataForUser(
  passcode: string,
  targetUserId: string,
): Promise<ResetAccountResult> {
  if (String(passcode) !== ADMIN_PASSCODE) {
    return { ok: false, error: "Administrator authorization failed." }
  }

  const id = targetUserId?.trim()
  if (!id) return { ok: false, error: "Select an account to reset first." }

  // Confirm the account exists so a typo / stale id can never silently no-op,
  // and so we can echo back exactly which account was reset.
  const target = await getDynamicUserById(id)
  if (!target) {
    return { ok: false, error: "The selected account could not be found." }
  }

  let cleared = 0
  for (const table of PER_USER_TABLES) {
    try {
      // Strictly this account's own rows — never ANY()/owner expansion.
      const res = await query(`DELETE FROM ${table} WHERE user_id = $1`, [id])
      cleared += res.rowCount ?? 0
    } catch (err) {
      // A missing table (never bootstrapped yet) is not an error for a reset —
      // there is simply nothing to clear. Log and continue with the rest.
      console.log(`[v0] reset: skipped ${table}:`, (err as Error).message)
    }
  }

  return {
    ok: true,
    cleared,
    targetName: target.profile.fullName || target.profile.company || target.email,
    targetEmail: target.email,
  }
}
