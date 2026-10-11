"use server"

// ---------------------------------------------------------------------------
// Platform membership upgrades.
//
// A client requests an upgrade (e.g. to Avant-Garde) from the Plans page. An
// administrator then runs a two-step approval:
//
//   1. Approve the request (compliance sign-off).
//   2. Validate the security deposit in Treasury — for Avant-Garde a
//      €1,000,000 deposit, recorded either as full cash or as €100,000 under
//      the approved 1:10 leverage facility (the rest financed by MCC HOLDING
//      SA). Validation flips the membership to "active" and the client
//      immediately reflects the new tier.
//
// Grants are persisted in Neon (one row per user) so they survive restarts and
// are visible to the administrator from any device, mirroring the gateway /
// certificate request queues. The €1M deposit is written through the existing
// authoritative treasury logic (saveTreasuryRecordAdmin) so the leverage math
// and audit trail stay in one place.
// ---------------------------------------------------------------------------

import { query } from "@/lib/db"
import { adminActionAuthorized } from "@/lib/admin-auth"
import { type UserProfile } from "@/lib/users"
import { resolveCurrentSession, resolveAccountProfileById } from "@/lib/session-user"
import { logActivity } from "@/app/actions/log-activity"
import { saveTreasuryRecordAdmin, releaseTreasuryDepositForDowngradeAdmin } from "@/app/actions/treasury"
import { getDynamicUserById, listDynamicUsers, updateDynamicUserProfile } from "@/lib/admin-users-db"
import { notifyAllAdminsOfClientRequest } from "@/lib/notify-admins"
import { insertNotification } from "@/lib/notifications-db"
import {
  AVANTGARDE_REQUIRED_DEPOSIT,
  AVANTGARDE_LEVERAGE_CONTRIBUTION,
  AVANTGARDE_ACCOUNT_BADGE,
  badgeForTier,
  MEMBERSHIP_TIER_LABEL,
  VISITOR_ACCOUNT_BADGE,
  type DepositBasis,
  type MembershipRecord,
  type MembershipStatus,
  type MembershipTierId,
} from "@/lib/membership"

// --- Session / admin helpers ------------------------------------------------

async function requireAdmin(passcode: string): Promise<UserProfile> {
  const session = await resolveCurrentSession()
  const user = session?.profile
  if (!user) throw new Error("Your session has expired. Please sign in again.")
  if (!(await adminActionAuthorized(passcode))) throw new Error("Administrator authorization failed.")
  return user
}

// The grant is keyed by the owning user's id (one active upgrade per user). The
// table is created on first use so no separate migration step is required.
let ready: Promise<void> | null = null
async function ensureTable(): Promise<void> {
  if (!ready) {
    ready = (async () => {
      await query(`
        CREATE TABLE IF NOT EXISTS membership_upgrades (
          user_id       text        PRIMARY KEY,
          tier          text        NOT NULL,
          status        text        NOT NULL,
          deposit_basis text,
          requested_at  timestamptz NOT NULL DEFAULT now(),
          approved_at   timestamptz,
          validated_at  timestamptz,
          decided_by    text,
          note          text,
          updated_at    timestamptz NOT NULL DEFAULT now()
        );
      `)
      await query(`CREATE INDEX IF NOT EXISTS membership_upgrades_status_idx ON membership_upgrades (status);`)
    })().catch((err) => {
      ready = null
      throw err
    })
  }
  return ready
}

function rowToRecord(row: Record<string, unknown>): MembershipRecord {
  return {
    tier: (row.tier as MembershipTierId) ?? "avantgarde",
    status: (row.status as MembershipStatus) ?? "pending",
    depositBasis: (row.deposit_basis as DepositBasis) ?? undefined,
    requestedAt: row.requested_at ? new Date(row.requested_at as string).toISOString() : undefined,
    approvedAt: row.approved_at ? new Date(row.approved_at as string).toISOString() : undefined,
    validatedAt: row.validated_at ? new Date(row.validated_at as string).toISOString() : undefined,
    note: (row.note as string) ?? undefined,
  }
}

async function readRecord(userId: string): Promise<MembershipRecord | null> {
  await ensureTable()
  const { rows } = await query(`SELECT * FROM membership_upgrades WHERE user_id = $1`, [userId])
  return rows[0] ? rowToRecord(rows[0]) : null
}

