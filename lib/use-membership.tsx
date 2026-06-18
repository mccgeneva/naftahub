"use client"

import { useCallback, useEffect, useState } from "react"
import { getMyMembership } from "@/app/actions/membership"
import type { MembershipRecord } from "@/lib/membership"

/**
 * Reads the signed-in client's membership upgrade grant from the server.
 *
 * The grant is fetched on mount and re-fetched whenever the tab regains focus,
 * so an administrator approval / Treasury deposit validation made in a separate
 * session appears for the client without a manual reload — the same pattern the
 * Treasury and certificate stores use. Self-contained (no provider) because
 * only the Plans page and the dashboard tier banner consume it, and they live
 * on different routes.
 */
export function useMembership() {
  const [membership, setMembership] = useState<MembershipRecord | null>(null)
  const [hydrated, setHydrated] = useState(false)

  const refresh = useCallback(async () => {
    try {
      const next = await getMyMembership()
      setMembership(next)
    } catch {
      // keep whatever we already have on a transient failure
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    void getMyMembership()
      .then((next) => {
        if (!cancelled) setMembership(next)
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setHydrated(true)
      })
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    if (!hydrated) return
    const onVisible = () => {
      if (document.visibilityState === "visible") void refresh()
    }
    window.addEventListener("focus", refresh)
    document.addEventListener("visibilitychange", onVisible)
    return () => {
      window.removeEventListener("focus", refresh)
      document.removeEventListener("visibilitychange", onVisible)
    }
  }, [hydrated, refresh])

  return { membership, hydrated, refresh }
}
