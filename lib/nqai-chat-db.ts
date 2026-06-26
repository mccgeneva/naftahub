import "server-only"

import { query } from "@/lib/db"
import type { UIMessage } from "ai"

/**
 * Server-only persistence for NQAi conversations.
 *
 * MODEL (multi-thread):
 *  - `nqai_threads` holds many conversation THREADS per user. Each row is one
 *    chat: its full UIMessage transcript (capped), a rolling `summary` used as
 *    long-term memory, and a short `title` for the history card. Strictly scoped
 *    by `user_id` — every read/write filters on it, so one client can never see
 *    another's threads.
 *  - `nqai_chats` is now the per-USER store for the DURABLE personalization
 *    profile (learned preferences accumulated across ALL threads). It also
 *    retains the legacy single-conversation columns purely so existing chats can
 *    be migrated into a thread once (see migrateLegacyChat).
 */

export interface NqaiThreadSummary {
  id: string
  title: string
  messageCount: number
  /** The folder this thread lives in, or null when it sits at the root. */
  folderId: string | null
  createdAt: string
  updatedAt: string
}

/** A folder in the user's conversation tree (unlimited nesting via parentId). */
export interface NqaiFolder {
  id: string
  parentId: string | null
  name: string
  createdAt: string
  updatedAt: string
}

export interface StoredNqaiThread {
  id: string
  title: string
  messages: UIMessage[]
  summary: string
  updatedAt: string | null
}

/** Hard cap on persisted transcript length to keep rows bounded. */
export const NQAI_MAX_STORED_MESSAGES = 200

let ensured = false

async function ensureTables(): Promise<void> {
  if (ensured) return
  // Per-user store: durable personalization profile (+ legacy chat columns).
  await query(
    `CREATE TABLE IF NOT EXISTS nqai_chats (
       user_id       text        PRIMARY KEY,
       messages      jsonb       NOT NULL DEFAULT '[]'::jsonb,
       summary       text        NOT NULL DEFAULT '',
       profile_notes text        NOT NULL DEFAULT '',
       updated_at    timestamptz NOT NULL DEFAULT now()
     )`,
  )
  await query(`ALTER TABLE nqai_chats ADD COLUMN IF NOT EXISTS profile_notes text NOT NULL DEFAULT ''`)

  // Per-thread store: many conversations per user.
  await query(
    `CREATE TABLE IF NOT EXISTS nqai_threads (
       id         text        PRIMARY KEY,
       user_id    text        NOT NULL,
       title      text        NOT NULL DEFAULT '',
       messages   jsonb       NOT NULL DEFAULT '[]'::jsonb,
       summary    text        NOT NULL DEFAULT '',
       folder_id  text,
       created_at timestamptz NOT NULL DEFAULT now(),
       updated_at timestamptz NOT NULL DEFAULT now()
     )`,
  )
  // Folder placement for threads (null = root / "Unfiled"). Added for existing DBs.
  await query(`ALTER TABLE nqai_threads ADD COLUMN IF NOT EXISTS folder_id text`)
  // Fast history listing: newest threads first, scoped by user.
  await query(
    `CREATE INDEX IF NOT EXISTS nqai_threads_user_updated_idx ON nqai_threads (user_id, updated_at DESC)`,
  )

  // Folder tree: unlimited nesting via self-referencing parent_id (null = root).
  // Strictly scoped by user_id like every other NQAi table.
  await query(
    `CREATE TABLE IF NOT EXISTS nqai_folders (
       id         text        PRIMARY KEY,
       user_id    text        NOT NULL,
       parent_id  text,
       name       text        NOT NULL DEFAULT 'New folder',
       created_at timestamptz NOT NULL DEFAULT now(),
       updated_at timestamptz NOT NULL DEFAULT now()
     )`,
  )
  await query(`CREATE INDEX IF NOT EXISTS nqai_folders_user_parent_idx ON nqai_folders (user_id, parent_id)`)
  ensured = true
}