// --- Customer-facing (own record only) --------------------------------------

/** Return the signed-in user's membership upgrade record (static OR dynamic). */
export async function getMyMembership(): Promise<MembershipRecord | null> {
  try {
    const session = await resolveCurrentSession()
    if (!session) return null
    return await readRecord(session.id)
  } catch (err) {
    console.log("[v0] getMyMembership failed:", (err as Error).message)
    return null
  }
}

export type RequestUpgradeResult =
  | { ok: true; record: MembershipRecord }
  | { ok: false; error: string }

/**
 * Client self-service: request an upgrade to the given tier. Allowed only when
 * there is no in-flight (pending/approved) or already-active grant for the same
 * tier, so a client can't spam the administrator queue.
 */
export async function requestMembershipUpgrade(tier: MembershipTierId): Promise<RequestUpgradeResult> {
  let session: Awaited<ReturnType<typeof resolveCurrentSession>>
  try {
    session = await resolveCurrentSession()
  } catch {
    session = null
  }
  if (!session) return { ok: false, error: "Your session has expired. Please sign in again." }

  try {
    const existing = await readRecord(session.id)
    if (existing && existing.tier === tier) {
      if (existing.status === "pending")
        return { ok: false, error: "Your upgrade request is already pending administrator approval." }
      if (existing.status === "approved")
        return { ok: false, error: "Your upgrade is approved and awaiting Treasury validation of the security deposit." }
      if (existing.status === "active")
        return { ok: false, error: "You are already on this membership." }
    }

    const now = new Date().toISOString()
    const { rows } = await query(
      `INSERT INTO membership_upgrades (user_id, tier, status, requested_at, updated_at)
       VALUES ($1, $2, 'pending', $3, $3)
       ON CONFLICT (user_id) DO UPDATE SET
         tier = EXCLUDED.tier,
         status = 'pending',
         deposit_basis = NULL,
         requested_at = EXCLUDED.requested_at,
         approved_at = NULL,
         validated_at = NULL,
         note = NULL,
         updated_at = EXCLUDED.updated_at
       RETURNING *`,
      [session.id, tier, now],
    )

    await logActivity({
      action: `Client requested an upgrade to the ${MEMBERSHIP_TIER_LABEL[tier]} membership`,
      category: "Plans & Pricing",
      user: `${session.profile.fullName} (${session.profile.company})`,
      details: {
        summary: `${session.profile.fullName} requested to upgrade to the ${MEMBERSHIP_TIER_LABEL[tier]} membership. The request is now pending administrator approval; once approved, Treasury must validate the ${
          tier === "avantgarde" ? "€1,000,000" : "security"
        } deposit before the membership is activated.`,
        account: `${session.profile.fullName} — ${session.profile.email}`,
        tier: MEMBERSHIP_TIER_LABEL[tier],
        status: "Pending approval",
      },
    })

    await notifyAllAdminsOfClientRequest({
      customerName: `${session.profile.fullName} (${session.profile.company})`,
      title: `New ${MEMBERSHIP_TIER_LABEL[tier]} membership upgrade request`,
      body: `${session.profile.fullName} (${session.profile.company}) requested to upgrade to the ${MEMBERSHIP_TIER_LABEL[tier]} membership. Open the Administrator panel → Membership Upgrades to approve it and validate the security deposit.`,
      href: "/dashboard/admin?view=membership",
    })

    return { ok: true, record: rowToRecord(rows[0]) }
  } catch (err) {
    console.log("[v0] requestMembershipUpgrade failed:", (err as Error).message)
    return { ok: false, error: "Your upgrade request could not be submitted. Please try again." }
  }
}

// --- Admin: queue + lifecycle ----------------------------------------------

export interface AdminMembershipView extends MembershipRecord {
  userId: string
  fullName: string
  company: string
  email: string
}

export type AdminMembershipResult =
  | { ok: true; requests: AdminMembershipView[] }
  | { ok: false; error: string }

interface TreasuryMembershipInfo {
  status: string
  financed: number
  updatedAt: string | null
}

