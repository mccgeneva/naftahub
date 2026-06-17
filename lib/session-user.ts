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
import { SESSION_COOKIE } from "@/lib/auth"
import { getUserBySessionToken, type UserProfile } from "@/lib/users"
import {
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
 * Resolve a session token to a user. Static users win (they never touch the DB,
 * keeping login fast and resilient even when Postgres is unavailable). Dynamic
 * users are only granted access while their status is "active".
 */
export async function resolveSessionByToken(token: string | undefined | null): Promise<ResolvedSession | null> {
  if (!token) return null

  const staticUser = getUserBySessionToken(token)
  if (staticUser) {
    return { id: staticUser.id, profile: staticUser, kind: "static", status: "active" }
  }

  try {
    const dyn = await getDynamicUserBySessionToken(token)
    if (dyn && dyn.status === "active") return dynamicToResolved(dyn)
  } catch {
    // DB unavailable (e.g. no DATABASE_URL in this sandbox). Static users still
    // work; dynamic users simply can't be resolved until the DB is reachable.
  }
  return null
}

/** Resolve the current request's session from the httpOnly session cookie. */
export async function resolveCurrentSession(): Promise<ResolvedSession | null> {
  const cookieStore = await cookies()
  const token = cookieStore.get(SESSION_COOKIE)?.value
  return resolveSessionByToken(token)
}
