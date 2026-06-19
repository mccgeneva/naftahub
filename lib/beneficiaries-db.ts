import "server-only"
import { pool, query } from "@/lib/db"

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
      await query(`
        CREATE TABLE IF NOT EXISTS client_beneficiaries (
          id           TEXT PRIMARY KEY,
          user_id      TEXT NOT NULL,
          data         JSONB NOT NULL,
          status       TEXT NOT NULL DEFAULT 'active',
          created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
          updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
        );
      `)
      await query(`CREATE INDEX IF NOT EXISTS client_beneficiaries_user_idx ON client_beneficiaries (user_id);`)
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
  const { rows } = await query(
    `SELECT * FROM client_beneficiaries WHERE user_id = $1 ORDER BY created_at DESC`,
    [userId],
  )
  return rows.map(toStored)
}

/**
 * List every beneficiary still awaiting a KYC decision, across all clients.
 *
 * A beneficiary is "awaiting a decision" only while its status is "pending" —
 * this is the exact figure the BeneficiaryManager surfaces to the admin as
 * "N beneficiaries awaiting approval" and the only state that exposes an
 * approve/reject control. Once the admin decides (active = approved, or
 * suspended/blocked = rejected) it is no longer actionable.
 *
 * NOTE: we deliberately do NOT also count `kycVerified = false`. An already
 * active beneficiary that happens to lack a `kycVerified: true` flag (legacy or
 * edge-case data) is shown as "active" in the UI with nothing to approve, so
 * counting it created a phantom "awaiting a decision" item the admin could
 * never clear. Matching the UI's definition keeps the command-center count and
 * the section in lock step.
 */
export async function listPendingKycBeneficiaries(): Promise<StoredBeneficiary[]> {
  await ensureTable()
  const { rows } = await query(
    `SELECT * FROM client_beneficiaries
       WHERE status = 'pending'
     ORDER BY created_at ASC`,
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
  const { rows } = await query(
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

/**
 * Reconcile the client's beneficiary set with the server (used by the client
 * mirror sync).
 *
 * IMPORTANT: compliance is administrator-owned. The client app's local copy
 * always reports `status: "pending"`, `kycVerified: false` and no AML date, so a
 * naive replace would clobber an admin's approval every time the client synced —
 * reverting KYC back to "Pending". To prevent that, this performs a MERGE:
 *
 *   - For a beneficiary that already exists on the server, we keep the server's
 *     `status` and the server's compliance subfields (`kycVerified`,
 *     `amlScreeningDate`, `riskLevel`), while accepting the client's edits to
 *     every other field (name, bank details, notes, favorite, etc.).
 *   - Brand-new beneficiaries (not yet on the server) are inserted as sent.
 *   - Beneficiaries the client removed (absent from `items`) are deleted.
 */
export async function replaceBeneficiariesForUser(
  userId: string,
  items: { id: string; data: Record<string, unknown>; status: string }[],
): Promise<void> {
  await ensureTable()
  const client = await pool.connect()
  try {
    await client.query("BEGIN")

    // Snapshot what the server currently holds so we can protect admin-owned
    // compliance fields and detect removals.
    const { rows: existingRows } = await client.query(
      `SELECT id, data, status FROM client_beneficiaries WHERE user_id = $1`,
      [userId],
    )
    const existing = new Map<string, { data: Record<string, unknown>; status: string }>(
      existingRows.map((r) => [r.id as string, { data: r.data as Record<string, unknown>, status: r.status as string }]),
    )

    const incomingIds = new Set(items.map((i) => i.id))

    // Delete beneficiaries the client removed.
    for (const id of existing.keys()) {
      if (!incomingIds.has(id)) {
        await client.query(`DELETE FROM client_beneficiaries WHERE id = $1 AND user_id = $2`, [id, userId])
      }
    }

    // Upsert the rest, preserving server-side compliance for known rows.
    for (const item of items) {
      const prior = existing.get(item.id)
      let data = item.data
      let status = item.status
      if (prior) {
        // Keep administrator-controlled fields from the server copy.
        status = prior.status
        data = {
          ...item.data,
          status: prior.status,
          kycVerified: prior.data.kycVerified ?? false,
          amlScreeningDate: prior.data.amlScreeningDate ?? (item.data.amlScreeningDate as unknown),
          riskLevel: prior.data.riskLevel ?? item.data.riskLevel ?? "low",
        }
      }
      await client.query(
        `INSERT INTO client_beneficiaries (id, user_id, data, status, updated_at)
         VALUES ($1, $2, $3::jsonb, $4, now())
         ON CONFLICT (id) DO UPDATE
           SET data = EXCLUDED.data,
               status = EXCLUDED.status,
               updated_at = now()`,
        [item.id, userId, JSON.stringify(data), status],
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

/**
 * Update the status of one beneficiary (approve / suspend / block).
 *
 * Approval is also the KYC decision: when a beneficiary is set to "active" we
 * flip `data.kycVerified` to true and stamp `data.amlScreeningDate` with today,
 * so the client's detail view shows "Verified" instead of "Pending". Any other
 * status (pending / suspended / blocked) clears `kycVerified` back to false
 * while preserving the previous AML screening date.
 */
export async function setBeneficiaryStatus(id: string, status: string): Promise<StoredBeneficiary | null> {
  await ensureTable()
  const { rows } = await query(
    `UPDATE client_beneficiaries
       SET status = $2,
           data = jsonb_set(
                    jsonb_set(
                      jsonb_set(data, '{status}', to_jsonb($2::text)),
                      '{kycVerified}', to_jsonb($2 = 'active')
                    ),
                    '{amlScreeningDate}',
                    CASE WHEN $2 = 'active'
                         THEN to_jsonb(to_char(now(), 'YYYY-MM-DD'))
                         ELSE COALESCE(data->'amlScreeningDate', 'null'::jsonb)
                    END
                  ),
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
  await query(`DELETE FROM client_beneficiaries WHERE id = $1`, [id])
}