async function readTreasuryMembershipInfo(): Promise<Map<string, TreasuryMembershipInfo>> {
  const map = new Map<string, TreasuryMembershipInfo>()
  try {
    const { rows } = await query(
      `SELECT user_id, status, financed_amount, updated_at FROM treasury_accounts`,
    )
    for (const r of rows) {
      map.set(String(r.user_id), {
        status: String(r.status ?? "none"),
        financed: Number(r.financed_amount ?? 0),
        updatedAt: r.updated_at ? new Date(r.updated_at as string).toISOString() : null,
      })
    }
  } catch {
    // No treasury table yet — nothing to add.
  }
  return map
}

function explicitTierFromBadge(badge: string | undefined | null): MembershipTierId | null {
  const v = (badge ?? "").trim().toLowerCase()
  if (v.includes("avant") || v.includes("institutional")) return "avantgarde"
  if (v.includes("pro")) return "pro"
  return null
}

/**
 * A membership granted outside the upgrade-request flow — typically through a
 * Treasury security deposit (often financed with leverage) — has no
 * membership_upgrades row. Derive it from the account badge + treasury record.
 */
function derivedMembership(
  badge: string | undefined | null,
  treasury: TreasuryMembershipInfo | undefined,
): MembershipRecord | null {
  const treasuryLive = !!treasury && treasury.status !== "none" && treasury.status !== "closed"
  const isVisitor = (badge ?? "").toLowerCase().includes("visitor")
  if (isVisitor) return null
  const tier = explicitTierFromBadge(badge) ?? (treasuryLive ? "pro" : null)
  if (!tier) return null
  return {
    tier,
    status: "active",
    depositBasis: treasury && treasury.financed > 0 ? "leverage" : treasuryLive ? "cash" : undefined,
    requestedAt: treasury?.updatedAt ?? undefined,
    note: treasuryLive ? "Membership through Treasury security deposit" : "Membership set on the account",
  }
}

async function listAllForAdmin(): Promise<AdminMembershipView[]> {
  await ensureTable()
  const { rows } = await query(`SELECT * FROM membership_upgrades ORDER BY requested_at DESC`)
  const views: AdminMembershipView[] = []
  const seen = new Set<string>()
  for (const row of rows) {
    const rec = rowToRecord(row)
    const profile = await resolveAccountProfileById(row.user_id as string)
    seen.add(row.user_id as string)
    views.push({
      ...rec,
      userId: row.user_id as string,
      fullName: profile.fullName,
      company: profile.company,
      email: profile.email,
    })
  }

  try {
    const [users, treasury] = await Promise.all([listDynamicUsers(), readTreasuryMembershipInfo()])
    for (const u of users) {
      if (seen.has(u.id)) continue
      const st = String(u.status ?? "").toLowerCase()
      if (st === "rejected" || st === "pending" || st === "suspended" || st === "disabled") continue
      const rec = derivedMembership(u.profile?.accountBadge, treasury.get(u.id))
      if (!rec) continue
      views.push({
        ...rec,
        userId: u.id,
        fullName: u.profile?.fullName ?? u.email,
        company: u.profile?.company ?? "",
        email: u.email,
      })
    }
  } catch (err) {
    console.log("[v0] listing treasury memberships failed:", (err as Error).message)
  }
  return views
}

/** Make sure a membership row exists so a badge/treasury-derived member can be downgraded. */
async function ensureRecordForAccount(userId: string): Promise<MembershipRecord | null> {
  const existing = await readRecord(userId)
  if (existing) return existing
  const dyn = await getDynamicUserById(userId)
  if (!dyn) return null
  const treasury = (await readTreasuryMembershipInfo()).get(userId)
  const rec = derivedMembership(dyn.profile?.accountBadge, treasury)
  if (!rec) return null
  await query(
    `INSERT INTO membership_upgrades (user_id, tier, status, deposit_basis, requested_at, validated_at, note, updated_at)
     VALUES ($1, $2, 'active', $3, now(), now(), $4, now())
     ON CONFLICT (user_id) DO NOTHING`,
    [userId, rec.tier, rec.depositBasis ?? null, rec.note ?? null],
  )
  return readRecord(userId)
}

/** Admin: read every client's membership upgrade for the review queue. */
export async function getAllMembershipRequestsAdmin(passcode: string): Promise<AdminMembershipResult> {
  try {
    await requireAdmin(passcode)
    return { ok: true, requests: await listAllForAdmin() }
  } catch (err) {
    return { ok: false, error: (err as Error).message }
  }
}

