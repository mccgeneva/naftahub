"use server"

import { cookies } from "next/headers"
import { pool, isDatabaseConfigured } from "@/lib/db"
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

// --- Table bootstrap --------------------------------------------------------

let ensured = false

const DB_NOT_CONFIGURED_MSG =
  "The database is not connected yet. Add the Neon connection string (DATABASE_URL) in Project Settings → Environment Variables, then try again."

/**
 * Lazily create the ledger_entries table on first use. Mirrors the pattern used
 * by gateway/reconciliation/admin-users so the table exists before any read or
 * write — otherwise queries throw and reads silently return empty, which makes
 * edit/reverse report "entry does not exist".
 */
async function ensureTable(): Promise<void> {
  if (ensured) return
  await pool.query(
    `CREATE TABLE IF NOT EXISTS ledger_entries (
       user_id      text        NOT NULL,
       entry_id     text        NOT NULL,
       direction    text        NOT NULL,
       amount       numeric     NOT NULL DEFAULT 0,
       currency     text        NOT NULL DEFAULT 'USD',
       status       text        NOT NULL DEFAULT 'completed',
       entry_date   timestamptz NOT NULL DEFAULT now(),
       counterparty text,
       account      text,
       bank         text,
       reference    text,
       comment      text,
       category     text,
       PRIMARY KEY (user_id, entry_id)
     )`,
  )
  ensured = true
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
  await ensureTable()
  const { rows } = await pool.query(
    `SELECT * FROM ledger_entries WHERE user_id = $1 ORDER BY entry_date DESC`,
    [userId],
  )
  return rows.map(rowToEntry)
}

async function upsertEntry(userId: string, entry: LedgerEntry): Promise<void> {
  await ensureTable()
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
    await ensureTable()
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

  if (!isDatabaseConfigured) {
    return { ok: false, error: DB_NOT_CONFIGURED_MSG }
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
    await ensureTable()
    await pool.query(`DELETE FROM ledger_entries WHERE user_id = $1 AND entry_id = $2`, [userId, entryId])
    return { ok: true, entries: await readLedger(userId) }
  } catch (err) {
    console.log("[v0] removeLedgerEntryForUserAdmin failed:", (err as Error).message)
    return { ok: false, error: "The entry could not be removed. Please try again." }
  }
}

/**
 * Admin: edit an existing ledger entry in place (amount, status, dates,
 * counterparty, etc.). Reuses the upsert so any subset of fields can be
 * corrected — e.g. releasing a hold by switching status to "completed".
 */
export async function updateLedgerEntryForUserAdmin(
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

  if (!isDatabaseConfigured) {
    return { ok: false, error: DB_NOT_CONFIGURED_MSG }
  }

  try {
    await upsertEntry(userId, { ...entry, amount })
    const target = getUserById(userId)
    await logActivity({
      action: `Administrator edited ledger entry ${entry.id} for ${target.fullName}`,
      category: "Administration",
      user: `${admin.fullName} (${admin.company})`,
      details: {
        referenceId: entry.id,
        targetAccount: `${target.fullName} — ${target.email}`,
        direction: entry.direction,
        amount: `${entry.currency} ${amount.toLocaleString("en-US")}`,
        status: entry.status,
        counterparty: entry.counterparty || "(none)",
      },
    })
    return { ok: true, entries: await readLedger(userId) }
  } catch (err) {
    console.log("[v0] updateLedgerEntryForUserAdmin failed:", (err as Error).message)
    return { ok: false, error: "The entry could not be updated. Please try again." }
  }
}

/**
 * Admin: reverse an existing ledger entry by posting a mirror entry in the
 * opposite direction. The original is preserved for the audit trail; the
 * reversal nets the balance back to where it was.
 */
export async function reverseLedgerEntryForUserAdmin(
  passcode: string,
  userId: string,
  entryId: string,
): Promise<AdminLedgerResult> {
  let admin: UserProfile
  try {
    admin = await requireAdmin(passcode)
  } catch (err) {
    return { ok: false, error: (err as Error).message }
  }

  try {
    const ledger = await readLedger(userId)
    const original = ledger.find((e) => e.id === entryId)
    if (!original) return { ok: false, error: "Original entry not found." }

    const reversal: LedgerEntry = {
      ...original,
      id: `REV-${original.id}`,
      direction: original.direction === "credit" ? "debit" : "credit",
      status: "completed",
      date: new Date().toISOString(),
      reference: `Reversal of ${original.id}`,
      comment: `Reversal of transaction ${original.id}${original.comment ? ` — ${original.comment}` : ""}`,
      category: "Reversal",
    }
    await upsertEntry(userId, reversal)

    const target = getUserById(userId)
    await logActivity({
      action: `Administrator reversed ledger entry ${original.id} for ${target.fullName}`,
      category: "Administration",
      user: `${admin.fullName} (${admin.company})`,
      details: {
        referenceId: reversal.id,
        targetAccount: `${target.fullName} — ${target.email}`,
        reversedEntry: original.id,
        direction: reversal.direction,
        amount: `${original.currency} ${Number(original.amount).toLocaleString("en-US")}`,
      },
    })
    return { ok: true, entries: await readLedger(userId) }
  } catch (err) {
    console.log("[v0] reverseLedgerEntryForUserAdmin failed:", (err as Error).message)
    return { ok: false, error: "The entry could not be reversed. Please try again." }
  }
}
