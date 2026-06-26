import "server-only"

import { query } from "@/lib/db"
import type { UIMessage } from "ai"

/**
 * Server-only persistence for NQAi conversations. Each user has exactly ONE
 * rolling conversation that continues across sessions:
 *  - `messages` is the full UIMessage transcript (capped) reloaded on login so
 *    the chat picks up where the client left off.
 *  - `summary` is a compact, rolling "long-term memory" the model reads each
 *    turn so it remembers prior sessions without us replaying the whole
 *    transcript (bounding token cost).
 *
 * Strictly scoped by user id; one client can never read another's history.
 */

export interface StoredNqaiChat {
  messages: UIMessage[]
  summary: string
  /**
   * Durable per-user personalization profile: learned preferences, business
   * focus, recurring needs and communication style accumulated ACROSS sessions.
   * Distinct from `summary` (which is the volatile "what we were just
   * discussing" memory) — this is long-term learning and survives a
   * "New conversation" reset so NQAi keeps getting more tailored to the client.
   */
  profileNotes: string
  updatedAt: string | null
}

/** Hard cap on persisted transcript length to keep rows bounded. */
export const NQAI_MAX_STORED_MESSAGES = 200

let ensured = false

async function ensureTable(): Promise<void> {
  if (ensured) return
  await query(
    `CREATE TABLE IF NOT EXISTS nqai_chats (
       user_id       text        PRIMARY KEY,
       messages      jsonb       NOT NULL DEFAULT '[]'::jsonb,
       summary       text        NOT NULL DEFAULT '',
       profile_notes text        NOT NULL DEFAULT '',
       updated_at    timestamptz NOT NULL DEFAULT now()
     )`,
  )
  // Migration for pre-existing rows that predate the personalization profile.
  await query(`ALTER TABLE nqai_chats ADD COLUMN IF NOT EXISTS profile_notes text NOT NULL DEFAULT ''`)
  ensured = true
}

/** Load a user's stored conversation. Returns empty defaults when none exists. */
export async function loadNqaiChat(userId: string): Promise<StoredNqaiChat> {
  if (!userId) return { messages: [], summary: "", profileNotes: "", updatedAt: null }
  await ensureTable()
  const { rows } = await query(
    `SELECT messages, summary, profile_notes, updated_at FROM nqai_chats WHERE user_id = $1`,
    [userId],
  )
  if (!rows.length) return { messages: [], summary: "", profileNotes: "", updatedAt: null }
  const row = rows[0] as Record<string, unknown>
  const messages = Array.isArray(row.messages) ? (row.messages as UIMessage[]) : []
  return {
    messages,
    summary: String(row.summary ?? ""),
    profileNotes: String(row.profile_notes ?? ""),
    updatedAt: row.updated_at ? new Date(row.updated_at as string).toISOString() : null,
  }
}

/** Persist a user's conversation transcript (capped) and optional summary. */
export async function saveNqaiChat(
  userId: string,
  messages: UIMessage[],
  summary?: string,
): Promise<void> {
  if (!userId) return
  await ensureTable()
  const capped = messages.slice(-NQAI_MAX_STORED_MESSAGES)
  if (summary === undefined) {
    await query(
      `INSERT INTO nqai_chats (user_id, messages, updated_at)
         VALUES ($1, $2::jsonb, now())
       ON CONFLICT (user_id)
         DO UPDATE SET messages = EXCLUDED.messages, updated_at = now()`,
      [userId, JSON.stringify(capped)],
    )
  } else {
    await query(
      `INSERT INTO nqai_chats (user_id, messages, summary, updated_at)
         VALUES ($1, $2::jsonb, $3, now())
       ON CONFLICT (user_id)
         DO UPDATE SET messages = EXCLUDED.messages, summary = EXCLUDED.summary, updated_at = now()`,
      [userId, JSON.stringify(capped), summary],
    )
  }
}

/** Update only the rolling memory summary. */
export async function saveNqaiSummary(userId: string, summary: string): Promise<void> {
  if (!userId) return
  await ensureTable()
  await query(
    `INSERT INTO nqai_chats (user_id, summary, updated_at)
       VALUES ($1, $2, now())
     ON CONFLICT (user_id)
       DO UPDATE SET summary = EXCLUDED.summary, updated_at = now()`,
    [userId, summary],
  )
}

/** Persist only the durable per-user personalization profile. */
export async function saveNqaiProfile(userId: string, profileNotes: string): Promise<void> {
  if (!userId) return
  await ensureTable()
  await query(
    `INSERT INTO nqai_chats (user_id, profile_notes, updated_at)
       VALUES ($1, $2, now())
     ON CONFLICT (user_id)
       DO UPDATE SET profile_notes = EXCLUDED.profile_notes, updated_at = now()`,
    [userId, profileNotes],
  )
}

/**
 * Reset a user's NQAi thread for "New conversation": clears the transcript and
 * the volatile rolling memory, but PRESERVES the durable personalization
 * profile so long-term learning about the client carries across conversations.
 */
export async function clearNqaiChat(userId: string): Promise<void> {
  if (!userId) return
  await ensureTable()
  await query(
    `UPDATE nqai_chats SET messages = '[]'::jsonb, summary = '', updated_at = now() WHERE user_id = $1`,
    [userId],
  )
}
