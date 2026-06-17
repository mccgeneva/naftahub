"use server"

import { cookies } from "next/headers"
import { pool } from "@/lib/db"
import { SESSION_COOKIE } from "@/lib/auth"
import { ADMIN_PASSCODE } from "@/lib/admin-config"
import { getUserBySessionToken, getUserById, type UserProfile } from "@/lib/users"
import { logActivity } from "@/app/actions/log-activity"
import type { LedgerEntry } from "@/lib/ledger-store"

// --- Session / admin helpers ------------------------------------------------

async function getSessionUser(): Promise<UserProfile | undefined> {
  const cookieStore = await cookies()
  const token = cookieStore.get(SESSION_COOKIE)?.value
  return getUserBySessionToken(token)
}

async function requireAdmin(passcode: string): Promise<UserProfile> {
  const user = await getSessionUser()
  if (!user) throw new Error("Your session has expired. Please sign in again.")
  if (String(passcode) !== ADMIN_PASSCODE) throw new Error("Administrator authorization failed.")
  return user
}

// --- Row mapping ------------------------------------------------------------

function rowToEntry(row: Record<string, unknown>): LedgerEntry {
  return {
    id: row.entry_id as string,
    direction: (row.direction as LedgerEntry["direction"]) ?? "credit",
    amount: Number(row.amount) || 0,
    currency: (row.currency as string) ?? "USD",
    status: (row.status as LedgerEntry["status"]) ?? "completed",
    date: row.entry_date ? new Date(row.entry_date as string).toISOString() : new Date().toISOString(),
    counterparty: (row.counterparty as string) ?? "",
    account: (row.account as string) ?? undefined,
    bank: (row.bank as string) ?? undefined,
    reference: (row.reference as string) ?? undefined,
    comment: (row.comment as string) ?? undefined,
    category: (row.category as string) ?? undefined,
  }
}

async function readLedger(userId: string): Promise<LedgerEntry[]> {
  const { rows } = await pool.query(
    `SELECT * FROM ledger_entries WHERE user_id = $1 ORDER BY entry_date DESC`,
    [userId],
  )
  return rows.map(rowToEntry)
}

async function upsertEntry(userId: string, entry: LedgerEntry): Promise<void> {
  await pool.query(
    `INSERT INTO ledger_entries
       (user_id, entry_id, direction, amount, currency, status, entry_date,
        counterparty, account, bank, reference, comment, category)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
     ON CONFLICT (user_id, entry_id) DO UPDATE SET
       direction = EXCLUDED.direction,
       amount = EXCLUDED.amount,
       currency = EXCLUDED.currency,
       status = EXCLUDED.status,
       entry_date = EXCLUDED.entry_date,
       counterparty = EXCLUDED.counterparty,
       account = EXCLUDED.account,
       bank = EXCLUDED.bank,
       reference = EXCLUDED.reference,
       comment = EXCLUDED.comment,
       category = EXCLUDED.category`,
    [
      userId,
      entry.id,
      entry.direction,
      entry.amount,
      entry.currency,
      entry.status,
      entry.date,
      entry.counterparty ?? "",
      entry.account ?? null,
      entry.bank ?? null,
      entry.reference ?? null,
      entry.comment ?? null,
      entry.category ?? null,
    ],
  )
}

// --- Customer-facing (own ledger only) --------------------------------------

/** Return the signed-in user's ledger entries, scoped to their session. */
export async function getMyLedger(): Promise<LedgerEntry[]> {
  const user = await getSessionUser()
  if (!user) return []
  try {
    return await readLedger(user.id)
  } catch (err) {
    console.log("[v0] getMyLedger query failed:", (err as Error).message)
    return []
  }
}

/** Persist (insert or update) a single ledger entry for the signed-in user. */
export async function persistMyLedgerEntry(entry: LedgerEntry): Promise<{ ok: boolean }> {
  const user = await getSessionUser()
  if (!user) return { ok: false }
  try {
    await upsertEntry(user.id, entry)
    return { ok: true }
  } catch (err) {
    console.log("[v0] persistMyLedgerEntry failed:", (err as Error).message)
    return { ok: false }
  }
}

/** Remove a single ledger entry for the signed-in user. */
export async function removeMyLedgerEntry(entryId: string): Promise<{ ok: boolean }> {
  const user = await getSessionUser()
  if (!user) return { ok: false }
  try {
    await pool.query(`DELETE FROM ledger_entries WHERE user_id = $1 AND entry_id = $2`, [user.id, entryId])
    return { ok: true }
  } catch (err) {
    console.log("[v0] removeMyLedgerEntry failed:", (err as Error).message)
    return { ok: false }
  }
}

// --- Admin cross-user (passcode verified server-side) -----------------------

export type AdminLedgerResult =
  | { ok: true; entries: LedgerEntry[] }
  | { ok: false; error: string }

/** Admin: read any client's ledger. */
export async function getLedgerForUserAdmin(passcode: string, userId: string): Promise<AdminLedgerResult> {
  try {
    await requireAdmin(passcode)
    return { ok: true, entries: await readLedger(userId) }
  } catch (err) {
    return { ok: false, error: (err as Error).message }
  }
}

/** Admin: credit or debit a client's ledger with a single entry. */
export async function addLedgerEntryForUserAdmin(
  passcode: string,
  userId: string,
  entry: LedgerEntry,
): Promise<AdminLedgerResult> {
  let admin: UserProfile
  try {
    admin = await requireAdmin(passcode)
  } catch (err) {
    return { ok: false, error: (err as Error).message }
  }

  const amount = Number(entry.amount)
  if (!Number.isFinite(amount) || amount <= 0) {
    return { ok: false, error: "Enter a valid amount." }
  }

  try {
    await upsertEntry(userId, { ...entry, amount })
    const target = getUserById(userId)
    await logActivity({
      action: `Administrator posted a ${entry.direction} of ${entry.currency} ${amount.toLocaleString("en-US")} to ${target.fullName}`,
      category: "Administration",
      user: `${admin.fullName} (${admin.company})`,
      details: {
        referenceId: entry.id,
        targetAccount: `${target.fullName} — ${target.email}`,
        direction: entry.direction,
        amount: `${entry.currency} ${amount.toLocaleString("en-US")}`,
        counterparty: entry.counterparty || "(none)",
        comment: entry.comment ?? "(none)",
      },
    })
    return { ok: true, entries: await readLedger(userId) }
  } catch (err) {
    console.log("[v0] addLedgerEntryForUserAdmin failed:", (err as Error).message)
    return { ok: false, error: "The entry could not be posted. Please try again." }
  }
}

/** Admin: remove a single ledger entry from a client's ledger. */
export async function removeLedgerEntryForUserAdmin(
  passcode: string,
  userId: string,
  entryId: string,
): Promise<AdminLedgerResult> {
  try {
    await requireAdmin(passcode)
  } catch (err) {
    return { ok: false, error: (err as Error).message }
  }
  try {
    await pool.query(`DELETE FROM ledger_entries WHERE user_id = $1 AND entry_id = $2`, [userId, entryId])
    return { ok: true, entries: await readLedger(userId) }
  } catch (err) {
    console.log("[v0] removeLedgerEntryForUserAdmin failed:", (err as Error).message)
    return { ok: false, error: "The entry could not be removed. Please try again." }
  }
}
