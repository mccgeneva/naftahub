"use client"

import { useState } from "react"
import { ensureDemoSeed } from "@/lib/demo-seed"

/**
 * Seeds the demo account's data synchronously, before the data providers it
 * wraps mount and read localStorage. The useState initializer runs during this
 * component's first render — which happens before any descendant effects — so
 * the providers always load the freshly seeded data on the very first login.
 *
 * It is a no-op for every non-demo user and on subsequent logins (guarded
 * inside ensureDemoSeed by a per-user marker key).
 */
export function DemoSeedGate({ children }: { children: React.ReactNode }) {
  useState(() => {
    ensureDemoSeed()
    return true
  })
  return <>{children}</>
}
