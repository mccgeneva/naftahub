"use client"

import { createContext, useCallback, useContext, useEffect, useState } from "react"
import {
  getMyGatewayAccounts,
  saveGatewayAccount,
  removeGatewayAccount,
} from "@/app/actions/gateway"

// ---------------------------------------------------------------------------
// Partner banks
// ---------------------------------------------------------------------------

// The partner-bank catalogue, types, and pure lookup helpers live in a
// server-safe module (no "use client") so they can be shared with server
// actions such as the account-inventory allocation logic. We re-export them
// here so existing `@/lib/gateway-store` imports keep working unchanged.
export {
  PARTNER_BANKS,
  BANK_REGIONS,
  partnerBankByKey,
  banksForCurrency,
  bankSupportsCurrency,
  suggestedBankFor,
} from "@/lib/partner-banks"
export type { PartnerBank, BankRegion } from "@/lib/partner-banks"

// ---------------------------------------------------------------------------
// Account types & currencies
// ---------------------------------------------------------------------------

// The account-type and currency catalogue lives in a server-safe module so it
// can be shared with server actions (e.g. the admin global config that
// enables/disables them). Re-exported here so existing imports keep working.
export {
  ACCOUNT_TYPES,
  ACCOUNT_TYPE_KEYS,
  GATEWAY_CURRENCIES,
  isAccountTypeKey,
  isGatewayCurrency,
} from "@/lib/gateway-catalog"
export type { GatewayAccountType } from "@/lib/gateway-catalog"

import type { GatewayAccountType } from "@/lib/gateway-catalog"

export type GatewayStatus = "pending" | "active" | "rejected" | "closed"

// A funding event recorded against an active account. It represents money that
// has landed at the partner bank and is reconciled into the Master Account.
export interface FundingEvent {
  id: string
  amount: number
  currency: string
  reference: string // payer reference / remittance info
  payer: string
  recordedAt: string
  reconciled: boolean
  reconciledAt?: string
  ledgerEntryId?: string // Master Account credit receipt id once reconciled
}

// Bank coordinates assigned by the administrator on approval.
export interface AccountCoordinates {
  partnerBankKey: string
  partnerBankName: string
  /** "iban" for IBAN jurisdictions, "domestic" for US/SG-style local clearing. */
  scheme: "iban" | "domestic"
  /** Present for IBAN-scheme accounts (validated, MOD-97 correct). */
  iban?: string
  bic: string
  accountNumber?: string
  /** US ABA routing / SG bank-branch code for domestic-scheme accounts. */
  routingNumber?: string
  reference: string // unique remittance reference clients quote on inbound payments
}

