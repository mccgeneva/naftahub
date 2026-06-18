"use client"

import { createContext, useContext, useEffect, useState } from "react"
import { getUserById, UNKNOWN_USER_ID, type UserProfile } from "@/lib/users"
import { hydrateProfile } from "@/lib/profile-types"
import { getMyIdentity } from "@/app/actions/admin-users"

/**
 * Identity is resolved ONCE per session from the authoritative httpOnly session
 * cookie (server action `getMyIdentity`) and shared with every consumer through
 * React context.
 *
 * Why a provider instead of resolving inside the hook:
 *  - The dashboard renders many components that each need the current user
 *    (header, welcome banner, tier banner, cards, activity tracker, page
 *    bodies, ...). If every one called `getMyIdentity()` on mount we'd fire a
 *    dozen identical server actions per navigation. Next.js executes Server
 *    Actions SERIALLY, so that herd of redundant calls queues up behind (and
 *    ahead of) the real data fetches and any action triggered by a click —
 *    making the whole UI feel frozen / "nothing is clickable" on slower or
 *    higher-latency environments. Resolving once removes that contention.
 *
 * Security note: the client-readable `mcc_user` cookie is never trusted for
 * identity. We always confirm against the session, so a stale/overwritten
 * cookie can never display — or act as — another real account. Until the server
 * confirms, the neutral placeholder is shown.
 */

const CurrentUserContext = createContext<UserProfile | null>(null)

function resolveNeutral(): UserProfile {
  return getUserById(UNKNOWN_USER_ID)
}

export function CurrentUserProvider({ children }: { children: React.ReactNode }) {
  // Deterministic neutral placeholder for SSR + first client render (prevents
  // hydration mismatch and never shows a real account by default).
  const [user, setUser] = useState<UserProfile>(resolveNeutral)

  useEffect(() => {
    // Resolve identity once for the whole tree. The `cancelled` flag prevents a
    // stale update if this provider unmounts (or remounts under Strict Mode)
    // before the request resolves. In production this runs a single time.
    let cancelled = false

    getMyIdentity()
      .then((identity) => {
        if (cancelled) return
        if (!identity) {
          setUser(resolveNeutral())
          return
        }
        if (identity.kind === "static") {
          setUser(getUserById(identity.id))
        } else {
          setUser(hydrateProfile(identity.profile))
        }
      })
      .catch(() => {
        if (!cancelled) setUser(resolveNeutral())
      })

    return () => {
      cancelled = true
    }
  }, [])

  return <CurrentUserContext.Provider value={user}>{children}</CurrentUserContext.Provider>
}

/**
 * Returns the identity profile of the currently signed-in user.
 *
 * Reads from the shared CurrentUserProvider context. If used outside a provider
 * (defensive fallback) it returns the neutral placeholder rather than throwing,
 * so a stray consumer can never crash the tree or expose a real account.
 */
export function useCurrentUser(): UserProfile {
  const ctx = useContext(CurrentUserContext)
  return ctx ?? resolveNeutral()
}
