import "server-only"
import { query } from "@/lib/db"

export type LegalMessageStatus = "sent" | "failed"

export interface LegalDeskMessage {
  id: string
  userId: string | null
  clientLabel: string
  instrumentRef: string | null
  transactionRef: string | null
  toEmails: string[]
  ccEmails: string[]
  recipientName: string
  subject: string
  transactionReference: string
  relatedReference: string
  narrative: string
  fromEmail: string
  status: LegalMessageStatus
  providerId: string | null
  error: string | null
  sentBy: string
  createdAt: string
}

let ready: Promise<void> | null = null

function ensureTable(): Promise<void> {
  if (!ready) {
    ready = (async () => {
      await query(`CREATE TABLE IF NOT EXISTS legal_desk_messages (
        id text PRIMARY KEY,
        user_id text,
        client_label text NOT NULL DEFAULT '',
        instrument_ref text,
        transaction_ref text,
        to_emails text[] NOT NULL DEFAULT '{}',
        cc_emails text[] NOT NULL DEFAULT '{}',
        recipient_name text NOT NULL DEFAULT '',
        subject text NOT NULL DEFAULT '',
        transaction_reference text NOT NULL DEFAULT '',
        related_reference text NOT NULL DEFAULT '',
        narrative text NOT NULL DEFAULT '',
        from_email text NOT NULL DEFAULT '',
        status text NOT NULL DEFAULT 'sent',
        provider_id text,
        error text,
        sent_by text NOT NULL DEFAULT '',
        created_at timestamptz NOT NULL DEFAULT now()
      )`)
      await query(`CREATE INDEX IF NOT EXISTS legal_desk_messages_created_idx ON legal_desk_messages (created_at DESC)`)
    })().catch((err) => {
      ready = null
      throw err
    })
  }
  return ready
}

type Row = {
  id: string
  user_id: string | null
  client_label: string
  instrument_ref: string | null
  transaction_ref: string | null
  to_emails: string[]
  cc_emails: string[]
  recipient_name: string
  subject: string
  transaction_reference: string
  related_reference: string
  narrative: string
  from_email: string
  status: string
  provider_id: string | null
  error: string | null
  sent_by: string
  created_at: string | Date
}

function toMessage(r: Row): LegalDeskMessage {
  return {
    id: r.id,
    userId: r.user_id,
    clientLabel: r.client_label,
    instrumentRef: r.instrument_ref,
    transactionRef: r.transaction_ref,
    toEmails: r.to_emails ?? [],
    ccEmails: r.cc_emails ?? [],
    recipientName: r.recipient_name,
    subject: r.subject,
    transactionReference: r.transaction_reference,
    relatedReference: r.related_reference,
    narrative: r.narrative,
    fromEmail: r.from_email,
    status: r.status === "failed" ? "failed" : "sent",
    providerId: r.provider_id,
    error: r.error,
    sentBy: r.sent_by,
    createdAt: new Date(r.created_at).toISOString(),
  }
}

export function newLegalReference(): string {
  const d = new Date()
  const ymd = `${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, "0")}${String(d.getUTCDate()).padStart(2, "0")}`
  const rand = Math.random().toString(36).slice(2, 7).toUpperCase()
  // MT799 :20: is limited to 16 characters.
  return `JT${ymd}${rand}`.slice(0, 16)
}

export async function saveLegalMessage(m: LegalDeskMessage): Promise<void> {
  await ensureTable()
  await query(
    `INSERT INTO legal_desk_messages (id, user_id, client_label, instrument_ref, transaction_ref, to_emails, cc_emails,
       recipient_name, subject, transaction_reference, related_reference, narrative, from_email, status, provider_id, error, sent_by, created_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18)`,
    [
      m.id, m.userId, m.clientLabel, m.instrumentRef, m.transactionRef, m.toEmails, m.ccEmails,
      m.recipientName, m.subject, m.transactionReference, m.relatedReference, m.narrative, m.fromEmail,
      m.status, m.providerId, m.error, m.sentBy, m.createdAt,
    ],
  )
}

export async function listLegalMessages(limit = 200): Promise<LegalDeskMessage[]> {
  await ensureTable()
  const res = await query<Row>(`SELECT * FROM legal_desk_messages ORDER BY created_at DESC LIMIT $1`, [limit])
  return res.rows.map(toMessage)
}