/**
 * One-time, idempotent migration: fold a user's pre-existing single
 * conversation (from `nqai_chats`) into a thread so history isn't lost when we
 * switch to the multi-thread model. Runs only while the user has zero threads;
 * once migrated, the legacy transcript is cleared so it can't be re-imported if
 * the user later deletes all their threads.
 */
async function migrateLegacyChat(userId: string): Promise<void> {
  await query(
    `INSERT INTO nqai_threads (id, user_id, title, summary, messages, created_at, updated_at)
       SELECT 'legacy-' || c.user_id, c.user_id, '', c.summary, c.messages, c.updated_at, c.updated_at
       FROM nqai_chats c
       WHERE c.user_id = $1
         AND jsonb_array_length(c.messages) > 0
         AND NOT EXISTS (SELECT 1 FROM nqai_threads t WHERE t.user_id = $1)
     ON CONFLICT (id) DO NOTHING`,
    [userId],
  )
  // Clear the legacy transcript (keep the profile) so we never double-migrate.
  await query(
    `UPDATE nqai_chats SET messages = '[]'::jsonb, summary = '' WHERE user_id = $1 AND jsonb_array_length(messages) > 0`,
    [userId],
  )
}

// ---------------------------------------------------------------------------
// Threads
// ---------------------------------------------------------------------------

/** List a user's conversation threads, newest first (metadata only — fast). */
export async function listNqaiThreads(userId: string): Promise<NqaiThreadSummary[]> {
  if (!userId) return []
  await ensureTables()
  await migrateLegacyChat(userId).catch(() => {})
  const { rows } = await query(
    `SELECT id, title, jsonb_array_length(messages) AS message_count, folder_id, created_at, updated_at
       FROM nqai_threads
       WHERE user_id = $1
       ORDER BY updated_at DESC`,
    [userId],
  )
  return rows.map((r) => {
    const row = r as Record<string, unknown>
    return {
      id: String(row.id),
      title: String(row.title ?? ""),
      messageCount: Number(row.message_count ?? 0),
      folderId: row.folder_id ? String(row.folder_id) : null,
      createdAt: row.created_at ? new Date(row.created_at as string).toISOString() : "",
      updatedAt: row.updated_at ? new Date(row.updated_at as string).toISOString() : "",
    }
  })
}

/** Load a single thread's transcript + memory, scoped to its owner. */
export async function loadNqaiThread(userId: string, threadId: string): Promise<StoredNqaiThread | null> {
  if (!userId || !threadId) return null
  await ensureTables()
  const { rows } = await query(
    `SELECT id, title, messages, summary, updated_at FROM nqai_threads WHERE id = $1 AND user_id = $2`,
    [threadId, userId],
  )
  if (!rows.length) return null
  const row = rows[0] as Record<string, unknown>
  return {
    id: String(row.id),
    title: String(row.title ?? ""),
    messages: Array.isArray(row.messages) ? (row.messages as UIMessage[]) : [],
    summary: String(row.summary ?? ""),
    updatedAt: row.updated_at ? new Date(row.updated_at as string).toISOString() : null,
  }
}

/**
 * Upsert a thread's transcript (capped) and optionally its rolling summary
 * and/or title. The thread id is client-supplied but ALWAYS namespaced under
 * the session user id, so a guessed/foreign id can only ever create or touch a
 * row owned by the caller — never read or overwrite another user's thread.
 */
export async function saveNqaiThread(
  userId: string,
  threadId: string,
  messages: UIMessage[],
  opts?: { summary?: string; title?: string },
): Promise<void> {
  if (!userId || !threadId) return
  await ensureTables()
  const capped = messages.slice(-NQAI_MAX_STORED_MESSAGES)
  const title = opts?.title
  const summary = opts?.summary

  // Build the UPDATE set dynamically so we only overwrite what's provided.
  await query(
    `INSERT INTO nqai_threads (id, user_id, title, messages, summary, created_at, updated_at)
       VALUES ($1, $2, $3, $4::jsonb, $5, now(), now())
     ON CONFLICT (id) DO UPDATE SET
       messages   = EXCLUDED.messages,
       title      = CASE WHEN $6 THEN EXCLUDED.title ELSE nqai_threads.title END,
       summary    = CASE WHEN $7 THEN EXCLUDED.summary ELSE nqai_threads.summary END,
       updated_at = now()
     WHERE nqai_threads.user_id = $2`,
    [threadId, userId, title ?? "", JSON.stringify(capped), summary ?? "", title !== undefined, summary !== undefined],
  )
}