/**
 * Admin: count membership upgrade requests awaiting a decision (status
 * 'pending'), for the command-center tile + nav badge so a request is never
 * invisible. Returns 0 on any failure (non-fatal).
 */
export async function countPendingMembershipUpgradesAdmin(passcode: string): Promise<number> {
  try {
    await requireAdmin(passcode)
    await ensureTable()
    const { rows } = await query(
      `SELECT COUNT(*)::int AS n FROM membership_upgrades WHERE status = 'pending'`,
    )
    return Number(rows[0]?.n ?? 0)
  } catch {
    return 0
  }
}

/** Admin step 1: approve a pending request (compliance sign-off). */
export async function approveMembershipUpgradeAdmin(
  passcode: string,
  userId: string,
  note?: string,
): Promise<AdminMembershipResult> {
  let admin: UserProfile
  try {
    admin = await requireAdmin(passcode)
  } catch (err) {
    return { ok: false, error: (err as Error).message }
  }
  try {
    const rec = await readRecord(userId)
    if (!rec) return { ok: false, error: "No membership request found for this client." }
    if (rec.status !== "pending") return { ok: false, error: "Only a pending request can be approved." }

    const now = new Date().toISOString()
    await query(
      `UPDATE membership_upgrades
          SET status = 'approved', approved_at = $2, decided_by = $3, note = $4, updated_at = $2
        WHERE user_id = $1`,
      [userId, now, `${admin.fullName} (${admin.company})`, note?.trim() || null],
    )

    const target = await resolveAccountProfileById(userId)
    await logActivity({
      action: `Administrator approved the ${MEMBERSHIP_TIER_LABEL[rec.tier]} upgrade for ${target.fullName}`,
      category: "Administration",
      user: `${admin.fullName} (${admin.company})`,
      details: {
        summary: `Administrator approved ${target.fullName}'s request to upgrade to the ${MEMBERSHIP_TIER_LABEL[rec.tier]} membership. Treasury must now validate the ${
          rec.tier === "avantgarde" ? "€1,000,000" : "security"
        } deposit to activate the membership.`,
        targetAccount: `${target.fullName} — ${target.email}`,
        tier: MEMBERSHIP_TIER_LABEL[rec.tier],
        decision: "Approved",
        note: note?.trim() || "(none)",
      },
    })

    return { ok: true, requests: await listAllForAdmin() }
  } catch (err) {
    console.log("[v0] approveMembershipUpgradeAdmin failed:", (err as Error).message)
    return { ok: false, error: "The request could not be approved. Please try again." }
  }
}

/** Admin: decline a pending or approved request with an optional reason. */
export async function rejectMembershipUpgradeAdmin(
  passcode: string,
  userId: string,
  reason?: string,
): Promise<AdminMembershipResult> {
  let admin: UserProfile
  try {
    admin = await requireAdmin(passcode)
  } catch (err) {
    return { ok: false, error: (err as Error).message }
  }
  try {
    const rec = await readRecord(userId)
    if (!rec) return { ok: false, error: "No membership request found for this client." }
    if (rec.status === "active") return { ok: false, error: "An active membership cannot be declined here." }

    const now = new Date().toISOString()
    await query(
      `UPDATE membership_upgrades
          SET status = 'rejected', decided_by = $3, note = $2, updated_at = $4
        WHERE user_id = $1`,
      [userId, reason?.trim() || null, `${admin.fullName} (${admin.company})`, now],
    )

    const target = await resolveAccountProfileById(userId)
    await logActivity({
      action: `Administrator declined the ${MEMBERSHIP_TIER_LABEL[rec.tier]} upgrade for ${target.fullName}`,
      category: "Administration",
      user: `${admin.fullName} (${admin.company})`,
      details: {
        summary: `Administrator declined ${target.fullName}'s ${MEMBERSHIP_TIER_LABEL[rec.tier]} membership upgrade.${
          reason?.trim() ? ` Reason: ${reason.trim()}.` : ""
        }`,
        targetAccount: `${target.fullName} — ${target.email}`,
        tier: MEMBERSHIP_TIER_LABEL[rec.tier],
        decision: "Declined",
        reason: reason?.trim() || "(none provided)",
      },
    })

    return { ok: true, requests: await listAllForAdmin() }
  } catch (err) {
    console.log("[v0] rejectMembershipUpgradeAdmin failed:", (err as Error).message)
    return { ok: false, error: "The request could not be declined. Please try again." }
  }
}

