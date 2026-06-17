"use client"

// ---------------------------------------------------------------------------
// Treasury Services store.
//
// Each client has a single Treasury Services record holding their security
// deposit status, any leverage facility granted by MCC CAPITAL, the resulting
// debit exposure financed by MCC HOLDING SA, and a treasury transaction
// history. Like every other store in the platform it is persisted in
// localStorage, namespaced per user via `scopedKey` so accounts stay isolated.
//
// Permissions are enforced by surface, matching the specification:
//   • Customers use `useTreasury()` (this file) to READ their own record only.
//   • The Administrator panel writes to ANY client via the cross-user helpers
//     at the bottom of this file (mirroring lib/admin-ledger.ts).
// ---------------------------------------------------------------------------

import { createContext, useContext, useEffect, useState, useCallback } from "react"
import { getMyTreasury } from "@/app/actions/treasury"

// --- Account profiles & their required security deposits --------------------

export type TreasuryProfileKey = "pro" | "avantgarde"

export interface TreasuryProfile {
  key: TreasuryProfileKey
  label: string
  /** Required security deposit, in EUR. */
  requiredDeposit: number
  description: string
}

export const TREASURY_PROFILES: TreasuryProfile[] = [
  {
    key: "pro",
    label: "PRO Account",
    requiredDeposit: 500_000,
    description: "Professional treasury profile requiring a €500,000 security deposit.",
  },
  {
    key: "avantgarde",
    label: "Avant-Garde Account",
    requiredDeposit: 1_000_000,
    description: "Premier treasury profile requiring a €1,000,000 security deposit.",
  },
]

export function getProfile(key: TreasuryProfileKey): TreasuryProfile {
  return TREASURY_PROFILES.find((p) => p.key === key) ?? TREASURY_PROFILES[0]
}

// Security deposits and the leverage facility are denominated in EUR.
export const TREASURY_CURRENCY = "EUR"

// Maximum leverage that may be approved by the administrator on a security
// deposit: 1:10. With it, a €50,000 contribution covers a €500,000 PRO deposit
// and €100,000 covers a €1,000,000 Avant-Garde deposit. The administrator must
// explicitly approve the facility per client.
export const MAX_LEVERAGE_RATIO = 10

/**
 * Minimum customer contribution required to reach `requiredDeposit` under the
 * approved 1:10 leverage facility (i.e. 10% of the required deposit).
 */
export function leverageMinContribution(requiredDeposit: number): number {
  return Math.ceil(requiredDeposit / MAX_LEVERAGE_RATIO)
}

// Annual debit cycle fee charged on leveraged positions. Applied to the
// financed (leveraged) amount of the security deposit plus any financial
// transaction exposure associated with the leverage facility.
export const DEBIT_CYCLE_FEE_RATE = 0.018 // 1.8% per year

const MS_PER_YEAR = 365 * 24 * 60 * 60 * 1000

// --- Record types -----------------------------------------------------------

export type TreasuryStatus =
  | "none" // no treasury account established yet
  | "pending" // established, awaiting funding / approval
  | "secured" // security deposit fully satisfied
  | "shortfall" // contribution + leverage does not cover the requirement
  | "closed" // facility closed

export type TreasuryTxnType =
  | "deposit" // customer security deposit contribution received
  | "leverage" // leverage drawdown financed by MCC HOLDING SA
  | "fee" // debit cycle fee charged
  | "adjustment" // manual adjustment
  | "settlement" // repayment / settlement of exposure

export interface TreasuryTransaction {
  id: string
  date: string // ISO
  type: TreasuryTxnType
  label: string
  amount: number
  currency: string
  note?: string
}

