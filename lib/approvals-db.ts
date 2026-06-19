import "server-only"
import { query } from "@/lib/db"
import type { ApprovalKind } from "@/lib/approval-kinds"

export type { ApprovalKind }

/**
 * Unified cross-client approval backbone.
 *
 * Every "request that needs an administrator decision" — outgoing payments,
 * leverage lines, PPP/yield, bank instruments, monetization, project funding,
 * fiduciary, download-of-funds, DTC, Euroclear, commodity deals — is stored as
 * a single row in `approval_requests`, namespaced by the owning client's
 * user_id. Because it lives in Neon (not per-browser localStorage), the
 * administrator can see and act on requests from ANY client, and the decision
 * is visible to that client on their next load.
 *
 * Kind-specific detail lives in the `payload` JSONB column so every workflow
 * shares one table, one query path, and one audit trail.
 */

export type ApprovalStatus = "pending" | "approved" | "rejected" | "cancelled"

/**
 * Optional financial effect applied to the owner's server-authoritative ledger
 * when the request is APPROVED. When present, approving the request posts this
 * entry (e.g. debiting an outgoing payment, crediting a funded amount).
 */
export interface LedgerEffect {
  direction: "debit" | "credit"
  amount: number
  currency: string
  counterparty?: string
  account?: string
  bank?: string
  reference?: string
  category?: string
  /** "completed" moves available balance immediately; "hold" pends it. */
  status?: "completed" | "hold"
}

export interface ApprovalRequest {
  id: string
  userId: string
  kind: ApprovalKind
  status: ApprovalStatus
  title: string
  summary: string
  amount: number | null
  currency: string | null
  payload: Record<string, unknown>
  ledgerEffect: LedgerEffect | null
  decisionNote: string | null
  decidedBy: string | null
  decidedAt: string | null
  createdAt: string
}

export interface NewApprovalRequest {
  id?: string
  userId: string
  kind: ApprovalKind
  title: string
  summary: string
  amount?: number | null
  currency?: string | null
  payload?: Record<string, unknown>
  ledgerEffect?: LedgerEffect | null
}

let ensured = false

async function ensureTable(): Promise<void> {
  if (ensured) return
  await query(
    `CREATE TABLE IF NOT EXISTS approval_requests (
       id            text        PRIMARY KEY,
       user_id       text        NOT NULL,
       kind          text        NOT NULL,
       status        text        NOT NULL DEFAULT 'pending',
       title         text        NOT NULL DEFAULT '',
       summary       text        NOT NULL DEFAULT '',
       amount        numeric,
       currency      text,
       payload       jsonb       NOT NULL DEFAULT '{}'::jsonb,
       ledger_effect jsonb,
       decision_note text,
       decided_by    text,
       decided_at    timestamptz,
       created_at    timestamptz NOT NULL DEFAULT now()
     )`,
  )
  // Indexes that match our two hot read paths: a client's own list, and the
  // admin's global pending queue.
  await query(`CREATE INDEX IF NOT EXISTS approval_requests_user_idx ON approval_requests (user_id, created_at DESC)`)
  await query(`CREATE INDEX IF NOT EXISTS approval_requests_status_idx ON approval_requests (status, created_at DESC)`)
  ensured = true
}

function rowToRequest(row: Record<string, unknown>): ApprovalRequest {
  const payload = (row.payload as Record<string, unknown>) ?? {}
  return {
    id: row.id as string,
    userId: row.user_id as string,
    kind: row.kind as ApprovalKind,
    status: row.status as ApprovalStatus,
    title: (row.title as string) ?? "",
    summary: (row.summary as string) ?? "",
    amount: row.amount == null ? null : Number(row.amount),
    currency: (row.currency as string) ?? null,
    payload,
    ledgerEffect: (row.ledger_effect as LedgerEffect | null) ?? null,
    decisionNote: (row.decision_note as string) ?? null,
    decidedBy: (row.decided_by as string) ?? null,
    decidedAt: row.decided_at ? new Date(row.decided_at as string).toISOString() : null,
    createdAt: row.created_at ? new Date(row.created_at as string).toISOString() : new Date().toISOString(),
  }
}

function genId(kind: ApprovalKind): string {
  const rand = Math.random().toString(36).slice(2, 8).toUpperCase()
  return `${kind.toUpperCase().slice(0, 4)}-${Date.now().toString(36).toUpperCase()}-${rand}`
}

