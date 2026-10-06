import "server-only"
import { query } from "@/lib/db"

// AML / compliance case files. One case per auditor or compliance-office letter
// raised about a customer. The letter(s) are stored in Blob under `aml/`, the
// case row tracks the findings and the measures the administrator decides to
// undertake on that account. Internal only — never surfaced to the customer
// (tipping-off a subject of an AML review is prohibited).

export type AmlSource = "auditor" | "compliance_office" | "regulator" | "bank_partner" | "other"
export type AmlRiskLevel = "low" | "medium" | "high" | "critical"
export type AmlCaseStatus = "open" | "under_review" | "actions_in_progress" | "reported" | "closed"
export type AmlMeasureCategory =
  | "enhanced_due_diligence"
  | "request_documents"
  | "restrict_outgoing"
  | "freeze_account"
  | "monitor_transactions"
  | "file_sar"
  | "close_account"
  | "other"
export type AmlMeasureStatus = "planned" | "in_progress" | "done" | "cancelled"

export interface AmlDocument {
  pathname: string
  name: string
  contentType: string
  sizeBytes: number
  uploadedAt: string
  uploadedBy: string
}

export interface AmlMeasure {
  id: string
  category: AmlMeasureCategory
  text: string
  status: AmlMeasureStatus
  dueDate: string | null
  assignee: string
  createdAt: string
  completedAt: string | null
}

export interface AmlTimelineEntry {
  at: string
  by: string
  text: string
}

export interface AmlCase {
  id: string
  userId: string
  holderLabel: string
  subject: string
  source: AmlSource
  authorName: string
  letterReference: string
  letterDate: string | null
  riskLevel: AmlRiskLevel
  status: AmlCaseStatus
  summary: string
  findings: string
  documents: AmlDocument[]
  measures: AmlMeasure[]
  timeline: AmlTimelineEntry[]
  createdAt: string
  updatedAt: string
  closedAt: string | null
  createdBy: string
  /** Opt-in per case: when true the customer sees `clientMessage` (and the letters if `clientShareDocuments`). */
  clientShared: boolean
  clientMessage: string
  clientShareDocuments: boolean
  clientSharedAt: string | null
}

/** What the customer is allowed to see of a shared case — never findings, measures, risk or timeline. */
export interface ClientComplianceNotice {
  id: string
  subject: string
  message: string
  sharedAt: string | null
  closed: boolean
  documents: Array<{ pathname: string; name: string; contentType: string }>
}

let ready: Promise<void> | null = null

function ensureTable(): Promise<void> {
  if (!ready) {
    ready = (async () => {
      await query(`
        CREATE TABLE IF NOT EXISTS aml_cases (
          id               text PRIMARY KEY,
          user_id          text NOT NULL,
          holder_label     text NOT NULL DEFAULT '',
          subject          text NOT NULL DEFAULT '',
          source           text NOT NULL DEFAULT 'auditor',
          author_name      text NOT NULL DEFAULT '',
          letter_reference text NOT NULL DEFAULT '',
          letter_date      text,
          risk_level       text NOT NULL DEFAULT 'medium',
          status           text NOT NULL DEFAULT 'open',
          summary          text NOT NULL DEFAULT '',
          findings         text NOT NULL DEFAULT '',
          documents        jsonb NOT NULL DEFAULT '[]'::jsonb,
          measures         jsonb NOT NULL DEFAULT '[]'::jsonb,
          timeline         jsonb NOT NULL DEFAULT '[]'::jsonb,
          created_at       timestamptz NOT NULL DEFAULT now(),
          updated_at       timestamptz NOT NULL DEFAULT now(),
          closed_at        timestamptz,
          created_by       text NOT NULL DEFAULT ''
        )
      `)
      await query(`CREATE INDEX IF NOT EXISTS aml_cases_user_idx ON aml_cases (user_id)`)
      await query(`CREATE INDEX IF NOT EXISTS aml_cases_status_idx ON aml_cases (status)`)
      await query(`ALTER TABLE aml_cases ADD COLUMN IF NOT EXISTS client_shared boolean NOT NULL DEFAULT false`)
      await query(`ALTER TABLE aml_cases ADD COLUMN IF NOT EXISTS client_message text NOT NULL DEFAULT ''`)
      await query(`ALTER TABLE aml_cases ADD COLUMN IF NOT EXISTS client_share_documents boolean NOT NULL DEFAULT false`)
      await query(`ALTER TABLE aml_cases ADD COLUMN IF NOT EXISTS client_shared_at timestamptz`)
    })().catch((err) => {
      ready = null
      throw err
    })
  }
  return ready
}

function iso(v: unknown): string {
  if (!v) return ""
  return v instanceof Date ? v.toISOString() : String(v)
}

