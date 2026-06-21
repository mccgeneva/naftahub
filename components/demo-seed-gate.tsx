"use client"

import { useEffect, useRef } from "react"
import { ensureDemoSeedServer } from "@/app/actions/demo-seed"

/**
 * Triggers the one-time server-side seeding of the demo account.
 *
 * The canonical demo dataset now lives in Neon (the single source of truth that
 * every store hydrates from), so seeding is a server action rather than a
 * localStorage write. On mount we call it exactly once: it is a no-op for every
 * non-demo session and on every login after the first (guarded by a server-side
 * marker that survives administrator resets). On the single run that actually
 * seeds, we reload so the freshly-mounted data providers re-hydrate from the now
 * fully-populated server instead of the empty state they fetched a moment ago.
 */
export function DemoSeedGate({ children }: { children: React.ReactNode }) {
  const ran = useRef(false)

  useEffect(() => {
    if (ran.current) return
    ran.current = true
    let cancelled = false
    ensureDemoSeedServer()
      .then((res) => {
        if (!cancelled && res.seeded) window.location.reload()
      })
      .catch(() => {
        // Seeding is best-effort; a transient failure simply retries next login.
      })
    return () => {
      cancelled = true
    }
  }, [])

  return <>{children}</>
}
