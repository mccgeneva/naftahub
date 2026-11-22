import "server-only"
import { query } from "@/lib/db"
import { DEFAULT_FEE_TIERS, type FeeTier } from "@/lib/tiered-fees"

/**
 * Persistence for the ONE global marginal tiered-fee table. Mirrors the
 * single-row config pattern (guarantee_config / account-limits): a
 * `fee_tier_config` table with a fixed primary key `'global'` holding the tier
 * array as JSON. Reads NEVER throw — they degrade to DEFAULT_FEE_TIERS so fee
 * calculation always works even if the table is missing or unreadable.
 */

const GLOBAL_ID = "global"
let ensured = false

async function ensureTable(): Promise<void> {
  if (ensured) return
  await query(`
    CREATE TABLE IF NOT EXISTS fee_tier_config (
      id         text PRIMARY KEY,
      tiers      jsonb NOT NULL,
      updated_at timestamptz NOT NULL DEFAULT now(),
      updated_by text
    )
  `)
  ensured = true
}

/** Basic validation + normalization of a stored/incoming tier array. */
function sanitizeTiers(raw: unknown): FeeTier[] | null {
  if (!Array.isArray(raw) || raw.length === 0) return null
  const tiers: FeeTier[] = []
  for (const t of raw) {
    if (!t || typeof t !== "object") return null
    const min = Number((t as Record<string, unknown>).min)
    const rawMax = (t as Record<string, unknown>).max
    const max = rawMax == null ? null : Number(rawMax)
    const rate = Number((t as Record<string, unknown>).rate)
    if (!Number.isFinite(min) || min < 0) return null
    if (max != null && (!Number.isFinite(max) || max <= min)) return null
    if (!Number.isFinite(rate) || rate < 0 || rate > 1) return null
    tiers.push({ min, max, rate })
  }
  const sorted = [...tiers].sort((a, b) => a.min - b.min)
  // Exactly one unbounded (top) tier, and it must be last.
  const unbounded = sorted.filter((t) => t.max == null)
  if (unbounded.length !== 1 || sorted[sorted.length - 1].max != null) return null
  return sorted
}

/** Read the global tier table, falling back to defaults when unset or on error. */
export async function getFeeTiers(): Promise<FeeTier[]> {
  try {
    await ensureTable()
    const { rows } = await query(`SELECT tiers FROM fee_tier_config WHERE id = $1`, [GLOBAL_ID])
    if (!rows.length) return [...DEFAULT_FEE_TIERS]
    const parsed = sanitizeTiers((rows[0] as Record<string, unknown>).tiers)
    return parsed ?? [...DEFAULT_FEE_TIERS]
  } catch {
    return [...DEFAULT_FEE_TIERS]
  }
}

// Per-customer overrides live in the same table under id `user:<dataOwnerId>`.
const customerId = (ownerId: string) => `user:${ownerId}`

/** A customer's own tier table, or null when they are on the standard table. */
export async function getCustomerFeeTiers(ownerId: string): Promise<FeeTier[] | null> {
  if (!ownerId) return null
  try {
    await ensureTable()
    const { rows } = await query(`SELECT tiers FROM fee_tier_config WHERE id = $1`, [customerId(ownerId)])
    if (!rows.length) return null
    return sanitizeTiers((rows[0] as Record<string, unknown>).tiers)
  } catch {
    return null
  }
}

/** The tier table that applies to a data owner: their override if set, else the global table. */
export async function getFeeTiersForOwner(ownerId: string | null | undefined): Promise<FeeTier[]> {
  if (ownerId) {
    const custom = await getCustomerFeeTiers(ownerId)
    if (custom) return custom
  }
  return getFeeTiers()
}

export async function saveCustomerFeeTiers(ownerId: string, tiers: FeeTier[], updatedBy?: string): Promise<FeeTier[]> {
  if (!ownerId) throw new Error("Missing customer")
  const clean = sanitizeTiers(tiers)
  if (!clean) throw new Error("Invalid tier table")
  await ensureTable()
  await query(
    `INSERT INTO fee_tier_config (id, tiers, updated_at, updated_by)
     VALUES ($1, $2::jsonb, now(), $3)
     ON CONFLICT (id) DO UPDATE SET tiers = EXCLUDED.tiers, updated_at = now(), updated_by = EXCLUDED.updated_by`,
    [customerId(ownerId), JSON.stringify(clean), updatedBy ?? null],
  )
  return clean
}

export async function deleteCustomerFeeTiers(ownerId: string): Promise<void> {
  if (!ownerId) return
  await ensureTable()
  await query(`DELETE FROM fee_tier_config WHERE id = $1`, [customerId(ownerId)])
}

/** Every customer with a custom table (owner id + their first-tier rate for a quick summary). */
export async function listCustomerFeeTierOverrides(): Promise<{ userId: string; tiers: FeeTier[]; updatedAt: string }[]> {
  try {
    await ensureTable()
    const { rows } = await query(
      `SELECT id, tiers, updated_at FROM fee_tier_config WHERE id LIKE 'user:%' ORDER BY updated_at DESC`,
    )
    const out: { userId: string; tiers: FeeTier[]; updatedAt: string }[] = []
    for (const r of rows as Record<string, unknown>[]) {
      const tiers = sanitizeTiers(r.tiers)
      if (!tiers) continue
      out.push({
        userId: String(r.id).slice(5),
        tiers,
        updatedAt: new Date(r.updated_at as string).toISOString(),
      })
    }
    return out
  } catch {
    return []
  }
}

/** Upsert the global tier table. Returns the sanitized tiers actually stored. */
export async function saveFeeTiers(tiers: FeeTier[], updatedBy?: string): Promise<FeeTier[]> {
  const clean = sanitizeTiers(tiers)
  if (!clean) throw new Error("Invalid tier table")
  await ensureTable()
  await query(
    `INSERT INTO fee_tier_config (id, tiers, updated_at, updated_by)
     VALUES ($1, $2::jsonb, now(), $3)
     ON CONFLICT (id) DO UPDATE SET tiers = EXCLUDED.tiers, updated_at = now(), updated_by = EXCLUDED.updated_by`,
    [GLOBAL_ID, JSON.stringify(clean), updatedBy ?? null],
  )
  return clean
}