function rowToCase(r: Record<string, unknown>): AmlCase {
  return {
    id: String(r.id),
    userId: String(r.user_id),
    holderLabel: String(r.holder_label ?? ""),
    subject: String(r.subject ?? ""),
    source: (r.source as AmlSource) ?? "auditor",
    authorName: String(r.author_name ?? ""),
    letterReference: String(r.letter_reference ?? ""),
    letterDate: r.letter_date ? String(r.letter_date) : null,
    riskLevel: (r.risk_level as AmlRiskLevel) ?? "medium",
    status: (r.status as AmlCaseStatus) ?? "open",
    summary: String(r.summary ?? ""),
    findings: String(r.findings ?? ""),
    documents: (r.documents as AmlDocument[]) ?? [],
    measures: (r.measures as AmlMeasure[]) ?? [],
    timeline: (r.timeline as AmlTimelineEntry[]) ?? [],
    createdAt: iso(r.created_at),
    updatedAt: iso(r.updated_at),
    closedAt: r.closed_at ? iso(r.closed_at) : null,
    createdBy: String(r.created_by ?? ""),
    clientShared: r.client_shared === true,
    clientMessage: String(r.client_message ?? ""),
    clientShareDocuments: r.client_share_documents === true,
    clientSharedAt: r.client_shared_at ? iso(r.client_shared_at) : null,
  }
}

/** Shared cases for the given customer ids, reduced to the client-safe fields. */
export async function listClientComplianceNotices(userIds: string[]): Promise<ClientComplianceNotice[]> {
  if (!userIds.length) return []
  await ensureTable()
  const { rows } = await query(
    `SELECT * FROM aml_cases WHERE user_id = ANY($1) AND client_shared = true ORDER BY client_shared_at DESC NULLS LAST`,
    [userIds],
  )
  return rows.map(rowToCase).map((c) => ({
    id: c.id,
    subject: c.subject,
    message: c.clientMessage,
    sharedAt: c.clientSharedAt,
    closed: c.status === "closed",
    documents: c.clientShareDocuments
      ? c.documents.map((d) => ({ pathname: d.pathname, name: d.name, contentType: d.contentType }))
      : [],
  }))
}

export function newAmlId(prefix = "AML"): string {
  const rand = Math.random().toString(36).slice(2, 8).toUpperCase()
  return `${prefix}-${Date.now().toString(36).toUpperCase()}-${rand}`
}

export async function listAmlCases(): Promise<AmlCase[]> {
  await ensureTable()
  const { rows } = await query(`SELECT * FROM aml_cases ORDER BY updated_at DESC`)
  return rows.map(rowToCase)
}

export async function getAmlCase(id: string): Promise<AmlCase | null> {
  await ensureTable()
  const { rows } = await query(`SELECT * FROM aml_cases WHERE id = $1`, [id])
  return rows[0] ? rowToCase(rows[0]) : null
}

export async function countOpenAmlCases(): Promise<number> {
  await ensureTable()
  const { rows } = await query(`SELECT COUNT(*)::int AS n FROM aml_cases WHERE status <> 'closed'`)
  return Number(rows[0]?.n ?? 0)
}

/** Insert or fully replace a case (the route builds the merged object). */
export async function saveAmlCase(c: AmlCase): Promise<AmlCase> {
  await ensureTable()
  const { rows } = await query(
    `INSERT INTO aml_cases (id, user_id, holder_label, subject, source, author_name, letter_reference, letter_date,
       risk_level, status, summary, findings, documents, measures, timeline, created_at, updated_at, closed_at, created_by,
       client_shared, client_message, client_share_documents, client_shared_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13::jsonb,$14::jsonb,$15::jsonb,
       COALESCE(NULLIF($16,'')::timestamptz, now()), now(), NULLIF($17,'')::timestamptz, $18,
       $19, $20, $21, NULLIF($22,'')::timestamptz)
     ON CONFLICT (id) DO UPDATE SET
       user_id = EXCLUDED.user_id, holder_label = EXCLUDED.holder_label, subject = EXCLUDED.subject,
       source = EXCLUDED.source, author_name = EXCLUDED.author_name, letter_reference = EXCLUDED.letter_reference,
       letter_date = EXCLUDED.letter_date, risk_level = EXCLUDED.risk_level, status = EXCLUDED.status,
       summary = EXCLUDED.summary, findings = EXCLUDED.findings, documents = EXCLUDED.documents,
       measures = EXCLUDED.measures, timeline = EXCLUDED.timeline, updated_at = now(), closed_at = EXCLUDED.closed_at,
       client_shared = EXCLUDED.client_shared, client_message = EXCLUDED.client_message,
       client_share_documents = EXCLUDED.client_share_documents, client_shared_at = EXCLUDED.client_shared_at
     RETURNING *`,
    [
      c.id,
      c.userId,
      c.holderLabel,
      c.subject,
      c.source,
      c.authorName,
      c.letterReference,
      c.letterDate,
      c.riskLevel,
      c.status,
      c.summary,
      c.findings,
      JSON.stringify(c.documents),
      JSON.stringify(c.measures),
      JSON.stringify(c.timeline),
      c.createdAt || "",
      c.closedAt || "",
      c.createdBy,
      c.clientShared,
      c.clientMessage,
      c.clientShareDocuments,
      c.clientSharedAt || "",
    ],
  )
  return rowToCase(rows[0])
}

export async function deleteAmlCase(id: string): Promise<AmlCase | null> {
  await ensureTable()
  const { rows } = await query(`DELETE FROM aml_cases WHERE id = $1 RETURNING *`, [id])
  return rows[0] ? rowToCase(rows[0]) : null
}