export type MembershipChangeTarget = "pro" | "visitor"

/**
 * Admin: downgrade an active membership (Avant-Garde → PRO / Visitor, or
 * PRO → Visitor). The grant row drives the effective tier, and dynamic accounts
 * also get their stored badge rewritten so every badge-derived surface matches.
 * The client's own paid-in security deposit is released back to the Master
 * Account (PRO keeps EUR 500,000; Visitor gets it all); the financed part is not.
 */
export async function changeMembershipTierAdmin(
  passcode: string,
  userId: string,
  target: MembershipChangeTarget,
  reason?: string,
): Promise<AdminMembershipResult> {
  let admin: UserProfile
  try {
    admin = await requireAdmin(passcode)
  } catch (err) {
    return { ok: false, error: (err as Error).message }
  }
  try {
    const rec = await ensureRecordForAccount(userId)
    if (!rec || rec.status !== "active") {
      return { ok: false, error: "Only an active membership can be downgraded." }
    }
    if (target === "pro" && rec.tier !== "avantgarde") {
      return { ok: false, error: "This client is already on PRO." }
    }

    const fromLabel = MEMBERSHIP_TIER_LABEL[rec.tier]
    const toLabel = target === "pro" ? "PRO" : "Visitor"
    const decidedBy = `${admin.fullName} (${admin.company})`
    const note = reason?.trim() || null
    const now = new Date().toISOString()

    if (target === "pro") {
      await query(
        `UPDATE membership_upgrades
            SET tier = 'pro', status = 'active', decided_by = $2, note = $3, updated_at = $4
          WHERE user_id = $1`,
        [userId, decidedBy, note, now],
      )
    } else {
      await query(
        `UPDATE membership_upgrades
            SET status = 'revoked', decided_by = $2, note = $3, updated_at = $4
          WHERE user_id = $1`,
        [userId, decidedBy, note, now],
      )
    }

    let refunded = 0
    try {
      const release = await releaseTreasuryDepositForDowngradeAdmin(passcode, userId, target)
      refunded = release.refunded
    } catch (err) {
      console.log("[v0] deposit release on downgrade failed:", (err as Error).message)
    }
    const refundText =
      refunded > 0
        ? ` EUR ${refunded.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} of your own security deposit has been credited back to your Master Account (the financed part is not paid out).`
        : ""

    try {
      const dyn = await getDynamicUserById(userId)
      if (dyn) {
        await updateDynamicUserProfile(userId, {
          profile: {
            ...dyn.profile,
            accountBadge: target === "pro" ? badgeForTier("pro") : VISITOR_ACCOUNT_BADGE,
          },
        })
      }
    } catch {
      // Badge sync is best-effort; the grant row already drives the tier.
    }

    const target_ = await resolveAccountProfileById(userId)
    try {
      await insertNotification({
        userId,
        tone: "warning",
        title: `Your membership is now ${toLabel}`,
        body: `An administrator changed your membership from ${fromLabel} to ${toLabel}.${note ? ` Reason: ${note}.` : ""}${refundText} Contact MCC through Bankeka if you have questions.`,
        href: "/dashboard/plans",
      })
    } catch {
      // Notification is best-effort.
    }

    await logActivity({
      action: `Administrator downgraded ${target_.fullName} from ${fromLabel} to ${toLabel}`,
      category: "Administration",
      user: decidedBy,
      details: {
        summary: `Administrator changed ${target_.fullName}'s membership from ${fromLabel} to ${toLabel}.${note ? ` Reason: ${note}.` : ""} Own security deposit refunded to the Master Account: EUR ${refunded.toFixed(2)} (financed part not paid out).`,
        depositRefunded: refunded,
        targetAccount: `${target_.fullName} — ${target_.email}`,
        from: fromLabel,
        to: toLabel,
        reason: note ?? "(none provided)",
      },
    })

    return { ok: true, requests: await listAllForAdmin() }
  } catch (err) {
    console.log("[v0] changeMembershipTierAdmin failed:", (err as Error).message)
    return { ok: false, error: "The membership could not be changed. Please try again." }
  }
}

