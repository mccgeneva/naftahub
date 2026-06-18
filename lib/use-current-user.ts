"use client"

import { useEffect, useState } from "react"
import { getUserById, UNKNOWN_USER_ID, type UserProfile } from "@/lib/users"
import { hydrateProfile } from "@/lib/profile-types"
import { getMyIdentity } from "@/app/actions/admin-users"

/**
 * Returns the identity profile of the currently signed-in user.
 *
 * Identity is ALWAYS confirmed against the authoritative session (the httpOnly
 * session cookie, resolved server-side via `getMyIdentity`). The client-readable
 * `mcc_user` cookie is used only as a non-authoritative initial guess so the
 * first paint shows something sensible without a flash; the server result then
 * overrides it.
 *
 * Why this matters: the old code trusted the `mcc_user` cookie and fell back to
 * the PRIMARY user when it was missing. A stale/absent/concurrent-overwritten
 * cookie therefore caused one user to be displayed — and to act — as another
 * real account (e.g. payments attributed to mesa@ipostrad.com). By confirming
 * every session against the server, a wrong cookie can never expose or
 * impersonate another account; at worst we show the neutral placeholder until
 * the session resolves (and the session gate redirects truly unauthenticated
 * users to /login).
 */
export function useCurrentUser(): UserProfile {
  // Deterministic neutral placeholder for SSR + first client render (prevents
  // hydration mismatch and never shows a real account by default).
  const [user, setUser] = useState<UserProfile>(() => getUserById(UNKNOWN_USER_ID))

  useEffect(() => {
    let cancelled = false

    // Identity is resolved ONLY from the authoritative session — we never show a
    // real identity based on the client `mcc_user` cookie, not even momentarily,
    // because a stale/overwritten cookie could otherwise flash the wrong account
    // on a payments screen. Until the server confirms, the neutral placeholder
    // stays.
    getMyIdentity()
      .then((identity) => {
        if (cancelled) return
        if (!identity) {
          // Unresolved session: keep the neutral placeholder.
          setUser(getUserById(UNKNOWN_USER_ID))
          return
        }
        if (identity.kind === "static") {
          setUser(getUserById(identity.id))
        } else {
          setUser(hydrateProfile(identity.profile))
        }
      })
      .catch(() => {
        // Network/transient error: do not assume any real identity.
        if (!cancelled) setUser(getUserById(UNKNOWN_USER_ID))
      })

    return () => {
      cancelled = true
    }
  }, [])

  return user
}
