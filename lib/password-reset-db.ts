import "server-only"
import { createHash, randomBytes } from "node:crypto"
import { query } from "@/lib/db"

/** A reset link is valid for 30 minutes and can be used once. */
export const RESET_TOKEN_TTL_MS = 30 * 60 * 1000

let ensured = false
async function ensureTable(): Promise<void> {
  if (ensured) return
  await query(
    `CREATE TABLE IF NOT EXISTS password_reset_tokens (
       token_hash  text PRIMARY KEY,
       user_id     text NOT NULL,
       reason      text NOT NULL DEFAULT 'forgot',
       expires_at  timestamptz NOT NULL,
       used_at     timestamptz,
       created_at  timestamptz NOT NULL DEFAULT now()
     )`,
  )
  await query(`CREATE INDEX IF NOT EXISTS password_reset_tokens_user_idx ON password_reset_tokens (user_id)`)
  ensured = true
}

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex")
}

/**
 * Issue a fresh single-use token. Any earlier unused token for the same user is
 * invalidated so only the newest emailed link works. Only the hash is stored.
 */
export async function createResetToken(userId: string, reason: string): Promise<string> {
  await ensureTable()
  const token = randomBytes(32).toString("hex")
  await query(`UPDATE password_reset_tokens SET used_at = now() WHERE user_id = $1 AND used_at IS NULL`, [userId])
  await query(
    `INSERT INTO password_reset_tokens (token_hash, user_id, reason, expires_at) VALUES ($1, $2, $3, $4)`,
    [hashToken(token), userId, reason, new Date(Date.now() + RESET_TOKEN_TTL_MS)],
  )
  return token
}

/** Return the user id for a valid (unused, unexpired) token, or null. */
export async function findValidResetToken(token: string): Promise<string | null> {
  if (!token || !/^[a-f0-9]{64}$/.test(token)) return null
  await ensureTable()
  const { rows } = await query(
    `SELECT user_id FROM password_reset_tokens
      WHERE token_hash = $1 AND used_at IS NULL AND expires_at > now()`,
    [hashToken(token)],
  )
  return rows[0] ? (rows[0].user_id as string) : null
}

/** Atomically consume a token; returns the user id only if it was still valid. */
export async function consumeResetToken(token: string): Promise<string | null> {
  if (!token || !/^[a-f0-9]{64}$/.test(token)) return null
  await ensureTable()
  const { rows } = await query(
    `UPDATE password_reset_tokens SET used_at = now()
      WHERE token_hash = $1 AND used_at IS NULL AND expires_at > now()
      RETURNING user_id`,
    [hashToken(token)],
  )
  if (!rows[0]) return null
  const userId = rows[0].user_id as string
  await query(`UPDATE password_reset_tokens SET used_at = now() WHERE user_id = $1 AND used_at IS NULL`, [userId])
  return userId
}

/** Number of links issued to this user in the last hour (simple abuse limit). */
export async function countRecentResetTokens(userId: string): Promise<number> {
  await ensureTable()
  const { rows } = await query(
    `SELECT count(*)::int AS n FROM password_reset_tokens
      WHERE user_id = $1 AND created_at > now() - interval '1 hour'`,
    [userId],
  )
  return (rows[0]?.n as number) ?? 0
}
