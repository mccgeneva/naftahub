import "server-only"
import { query } from "@/lib/db"
import type { PpiPolicy, PpiPolicyStatus } from "@/lib/ppi-insurance"

let ensured = false

async function ensureTable(): Promise<void> {
  if (ensured) return
  await query(
    `CREATE TABLE IF NOT EXISTS ppi_policies (
       id                 text        PRIMARY KEY,
       user_id            text        NOT NULL,
       owner_id           text        NOT NULL,
       holder_label       text        NOT NULL DEFAULT '',
       status             text        NOT NULL DEFAULT 'negotiating',
       insurer            text        NOT NULL DEFAULT 'Lloyd''s of London',
       currency           text        NOT NULL DEFAULT 'EUR',
       cover_amount       numeric     NOT NULL DEFAULT 0,
       computed_premium   numeric     NOT NULL DEFAULT 0,
       negotiated_premium numeric,
       lloyds_reference   text        NOT NULL DEFAULT '',
       note               text        NOT NULL DEFAULT '',
       claimed_amount     numeric     NOT NULL DEFAULT 0,
       created_at         timestamptz NOT NULL DEFAULT now(),
       activated_at       timestamptz,
       expires_at         timestamptz,
       charge_entry_id    text
     )`,
  )
  await query(`CREATE INDEX IF NOT EXISTS ppi_policies_owner_idx ON ppi_policies (owner_id)`)
  ensured = true
}

function rowToPolicy(r: Record<string, unknown>): PpiPolicy {
  const iso = (v: unknown) => (v ? new Date(v as string).toISOString() : null)
  return {
    id: String(r.id),
    userId: String(r.user_id),
    ownerId: String(r.owner_id),
    holderLabel: String(r.holder_label ?? ""),
    status: r.status as PpiPolicyStatus,
    insurer: String(r.insurer ?? ""),
    currency: String(r.currency ?? "EUR"),
    coverAmount: Number(r.cover_amount ?? 0),
    computedPremium: Number(r.computed_premium ?? 0),
    negotiatedPremium: r.negotiated_premium == null ? null : Number(r.negotiated_premium),
    lloydsReference: String(r.lloyds_reference ?? ""),
    note: String(r.note ?? ""),
    claimedAmount: Number(r.claimed_amount ?? 0),
    createdAt: iso(r.created_at) ?? new Date().toISOString(),
    activatedAt: iso(r.activated_at),
    expiresAt: iso(r.expires_at),
    chargeEntryId: (r.charge_entry_id as string) ?? null,
  }
}

export async function listPpiPolicies(): Promise<PpiPolicy[]> {
  await ensureTable()
  const { rows } = await query(`SELECT * FROM ppi_policies ORDER BY created_at DESC`)
  return rows.map(rowToPolicy)
}

export async function getPpiPolicy(id: string): Promise<PpiPolicy | null> {
  await ensureTable()
  const { rows } = await query(`SELECT * FROM ppi_policies WHERE id = $1`, [id])
  return rows[0] ? rowToPolicy(rows[0]) : null
}

export async function listPpiPoliciesForOwner(ownerId: string): Promise<PpiPolicy[]> {
  await ensureTable()
  const { rows } = await query(
    `SELECT * FROM ppi_policies WHERE owner_id = $1 ORDER BY created_at DESC`,
    [ownerId],
  )
  return rows.map(rowToPolicy)
}

export async function upsertPpiDeal(input: {
  id: string
  userId: string
  ownerId: string
  holderLabel: string
  coverAmount: number
  computedPremium: number
  negotiatedPremium: number | null
  lloydsReference: string
  note: string
}): Promise<PpiPolicy> {
  await ensureTable()
  const { rows } = await query(
    `INSERT INTO ppi_policies
       (id, user_id, owner_id, holder_label, status, cover_amount, computed_premium,
        negotiated_premium, lloyds_reference, note)
     VALUES ($1,$2,$3,$4,'negotiating',$5,$6,$7,$8,$9)
     ON CONFLICT (id) DO UPDATE SET
       cover_amount = EXCLUDED.cover_amount,
       computed_premium = EXCLUDED.computed_premium,
       negotiated_premium = EXCLUDED.negotiated_premium,
       lloyds_reference = EXCLUDED.lloyds_reference,
       note = EXCLUDED.note
     WHERE ppi_policies.status = 'negotiating'
     RETURNING *`,
    [
      input.id,
      input.userId,
      input.ownerId,
      input.holderLabel,
      input.coverAmount,
      input.computedPremium,
      input.negotiatedPremium,
      input.lloydsReference,
      input.note,
    ],
  )
  if (!rows[0]) throw new Error("This policy is no longer in negotiation and cannot be edited.")
  return rowToPolicy(rows[0])
}

export async function activatePpiPolicy(id: string, chargeEntryId: string, expiresAt: string): Promise<PpiPolicy | null> {
  await ensureTable()
  const { rows } = await query(
    `UPDATE ppi_policies
        SET status = 'active', activated_at = now(), expires_at = $3, charge_entry_id = $2
      WHERE id = $1 AND status = 'negotiating'
      RETURNING *`,
    [id, chargeEntryId, expiresAt],
  )
  return rows[0] ? rowToPolicy(rows[0]) : null
}

export async function cancelPpiPolicy(id: string): Promise<PpiPolicy | null> {
  await ensureTable()
  const { rows } = await query(
    `UPDATE ppi_policies SET status = 'cancelled'
      WHERE id = $1 AND status = 'negotiating' RETURNING *`,
    [id],
  )
  return rows[0] ? rowToPolicy(rows[0]) : null
}

/** Atomically record a claim, never exceeding the insured sum. */
export async function addPpiClaim(id: string, amount: number): Promise<PpiPolicy | null> {
  await ensureTable()
  const { rows } = await query(
    `UPDATE ppi_policies SET claimed_amount = claimed_amount + $2
      WHERE id = $1 AND status = 'active' AND claimed_amount + $2 <= cover_amount + 0.01
      RETURNING *`,
    [id, amount],
  )
  return rows[0] ? rowToPolicy(rows[0]) : null
}

export async function revertPpiClaim(id: string, amount: number): Promise<void> {
  await ensureTable()
  await query(
    `UPDATE ppi_policies SET claimed_amount = GREATEST(0, claimed_amount - $2) WHERE id = $1`,
    [id, amount],
  )
}
