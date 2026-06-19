// ---------------------------------------------------------------------------
// Authoritative session resolver (server-only).
//
// The Edge proxy can only do a lightweight "is a session cookie present" check
// because it cannot reach Postgres. This module is the authoritative resolver:
// given the session cookie it returns the signed-in user — checking the static
// registry (lib/users.ts) first and then the dynamic, admin-created users in
// Neon (lib/admin-users-db.ts). It also enforces account status: suspended or
// inactive dynamic accounts resolve to `null` so they are denied access.
//
// Used by:
//  - app/dashboard/layout.tsx  → authoritative gate (redirects if invalid)
//  - app/actions/auth.ts        → login lookup
//  - app/actions/admin-users.ts → "who am I" for the client identity hydrate
// ---------------------------------------------------------------------------

import "server-only"
import { cookies } from "next/headers"
import { SESSION_COOKIE, SESSION_META_COOKIE, SESSION_IDLE_MAX_AGE } from "@/lib/auth"
import { verifySessionMeta, evaluateSessionMeta } from "@/lib/session-token"
import { getUserById, type UserProfile } from "@/lib/users"
import {
  getDynamicUserById,
  getDynamicUserBySessionToken,
  type DynamicUserRecord,
  type UserStatus,
} from "@/lib/admin-users-db"
import { hydrateProfile } from "@/lib/profile-types"

export interface ResolvedSession {
  /** Stable user id (namespaces this user's data). */
  id: string
  /** Full identity profile (icons hydrated for dynamic users). */
  profile: UserProfile
  /** "static" = hand-authored registry user; "dynamic" = admin-created. */
  kind: "static" | "dynamic"
  /** Account status. Static users are always "active". */
  status: UserStatus
}

function dynamicToResolved(rec: DynamicUserRecord): ResolvedSession {
  return {
    id: rec.id,
    profile: hydrateProfile(rec.profile),
    kind: "dynamic",
    status: rec.status,
  }
}

/**
 * Resolve a session token to a user. Every account lives in the database, so
 * this requires Postgres to be reachable. Accounts are only granted access
 * while their status is "active".
 */
export async function resolveSessionByToken(token: string | undefined | null): Promise<ResolvedSession | null> {
  if (!token) return null

  try {
    const dyn = await getDynamicUserBySessionToken(token)
    if (dyn && dyn.status === "active") return dynamicToResolved(dyn)
  } catch {
    // Database unreachable — the session cannot be resolved until it recovers.
  }
  return null
}

/** Resolve the current request's session from the httpOnly session cookie. */
export async function resolveCurrentSession(): Promise<ResolvedSession | null> {
  const cookieStore = await cookies()
  const token = cookieStore.get(SESSION_COOKIE)?.value

  // Defense-in-depth: enforce server-side session expiry here too, so any RSC,
  // layout, or server action that resolves the session rejects an expired/idle
  // session even if it were somehow reached without passing the Edge proxy.
  const meta = await verifySessionMeta(cookieStore.get(SESSION_META_COOKIE)?.value)
  if (evaluateSessionMeta(meta, SESSION_IDLE_MAX_AGE * 1000) !== "valid") return null

  return resolveSessionByToken(token)
}

/**
 * Resolve ANY account id — static OR dynamic (admin-created) — to its full
 * identity profile. Intended for server-side labelling such as admin audit-log
 * entries and emails, where we must show the CORRECT target account.
 *
 * For unknown ids it returns the neutral placeholder (via getUserById), never a
 * different real user. This is what keeps "Administrator posted X to <account>"
 * audit entries accurate for dynamic users instead of mis-attributing them to
 * the primary account.
 */
export async function resolveAccountProfileById(userId: string | undefined | null): Promise<UserProfile> {
  if (!userId) return getUserById(null)
  try {
    const dyn = await getDynamicUserById(userId)
    if (dyn) return hydrateProfile(dyn.profile)
  } catch {
    // DB unavailable — fall through to the neutral placeholder.
  }
  return getUserById(userId)
}
