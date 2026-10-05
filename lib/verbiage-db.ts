import "server-only"
import { query } from "@/lib/db"
import type { VerbiageAnalysis } from "@/lib/verbiage-types"

export type VerbiageStatus =
  | "analyzed" // report shown to the customer, awaiting their approval
  | "awaiting_transmission" // customer approved; waiting for the Barclays execution address
  | "transmitted" // sent to Barclays for execution
  | "issued" // the instrument has been received and booked
  | "rejected" // declined by the administrator
  | "withdrawn" // withdrawn by the customer before transmission

export interface VerbiageSubmission {
  id: string
  userId: string
  holderLabel: string
  fileName: string
  blobPathname: string | null
  analysis: VerbiageAnalysis
  status: VerbiageStatus
  approvedAt: string | null
  transmittedAt: string | null
  transmittedTo: string | null
  transmissionError: string | null
  issuedInstrumentRef: string | null
  issuedAt: string | null
  adminNote: string | null
  createdAt: string
}

let ready: Promise<void> | null = null

function ensureTables(): Promise<void> {
  if (!ready) {
    ready = (async () => {
      await query(`CREATE TABLE IF NOT EXISTS instrument_verbiage_submissions (
        id text PRIMARY KEY,
        user_id text NOT NULL,
        holder_label text NOT NULL DEFAULT '',
        file_name text NOT NULL DEFAULT '',
        blob_pathname text,
        analysis jsonb NOT NULL DEFAULT '{}'::jsonb,
        status text NOT NULL DEFAULT 'analyzed',
        approved_at timestamptz,
        transmitted_at timestamptz,
        transmitted_to text,
        transmission_error text,
        issued_instrument_ref text,
        issued_at timestamptz,
        admin_note text,
        created_at timestamptz NOT NULL DEFAULT now()
      )`)
      await query(
        `CREATE INDEX IF NOT EXISTS instrument_verbiage_user_idx ON instrument_verbiage_submissions (user_id, created_at DESC)`,
      )
      await query(`CREATE TABLE IF NOT EXISTS instrument_verbiage_settings (
        id text PRIMARY KEY,
        barclays_email text NOT NULL DEFAULT '',
        updated_at timestamptz NOT NULL DEFAULT now()
      )`)
    })().catch((err) => {
      ready = null
      throw err
    })
  }
  return ready
}

type Row = {
  id: string
  user_id: string
  holder_label: string
  file_name: string
  blob_pathname: string | null
  analysis: VerbiageAnalysis
  status: string
  approved_at: string | Date | null
  transmitted_at: string | Date | null
  transmitted_to: string | null
  transmission_error: string | null
  issued_instrument_ref: string | null
  issued_at: string | Date | null
  admin_note: string | null
  created_at: string | Date
}

const iso = (v: string | Date | null) => (v == null ? null : new Date(v).toISOString())

function toSubmission(r: Row): VerbiageSubmission {
  return {
    id: r.id,
    userId: r.user_id,
    holderLabel: r.holder_label,
    fileName: r.file_name,
    blobPathname: r.blob_pathname,
    analysis: r.analysis,
    status: r.status as VerbiageStatus,
    approvedAt: iso(r.approved_at),
    transmittedAt: iso(r.transmitted_at),
    transmittedTo: r.transmitted_to,
    transmissionError: r.transmission_error,
    issuedInstrumentRef: r.issued_instrument_ref,
    issuedAt: iso(r.issued_at),
    adminNote: r.admin_note,
    createdAt: iso(r.created_at) as string,
  }
}

export function newVerbiageId(): string {
  return `VRB-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`
}

export async function insertVerbiage(input: {
  id: string
  userId: string
  holderLabel: string
  fileName: string
  blobPathname: string | null
  analysis: VerbiageAnalysis
}): Promise<VerbiageSubmission> {
  await ensureTables()
  const rows = await query<Row>(
    `INSERT INTO instrument_verbiage_submissions (id, user_id, holder_label, file_name, blob_pathname, analysis)
     VALUES ($1,$2,$3,$4,$5,$6::jsonb) RETURNING *`,
    [input.id, input.userId, input.holderLabel, input.fileName, input.blobPathname, JSON.stringify(input.analysis)],
  )
  return toSubmission(rows[0])
}

export async function getVerbiage(id: string): Promise<VerbiageSubmission | null> {
  await ensureTables()
  const rows = await query<Row>(`SELECT * FROM instrument_verbiage_submissions WHERE id = $1`, [id])
  return rows[0] ? toSubmission(rows[0]) : null
}

export async function listVerbiageForUser(userId: string): Promise<VerbiageSubmission[]> {
  await ensureTables()
  const rows = await query<Row>(
    `SELECT * FROM instrument_verbiage_submissions WHERE user_id = $1 ORDER BY created_at DESC LIMIT 50`,
    [userId],
  )
  return rows.map(toSubmission)
}

export async function listAllVerbiage(): Promise<VerbiageSubmission[]> {
  await ensureTables()
  const rows = await query<Row>(
    `SELECT * FROM instrument_verbiage_submissions WHERE status <> 'withdrawn' ORDER BY created_at DESC LIMIT 200`,
  )
  return rows.map(toSubmission)
}

export async function countVerbiageAwaitingAdmin(): Promise<number> {
  await ensureTables()
  const rows = await query<{ n: string }>(
    `SELECT COUNT(*)::text AS n FROM instrument_verbiage_submissions WHERE status IN ('awaiting_transmission','transmitted')`,
  )
  return Number(rows[0]?.n ?? 0)
}

export async function updateVerbiage(
  id: string,
  patch: Partial<{
    status: VerbiageStatus
    approvedAt: string | null
    transmittedAt: string | null
    transmittedTo: string | null
    transmissionError: string | null
    issuedInstrumentRef: string | null
    issuedAt: string | null
    adminNote: string | null
  }>,
): Promise<VerbiageSubmission | null> {
  await ensureTables()
  const map: Record<string, string> = {
    status: "status",
    approvedAt: "approved_at",
    transmittedAt: "transmitted_at",
    transmittedTo: "transmitted_to",
    transmissionError: "transmission_error",
    issuedInstrumentRef: "issued_instrument_ref",
    issuedAt: "issued_at",
    adminNote: "admin_note",
  }
  const sets: string[] = []
  const vals: unknown[] = []
  for (const [k, v] of Object.entries(patch)) {
    if (!(k in map)) continue
    vals.push(v)
    sets.push(`${map[k]} = $${vals.length}`)
  }
  if (!sets.length) return getVerbiage(id)
  vals.push(id)
  const rows = await query<Row>(
    `UPDATE instrument_verbiage_submissions SET ${sets.join(", ")} WHERE id = $${vals.length} RETURNING *`,
    vals,
  )
  return rows[0] ? toSubmission(rows[0]) : null
}

export async function getBarclaysExecutionEmail(): Promise<string> {
  try {
    await ensureTables()
    const rows = await query<{ barclays_email: string }>(
      `SELECT barclays_email FROM instrument_verbiage_settings WHERE id = 'global'`,
    )
    return rows[0]?.barclays_email?.trim() ?? ""
  } catch {
    return ""
  }
}

export async function setBarclaysExecutionEmail(email: string): Promise<void> {
  await ensureTables()
  await query(
    `INSERT INTO instrument_verbiage_settings (id, barclays_email, updated_at) VALUES ('global', $1, now())
     ON CONFLICT (id) DO UPDATE SET barclays_email = EXCLUDED.barclays_email, updated_at = now()`,
    [email],
  )
}
