"use client"

import { createContext, useContext, useEffect, useMemo, useState } from "react"
import { scopedKey, scopedKeyForUser, getActiveUserId } from "@/lib/user-scope"
import { getMyLedger } from "@/app/actions/ledger"
import { reconcileMyApprovedCredits } from "@/app/actions/approvals"
import { DEMO_USER_ID } from "@/lib/users"
import { convertCurrency } from "@/lib/fx"

export type LedgerDirection = "credit" | "debit"
export type LedgerStatus = "completed" | "hold"

export interface LedgerEntry {
  id: string // receipt / reference number, e.g. "PPY3175227"
  direction: LedgerDirection
  amount: number // always positive; direction determines sign
  currency: string
  status: LedgerStatus
  date: string // ISO date
  counterparty: string // sender (for credits) or beneficiary (for debits)
  account?: string // counterparty account number
  bank?: string // counterparty bank
  reference?: string
  comment?: string
  category?: string
}

const KEY_BASE = "mcc.ledger.v1"
const storageKey = () => scopedKey(KEY_BASE)

// --- Privacy purge ----------------------------------------------------------
// One-time, demo-scoped cleanup of a privacy leak: a stale instant-transfer
// debit recorded in the demo account's *local* ledger that exposed another
// client's name and email (Jobaida Akter / jobaida.akter1996@libero.it). Instant
// transfers are only ever stored in localStorage (never the server ledger), so
// the durable record is clean — this scrubs the residual client-side copy on
// whatever device still holds it. Guarded by a marker so it runs exactly once
// and never interferes with the user's own legitimate future activity.
const PRIVACY_PURGE_MARKER = "mcc.ledger-privacy-purge.v1"
const PURGE_NEEDLES = ["jobaida.akter1996@libero.it", "jobaida akter"]

function entryReferencesLeakedIdentity(e: LedgerEntry): boolean {
  const haystack = [e.counterparty, e.account, e.comment, e.reference]
    .filter(Boolean)
    .join(" ")
    .toLowerCase()
  return PURGE_NEEDLES.some((needle) => haystack.includes(needle))
}

/**
 * Strip leaked-identity entries from the demo account's locally stored ledger.
 * Returns the cleaned list. Writes the marker and the cleaned data back to
 * localStorage so it is idempotent and persists across reloads.
 */
function purgeLeakedIdentity(local: LedgerEntry[]): LedgerEntry[] {
  if (typeof window === "undefined") return local
  if (getActiveUserId() !== DEMO_USER_ID) return local
  try {
    if (window.localStorage.getItem(scopedKey(PRIVACY_PURGE_MARKER))) return local
  } catch {
    return local
  }
  const cleaned = local.filter((e) => !entryReferencesLeakedIdentity(e))
  try {
    window.localStorage.setItem(
      scopedKey(PRIVACY_PURGE_MARKER),
      JSON.stringify({ at: new Date().toISOString(), removed: local.length - cleaned.length }),
    )
    if (cleaned.length !== local.length) {
      window.localStorage.setItem(storageKey(), JSON.stringify(cleaned))
    }
  } catch {
    // best-effort; marker write failure just means it may retry next load
  }
  return cleaned
}

/**
 * Merge server-persisted entries (written by the administrator panel into the
 * Postgres ledger) with the locally stored ones. Server entries are
 * authoritative: when the same entry id exists in both, the server version
 * wins. Anything that only exists locally (e.g. transfers recorded in this
 * browser before they were synced) is preserved. The result is sorted by date
 * descending so the newest activity appears first.
 */
