// ---------------------------------------------------------------------------
// Platform membership upgrade — shared types & helpers (client-safe).
//
// A client can request to upgrade their platform membership (e.g. to
// Avant-Garde) from the Plans page. The upgrade follows a two-step,
// administrator-owned lifecycle:
//
//   pending   → client requested the upgrade, awaiting administrator approval
//   approved  → administrator approved; awaiting Treasury validation of the
//               security deposit
//   active    → Treasury validated the security deposit; the membership is live
//               and the client immediately reflects the new tier
//   rejected  → administrator declined the request
//
// The membership grant is the authoritative source for a client's EFFECTIVE
// platform tier. It works for BOTH static (hand-authored) and dynamic
// (admin-created) accounts: once a grant is "active" the client is shown the
// new tier regardless of their stored `accountBadge`, so a static user whose
// badge can't be edited at runtime still flips to Avant-Garde.
//
// This module is intentionally free of any server-only imports so it can be
// shared by client components, admin components and server actions alike.
// ---------------------------------------------------------------------------

import { resolvePlatformTier, type PlatformTier } from "@/lib/platform-tier"

export type MembershipTierId = "pro" | "avantgarde"
export type MembershipStatus = "none" | "pending" | "approved" | "active" | "rejected"

/** How the validated security deposit is recorded in the client's treasury. */
export type DepositBasis = "cash" | "leverage"

/** Avant-Garde requires a €1,000,000 refundable security deposit. */
export const AVANTGARDE_REQUIRED_DEPOSIT = 1_000_000

/**
 * Under the approved 1:10 leverage facility the client contributes 10% in cash
 * (€100,000) and MCC HOLDING SA finances the remaining €900,000.
 */
export const AVANTGARDE_LEVERAGE_CONTRIBUTION = AVANTGARDE_REQUIRED_DEPOSIT / 10

/** The display badge written onto an account once Avant-Garde is granted. */
export const AVANTGARDE_ACCOUNT_BADGE = "Avant-garde Account"

export interface MembershipRecord {
  tier: MembershipTierId
  status: MembershipStatus
  depositBasis?: DepositBasis
  requestedAt?: string
  approvedAt?: string
  validatedAt?: string
  note?: string
}

export const MEMBERSHIP_TIER_LABEL: Record<MembershipTierId, string> = {
  pro: "PRO",
  avantgarde: "Avant-Garde",
}

export const MEMBERSHIP_STATUS_LABEL: Record<MembershipStatus, string> = {
  none: "Not requested",
  pending: "Pending approval",
  approved: "Awaiting deposit validation",
  active: "Active",
  rejected: "Declined",
}

/** Map a membership tier id to the canonical account badge string. */
export function badgeForTier(tier: MembershipTierId): string {
  return tier === "avantgarde" ? AVANTGARDE_ACCOUNT_BADGE : "PRO Account"
}

/**
 * The EFFECTIVE platform tier shown to a client: an *active* membership grant
 * wins over whatever their stored account badge says, so newly upgraded clients
 * reflect the new tier immediately even when their badge can't be edited
 * (static accounts). Pending / approved / rejected grants do not change the
 * displayed tier — they only drive status messaging.
 */
export function effectivePlatformTier(
  accountBadge: string | undefined | null,
  membership: MembershipRecord | null | undefined,
): PlatformTier {
  if (membership && membership.status === "active") {
    return resolvePlatformTier(badgeForTier(membership.tier))
  }
  return resolvePlatformTier(accountBadge)
}
