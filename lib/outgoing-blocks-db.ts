import "server-only"
import { query } from "@/lib/db"
import type { OutgoingBlockConfig } from "@/lib/outgoing-blocks-eval"

/**
 * Outgoing-block store.
 *
 * An administrator can suspend a SELECTED user's outgoing activity — payments &
 * transfers and/or trading & financing — for a period of time, with an
 * explanation captured at the moment the block is set. The block is keyed by the
 * user's account id (per-user only; there is no global outgoing block). Incoming
 * funds and instruments are never affected.
 *
 * A block optionally expires at `until`; enforcement/eval treats a past `until`
 * as inactive (see outgoing-blocks-eval). The row is left in place after expiry
 * so the admin can see the history and re-arm it.
 */

let ensured = false
async function ensureTable(): Promise<void> {
  if (ensured) return
  await query(
    `CREATE TABLE IF NOT EXISTS outgoing_blocks (
       user_id         text        PRIMARY KEY,
       block_payments  boolean     NOT NULL DEFAULT false,
       block_trades    boolean     NOT NULL DEFAULT false,
       reason          text        NOT NULL DEFAULT '',
       until           timestamptz,
       created_by      text,
       updated_at      timestamptz NOT NULL DEFAULT now()
     )`,
  )
  ensured = true
}

function rowToConfig(row: Record<string, unknown>): OutgoingBlockConfig {
  return {
    blockPayments: Boolean(row.block_payments),
    blockTrades: Boolean(row.block_trades),
    reason: (row.reason as string) || "",
    until: row.until ? new Date(row.until as string).toISOString() : null,
    createdBy: (row.created_by as string) || null,
    updatedAt: row.updated_at ? new Date(row.updated_at as string).toISOString() : null,
  }
}

/** Read a user's outgoing-block row. Null when no block was ever configured. */
export async function getOutgoingBlock(userId: string): Promise<OutgoingBlockConfig | null> {
  if (!userId) return null
  await ensureTable()
  const { rows } = await query(`SELECT * FROM outgoing_blocks WHERE user_id = $1`, [userId])
  return rows[0] ? rowToConfig(rows[0]) : null
}

/**
 * Upsert a user's outgoing block. Passing both scopes false effectively lifts
 * the block (kept as a row for history); use clearOutgoingBlock to delete it.
 */
export async function saveOutgoingBlock(
  userId: string,
  input: {
    blockPayments: boolean
    blockTrades: boolean
    reason: string
    until: string | null
    createdBy?: string | null
  },
): Promise<OutgoingBlockConfig> {
  await ensureTable()
  const until = input.until && !Number.isNaN(Date.parse(input.until)) ? new Date(input.until).toISOString() : null
  const { rows } = await query(
    `INSERT INTO outgoing_blocks (user_id, block_payments, block_trades, reason, until, created_by, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, now())
     ON CONFLICT (user_id) DO UPDATE SET
       block_payments = EXCLUDED.block_payments,
       block_trades   = EXCLUDED.block_trades,
       reason         = EXCLUDED.reason,
       until          = EXCLUDED.until,
       created_by     = EXCLUDED.created_by,
       updated_at     = now()
     RETURNING *`,
    [
      userId,
      !!input.blockPayments,
      !!input.blockTrades,
      (input.reason || "").slice(0, 2000),
      until,
      input.createdBy || null,
    ],
  )
  return rowToConfig(rows[0])
}

/** Remove a user's outgoing block entirely. */
export async function clearOutgoingBlock(userId: string): Promise<void> {
  if (!userId) return
  await ensureTable()
  await query(`DELETE FROM outgoing_blocks WHERE user_id = $1`, [userId])
}

/** Count users currently under an active outgoing block (for the admin badge). */
export async function countActiveOutgoingBlocks(): Promise<number> {
  await ensureTable()
  const { rows } = await query(
    `SELECT COUNT(*)::int AS n FROM outgoing_blocks
     WHERE (block_payments OR block_trades)
       AND (until IS NULL OR until > now())`,
  )
  return Number(rows[0]?.n ?? 0)
}
