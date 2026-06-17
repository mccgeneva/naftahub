"use server"

import { cookies } from "next/headers"
import { pool } from "@/lib/db"
import { SESSION_COOKIE } from "@/lib/auth"
import { ADMIN_PASSCODE } from "@/lib/admin-config"
import { getUserBySessionToken, getUserById, type UserProfile } from "@/lib/users"
import { logActivity } from "@/app/actions/log-activity"
import type { GatewayAccount, FundingEvent } from "@/lib/gateway-store"
import type { LedgerEntry } from "@/lib/ledger-store"
import {
  matchPayment,
  type IncomingPayment,
  type MatchResult,
  type ReconciliationCandidate,
  type ReconciliationStatus,
} from "@/lib/reconciliation"

// ---------------------------------------------------------------------------
// Auth helpers (mirror app/actions/gateway.ts)
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Persistence
// ---------------------------------------------------------------------------

/** A reconciliation record as stored / returned to the admin UI. */
export interface ReconciliationRecord {
  id: string
  payment: IncomingPayment
  status: ReconciliationStatus
  /** Candidate accounts from the last match run (best first). */
  candidates: ReconciliationCandidate[]
  summary: string
  /** Set once funds are credited (auto or via manual resolve). */
  matchedUserId?: string
  matchedRequestId?: string
  matchedAccountHolder?: string
  ledgerEntryId?: string
  createdAt: string
  updatedAt: string
  /** Admin note captured on manual resolve / ignore. */
  resolutionNote?: string
}

let ensured = false
async function ensureTable(): Promise<void> {
  if (ensured) return
  await pool.query(
    `CREATE TABLE IF NOT EXISTS reconciliation_payments (
       id          text        PRIMARY KEY,
       status      text        NOT NULL,
       created_at  timestamptz NOT NULL DEFAULT now(),
       updated_at  timestamptz NOT NULL DEFAULT now(),
       payload     jsonb       NOT NULL
     )`,
  )
  ensured = true
}

function rowToRecord(row: Record<string, unknown>): ReconciliationRecord {
  const payload = (row.payload as ReconciliationRecord) ?? ({} as ReconciliationRecord)
  return {
    ...payload,
    id: row.id as string,
    status: (row.status as ReconciliationStatus) ?? payload.status,
  }
}

async function writeRecord(record: ReconciliationRecord): Promise<void> {
  await ensureTable()
  await pool.query(
    `INSERT INTO reconciliation_payments (id, status, created_at, updated_at, payload)
     VALUES ($1,$2,$3,now(),$4::jsonb)
     ON CONFLICT (id) DO UPDATE SET
       status = EXCLUDED.status,
       updated_at = now(),
       payload = EXCLUDED.payload`,
    [record.id, record.status, record.createdAt, JSON.stringify(record)],
  )
}

async function readRecord(id: string): Promise<ReconciliationRecord | undefined> {
  await ensureTable()
  const { rows } = await pool.query(`SELECT * FROM reconciliation_payments WHERE id = $1`, [id])
  return rows[0] ? rowToRecord(rows[0]) : undefined
}

async function readAllRecords(): Promise<ReconciliationRecord[]> {
  await ensureTable()
  const { rows } = await pool.query(
    `SELECT * FROM reconciliation_payments ORDER BY created_at DESC`,
  )
  return rows.map(rowToRecord)
}

// Read every user's active gateway accounts (the match targets).
async function readActiveAccounts(): Promise<GatewayAccount[]> {
  // gateway_accounts is created lazily by app/actions/gateway.ts; guard in case
  // reconciliation runs before any account has ever been written.
  await pool.query(
    `CREATE TABLE IF NOT EXISTS gateway_accounts (
       user_id text NOT NULL, request_id text NOT NULL, status text NOT NULL,
       submitted_at timestamptz, decided_at timestamptz,
       updated_at timestamptz NOT NULL DEFAULT now(), payload jsonb NOT NULL,
       PRIMARY KEY (user_id, request_id))`,
  )
  const { rows } = await pool.query(`SELECT payload, request_id, status FROM gateway_accounts WHERE status = 'active'`)
  return rows.map((row: Record<string, unknown>) => {
    const payload = (row.payload as GatewayAccount) ?? ({} as GatewayAccount)
    return { ...payload, id: row.request_id as string, status: "active" as const }
  })
}