export interface TreasuryAccount {
  /** Selected account profile (drives the required deposit). */
  profile: TreasuryProfileKey
  currency: string
  /** Required security deposit for the profile (EUR). */
  requiredDeposit: number
  /** Funds actually contributed by the customer (EUR). */
  customerContribution: number
  /** Whether a leverage facility has been granted by MCC CAPITAL. */
  leverageEnabled: boolean
  /** Applied leverage ratio, e.g. 10 for 1:10. */
  leverageRatio: number
  /** Amount financed by MCC HOLDING SA to reach the full deposit (debit exposure). */
  financedAmount: number
  /** Additional financial transaction exposure tied to the leverage facility. */
  transactionExposure: number
  /** Annual debit cycle fee rate (1.8%). */
  feeRate: number
  status: TreasuryStatus
  establishedAt?: string
  securedAt?: string // when the deposit requirement was satisfied (fee accrual start)
  updatedAt?: string
  note?: string
  transactions: TreasuryTransaction[]
}

/** A brand-new, empty treasury record. */
export function emptyTreasuryAccount(): TreasuryAccount {
  return {
    profile: "pro",
    currency: TREASURY_CURRENCY,
    requiredDeposit: getProfile("pro").requiredDeposit,
    customerContribution: 0,
    leverageEnabled: false,
    leverageRatio: 1,
    financedAmount: 0,
    transactionExposure: 0,
    feeRate: DEBIT_CYCLE_FEE_RATE,
    status: "none",
    transactions: [],
  }
}

// --- Derived calculations ---------------------------------------------------

/** Total credited to treasury = customer contribution + financed (leveraged) amount. */
export function treasurySecured(account: TreasuryAccount): number {
  return account.customerContribution + (account.leverageEnabled ? account.financedAmount : 0)
}

/** Remaining shortfall against the required deposit (0 if fully secured). */
export function treasuryShortfall(account: TreasuryAccount): number {
  return Math.max(0, account.requiredDeposit - treasurySecured(account))
}

/** Annual debit cycle fee = 1.8% of (financed amount + transaction exposure). */
export function annualCycleFee(account: TreasuryAccount): number {
  if (!account.leverageEnabled) return 0
  return (account.financedAmount + account.transactionExposure) * account.feeRate
}

/**
 * Debit cycle fee accrued from when the facility was secured up to `asOf`.
 * Returns 0 when there is no active leverage facility.
 */
export function accruedCycleFee(account: TreasuryAccount, asOf: number = Date.now()): number {
  if (!account.leverageEnabled) return 0
  const startIso = account.securedAt ?? account.establishedAt
  if (!startIso) return 0
  const start = new Date(startIso).getTime()
  const elapsedMs = Math.max(0, asOf - start)
  return annualCycleFee(account) * (elapsedMs / MS_PER_YEAR)
}

// --- Customer-facing provider (read-only of their own record) ---------------
//
// The customer's treasury record now lives in the shared Neon database (server
// action `getMyTreasury`), so it is consistent across every device the client
// signs in from. The record is fetched on mount and re-fetched whenever the tab
// regains focus, so Administrator changes appear without a manual reload.

interface TreasuryContextValue {
  account: TreasuryAccount
  hydrated: boolean
  /** Re-fetch this user's treasury record from the server. */
  refresh: () => Promise<void>
}

const TreasuryContext = createContext<TreasuryContextValue | null>(null)

export function TreasuryProvider({ children }: { children: React.ReactNode }) {
  const [account, setAccount] = useState<TreasuryAccount>(() => emptyTreasuryAccount())
  const [hydrated, setHydrated] = useState(false)

  const refresh = useCallback(async () => {
    try {
      const next = await getMyTreasury()
      setAccount(next)
    } catch {
      // keep whatever we already have on a transient failure
    }
  }, [])

  useEffect(() => {
    void refresh().finally(() => setHydrated(true))
  }, [refresh])

  // Re-sync from the server when the tab regains focus so Administrator updates
  // (made in a separate session) appear for the client.
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

  return (
    <TreasuryContext.Provider value={{ account, hydrated, refresh }}>
      {children}
    </TreasuryContext.Provider>
  )
}

export function useTreasury() {
  const ctx = useContext(TreasuryContext)
  if (!ctx) {
    throw new Error("useTreasury must be used within a TreasuryProvider")
  }
  return ctx
}
