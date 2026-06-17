"use client"

import { createContext, useContext, useEffect, useMemo, useState } from "react"
import { scopedKey, scopedKeyForUser } from "@/lib/user-scope"

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

// USD value of 1 unit of each currency, used to convert balances between
// currencies so the dashboard can show a single aggregated total.
const usdPerUnit: Record<string, number> = {
  USD: 1,
  EUR: 1.0892,
  GBP: 1.2645,
  CHF: 1.1303,
  JPY: 0.006688,
  AUD: 0.6542,
  CAD: 0.7416,
  SGD: 0.7407,
}

// Convert an amount from one currency into another using the USD-based rates.
export function convertCurrency(amount: number, from: string, to: string): number {
  const fromUsd = usdPerUnit[from] ?? 1
  const toUsd = usdPerUnit[to] ?? 1
  return (amount * fromUsd) / toUsd
}

interface LedgerContextValue {
  entries: LedgerEntry[]
  setEntries: React.Dispatch<React.SetStateAction<LedgerEntry[]>>
  /** Record an incoming payment (credit). Returns the stored entry. */
  addReceipt: (entry: Omit<LedgerEntry, "direction">) => LedgerEntry
  /** Record an outgoing payment (debit). Returns the stored entry. */
  addDebit: (entry: Omit<LedgerEntry, "direction">) => LedgerEntry
  /** Net available balance for a currency: completed credits minus completed debits. */
  balanceFor: (currency: string) => number
  /** Aggregated balance of every currency converted into the target currency. */
  totalIn: (currency: string) => number
  /** All currencies that have at least one entry. */
  currencies: string[]
  hydrated: boolean
}

const LedgerContext = createContext<LedgerContextValue | null>(null)

export function LedgerProvider({ children }: { children: React.ReactNode }) {
  const [entries, setEntries] = useState<LedgerEntry[]>([])
  const [hydrated, setHydrated] = useState(false)

  // Load persisted ledger once on mount so balances survive logout/login &
  // reloads. A fresh account (no stored data) starts completely empty, so all
  // balances read 0.00 and there is no transaction history.
  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(storageKey())
      setEntries(stored ? (JSON.parse(stored) as LedgerEntry[]) : [])
    } catch {
      setEntries([])
    }
    setHydrated(true)
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

  const balanceFor = (currency: string) =>
    entries
      .filter((e) => e.currency === currency && e.status === "completed")
      .reduce((sum, e) => sum + (e.direction === "credit" ? e.amount : -e.amount), 0)

  const currencies = useMemo(
    () => Array.from(new Set(entries.map((e) => e.currency))),
    [entries],
  )

  // Sum every currency's net balance, converted into the target currency.
  const totalIn = (currency: string) =>
    currencies.reduce((sum, cur) => sum + convertCurrency(balanceFor(cur), cur, currency), 0)

  return (
    <LedgerContext.Provider
      value={{ entries, setEntries, addReceipt, addDebit, balanceFor, totalIn, currencies, hydrated }}
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
