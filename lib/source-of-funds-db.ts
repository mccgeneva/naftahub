import "server-only"
import { query } from "@/lib/db"

export type SofStatus = "open" | "cleared" | "hold" | "returned"

export type SofDocumentKind =
  | "mt103"
  | "sender_passport"
  | "sender_address"
  | "sender_company"
  | "existing_contract"
  | "correspondence"
  | "delivery_evidence"
  | "other"

export interface SofDocument {
  id: string
  kind: SofDocumentKind
  name: string
  pathname: string
  contentType: string
  uploadedAt: string
}

export interface SofChecklist {
  senderIdentityVerified: boolean
  sanctionsScreened: boolean
  documentsMatchPayment: boolean
  amountFitsPurpose: boolean
  declarationSigned: boolean
}

export interface SofDeclaration {
  purpose: string
  sourceOfFunds: string
  relationship: string
  signedBy: string
  signedAt: string | null
}

export interface SourceOfFundsFile {
  id: string
  userId: string
  holderLabel: string
  amount: number
  currency: string
  valueDate: string | null
  senderName: string
  senderCountry: string
  senderBank: string
  senderAccount: string
  reference: string
  declaration: SofDeclaration
  checklist: SofChecklist
  documents: SofDocument[]
  status: SofStatus
  decisionNote: string
  decidedBy: string | null
  decidedAt: string | null
  createdAt: string
  updatedAt: string
}

export const EMPTY_CHECKLIST: SofChecklist = {
  senderIdentityVerified: false,
  sanctionsScreened: false,
  documentsMatchPayment: false,
  amountFitsPurpose: false,
  declarationSigned: false,
}

export const EMPTY_DECLARATION: SofDeclaration = {
  purpose: "",
  sourceOfFunds: "",
  relationship: "",
  signedBy: "",
  signedAt: null,
}

let tableReady: Promise<void> | null = null

function ensureTable(): Promise<void> {
  if (!tableReady) {
    tableReady = (async () => {
      await query(`
        CREATE TABLE IF NOT EXISTS source_of_funds_files (
          id text PRIMARY KEY,
          user_id text NOT NULL,
          holder_label text NOT NULL DEFAULT '',
          amount numeric NOT NULL DEFAULT 0,
          currency text NOT NULL DEFAULT 'EUR',
          value_date text,
          sender_name text NOT NULL DEFAULT '',
          sender_country text NOT NULL DEFAULT '',
          sender_bank text NOT NULL DEFAULT '',
          sender_account text NOT NULL DEFAULT '',
          reference text NOT NULL DEFAULT '',
          declaration jsonb NOT NULL DEFAULT '{}'::jsonb,
          checklist jsonb NOT NULL DEFAULT '{}'::jsonb,
          documents jsonb NOT NULL DEFAULT '[]'::jsonb,
          status text NOT NULL DEFAULT 'open',
          decision_note text NOT NULL DEFAULT '',
          decided_by text,
          decided_at timestamptz,
          created_at timestamptz NOT NULL DEFAULT now(),
          updated_at timestamptz NOT NULL DEFAULT now()
        )
      `)
      await query(`CREATE INDEX IF NOT EXISTS source_of_funds_files_user_idx ON source_of_funds_files (user_id)`)
    })().catch((err) => {
      tableReady = null
      throw err
    })
  }
  return tableReady
}

type Row = {
  id: string
  user_id: string
  holder_label: string
  amount: string | number
  currency: string
  value_date: string | null
  sender_name: string
  sender_country: string
  sender_bank: string
  sender_account: string
  reference: string
  declaration: Partial<SofDeclaration> | null
  checklist: Partial<SofChecklist> | null
  documents: SofDocument[] | null
  status: SofStatus
  decision_note: string
  decided_by: string | null
  decided_at: Date | string | null
  created_at: Date | string
  updated_at: Date | string
}

const iso = (v: Date | string | null) => (v == null ? null : new Date(v).toISOString())