// ---------------------------------------------------------------------------
// Credit primitive — credit a client's Master Account and stamp the gateway
// account with a reconciled funding event. Mirrors recordGatewayFundingAdmin
// but is callable internally with an already-resolved account.
// ---------------------------------------------------------------------------

async function creditMatchedAccount(
  account: GatewayAccount,
  payment: IncomingPayment,
): Promise<string> {
  const receiptRef = `RC-CR-${Date.now().toString().slice(-8)}`
  const reference = payment.reference?.trim() || account.coordinates?.reference || account.id
  const bankName = account.coordinates?.partnerBankName

  const entry: LedgerEntry = {
    id: receiptRef,
    direction: "credit",
    amount: payment.amount,
    currency: account.currency,
    status: "completed",
    date: new Date().toISOString(),
    counterparty: payment.payer.trim(),
    bank: bankName,
    reference: account.id,
    category: "Reconciled Collection",
    comment: `Inbound payment from ${payment.payer.trim()} (reference ${reference}${payment.senderBic ? `, sender BIC ${payment.senderBic}` : ""}) auto-reconciled to the Master Account via gateway account ${account.id}.`,
  }

  await pool.query(
    `INSERT INTO ledger_entries
       (user_id, entry_id, direction, amount, currency, status, entry_date,
        counterparty, account, bank, reference, comment, category)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
     ON CONFLICT (user_id, entry_id) DO UPDATE SET
       direction = EXCLUDED.direction, amount = EXCLUDED.amount, currency = EXCLUDED.currency,
       status = EXCLUDED.status, entry_date = EXCLUDED.entry_date, counterparty = EXCLUDED.counterparty,
       account = EXCLUDED.account, bank = EXCLUDED.bank, reference = EXCLUDED.reference,
       comment = EXCLUDED.comment, category = EXCLUDED.category`,
    [
      account.userId,
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

  // Stamp a reconciled funding event onto the gateway account.
  const now = new Date().toISOString()
  const event: FundingEvent = {
    id: `FND-${Math.random().toString(36).slice(2, 8).toUpperCase()}`,
    amount: payment.amount,
    currency: account.currency,
    reference,
    payer: payment.payer.trim(),
    recordedAt: now,
    reconciled: true,
    reconciledAt: now,
    ledgerEntryId: receiptRef,
  }
  const updated: GatewayAccount = { ...account, funding: [event, ...(account.funding ?? [])] }
  await pool.query(
    `UPDATE gateway_accounts SET payload = $3::jsonb, updated_at = now()
     WHERE user_id = $1 AND request_id = $2`,
    [account.userId, account.id, JSON.stringify(updated)],
  )

  return receiptRef
}

function genId() {
  return `RCN-${Date.now().toString(36).toUpperCase()}${Math.random().toString(36).slice(2, 5).toUpperCase()}`
}

export type ReconciliationResult =
  | { ok: true; records: ReconciliationRecord[]; lastId?: string }
  | { ok: false; error: string }

// ---------------------------------------------------------------------------
// Public admin actions
// ---------------------------------------------------------------------------

/** Admin: list all reconciliation records for the history / review queue. */
export async function listReconciliationsAdmin(passcode: string): Promise<ReconciliationResult> {
  try {
    await requireAdmin(passcode)
    return { ok: true, records: await readAllRecords() }
  } catch (err) {
    return { ok: false, error: (err as Error).message }
  }
}

/**
 * Admin: submit a new incoming payment. The engine matches it against active
 * gateway accounts; a single exact reference+currency match is auto-credited,
 * everything else is parked for manual review.
 */
export async function submitIncomingPaymentAdmin(
  passcode: string,
  input: {
    amount: number
    currency: string
    payer: string
    reference: string
    senderIban?: string
    senderBic?: string
    valueDate?: string
  },
): Promise<ReconciliationResult> {
  let admin: UserProfile
  try {
    admin = await requireAdmin(passcode)
  } catch (err) {
    return { ok: false, error: (err as Error).message }
  }

  const amount = Number(input.amount)
  if (!Number.isFinite(amount) || amount <= 0) return { ok: false, error: "Enter a valid amount greater than zero." }
  if (!input.payer.trim()) return { ok: false, error: "Enter the ordering customer / payer name." }
  if (!input.reference.trim()) return { ok: false, error: "Enter the remittance reference quoted by the sender." }
  if (!input.currency.trim()) return { ok: false, error: "Select the payment currency." }

  try {
    const payment: IncomingPayment = {
      id: genId(),
      amount,
      currency: input.currency.trim().toUpperCase(),
      payer: input.payer.trim(),
      reference: input.reference.trim(),
      senderIban: input.senderIban?.trim() || undefined,
      senderBic: input.senderBic?.trim().toUpperCase() || undefined,
      valueDate: input.valueDate || new Date().toISOString(),
    }

    const accounts = await readActiveAccounts()
    const match: MatchResult = matchPayment(payment, accounts)

    const now = new Date().toISOString()
    const record: ReconciliationRecord = {
      id: payment.id,
      payment,
      status: match.classification,
      candidates: match.candidates,
      summary: match.summary,
      createdAt: now,
      updatedAt: now,
    }

    if (match.classification === "reconciled" && match.confident) {
      const account = accounts.find(
        (a) => a.userId === match.confident!.userId && a.id === match.confident!.requestId,
      )
      if (account) {
        const ledgerEntryId = await creditMatchedAccount(account, payment)
        record.matchedUserId = account.userId
        record.matchedRequestId = account.id
        record.matchedAccountHolder = account.accountHolder
        record.ledgerEntryId = ledgerEntryId

        const target = getUserById(account.userId)
        await logActivity({
          action: `Reconciliation engine auto-credited ${payment.currency} ${amount.toLocaleString("en-US")} to ${target.fullName}'s Master Account`,
          category: "Administration",
          user: `${admin.fullName} (${admin.company})`,
          details: {
            summary: `Incoming payment ${payment.id} from ${payment.payer} (reference ${payment.reference}) was matched with full confidence to gateway account ${account.id} and auto-credited to ${target.fullName}'s Master Account under ledger reference ${ledgerEntryId}.`,
            referenceId: payment.id,
            targetAccount: `${target.fullName} — ${target.email}`,
            amount: `${payment.currency} ${amount.toLocaleString("en-US")}`,
            remittanceReference: payment.reference,
            ledgerReference: ledgerEntryId,
            decision: "Auto-reconciled",
          },
        })
      } else {
        // Should not happen, but never lose a payment — park for review.
        record.status = "needs_review"
        record.summary = "Matched account could not be loaded for crediting. Parked for manual review."
      }
    } else {
      await logActivity({
        action: `Reconciliation engine flagged incoming payment ${payment.id} (${match.classification === "unmatched" ? "no match" : "needs review"})`,
        category: "Administration",
        user: `${admin.fullName} (${admin.company})`,
        details: {
          summary: `Incoming payment ${payment.id} from ${payment.payer} (reference ${payment.reference}, ${payment.currency} ${amount.toLocaleString("en-US")}) could not be auto-credited (${match.classification}). ${match.summary}`,
          referenceId: payment.id,
          amount: `${payment.currency} ${amount.toLocaleString("en-US")}`,
          remittanceReference: payment.reference,
          decision: match.classification === "unmatched" ? "Unmatched" : "Needs review",
        },
      })
    }

    await writeRecord(record)
    return { ok: true, records: await readAllRecords(), lastId: record.id }
  } catch (err) {
    console.log("[v0] submitIncomingPaymentAdmin failed:", (err as Error).message)
    return { ok: false, error: "The payment could not be processed. Please try again." }
  }
}

/** Admin: re-run matching for every record still in review / unmatched. */
export async function rerunReconciliationAdmin(passcode: string): Promise<ReconciliationResult> {
  try {
    await requireAdmin(passcode)
    const accounts = await readActiveAccounts()
    const records = await readAllRecords()
    for (const record of records) {
      if (record.status !== "needs_review" && record.status !== "unmatched") continue
      const match = matchPayment(record.payment, accounts)
      record.candidates = match.candidates
      record.summary = match.summary
      record.status = match.classification
      record.updatedAt = new Date().toISOString()
      await writeRecord(record)
    }
    return { ok: true, records: await readAllRecords() }
  } catch (err) {
    return { ok: false, error: (err as Error).message }
  }
}

/**
 * Admin: manually resolve a parked payment by crediting a chosen account.
 */
export async function resolveReconciliationAdmin(
  passcode: string,
  recordId: string,
  targetUserId: string,
  targetRequestId: string,
  note?: string,
): Promise<ReconciliationResult> {
  let admin: UserProfile
  try {
    admin = await requireAdmin(passcode)
  } catch (err) {
    return { ok: false, error: (err as Error).message }
  }
  try {
    const record = await readRecord(recordId)
    if (!record) return { ok: false, error: "Reconciliation record not found." }
    if (record.status === "reconciled") return { ok: false, error: "This payment has already been reconciled." }

    const accounts = await readActiveAccounts()
    const account = accounts.find((a) => a.userId === targetUserId && a.id === targetRequestId)
    if (!account) return { ok: false, error: "The selected destination account is no longer active." }

    const ledgerEntryId = await creditMatchedAccount(account, record.payment)
    record.status = "reconciled"
    record.matchedUserId = account.userId
    record.matchedRequestId = account.id
    record.matchedAccountHolder = account.accountHolder
    record.ledgerEntryId = ledgerEntryId
    record.resolutionNote = note?.trim() || undefined
    record.summary = `Manually reconciled to ${account.accountHolder} (reference ${account.coordinates?.reference}) by the administrator.`
    record.updatedAt = new Date().toISOString()
    await writeRecord(record)

    const target = getUserById(account.userId)
    await logActivity({
      action: `Administrator manually reconciled ${record.payment.currency} ${record.payment.amount.toLocaleString("en-US")} to ${target.fullName}'s Master Account`,
      category: "Administration",
      user: `${admin.fullName} (${admin.company})`,
      details: {
        summary: `Administrator manually matched incoming payment ${record.payment.id} from ${record.payment.payer} (reference ${record.payment.reference}) to gateway account ${account.id} and credited ${target.fullName}'s Master Account under ledger reference ${ledgerEntryId}.${note?.trim() ? ` Note: ${note.trim()}.` : ""}`,
        referenceId: record.payment.id,
        targetAccount: `${target.fullName} — ${target.email}`,
        amount: `${record.payment.currency} ${record.payment.amount.toLocaleString("en-US")}`,
        ledgerReference: ledgerEntryId,
        decision: "Manually reconciled",
      },
    })
    return { ok: true, records: await readAllRecords(), lastId: record.id }
  } catch (err) {
    console.log("[v0] resolveReconciliationAdmin failed:", (err as Error).message)
    return { ok: false, error: "The payment could not be reconciled. Please try again." }
  }
}

/** Admin: mark a payment as ignored (e.g. duplicate / not ours) without crediting. */
export async function ignoreReconciliationAdmin(
  passcode: string,
  recordId: string,
  note?: string,
): Promise<ReconciliationResult> {
  let admin: UserProfile
  try {
    admin = await requireAdmin(passcode)
  } catch (err) {
    return { ok: false, error: (err as Error).message }
  }
  try {
    const record = await readRecord(recordId)
    if (!record) return { ok: false, error: "Reconciliation record not found." }
    if (record.status === "reconciled") return { ok: false, error: "Reconciled payments cannot be ignored." }

    record.status = "ignored"
    record.resolutionNote = note?.trim() || undefined
    record.summary = "Marked as ignored by the administrator (no funds credited)."
    record.updatedAt = new Date().toISOString()
    await writeRecord(record)

    await logActivity({
      action: `Administrator ignored incoming payment ${record.payment.id}`,
      category: "Administration",
      user: `${admin.fullName} (${admin.company})`,
      details: {
        summary: `Administrator marked incoming payment ${record.payment.id} from ${record.payment.payer} (reference ${record.payment.reference}, ${record.payment.currency} ${record.payment.amount.toLocaleString("en-US")}) as ignored. No funds were credited.${note?.trim() ? ` Reason: ${note.trim()}.` : ""}`,
        referenceId: record.payment.id,
        decision: "Ignored",
        reason: note?.trim() || "(none provided)",
      },
    })
    return { ok: true, records: await readAllRecords() }
  } catch (err) {
    console.log("[v0] ignoreReconciliationAdmin failed:", (err as Error).message)
    return { ok: false, error: "The payment could not be updated. Please try again." }
  }
}
