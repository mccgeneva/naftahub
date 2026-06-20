"use server"

import { query } from "@/lib/db"
import { resolveCurrentSession } from "@/lib/session-user"
import type { Instrument } from "@/lib/instrument-requests-store"

/** Id whose instruments this session operates on — the Master's id for a
 *  Sub-account (shared bank instruments), otherwise the account's own id. */
async function getDataOwnerId(): Promise<string | undefined> {
  const session = await resolveCurrentSession()
  return session?.dataOwnerId
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

/** Return the signed-in user's instrument requests (the shared Master portfolio
 *  for a Sub-account). */
export async function getMyInstruments(): Promise<Instrument[]> {
  const ownerId = await getDataOwnerId()
  if (!ownerId) return []
  try {
    return await readInstruments(ownerId)
  } catch (err) {
    console.log("[v0] getMyInstruments query failed:", (err as Error).message)
    return []
  }
}

/** Insert or update a single instrument request for the signed-in user (shared
 *  Master portfolio for a sub). */
export async function saveInstrumentRequest(instrument: Instrument): Promise<{ ok: boolean }> {
  const ownerId = await getDataOwnerId()
  if (!ownerId) return { ok: false }
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
        ownerId,
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

/** Remove a single instrument request for the signed-in user (shared Master
 *  portfolio for a sub). */
export async function removeInstrumentRequest(requestId: string): Promise<{ ok: boolean }> {
  const ownerId = await getDataOwnerId()
  if (!ownerId) return { ok: false }
  try {
    await query(`DELETE FROM instrument_requests WHERE user_id = $1 AND request_id = $2`, [
      ownerId,
      requestId,
    ])
    return { ok: true }
  } catch (err) {
    console.log("[v0] removeInstrumentRequest failed:", (err as Error).message)
    return { ok: false }
  }
}
