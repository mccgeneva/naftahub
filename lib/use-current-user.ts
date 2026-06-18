"use client"

import { useEffect, useState } from "react"
import { getUserById, UNKNOWN_USER_ID, USERS, type UserProfile } from "@/lib/users"
import { getActiveUserId } from "@/lib/user-scope"
import { hydrateProfile } from "@/lib/profile-types"
import { getMyProfile } from "@/app/actions/admin-users"

/**
 * Returns the identity profile of the currently signed-in user.
 *
 * The active user id comes from the client-readable `mcc_user` cookie. Cookies
 * aren't available during SSR, so we always start from a deterministic NEUTRAL
 * placeholder (never a real account) and then resolve the real user after mount.
 * This keeps the server and first client render identical (no hydration
 * mismatch) while guaranteeing that no real user's identity is ever shown by
 * default — only after we've positively resolved who is actually logged in.
 *
 * IMPORTANT: there are two kinds of accounts:
 *  - Static users (lib/users.ts) — resolved synchronously by id.
 *  - Dynamic, admin-created users (Neon) — their id (e.g. "du_…") is NOT in the
 *    static registry, so `getUserById` would fall back to the PRIMARY user and
 *    wrongly show someone else's identity. For these we fetch the caller's OWN
 *    profile from the server (resolved from the httpOnly session cookie) and
 *    hydrate it. This guarantees a dynamic user can never see a static user's
 *    identity.
 */
export function useCurrentUser(): UserProfile {
  const [user, setUser] = useState<UserProfile>(() => getUserById(UNKNOWN_USER_ID))

  useEffect(() => {
    let cancelled = false
    const activeId = getActiveUserId()

    // Static user: resolve synchronously by id.
    const staticUser = USERS.find((u) => u.id === activeId)
    if (staticUser) {
      setUser(staticUser)
      return
    }

    // Dynamic (admin-created) user: the static registry has no record, so fetch
    // this caller's own profile from the server and hydrate it. Never fall back
    // to the primary user here — that would expose another account's identity.
    getMyProfile()
      .then((serialized) => {
        if (cancelled || !serialized) return
        setUser(hydrateProfile(serialized))
      })
      .catch(() => {
        // Leave the deterministic placeholder; the session gate will redirect
        // unauthenticated/unresolved sessions to /login.
      })

    return () => {
      cancelled = true
    }
  }, [])

  return user
}
