import "server-only"
import { query } from "@/lib/db"

export type MandateStatus = "pending_financing" | "active" | "closed" | "cancelled"
export type DistributionStatus = "pending" | "credited" | "rejected"

export interface MandateDistribution {
  id: string
  periodLabel: string
  amount: number
  interestCharged: number
  note: string
  status: DistributionStatus
  recordedBy: string
  recordedAt: string
  approvedBy?: string
  approvedAt?: string
  rejectedReason?: string
}

export interface ManagedMandate {
  id: string
  userId: string
  ownerId: string
  holderLabel: string
  title: string
  currency: string
  deposit: number
  leverageRatio: number
  borrowed: number
  annualInterestRate: number
  targetNote: string
  status: MandateStatus
  distributions: MandateDistribution[]
  createdAt: string
  createdBy: string
  activatedAt: string | null
  activatedBy: string | null
  lastInterestAt: string | null
  closedAt: string | null
}

let ensured = false

async function ensureTable(): Promise<void> {
  if (ensured) return
  await query(
    `CREATE TABLE IF NOT EXISTS managed_mandates (
       id                   text PRIMARY KEY,
       user_id              text NOT NULL,
       owner_id             text NOT NULL,
       holder_label         text NOT NULL DEFAULT '',
       title                text NOT NULL,
       currency             text NOT NULL,
       deposit              numeric NOT NULL,
       leverage_ratio       numeric NOT NULL DEFAULT 1,
       borrowed             numeric NOT NULL DEFAULT 0,
       annual_interest_rate numeric NOT NULL DEFAULT 0,
       target_note          text NOT NULL DEFAULT '',
       status               text NOT NULL DEFAULT 'pending_financing',
       distributions        jsonb NOT NULL DEFAULT '[]'::jsonb,
       created_at           timestamptz NOT NULL DEFAULT now(),
       created_by           text NOT NULL DEFAULT '',
       activated_at         timestamptz,
       activated_by         text,
       last_interest_at     timestamptz,
       closed_at            timestamptz
     )`,
  )
  await query(`CREATE INDEX IF NOT EXISTS managed_mandates_user_idx ON managed_mandates (user_id)`)
  ensured = true
}

function iso(v: unknown): string | null {
  if (!v) return null
  return v instanceof Date ? v.toISOString() : String(v)
}

function rowToMandate(r: Record<string, unknown>): ManagedMandate {
  return {
    id: String(r.id),
    userId: String(r.user_id),
    ownerId: String(r.owner_id),
    holderLabel: String(r.holder_label ?? ""),
    title: String(r.title),
    currency: String(r.currency),
    deposit: Number(r.deposit),
    leverageRatio: Number(r.leverage_ratio),
    borrowed: Number(r.borrowed),
    annualInterestRate: Number(r.annual_interest_rate),
    targetNote: String(r.target_note ?? ""),
    status: String(r.status) as MandateStatus,
    distributions: Array.isArray(r.distributions) ? (r.distributions as MandateDistribution[]) : [],
    createdAt: iso(r.created_at) ?? new Date().toISOString(),
    createdBy: String(r.created_by ?? ""),
    activatedAt: iso(r.activated_at),
    activatedBy: (r.activated_by as string | null) ?? null,
    lastInterestAt: iso(r.last_interest_at),
    closedAt: iso(r.closed_at),
  }
}

export async function listAllMandates(): Promise<ManagedMandate[]> {
  await ensureTable()
  const { rows } = await query(`SELECT * FROM managed_mandates ORDER BY created_at DESC`)
  return rows.map(rowToMandate)
}

export async function listMandatesForUsers(userIds: string[]): Promise<ManagedMandate[]> {
  await ensureTable()
  if (!userIds.length) return []
  const { rows } = await query(
    `SELECT * FROM managed_mandates WHERE user_id = ANY($1) AND status <> 'cancelled' ORDER BY created_at DESC`,
    [userIds],
  )
  return rows.map(rowToMandate)
}

export async function getMandate(id: string): Promise<ManagedMandate | null> {
  await ensureTable()
  const { rows } = await query(`SELECT * FROM managed_mandates WHERE id = $1`, [id])
  return rows[0] ? rowToMandate(rows[0]) : null
}

export async function insertMandate(m: ManagedMandate): Promise<void> {
  await ensureTable()
  await query(
    `INSERT INTO managed_mandates
       (id, user_id, owner_id, holder_label, title, currency, deposit, leverage_ratio, borrowed,
        annual_interest_rate, target_note, status, distributions, created_at, created_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13::jsonb,$14,$15)`,
    [
      m.id, m.userId, m.ownerId, m.holderLabel, m.title, m.currency, m.deposit, m.leverageRatio,
      m.borrowed, m.annualInterestRate, m.targetNote, m.status, JSON.stringify(m.distributions),
      m.createdAt, m.createdBy,
    ],
  )
}

export async function updateMandate(
  id: string,
  patch: Partial<Pick<ManagedMandate, "status" | "distributions" | "activatedAt" | "activatedBy" | "lastInterestAt" | "closedAt">>,
): Promise<void> {
  await ensureTable()
  const current = await getMandate(id)
  if (!current) return
  const next = { ...current, ...patch }
  await query(
    `UPDATE managed_mandates SET status=$2, distributions=$3::jsonb, activated_at=$4, activated_by=$5,
       last_interest_at=$6, closed_at=$7 WHERE id=$1`,
    [id, next.status, JSON.stringify(next.distributions), next.activatedAt, next.activatedBy, next.lastInterestAt, next.closedAt],
  )
}