function mergeLedgers(local: LedgerEntry[], server: LedgerEntry[]): LedgerEntry[] {
  const byId = new Map<string, LedgerEntry>()
  for (const e of local) byId.set(e.id, e)
  for (const e of server) byId.set(e.id, e) // server overrides local on id clash
  return Array.from(byId.values()).sort(
    (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime(),
  )
}

/**
 * Append a credit entry directly into another user's persisted ledger.
 *
 * Used by internal P2P transfers: the recipient is a different tenant whose
 * ledger lives under their own namespaced localStorage key. We read that key,
 * prepend the new credit, and write it back. The recipient picks the credit up
 * the next time their LedgerProvider hydrates (login / reload), exactly like an
 * externally received payment. Returns true on success.
 *
 * Note: this only runs in the browser (localStorage). The active sender's own
 * balance must be updated through the live `addDebit` from `useLedger()` so the
 * UI reflects it immediately.
 */
export function creditUserLedger(userId: string, entry: Omit<LedgerEntry, "direction">): boolean {
  if (typeof window === "undefined") return false
  try {
    const key = scopedKeyForUser(KEY_BASE, userId)
    const stored = window.localStorage.getItem(key)
    const existing = stored ? (JSON.parse(stored) as LedgerEntry[]) : []
    const full: LedgerEntry = { ...entry, direction: "credit" }
    window.localStorage.setItem(key, JSON.stringify([full, ...existing]))
    return true
  } catch {
    return false
  }
}

// Re-exported (imported at top) from the shared, server-safe FX module so
// existing imports from "@/lib/ledger-store" keep working while server actions
// can use the same rates.
export { convertCurrency }

interface LedgerContextValue {
  entries: LedgerEntry[]
  setEntries: React.Dispatch<React.SetStateAction<LedgerEntry[]>>
  /** Record an incoming payment (credit). Returns the stored entry. */
  addReceipt: (entry: Omit<LedgerEntry, "direction">) => LedgerEntry
  /** Record an outgoing payment (debit). Returns the stored entry. */
  addDebit: (entry: Omit<LedgerEntry, "direction">) => LedgerEntry
  /** Net available balance for a currency: completed credits minus completed
   *  debits, minus any funds currently on hold (reserved). Reserved funds are
   *  not spendable, so they are excluded from the available balance. */
  balanceFor: (currency: string) => number
  /** Funds currently reserved/blocked (sum of held debits) for a currency. */
  reservedFor: (currency: string) => number
  /** Aggregated balance of every currency converted into the target currency. */
  totalIn: (currency: string) => number
  /** All currencies that have at least one entry. */
  currencies: string[]
  /** Re-read the persisted ledger from storage (e.g. after an admin edit to the
   *  currently signed-in account) so the live view reflects the change. */
  refresh: () => void
  hydrated: boolean
}

const LedgerContext = createContext<LedgerContextValue | null>(null)

export function LedgerProvider({ children }: { children: React.ReactNode }) {
  const [entries, setEntries] = useState<LedgerEntry[]>([])
  const [hydrated, setHydrated] = useState(false)

  // Load persisted ledger once on mount so balances survive logout/login &
  // reloads. We start from the locally stored entries (instant, offline-safe),
  // then pull the server-side ledger — which is where administrator-posted
  // credits/debits live — and merge it in so admin activity reflects on the
  // client's dashboard. A fresh account with no data anywhere reads 0.00.
  useEffect(() => {
    let cancelled = false

    let localEntries: LedgerEntry[] = []
    try {
      const stored = window.localStorage.getItem(storageKey())
      localEntries = stored ? (JSON.parse(stored) as LedgerEntry[]) : []
    } catch {
      localEntries = []
    }
    // One-time privacy purge of any leaked-identity entry before first render.
    localEntries = purgeLeakedIdentity(localEntries)
    setEntries(localEntries)
    setHydrated(true)

    // Back-fill ledger credits for any already-approved requests (e.g. an
    // approved instrument monetization), then pull the authoritative server
    // ledger and merge admin-posted entries in. Reconcile first so freshly
    // back-filled credits are included in the same fetch.
    reconcileMyApprovedCredits()
      .catch(() => {
        // best-effort; reconciliation failure must not block reading the ledger
      })
      .then(() => getMyLedger())
      .then((serverEntries) => {
        if (cancelled || !serverEntries || serverEntries.length === 0) return
        setEntries((prev) => {
          const merged = mergeLedgers(prev, serverEntries)
          try {
            window.localStorage.setItem(storageKey(), JSON.stringify(merged))
          } catch {
            // ignore quota/availability errors
          }
          return merged
        })
      })
      .catch(() => {
        // Server unreachable (e.g. DB not configured) — keep local entries.
      })

    return () => {
      cancelled = true
    }
  }, [])

  // Persist on change (only after hydration to avoid clobbering stored data).
  useEffect(() => {
    if (!hydrated) return
    try {
      window.localStorage.setItem(storageKey(), JSON.stringify(entries))
    } catch {
      // ignore quota/availability errors
    }
  }, [entries, hydrated])

  const addReceipt = (entry: Omit<LedgerEntry, "direction">) => {
    const full: LedgerEntry = { ...entry, direction: "credit" }
    setEntries((prev) => [full, ...prev])
    return full
  }

  const addDebit = (entry: Omit<LedgerEntry, "direction">) => {
    const full: LedgerEntry = { ...entry, direction: "debit" }
    setEntries((prev) => [full, ...prev])
    return full
  }

  // Funds currently reserved/blocked: held debits (e.g. an approved commodity
  // deal earmarking funds to settle the supplier). Held credits are ignored —
  // incoming pending money is not yet available either way.
  const reservedFor = (currency: string) =>
    entries
      .filter((e) => e.currency === currency && e.status === "hold" && e.direction === "debit")
      .reduce((sum, e) => sum + e.amount, 0)

  // Available (spendable) balance: settled credits minus settled debits, minus
  // anything currently on hold. Reserved funds cannot be spent, so they reduce
  // the available balance everywhere it is read (send, payments, exchange…).
  const balanceFor = (currency: string) => {
    const settled = entries
      .filter((e) => e.currency === currency && e.status === "completed")
      .reduce((sum, e) => sum + (e.direction === "credit" ? e.amount : -e.amount), 0)
    return settled - reservedFor(currency)
  }

  const currencies = useMemo(
    () => Array.from(new Set(entries.map((e) => e.currency))),
    [entries],
  )

  // Sum every currency's net balance, converted into the target currency.
  const totalIn = (currency: string) =>
    currencies.reduce((sum, cur) => sum + convertCurrency(balanceFor(cur), cur, currency), 0)

  // Re-read persisted entries from storage and re-pull the server ledger. Used
  // after an out-of-band write (e.g. an administrator editing the signed-in
  // account's ledger) so the live view reflects the change without a reload.
  const refresh = () => {
    let localEntries: LedgerEntry[] = []
    try {
      const stored = window.localStorage.getItem(storageKey())
      localEntries = stored ? (JSON.parse(stored) as LedgerEntry[]) : []
    } catch {
      localEntries = []
    }
    setEntries(localEntries)

    reconcileMyApprovedCredits()
      .catch(() => {
        // best-effort; do not block the refresh on reconciliation
      })
      .then(() => getMyLedger())
      .then((serverEntries) => {
        if (!serverEntries || serverEntries.length === 0) return
        setEntries((prev) => {
          const merged = mergeLedgers(prev, serverEntries)
          try {
            window.localStorage.setItem(storageKey(), JSON.stringify(merged))
          } catch {
            // ignore availability errors
          }
          return merged
        })
      })
      .catch(() => {
        // Server unreachable — keep local entries.
      })
  }

  return (
    <LedgerContext.Provider
      value={{ entries, setEntries, addReceipt, addDebit, balanceFor, reservedFor, totalIn, currencies, refresh, hydrated }}
    >
      {children}
    </LedgerContext.Provider>
  )
}

export function useLedger() {
  const ctx = useContext(LedgerContext)
  if (!ctx) {
    throw new Error("useLedger must be used within a LedgerProvider")
  }
  return ctx
}
