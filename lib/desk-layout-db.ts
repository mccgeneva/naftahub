import "server-only"
import { query } from "@/lib/db"
import { normalizeDeskLayout, type DeskLayout } from "@/lib/desk-layout"

// Per-user persisted Trading Desk layout (tile count, which panel sits in each
// slot, the loaded security). One row per user — the user id is always the
// authenticated session id, so one account can never read or overwrite
// another's workspace.

let ready: Promise<void> | null = null

function ensureTable() {
  if (!ready) {
    ready = query(
      `CREATE TABLE IF NOT EXISTS trading_desk_layouts (
         user_id text PRIMARY KEY,
         layout jsonb NOT NULL,
         updated_at timestamptz NOT NULL DEFAULT now()
       )`,
    )
      .then(() => undefined)
      .catch((err) => {
        ready = null
        throw err
      })
  }
  return ready
}

export async function getDeskLayout(userId: string): Promise<DeskLayout | null> {
  try {
    await ensureTable()
    const res = await query<{ layout: unknown }>(
      `SELECT layout FROM trading_desk_layouts WHERE user_id = $1`,
      [userId],
    )
    const raw = res.rows[0]?.layout
    return raw ? normalizeDeskLayout(raw) : null
  } catch {
    return null
  }
}

export async function saveDeskLayout(userId: string, layout: DeskLayout): Promise<void> {
  await ensureTable()
  await query(
    `INSERT INTO trading_desk_layouts (user_id, layout, updated_at)
     VALUES ($1, $2::jsonb, now())
     ON CONFLICT (user_id) DO UPDATE SET layout = EXCLUDED.layout, updated_at = now()`,
    [userId, JSON.stringify(normalizeDeskLayout(layout))],
  )
}
