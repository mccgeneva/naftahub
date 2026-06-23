// ---------------------------------------------------------------------------
// Biometric storage — server-only. Lives in dedicated columns on `admin_users`
// that are NEVER included in `rowToRecord`/`DynamicUserRecord`, so encrypted
// face data can never be serialized to a client or leaked through the profile.
// ---------------------------------------------------------------------------

import "server-only"
import { query } from "@/lib/db"
import { FACE_MAX_FAILS } from "@/lib/biometric"

let ensured = false
async function ensureColumns(): Promise<void> {
  if (ensured) return
  // Idempotent migration. `admin_users` is created in lib/admin-users-db.ts;
  // here we only add the biometric columns if they don't yet exist.
  await query(`ALTER TABLE admin_users ADD COLUMN IF NOT EXISTS face_descriptor text`)
  await query(`ALTER TABLE admin_users ADD COLUMN IF NOT EXISTS face_fail_count integer NOT NULL DEFAULT 0`)
  await query(`ALTER TABLE admin_users ADD COLUMN IF NOT EXISTS face_locked boolean NOT NULL DEFAULT false`)
  await query(`ALTER TABLE admin_users ADD COLUMN IF NOT EXISTS face_enrolled_at timestamptz`)
  ensured = true
}

export interface FaceState {
  enrolled: boolean
  locked: boolean
  failCount: number
  enrolledAt: string | null
}

/** Lightweight enrollment status for UI and login gating (no descriptor data). */
export async function getFaceState(userId: string): Promise<FaceState> {
  if (!userId) return { enrolled: false, locked: false, failCount: 0, enrolledAt: null }
  await ensureColumns()
  const { rows } = await query(
    `SELECT face_descriptor, face_fail_count, face_locked, face_enrolled_at FROM admin_users WHERE id = $1`,
    [userId],
  )
  const row = rows[0]
  if (!row) return { enrolled: false, locked: false, failCount: 0, enrolledAt: null }
  return {
    enrolled: !!row.face_descriptor,
    locked: !!row.face_locked,
    failCount: (row.face_fail_count as number) ?? 0,
    enrolledAt: (row.face_enrolled_at as Date)?.toISOString?.() ?? (row.face_enrolled_at as string | null),
  }
}

/** The raw encrypted descriptor blob — server-side use only (login verify). */
export async function getEncryptedDescriptor(userId: string): Promise<string | null> {
  if (!userId) return null
  await ensureColumns()
  const { rows } = await query(`SELECT face_descriptor FROM admin_users WHERE id = $1`, [userId])
  return (rows[0]?.face_descriptor as string | null) ?? null
}

/** Store (or replace) a user's encrypted enrollment and reset lock/fail state. */
export async function saveEncryptedDescriptor(userId: string, blob: string): Promise<void> {
  await ensureColumns()
  await query(
    `UPDATE admin_users
        SET face_descriptor = $2, face_fail_count = 0, face_locked = false,
            face_enrolled_at = now(), updated_at = now()
      WHERE id = $1`,
    [userId, blob],
  )
}

/** Remove a user's enrollment entirely and clear lock/fail state (admin reset / self-disable). */
export async function clearEnrollment(userId: string): Promise<void> {
  await ensureColumns()
  await query(
    `UPDATE admin_users
        SET face_descriptor = NULL, face_fail_count = 0, face_locked = false,
            face_enrolled_at = NULL, updated_at = now()
      WHERE id = $1`,
    [userId],
  )
}

/** Reset the consecutive-failure counter after a successful match. */
export async function resetFailCount(userId: string): Promise<void> {
  await ensureColumns()
  await query(`UPDATE admin_users SET face_fail_count = 0 WHERE id = $1`, [userId])
}

/**
 * Record a failed scan. Increments the counter and, once it reaches the limit,
 * LOCKS biometric login (which then requires an administrator reset). Returns
 * the new state so the caller can message the user appropriately.
 */
export async function registerFailure(userId: string): Promise<{ failCount: number; locked: boolean }> {
  await ensureColumns()
  const { rows } = await query(
    `UPDATE admin_users
        SET face_fail_count = face_fail_count + 1,
            face_locked = (face_fail_count + 1) >= $2,
            updated_at = now()
      WHERE id = $1
      RETURNING face_fail_count, face_locked`,
    [userId, FACE_MAX_FAILS],
  )
  const row = rows[0]
  return { failCount: (row?.face_fail_count as number) ?? 0, locked: !!row?.face_locked }
}