export interface GatewayAccount {
  id: string
  userId: string
  accountHolder: string
  company?: string
  type: GatewayAccountType
  currency: string
  purpose: string
  /** Client's chosen partner bank at request time. */
  preferredBankKey: string
  status: GatewayStatus
  submittedAt?: string
  decidedAt?: string
  closedAt?: string
  rejectionReason?: string
  coordinates?: AccountCoordinates
  funding: FundingEvent[]
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Total funds reconciled into the Master Account for an account. */
export function reconciledTotal(account: GatewayAccount): number {
  return account.funding
    .filter((f) => f.reconciled)
    .reduce((sum, f) => sum + f.amount, 0)
}

/** Total funds recorded but not yet reconciled (awaiting admin sweep). */
export function pendingFundingTotal(account: GatewayAccount): number {
  return account.funding
    .filter((f) => !f.reconciled)
    .reduce((sum, f) => sum + f.amount, 0)
}

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

interface GatewayContextValue {
  accounts: GatewayAccount[]
  hydrated: boolean
  /** Client submits a new account request (status pending). */
  requestAccount: (
    input: Omit<
      GatewayAccount,
      "id" | "status" | "submittedAt" | "decidedAt" | "closedAt" | "coordinates" | "funding"
    >,
  ) => GatewayAccount
  /** Admin approves a request and assigns partner-bank coordinates. */
  approveAccount: (id: string, coordinates: AccountCoordinates) => GatewayAccount | null
  /** Admin rejects a request. */
  rejectAccount: (id: string, reason?: string) => GatewayAccount | null
  /**
   * Record an inbound funding event AND mark it reconciled in a single atomic
   * update. The caller posts the Master Account credit first and passes the
   * resulting ledger entry id. Doing both in one state update + one persist
   * avoids a write race between recording and reconciling.
   */
  recordReconciledFunding: (
    id: string,
    event: Omit<FundingEvent, "id" | "recordedAt" | "reconciled">,
    ledgerEntryId: string,
  ) => GatewayAccount | null
  refresh: () => Promise<void>
}

const GatewayContext = createContext<GatewayContextValue | null>(null)

function genId(prefix: string) {
  return `${prefix}-${Math.random().toString(36).slice(2, 8).toUpperCase()}${Date.now().toString(36).slice(-4).toUpperCase()}`
}

export function GatewayProvider({ children }: { children: React.ReactNode }) {
  const [accounts, setAccounts] = useState<GatewayAccount[]>([])
  const [hydrated, setHydrated] = useState(false)

  // Gateway accounts live in the shared Neon database (one row per request,
  // scoped to the signed-in user) so the client and Administrator see the same
  // state across devices and sessions.
  const refresh = useCallback(async () => {
    try {
      setAccounts(await getMyGatewayAccounts())
    } catch {
      // keep whatever we have on a transient failure
    }
  }, [])

  useEffect(() => {
    void refresh().finally(() => setHydrated(true))
  }, [refresh])

  // Re-sync on focus so an Administrator decision in another session appears
  // without a manual reload.
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

  const persist = (account: GatewayAccount) => {
    void saveGatewayAccount(account)
  }

  const requestAccount: GatewayContextValue["requestAccount"] = (input) => {
    const full: GatewayAccount = {
      ...input,
      id: genId("GW"),
      status: "pending",
      submittedAt: new Date().toISOString(),
      funding: [],
    }
    setAccounts((prev) => [full, ...prev])
    persist(full)
    return full
  }

  const approveAccount: GatewayContextValue["approveAccount"] = (id, coordinates) => {
    let updated: GatewayAccount | null = null
    setAccounts((prev) =>
      prev.map((a) => {
        if (a.id === id && a.status === "pending") {
          updated = {
            ...a,
            status: "active",
            decidedAt: new Date().toISOString(),
            coordinates,
          }
          return updated
        }
        return a
      }),
    )
    if (updated) persist(updated)
    return updated
  }

  const rejectAccount: GatewayContextValue["rejectAccount"] = (id, reason) => {
    let updated: GatewayAccount | null = null
    setAccounts((prev) =>
      prev.map((a) => {
        if (a.id === id && a.status === "pending") {
          updated = {
            ...a,
            status: "rejected",
            decidedAt: new Date().toISOString(),
            rejectionReason: reason,
          }
          return updated
        }
        return a
      }),
    )
    if (updated) persist(updated)
    return updated
  }

  const recordReconciledFunding: GatewayContextValue["recordReconciledFunding"] = (id, event, ledgerEntryId) => {
    let updated: GatewayAccount | null = null
    const now = new Date().toISOString()
    setAccounts((prev) =>
      prev.map((a) => {
        if (a.id === id && a.status === "active") {
          const funding: FundingEvent = {
            ...event,
            id: genId("FND"),
            recordedAt: now,
            reconciled: true,
            reconciledAt: now,
            ledgerEntryId,
          }
          updated = { ...a, funding: [funding, ...a.funding] }
          return updated
        }
        return a
      }),
    )
    if (updated) persist(updated)
    return updated
  }

  return (
    <GatewayContext.Provider
      value={{
        accounts,
        hydrated,
        requestAccount,
        approveAccount,
        rejectAccount,
        recordReconciledFunding,
        refresh,
      }}
    >
      {children}
    </GatewayContext.Provider>
  )
}

export function useGateway() {
  const ctx = useContext(GatewayContext)
  if (!ctx) throw new Error("useGateway must be used within a GatewayProvider")
  return ctx
}