/**
 * Admin step 2: Treasury validates the security deposit and activates the
 * membership. For Avant-Garde this secures a €1,000,000 deposit, recorded
 * either as full cash or as €100,000 under the approved 1:10 leverage facility.
 *
 * The deposit is written through saveTreasuryRecordAdmin so the authoritative
 * leverage math + audit trail are reused, then the grant is flipped to "active"
 * and (for dynamic accounts) the stored account badge is updated so every
 * badge-derived surface reflects the new tier too.
 */
export async function validateMembershipDepositAdmin(
  passcode: string,
  userId: string,
  basis: DepositBasis,
): Promise<AdminMembershipResult> {
  let admin: UserProfile
  try {
    admin = await requireAdmin(passcode)
  } catch (err) {
    return { ok: false, error: (err as Error).message }
  }

  try {
    const rec = await readRecord(userId)
    if (!rec) return { ok: false, error: "No membership request found for this client." }
    if (rec.status !== "approved") {
      return { ok: false, error: "The request must be approved before the deposit can be validated." }
    }
    if (rec.tier !== "avantgarde") {
      return { ok: false, error: "Deposit validation is only required for the Avant-Garde membership." }
    }

    const leverage = basis === "leverage"
    const required = AVANTGARDE_REQUIRED_DEPOSIT
    const contribution = leverage ? AVANTGARDE_LEVERAGE_CONTRIBUTION : AVANTGARDE_REQUIRED_DEPOSIT

    // 1) Secure the €1M security deposit through the authoritative treasury
    //    logic (handles the 1:10 financed amount, fee accrual start, audit log).
    const treasury = await saveTreasuryRecordAdmin(passcode, userId, {
      profile: "avantgarde",
      requiredDeposit: required,
      customerContribution: contribution,
      leverageEnabled: leverage,
      transactionExposure: 0,
      status: "secured",
      note: `Avant-Garde security deposit validated (${leverage ? "1:10 leverage facility" : "full cash"}).`,
    })
    if (!treasury.ok) return { ok: false, error: treasury.error }

    // 2) Activate the membership grant.
    const now = new Date().toISOString()
    await query(
      `UPDATE membership_upgrades
          SET status = 'active', deposit_basis = $2, validated_at = $3, decided_by = $4, updated_at = $3
        WHERE user_id = $1`,
      [userId, basis, now, `${admin.fullName} (${admin.company})`],
    )

    // 3) For dynamic (admin-created) accounts, also flip the stored badge so
    //    badge-derived UI matches. Static accounts rely on the active grant.
    try {
      const dyn = await getDynamicUserById(userId)
      if (dyn) {
        await updateDynamicUserProfile(userId, {
          profile: { ...dyn.profile, accountBadge: AVANTGARDE_ACCOUNT_BADGE },
        })
      }
    } catch {
      // Badge sync is best-effort; the active grant already drives the tier.
    }

    const target = await resolveAccountProfileById(userId)
    await logActivity({
      action: `Treasury validated the €1,000,000 security deposit and activated Avant-Garde for ${target.fullName}`,
      category: "Administration",
      user: `${admin.fullName} (${admin.company})`,
      details: {
        summary: `Treasury validated ${target.fullName}'s €1,000,000 Avant-Garde security deposit (${
          leverage
            ? "€100,000 client contribution under the approved 1:10 leverage facility, €900,000 financed by MCC HOLDING SA"
            : "full €1,000,000 cash"
        }) and the membership is now active. The client immediately reflects the Avant-Garde tier.`,
        targetAccount: `${target.fullName} — ${target.email}`,
        tier: "Avant-Garde",
        securityDeposit: "EUR 1,000,000",
        depositBasis: leverage ? "1:10 leverage (EUR 100,000 cash)" : "Full cash (EUR 1,000,000)",
        decision: "Activated",
      },
    })

    return { ok: true, requests: await listAllForAdmin() }
  } catch (err) {
    console.log("[v0] validateMembershipDepositAdmin failed:", (err as Error).message)
    return { ok: false, error: "The deposit could not be validated. Please try again." }
  }
}