function rowToFile(r: Row): SourceOfFundsFile {
  return {
    id: r.id,
    userId: r.user_id,
    holderLabel: r.holder_label,
    amount: Number(r.amount) || 0,
    currency: r.currency,
    valueDate: r.value_date,
    senderName: r.sender_name,
    senderCountry: r.sender_country,
    senderBank: r.sender_bank,
    senderAccount: r.sender_account,
    reference: r.reference,
    declaration: { ...EMPTY_DECLARATION, ...(r.declaration ?? {}) },
    checklist: { ...EMPTY_CHECKLIST, ...(r.checklist ?? {}) },
    documents: Array.isArray(r.documents) ? r.documents : [],
    status: r.status,
    decisionNote: r.decision_note,
    decidedBy: r.decided_by,
    decidedAt: iso(r.decided_at),
    createdAt: iso(r.created_at) as string,
    updatedAt: iso(r.updated_at) as string,
  }
}

export async function listSourceOfFundsFiles(): Promise<SourceOfFundsFile[]> {
  await ensureTable()
  const res = await query<Row>(
    `SELECT * FROM source_of_funds_files
     ORDER BY CASE WHEN status IN ('open','hold') THEN 0 ELSE 1 END, created_at DESC
     LIMIT 500`,
  )
  return res.rows.map(rowToFile)
}

export async function getSourceOfFundsFile(id: string): Promise<SourceOfFundsFile | null> {
  await ensureTable()
  const res = await query<Row>(`SELECT * FROM source_of_funds_files WHERE id = $1`, [id])
  return res.rows[0] ? rowToFile(res.rows[0]) : null
}

export type SofEditableFields = Pick<
  SourceOfFundsFile,
  | "userId"
  | "holderLabel"
  | "amount"
  | "currency"
  | "valueDate"
  | "senderName"
  | "senderCountry"
  | "senderBank"
  | "senderAccount"
  | "reference"
  | "declaration"
  | "checklist"
  | "documents"
>

export async function saveSourceOfFundsFile(id: string, f: SofEditableFields): Promise<SourceOfFundsFile> {
  await ensureTable()
  const res = await query<Row>(
    `INSERT INTO source_of_funds_files
       (id, user_id, holder_label, amount, currency, value_date, sender_name, sender_country,
        sender_bank, sender_account, reference, declaration, checklist, documents)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12::jsonb,$13::jsonb,$14::jsonb)
     ON CONFLICT (id) DO UPDATE SET
       user_id = EXCLUDED.user_id,
       holder_label = EXCLUDED.holder_label,
       amount = EXCLUDED.amount,
       currency = EXCLUDED.currency,
       value_date = EXCLUDED.value_date,
       sender_name = EXCLUDED.sender_name,
       sender_country = EXCLUDED.sender_country,
       sender_bank = EXCLUDED.sender_bank,
       sender_account = EXCLUDED.sender_account,
       reference = EXCLUDED.reference,
       declaration = EXCLUDED.declaration,
       checklist = EXCLUDED.checklist,
       documents = EXCLUDED.documents,
       updated_at = now()
     RETURNING *`,
    [
      id,
      f.userId,
      f.holderLabel,
      f.amount,
      f.currency,
      f.valueDate,
      f.senderName,
      f.senderCountry,
      f.senderBank,
      f.senderAccount,
      f.reference,
      JSON.stringify(f.declaration),
      JSON.stringify(f.checklist),
      JSON.stringify(f.documents),
    ],
  )
  return rowToFile(res.rows[0])
}

export async function decideSourceOfFundsFile(
  id: string,
  status: SofStatus,
  note: string,
  decidedBy: string,
): Promise<SourceOfFundsFile | null> {
  await ensureTable()
  const res = await query<Row>(
    `UPDATE source_of_funds_files
       SET status = $2, decision_note = $3, decided_by = $4,
           decided_at = CASE WHEN $2 = 'open' THEN NULL ELSE now() END,
           updated_at = now()
     WHERE id = $1
     RETURNING *`,
    [id, status, note, status === "open" ? null : decidedBy],
  )
  return res.rows[0] ? rowToFile(res.rows[0]) : null
}

export async function deleteSourceOfFundsFile(id: string): Promise<boolean> {
  await ensureTable()
  const res = await query(`DELETE FROM source_of_funds_files WHERE id = $1 AND status = 'open'`, [id])
  return (res.rowCount ?? 0) > 0
}