/** Insert a new pending request. Returns the stored record. */
export async function insertApproval(req: NewApprovalRequest): Promise<ApprovalRequest> {
  await ensureTable()
  const id = req.id ?? genId(req.kind)
  const { rows } = await query(
    `INSERT INTO approval_requests
       (id, user_id, kind, status, title, summary, amount, currency, payload, ledger_effect)
     VALUES ($1,$2,$3,'pending',$4,$5,$6,$7,$8::jsonb,$9::jsonb)
     RETURNING *`,
    [
      id,
      req.userId,
      req.kind,
      req.title,
      req.summary,
      req.amount ?? null,
      req.currency ?? null,
      JSON.stringify(req.payload ?? {}),
      req.ledgerEffect ? JSON.stringify(req.ledgerEffect) : null,
    ],
  )
  return rowToRequest(rows[0])
}

/** A single request by id (used to validate decisions). */
export async function getApprovalById(id: string): Promise<ApprovalRequest | null> {
  await ensureTable()
  const { rows } = await query(`SELECT * FROM approval_requests WHERE id = $1`, [id])
  return rows.length ? rowToRequest(rows[0]) : null
}

/** All requests owned by one client, newest first. Optionally filter by kind. */
export async function listApprovalsForUser(userId: string, kind?: ApprovalKind): Promise<ApprovalRequest[]> {
  await ensureTable()
  const { rows } = kind
    ? await query(
        `SELECT * FROM approval_requests WHERE user_id = $1 AND kind = $2 ORDER BY created_at DESC`,
        [userId, kind],
      )
    : await query(`SELECT * FROM approval_requests WHERE user_id = $1 ORDER BY created_at DESC`, [userId])
  return rows.map(rowToRequest)
}

/** Cross-client list for the admin dashboard, newest first. */
export async function listAllApprovals(opts?: {
  status?: ApprovalStatus
  kind?: ApprovalKind
  userId?: string
}): Promise<ApprovalRequest[]> {
  await ensureTable()
  const where: string[] = []
  const params: unknown[] = []
  if (opts?.status) {
    params.push(opts.status)
    where.push(`status = $${params.length}`)
  }
  if (opts?.kind) {
    params.push(opts.kind)
    where.push(`kind = $${params.length}`)
  }
  if (opts?.userId) {
    params.push(opts.userId)
    where.push(`user_id = $${params.length}`)
  }
  const clause = where.length ? `WHERE ${where.join(" AND ")}` : ""
  const { rows } = await query(`SELECT * FROM approval_requests ${clause} ORDER BY created_at DESC`, params)
  return rows.map(rowToRequest)
}

/** Count of pending requests grouped by kind — drives the admin banner. */
export async function countPendingByKind(): Promise<Record<string, number>> {
  await ensureTable()
  const { rows } = await query<{ kind: string; n: string }>(
    `SELECT kind, COUNT(*)::int AS n FROM approval_requests WHERE status = 'pending' GROUP BY kind`,
  )
  const out: Record<string, number> = {}
  for (const r of rows) out[r.kind] = Number(r.n)
  return out
}

/**
 * Record a decision on a pending request. Returns the updated record, or null
 * if it does not exist or was already decided (idempotent / race-safe via the
 * status guard in the WHERE clause).
 */
export async function decideApproval(
  id: string,
  decision: "approved" | "rejected",
  decidedBy: string,
  note?: string,
): Promise<ApprovalRequest | null> {
  await ensureTable()
  const { rows } = await query(
    `UPDATE approval_requests
        SET status = $2, decided_by = $3, decided_at = now(), decision_note = $4
      WHERE id = $1 AND status = 'pending'
      RETURNING *`,
    [id, decision, decidedBy, note?.trim() || null],
  )
  return rows.length ? rowToRequest(rows[0]) : null
}

/** Client-side cancellation of their own still-pending request. */
export async function cancelApproval(id: string, userId: string): Promise<ApprovalRequest | null> {
  await ensureTable()
  const { rows } = await query(
    `UPDATE approval_requests
        SET status = 'cancelled', decided_at = now()
      WHERE id = $1 AND user_id = $2 AND status = 'pending'
      RETURNING *`,
    [id, userId],
  )
  return rows.length ? rowToRequest(rows[0]) : null
}
