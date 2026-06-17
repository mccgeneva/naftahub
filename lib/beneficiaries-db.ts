import "server-only"
import { pool } from "@/lib/db"

/**
 * Server-side persistence for client beneficiaries.
 *
 * Beneficiaries were originally a per-browser localStorage list. To let
 * administrators add / edit / remove / approve beneficiaries on behalf of any
 * client (and to make the data durable across devices), they are now persisted
 * in Neon, keyed by the owning user's id. The client store hydrates from here
 * and mirrors writes back, falling back to localStorage when the DB is
 * unavailable (e.g. local dev without DATABASE_URL).
 *
 * The full beneficiary object is stored as JSONB so the rich KYC/AML shape in
 * lib/beneficiaries-store.tsx can evolve without migrations.
 */

let ready: Promise<void> | null = null

async function ensureTable(): Promise<void> {
  if (!ready) {
    ready = (async () => {
      await pool.query(`
        CREATE TABLE IF NOT EXISTS client_beneficiaries (
          id           TEXT PRIMARY KEY,
          user_id      TEXT NOT NULL,
          data         JSONB NOT NULL,
          status       TEXT NOT NULL DEFAULT 'active',
          created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
          updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
        );
      `)
      await pool.query(`CREATE INDEX IF NOT EXISTS client_beneficiaries_user_idx ON client_beneficiaries (user_id);`)
    })().catch((err) => {
      ready = null
      throw err
    })
  }
  return ready
}

export interface StoredBeneficiary {
  id: string
  userId: string
  data: Record<string, unknown>
  status: string
  createdAt: string
  updatedAt: string
}

function toStored(row: Record<string, unknown>): StoredBeneficiary {
  return {
    id: row.id as string,
    userId: row.user_id as string,
    data: row.data as Record<string, unknown>,
    status: row.status as string,
    createdAt: (row.created_at as Date).toISOString(),
    updatedAt: (row.updated_at as Date).toISOString(),
  }
}

/** List all beneficiaries belonging to a single user. */
export async function listBeneficiariesForUser(userId: string): Promise<StoredBeneficiary[]> {
  await ensureTable()
  const { rows } = await pool.query(
    `SELECT * FROM client_beneficiaries WHERE user_id = $1 ORDER BY created_at DESC`,
    [userId],
  )
  return rows.map(toStored)
}

/** Insert or update a single beneficiary for a user. */
export async function upsertBeneficiary(
  userId: string,
  id: string,
  data: Record<string, unknown>,
  status: string,
): Promise<StoredBeneficiary> {
  await ensureTable()
  const { rows } = await pool.query(
    `INSERT INTO client_beneficiaries (id, user_id, data, status, updated_at)
     VALUES ($1, $2, $3::jsonb, $4, now())
     ON CONFLICT (id) DO UPDATE
       SET data = EXCLUDED.data,
           status = EXCLUDED.status,
           updated_at = now()
     RETURNING *`,
    [id, userId, JSON.stringify(data), status],
  )
  return toStored(rows[0])
}

/** Replace the entire beneficiary set for a user (used by client mirror sync). */
export async function replaceBeneficiariesForUser(
  userId: string,
  items: { id: string; data: Record<string, unknown>; status: string }[],
): Promise<void> {
  await ensureTable()
  const client = await pool.connect()
  try {
    await client.query("BEGIN")
    await client.query(`DELETE FROM client_beneficiaries WHERE user_id = $1`, [userId])
    for (const item of items) {
      await client.query(
        `INSERT INTO client_beneficiaries (id, user_id, data, status)
         VALUES ($1, $2, $3::jsonb, $4)`,
        [item.id, userId, JSON.stringify(item.data), item.status],
      )
    }
    await client.query("COMMIT")
  } catch (err) {
    await client.query("ROLLBACK")
    throw err
  } finally {
    client.release()
  }
}

/** Update only the status of one beneficiary (approve / suspend / block). */
export async function setBeneficiaryStatus(id: string, status: string): Promise<StoredBeneficiary | null> {
  await ensureTable()
  const { rows } = await pool.query(
    `UPDATE client_beneficiaries
       SET status = $2,
           data = jsonb_set(data, '{status}', to_jsonb($2::text)),
           updated_at = now()
     WHERE id = $1
     RETURNING *`,
    [id, status],
  )
  return rows[0] ? toStored(rows[0]) : null
}

/** Delete a single beneficiary by id. */
export async function deleteBeneficiary(id: string): Promise<void> {
  await ensureTable()
  await pool.query(`DELETE FROM client_beneficiaries WHERE id = $1`, [id])
}
