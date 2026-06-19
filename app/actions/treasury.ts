"use server"

import { query } from "@/lib/db"
import { ADMIN_PASSCODE } from "@/lib/admin-config"
import { type UserProfile } from "@/lib/users"
import { resolveAccountProfileById, resolveCurrentSession } from "@/lib/session-user"
import { logActivity } from "@/app/actions/log-activity"
import type {
  TreasuryAccount,
  TreasuryProfileKey,
  TreasuryStatus,
  TreasuryTransaction,
  TreasuryTxnType,
} from "@/lib/treasury-store"

// Annual debit cycle fee rate (kept in sync with lib/treasury-store.ts).
const DEBIT_CYCLE_FEE_RATE = 0.018

// Maximum leverage approved on a security deposit (1:10). Kept in sync with
// MAX_LEVERAGE_RATIO in lib/treasury-store.ts.
const MAX_LEVERAGE_RATIO = 10

// --- Session / admin helpers ------------------------------------------------

async function getSessionUser(): Promise<UserProfile | undefined> {
  const session = await resolveCurrentSession()
  return session?.profile
}

// An admin action requires (a) a valid session and (b) the administrator
// passcode, verified here on the server rather than trusting the client gate.
async function requireAdmin(passcode: string): Promise<UserProfile> {
  const user = await getSessionUser()
  if (!user) throw new Error("Your session has expired. Please sign in again.")
  if (String(passcode) !== ADMIN_PASSCODE) throw new Error("Administrator authorization failed.")
  return user
}

// --- Default + row mapping --------------------------------------------------

function emptyAccount(): TreasuryAccount {
  return {
    profile: "pro",
    currency: "EUR",
    requiredDeposit: 0,
    customerContribution: 0,
    leverageEnabled: false,
    leverageRatio: 1,
    financedAmount: 0,
    transactionExposure: 0,
    feeRate: DEBIT_CYCLE_FEE_RATE,
    status: "none",
    transactions: [],
  }
}

function rowToAccount(row: Record<string, unknown>): TreasuryAccount {
  const txns = Array.isArray(row.transactions) ? (row.transactions as TreasuryTransaction[]) : []
  return {
    profile: (row.profile as TreasuryProfileKey) ?? "pro",
    currency: (row.currency as string) ?? "EUR",
    requiredDeposit: Number(row.required_deposit) || 0,
    customerContribution: Number(row.customer_contribution) || 0,
    leverageEnabled: Boolean(row.leverage_enabled),
    leverageRatio: Number(row.leverage_ratio) || 1,
    financedAmount: Number(row.financed_amount) || 0,
    transactionExposure: Number(row.transaction_exposure) || 0,
    feeRate: Number(row.fee_rate) || DEBIT_CYCLE_FEE_RATE,
    status: (row.status as TreasuryStatus) ?? "pending",
    establishedAt: row.established_at ? new Date(row.established_at as string).toISOString() : undefined,
    securedAt: row.secured_at ? new Date(row.secured_at as string).toISOString() : undefined,
    updatedAt: row.updated_at ? new Date(row.updated_at as string).toISOString() : undefined,
    note: (row.note as string) ?? undefined,
    transactions: txns,
  }
}

async function readAccount(userId: string): Promise<TreasuryAccount> {
  const { rows } = await query(`SELECT * FROM treasury_accounts WHERE user_id = $1`, [userId])
  if (rows.length === 0) return emptyAccount()
  return rowToAccount(rows[0])
}

// --- Customer-facing read (own record only) ---------------------------------

/** Return the signed-in user's treasury record, scoped to their session. */
export async function getMyTreasury(): Promise<TreasuryAccount> {
  const user = await getSessionUser()
  if (!user) return emptyAccount()
  try {
    return await readAccount(user.id)
  } catch (err) {
    console.log("[v0] getMyTreasury query failed:", (err as Error).message)
    return emptyAccount()
  }
}

// --- Admin reads/writes (any client) ----------------------------------------

export type AdminTreasuryResult =
  | { ok: true; account: TreasuryAccount }
  | { ok: false; error: string }

