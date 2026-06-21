"use client"

import { useEffect, useState } from "react"
import { getMyResetEpoch } from "@/app/actions/reset-account"
import { scopedKey } from "@/lib/user-scope"
import { ACCOUNT_DATA_KEYS } from "@/lib/reset-account"

// Where the last-applied reset epoch is remembered, per user (namespaced).
const EPOCH_BASE = "mcc.reset-epoch.v1"

/**
 * Enforces an administrator account reset on the user's own device.
 *
 * Balances, transactions and most stores are cached in each user's browser
 * localStorage. An admin reset clears the SERVER, but cannot reach the user's
 * browser — so without this gate the money reappears after the user logs in
 * (the stale local copy is merged back in).
 *
 * On load we read the server-side reset epoch for the signed-in account. If it
 * is newer than the epoch this browser last applied, we purge every local
 * account store BEFORE the data providers mount, record the new epoch, and
 * reload so the providers hydrate from the now-empty server state. This makes
 * a reset stick on any device, every time.
 *
 * It blocks rendering only until the (fast) epoch check resolves, so stale
 * balances are never shown after a reset. Any failure fails open (renders
 * children) so a transient DB/network issue can never lock a user out.
 */
export function AccountResetGate({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = useState(false)

  useEffect(() => {
    let cancelled = false

    getMyResetEpoch()
      .then((serverEpoch) => {
        if (cancelled) return

        if (serverEpoch) {
          let localEpoch: string | null = null
          try {
            localEpoch = window.localStorage.getItem(scopedKey(EPOCH_BASE))
          } catch {
            localEpoch = null
          }

          if (localEpoch !== serverEpoch) {
            // A reset happened (or this device hasn't applied it yet). Purge all
            // per-user account stores, then record the epoch and reload so the
            // providers hydrate clean.
            try {
              for (const base of ACCOUNT_DATA_KEYS) {
                window.localStorage.removeItem(scopedKey(base))
                window.localStorage.removeItem(base)
              }
              window.localStorage.setItem(scopedKey(EPOCH_BASE), serverEpoch)
            } catch {
              // best-effort
            }
            window.location.reload()
            return
          }
        }

        setReady(true)
      })
      .catch(() => {
        if (!cancelled) setReady(true)
      })

    return () => {
      cancelled = true
    }
  }, [])

  if (!ready) return null
  return <>{children}</>
}