/** Rename a thread (used when the model generates a better title). */
export async function renameNqaiThread(userId: string, threadId: string, title: string): Promise<void> {
  if (!userId || !threadId) return
  await ensureTables()
  await query(`UPDATE nqai_threads SET title = $3, updated_at = updated_at WHERE id = $1 AND user_id = $2`, [
    threadId,
    userId,
    title.slice(0, 120),
  ])
}

/** Permanently delete a thread, scoped to its owner. */
export async function deleteNqaiThread(userId: string, threadId: string): Promise<void> {
  if (!userId || !threadId) return
  await ensureTables()
  await query(`DELETE FROM nqai_threads WHERE id = $1 AND user_id = $2`, [threadId, userId])
}

/** Derive a short fallback title from the first user message in a thread. */
export function deriveThreadTitle(messages: UIMessage[]): string {
  const firstUser = messages.find((m) => m.role === "user")
  if (!firstUser) return "New conversation"
  const text = (firstUser.parts ?? [])
    .filter((p): p is { type: "text"; text: string } => (p as { type?: string }).type === "text")
    .map((p) => p.text)
    .join(" ")
    .trim()
  if (!text) return "New conversation"
  const clean = text.replace(/\s+/g, " ")
  return clean.length > 60 ? `${clean.slice(0, 57)}…` : clean
}

/** Move a thread into a folder (or to the root when folderId is null). */
export async function moveNqaiThread(
  userId: string,
  threadId: string,
  folderId: string | null,
): Promise<void> {
  if (!userId || !threadId) return
  await ensureTables()
  // If targeting a folder, verify it belongs to the caller — otherwise drop to root.
  let target: string | null = null
  if (folderId) {
    const { rows } = await query(`SELECT 1 FROM nqai_folders WHERE id = $1 AND user_id = $2`, [folderId, userId])
    target = rows.length ? folderId : null
  }
  await query(`UPDATE nqai_threads SET folder_id = $3, updated_at = updated_at WHERE id = $1 AND user_id = $2`, [
    threadId,
    userId,
    target,
  ])
}

// ---------------------------------------------------------------------------
// Folders (unlimited nesting, strictly per-user)
// ---------------------------------------------------------------------------

function mapFolder(row: Record<string, unknown>): NqaiFolder {
  return {
    id: String(row.id),
    parentId: row.parent_id ? String(row.parent_id) : null,
    name: String(row.name ?? ""),
    createdAt: row.created_at ? new Date(row.created_at as string).toISOString() : "",
    updatedAt: row.updated_at ? new Date(row.updated_at as string).toISOString() : "",
  }
}

/** List all of a user's folders (the client builds the tree from parentId). */
export async function listNqaiFolders(userId: string): Promise<NqaiFolder[]> {
  if (!userId) return []
  await ensureTables()
  const { rows } = await query(
    `SELECT id, parent_id, name, created_at, updated_at FROM nqai_folders WHERE user_id = $1 ORDER BY name ASC`,
    [userId],
  )
  return rows.map((r) => mapFolder(r as Record<string, unknown>))
}

