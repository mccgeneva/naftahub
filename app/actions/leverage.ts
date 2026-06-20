"use server"

import { query } from "@/lib/db"
import { resolveCurrentSession } from "@/lib/session-user"
import type { LeverageRequest } from "@/lib/leverage-requests-store"

/** Id whose leverage book this session operates on — the Master's id for a
 *  Sub-account (leverage draws against the shared balance), else own id. */
async function getDataOwnerId(): Promise<string | undefined> {
  const session = await resolveCurrentSession()
  return session?.dataOwnerId
}

function rowToRequest(row: Record<string, unknown>): LeverageRequest {
  // The full request object is stored in the jsonb payload; promoted columns
  // (status/timestamps) are authoritative and overlaid on read.
  const payload = (row.payload as LeverageRequest) ?? ({} as LeverageRequest)
  return {
    ...payload,
    id: row.request_id as string,
    status: (row.status as LeverageRequest["status"]) ?? payload.status,
  }
}

async function readRequests(userId: string): Promise<LeverageRequest[]> {
  const { rows } = await query(
    `SELECT * FROM leverage_requests WHERE user_id = $1 ORDER BY submitted_at DESC NULLS LAST`,
    [userId],
  )
  return rows.map(rowToRequest)
}

/** Return the signed-in user's leverage requests (shared Master book for a sub). */
export async function getMyLeverage(): Promise<LeverageRequest[]> {
  const ownerId = await getDataOwnerId()
  if (!ownerId) return []
  try {
    return await readRequests(ownerId)
  } catch (err) {
    console.log("[v0] getMyLeverage query failed:", (err as Error).message)
    return []
  }
}

/** Insert or update a single leverage request for the signed-in user (shared
 *  Master book for a sub). */
export async function saveLeverageRequest(request: LeverageRequest): Promise<{ ok: boolean }> {
  const ownerId = await getDataOwnerId()
  if (!ownerId) return { ok: false }
  try {
    await query(
      `INSERT INTO leverage_requests
         (user_id, request_id, status, submitted_at, decided_at, closed_at, updated_at, payload)
       VALUES ($1,$2,$3,$4,$5,$6,now(),$7::jsonb)
       ON CONFLICT (user_id, request_id) DO UPDATE SET
         status = EXCLUDED.status,
         submitted_at = EXCLUDED.submitted_at,
         decided_at = EXCLUDED.decided_at,
         closed_at = EXCLUDED.closed_at,
         updated_at = now(),
         payload = EXCLUDED.payload`,
      [
        ownerId,
        request.id,
        request.status,
        request.submittedAt ?? null,
        request.decidedAt ?? null,
        request.closedAt ?? null,
        JSON.stringify(request),
      ],
    )
    return { ok: true }
  } catch (err) {
    console.log("[v0] saveLeverageRequest failed:", (err as Error).message)
    return { ok: false }
  }
}

/** Remove a single leverage request for the signed-in user (shared Master book
 *  for a sub). */
export async function removeLeverageRequest(requestId: string): Promise<{ ok: boolean }> {
  const ownerId = await getDataOwnerId()
  if (!ownerId) return { ok: false }
  try {
    await query(`DELETE FROM leverage_requests WHERE user_id = $1 AND request_id = $2`, [
      ownerId,
      requestId,
    ])
    return { ok: true }
  } catch (err) {
    console.log("[v0] removeLeverageRequest failed:", (err as Error).message)
    return { ok: false }
  }
}
