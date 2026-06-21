"use server"

import { ADMIN_PASSCODE } from "@/lib/admin-config"
import { query } from "@/lib/db"
import { resolveCurrentSession, resolveDataOwnerIdFor } from "@/lib/session-user"

/**
 * Every server-side table that holds per-account data, all keyed by `user_id`.
 * Wiping these rows for the signed-in account restores it to a brand-new state
 * on the SERVER — the authoritative source the in-memory stores hydrate from.
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

export type ResetAccountResult = { ok: true; cleared: number } | { ok: false; error: string }

/**
 * Administrator Danger-Zone reset of the CURRENTLY signed-in account's
 * server-side data. Deletes every per-user row across the account-data tables
 * for both the account's own id AND its shared-data owner id (a sub-account's
 * balance lives under its Master), so the balance truly drops to zero and does
 * not re-hydrate after the page reload. Other accounts are never touched.
 */
export async function resetMyServerAccountData(passcode: string): Promise<ResetAccountResult> {
  if (String(passcode) !== ADMIN_PASSCODE) {
    return { ok: false, error: "Administrator authorization failed." }
  }

  const session = await resolveCurrentSession()
  if (!session) return { ok: false, error: "Your session has expired. Please sign in again." }

  // Scope the wipe to this account's own id and the id whose shared financial
  // data it operates on (Master, for a sub-account). De-duplicated.
  const ownerId = await resolveDataOwnerIdFor(session.id)
  const ids = Array.from(new Set([session.id, ownerId].filter(Boolean)))
  if (ids.length === 0) return { ok: false, error: "Could not resolve the account to reset." }

  let cleared = 0
  for (const table of PER_USER_TABLES) {
    try {
      const res = await query(`DELETE FROM ${table} WHERE user_id = ANY($1::text[])`, [ids])
      cleared += res.rowCount ?? 0
    } catch (err) {
      // A missing table (never bootstrapped yet) is not an error for a reset —
      // there is simply nothing to clear. Log and continue with the rest.
      console.log(`[v0] reset: skipped ${table}:`, (err as Error).message)
    }
  }

  return { ok: true, cleared }
}
