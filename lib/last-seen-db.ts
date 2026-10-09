import "server-only"
import { query } from "@/lib/db"

// "Last active" tracking: stamped whenever a signed-in client's app reads its
// ledger (which happens on open and every few seconds while in use), so a
// persistent "Stay signed in" session still shows when the client was really
// using the app — unlike the login selfie, which only updates on a full sign-in.

let ensured: Promise<void> | null = null

function ensureTable(): Promise<void> {
  if (!ensured) {
    ensured = query(
      `CREATE TABLE IF NOT EXISTS user_last_seen (
         user_id text PRIMARY KEY,
         last_seen_at timestamptz NOT NULL DEFAULT now(),
         ip text,
         user_agent text
       )`,
    )
      .then(() => undefined)
      .catch((err) => {
        ensured = null
        throw err
      })
  }
  return ensured
}

/** Best-effort, throttled to one write per user every 2 minutes. Never throws. */
export async function touchLastSeen(userId: string, ip?: string | null, userAgent?: string | null) {
  try {
    await ensureTable()
    await query(
      `INSERT INTO user_last_seen (user_id, last_seen_at, ip, user_agent)
       VALUES ($1, now(), $2, $3)
       ON CONFLICT (user_id) DO UPDATE
         SET last_seen_at = now(), ip = EXCLUDED.ip, user_agent = EXCLUDED.user_agent
       WHERE user_last_seen.last_seen_at < now() - interval '2 minutes'`,
      [userId, ip ?? null, userAgent?.slice(0, 300) ?? null],
    )
  } catch {
    // never block the caller
  }
}

export async function getLastSeen(
  userId: string,
): Promise<{ at: string; ip: string | null; userAgent: string | null } | null> {
  try {
    await ensureTable()
    const res = await query(`SELECT last_seen_at, ip, user_agent FROM user_last_seen WHERE user_id = $1`, [userId])
    const row = res.rows[0] as Record<string, unknown> | undefined
    if (!row) return null
    const at = row.last_seen_at instanceof Date ? row.last_seen_at.toISOString() : String(row.last_seen_at)
    return { at, ip: (row.ip as string) ?? null, userAgent: (row.user_agent as string) ?? null }
  } catch {
    return null
  }
}
