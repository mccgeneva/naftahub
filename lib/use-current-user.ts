"use client"

import { useEffect, useState } from "react"
import { getUserById, PRIMARY_USER_ID, type UserProfile } from "@/lib/users"
import { getActiveUserId } from "@/lib/user-scope"

/**
 * Returns the identity profile of the currently signed-in user.
 *
 * The active user id comes from the client-readable `mcc_user` cookie. Cookies
 * aren't available during SSR, so we always start from a deterministic value
 * (the primary user) and then resolve the real user after mount. This keeps the
 * server and first client render identical (no hydration mismatch) while still
 * showing the correct identity for whoever is actually logged in.
 */
export function useCurrentUser(): UserProfile {
  const [user, setUser] = useState<UserProfile>(() => getUserById(PRIMARY_USER_ID))

  useEffect(() => {
    setUser(getUserById(getActiveUserId()))
  }, [])

  return user
}
