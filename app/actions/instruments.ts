"use server"

import { query } from "@/lib/db"
import { type UserProfile } from "@/lib/users"
import { resolveCurrentSession } from "@/lib/session-user"
import type { Instrument } from "@/lib/instrument-requests-store"

async function getSessionUser(): Promise<UserProfile | undefined> {
  const session = await resolveCurrentSession()
  return session?.profile
}

function rowToInstrument(row: Record<string, unknown>): Instrument {
  const payload = (row.payload as Instrument) ?? ({} as Instrument)
  return {
    ...payload,
    id: row.request_id as string,
    status: (row.status as Instrument["status"]) ?? payload.status,
  }
}

async function readInstruments(userId: string): Promise<Instrument[]> {
  const { rows } = await query(
    `SELECT * FROM instrument_requests WHERE user_id = $1 ORDER BY submitted_at DESC NULLS LAST`,
    [userId],
  )
  return rows.map(rowToInstrument)
}

/** Return the signed-in user's instrument requests. */
export async function getMyInstruments(): Promise<Instrument[]> {
  const user = await getSessionUser()
  if (!user) return []
  try {
    return await readInstruments(user.id)
  } catch (err) {
    console.log("[v0] getMyInstruments query failed:", (err as Error).message)
    return []
  }
}

/** Insert or update a single instrument request for the signed-in user. */
export async function saveInstrumentRequest(instrument: Instrument): Promise<{ ok: boolean }> {
  const user = await getSessionUser()
  if (!user) return { ok: false }
  try {
    await query(
      `INSERT INTO instrument_requests
         (user_id, request_id, status, submitted_at, decided_at, updated_at, payload)
       VALUES ($1,$2,$3,$4,$5,now(),$6::jsonb)
       ON CONFLICT (user_id, request_id) DO UPDATE SET
         status = EXCLUDED.status,
         submitted_at = EXCLUDED.submitted_at,
         decided_at = EXCLUDED.decided_at,
         updated_at = now(),
         payload = EXCLUDED.payload`,
      [
        user.id,
        instrument.id,
        instrument.status,
        instrument.submittedAt ?? null,
        instrument.decidedAt ?? null,
        JSON.stringify(instrument),
      ],
    )
    return { ok: true }
  } catch (err) {
    console.log("[v0] saveInstrumentRequest failed:", (err as Error).message)
    return { ok: false }
  }
}

/** Remove a single instrument request for the signed-in user. */
export async function removeInstrumentRequest(requestId: string): Promise<{ ok: boolean }> {
  const user = await getSessionUser()
  if (!user) return { ok: false }
  try {
    await query(`DELETE FROM instrument_requests WHERE user_id = $1 AND request_id = $2`, [
      user.id,
      requestId,
    ])
    return { ok: true }
  } catch (err) {
    console.log("[v0] removeInstrumentRequest failed:", (err as Error).message)
    return { ok: false }
  }
}