/** Admin: read any client's treasury record. */
export async function getTreasuryForUserAdmin(
  passcode: string,
  userId: string,
): Promise<AdminTreasuryResult> {
  try {
    await requireAdmin(passcode)
    return { ok: true, account: await readAccount(userId) }
  } catch (err) {
    return { ok: false, error: (err as Error).message }
  }
}

/**
 * Admin: create or update a client's treasury record. The leverage math
 * (financed amount, applied ratio) is computed authoritatively on the server.
 */
export async function saveTreasuryRecordAdmin(
  passcode: string,
  userId: string,
  fields: {
    profile: TreasuryProfileKey
    requiredDeposit: number
    customerContribution: number
    leverageEnabled: boolean
    transactionExposure: number
    status: TreasuryStatus
    note?: string
  },
): Promise<AdminTreasuryResult> {
  let admin: UserProfile
  try {
    admin = await requireAdmin(passcode)
  } catch (err) {
    return { ok: false, error: (err as Error).message }
  }

  const required = Math.max(0, Number(fields.requiredDeposit) || 0)
  if (required <= 0) return { ok: false, error: "Enter a valid required security deposit." }

  const contribution = Math.max(0, Number(fields.customerContribution) || 0)
  const leverageEnabled = Boolean(fields.leverageEnabled)

  const exposure = leverageEnabled ? Math.max(0, Number(fields.transactionExposure) || 0) : 0

  // The approved facility is capped at 1:10, which means it can finance at most
  // (10 − 1)× the client's own contribution. We finance the gap to the required
  // deposit, but never more than that cap allows — so reducing or removing the
  // contribution correctly leaves the deposit uncovered (a shortfall) instead of
  // being silently topped up to "fully secured".
  const maxFinanceable = leverageEnabled ? contribution * (MAX_LEVERAGE_RATIO - 1) : 0
  const financed = leverageEnabled ? Math.min(Math.max(0, required - contribution), maxFinanceable) : 0
  const secured = contribution + financed
  const ratio = leverageEnabled && contribution > 0 ? Math.round((required / contribution) * 100) / 100 : 1

  // Derive the stored status from the real coverage so it can never be saved as
  // "secured" while the deposit is actually uncovered. "closed" stays explicit.
  let status: TreasuryStatus
  if (fields.status === "closed") status = "closed"
  else if (required > 0 && secured >= required) status = "secured"
  else if (secured > 0) status = "shortfall"
  else status = "pending"

  const note = fields.note?.toString().trim() || null
  const now = new Date().toISOString()

  const target = await resolveAccountProfileById(userId)

  try {
    const prev = await readAccount(userId)
    const establishedAt = prev.establishedAt ?? now
    // Stamp securedAt the first time the deposit becomes secured (fee accrual start).
    const securedAt = status === "secured" ? prev.securedAt ?? now : prev.securedAt ?? null

    const { rows } = await query(
      `INSERT INTO treasury_accounts
         (user_id, profile, currency, required_deposit, customer_contribution,
          leverage_enabled, leverage_ratio, financed_amount, transaction_exposure,
          fee_rate, status, established_at, secured_at, updated_at, note)
       VALUES ($1,$2,'EUR',$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
       ON CONFLICT (user_id) DO UPDATE SET
         profile = EXCLUDED.profile,
         required_deposit = EXCLUDED.required_deposit,
         customer_contribution = EXCLUDED.customer_contribution,
         leverage_enabled = EXCLUDED.leverage_enabled,
         leverage_ratio = EXCLUDED.leverage_ratio,
         financed_amount = EXCLUDED.financed_amount,
         transaction_exposure = EXCLUDED.transaction_exposure,
         fee_rate = EXCLUDED.fee_rate,
         status = EXCLUDED.status,
         established_at = EXCLUDED.established_at,
         secured_at = EXCLUDED.secured_at,
         updated_at = EXCLUDED.updated_at,
         note = EXCLUDED.note
       RETURNING *`,
      [
        userId,
        fields.profile,
        required,
        contribution,
        leverageEnabled,
        ratio,
        financed,
        exposure,
        DEBIT_CYCLE_FEE_RATE,
        status,
        establishedAt,
        securedAt,
        now,
        note,
      ],
    )

    await logActivity({
      action: `Administrator updated the treasury record for ${target.fullName}`,
      category: "Administration",
      user: `${admin.fullName} (${admin.company})`,
      details: {
        targetAccount: `${target.fullName} — ${target.email}`,
        requiredDeposit: `EUR ${required.toLocaleString("en-US")}`,
        customerContribution: `EUR ${contribution.toLocaleString("en-US")}`,
        leverage: leverageEnabled ? `1:${Math.round(ratio)} — EUR ${financed.toLocaleString("en-US")} financed by MCC HOLDING SA` : "None",
        status,
      },
    })

    return { ok: true, account: rowToAccount(rows[0]) }
  } catch (err) {
    console.log("[v0] saveTreasuryRecordAdmin failed:", (err as Error).message)
    return { ok: false, error: "The treasury record could not be saved. Please try again." }
  }
}