/** Create a folder. parentId, when given, must belong to the caller. */
export async function createNqaiFolder(
  userId: string,
  name: string,
  parentId: string | null,
): Promise<NqaiFolder | null> {
  if (!userId) return null
  await ensureTables()
  let parent: string | null = null
  if (parentId) {
    const { rows } = await query(`SELECT 1 FROM nqai_folders WHERE id = $1 AND user_id = $2`, [parentId, userId])
    parent = rows.length ? parentId : null
  }
  const id = `f-${globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`}`
  const cleanName = (name || "New folder").trim().slice(0, 80) || "New folder"
  const { rows } = await query(
    `INSERT INTO nqai_folders (id, user_id, parent_id, name) VALUES ($1, $2, $3, $4)
       RETURNING id, parent_id, name, created_at, updated_at`,
    [id, userId, parent, cleanName],
  )
  return rows.length ? mapFolder(rows[0] as Record<string, unknown>) : null
}

/** Rename a folder, scoped to its owner. */
export async function renameNqaiFolder(userId: string, folderId: string, name: string): Promise<void> {
  if (!userId || !folderId) return
  await ensureTables()
  const cleanName = (name || "").trim().slice(0, 80)
  if (!cleanName) return
  await query(`UPDATE nqai_folders SET name = $3, updated_at = now() WHERE id = $1 AND user_id = $2`, [
    folderId,
    userId,
    cleanName,
  ])
}

/**
 * Delete a folder WITHOUT destroying its contents: any threads and subfolders it
 * directly contains are re-parented UP to the deleted folder's own parent (root
 * if it had none). This makes deletion safe — chats are never lost, just lifted
 * one level. Scoped to the owner throughout.
 */
export async function deleteNqaiFolder(userId: string, folderId: string): Promise<void> {
  if (!userId || !folderId) return
  await ensureTables()
  const { rows } = await query(`SELECT parent_id FROM nqai_folders WHERE id = $1 AND user_id = $2`, [folderId, userId])
  if (!rows.length) return
  const parentId = (rows[0] as Record<string, unknown>).parent_id
  const newParent = parentId ? String(parentId) : null
  // Lift child folders and threads to the deleted folder's parent.
  await query(`UPDATE nqai_folders SET parent_id = $3, updated_at = now() WHERE parent_id = $1 AND user_id = $2`, [
    folderId,
    userId,
    newParent,
  ])
  await query(`UPDATE nqai_threads SET folder_id = $3 WHERE folder_id = $1 AND user_id = $2`, [
    folderId,
    userId,
    newParent,
  ])
  await query(`DELETE FROM nqai_folders WHERE id = $1 AND user_id = $2`, [folderId, userId])
}

/**
 * Re-parent a folder. Guards against cycles: the new parent may not be the
 * folder itself or any of its descendants (which would detach a subtree).
 */
export async function moveNqaiFolder(
  userId: string,
  folderId: string,
  newParentId: string | null,
): Promise<{ ok: boolean }> {
  if (!userId || !folderId) return { ok: false }
  await ensureTables()
  if (newParentId === folderId) return { ok: false }

  const all = await listNqaiFolders(userId)
  const byId = new Map(all.map((f) => [f.id, f]))
  if (!byId.has(folderId)) return { ok: false }
  if (newParentId && !byId.has(newParentId)) return { ok: false }

  // Walk up from the proposed parent; if we reach folderId, it's a cycle.
  let cursor: string | null = newParentId
  let guard = 0
  while (cursor && guard++ < 1000) {
    if (cursor === folderId) return { ok: false }
    cursor = byId.get(cursor)?.parentId ?? null
  }

  await query(`UPDATE nqai_folders SET parent_id = $3, updated_at = now() WHERE id = $1 AND user_id = $2`, [
    folderId,
    userId,
    newParentId,
  ])
  return { ok: true }
}

// ---------------------------------------------------------------------------
// Per-user durable personalization profile (shared across all threads)
// ---------------------------------------------------------------------------

/** Load the user's durable personalization profile. */
export async function loadNqaiProfile(userId: string): Promise<string> {
  if (!userId) return ""
  await ensureTables()
  const { rows } = await query(`SELECT profile_notes FROM nqai_chats WHERE user_id = $1`, [userId])
  if (!rows.length) return ""
  return String((rows[0] as Record<string, unknown>).profile_notes ?? "")
}

/** Persist the durable per-user personalization profile. */
export async function saveNqaiProfile(userId: string, profileNotes: string): Promise<void> {
  if (!userId) return
  await ensureTables()
  await query(
    `INSERT INTO nqai_chats (user_id, profile_notes, updated_at)
       VALUES ($1, $2, now())
     ON CONFLICT (user_id)
       DO UPDATE SET profile_notes = EXCLUDED.profile_notes, updated_at = now()`,
    [userId, profileNotes],
  )
}
