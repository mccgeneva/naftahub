import "server-only"
import { query } from "@/lib/db"
import type { LedgerEntry } from "@/lib/ledger-store"

/**
 * Server-only helpers for the authoritative ledger, shared by the approvals
 * workflow so that approving a financial request (e.g. an outgoing payment)
 * actually moves the client's balance in Neon. The table definition mirrors the
 * one bootstrapped in app/actions/ledger.ts (CREATE IF NOT EXISTS is idempotent
 * so both entry points are safe).
 */

let ensured = false

async function ensureLedgerTable(): Promise<void> {
  if (ensured) return
  await query(
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

/** Insert or update a single ledger entry for a user. */
export async function upsertLedgerEntry(userId: string, entry: LedgerEntry): Promise<void> {
  await ensureLedgerTable()
  await query(
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