function genTreasuryId(prefix = "TRY"): string {
  const n = Math.floor(1_000_000 + Math.random() * 9_000_000)
  return `${prefix}${n}`
}

/** Admin: post a treasury transaction to a client's record. */
export async function postTreasuryTxnAdmin(
  passcode: string,
  userId: string,
  input: { type: TreasuryTxnType; label: string; amount: number; note?: string },
): Promise<AdminTreasuryResult> {
  let admin: UserProfile
  try {
    admin = await requireAdmin(passcode)
  } catch (err) {
    return { ok: false, error: (err as Error).message }
  }

  const amount = Number(input.amount)
  if (!Number.isFinite(amount) || amount <= 0) {
    return { ok: false, error: "Enter a valid transaction amount." }
  }

  try {
    const prev = await readAccount(userId)
    if (prev.status === "none") {
      return { ok: false, error: "Establish the treasury record first (save the record above)." }
    }
    const txn: TreasuryTransaction = {
      id: genTreasuryId(),
      date: new Date().toISOString(),
      type: input.type,
      label: input.label.trim() || input.type,
      amount,
      currency: "EUR",
      note: input.note?.toString().trim() || undefined,
    }
    const transactions = [txn, ...prev.transactions]
    const { rows } = await query(
      `UPDATE treasury_accounts
          SET transactions = $2::jsonb, updated_at = $3
        WHERE user_id = $1
        RETURNING *`,
      [userId, JSON.stringify(transactions), txn.date],
    )

    const target = await resolveAccountProfileById(userId)
    await logActivity({
      action: `Administrator posted a treasury ${input.type} of EUR ${amount.toLocaleString("en-US")} for ${target.fullName}`,
      category: "Administration",
      user: `${admin.fullName} (${admin.company})`,
      details: {
        referenceId: txn.id,
        targetAccount: `${target.fullName} — ${target.email}`,
        type: txn.label,
        amount: `EUR ${amount.toLocaleString("en-US")}`,
        note: txn.note ?? "(none)",
      },
    })

    return { ok: true, account: rowToAccount(rows[0]) }
  } catch (err) {
    console.log("[v0] postTreasuryTxnAdmin failed:", (err as Error).message)
    return { ok: false, error: "The transaction could not be posted. Please try again." }
  }
}

/** Admin: delete a treasury transaction from a client's record. */
export async function deleteTreasuryTxnAdmin(
  passcode: string,
  userId: string,
  txnId: string,
): Promise<AdminTreasuryResult> {
  try {
    await requireAdmin(passcode)
  } catch (err) {
    return { ok: false, error: (err as Error).message }
  }

  try {
    const prev = await readAccount(userId)
    const transactions = prev.transactions.filter((t) => t.id !== txnId)
    const { rows } = await query(
      `UPDATE treasury_accounts
          SET transactions = $2::jsonb, updated_at = $3
        WHERE user_id = $1
        RETURNING *`,
      [userId, JSON.stringify(transactions), new Date().toISOString()],
    )
    if (rows.length === 0) return { ok: false, error: "No treasury record found for this client." }
    return { ok: true, account: rowToAccount(rows[0]) }
  } catch (err) {
    console.log("[v0] deleteTreasuryTxnAdmin failed:", (err as Error).message)
    return { ok: false, error: "The transaction could not be removed. Please try again." }
  }
}
