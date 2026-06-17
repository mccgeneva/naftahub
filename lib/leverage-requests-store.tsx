"use client"

import { createContext, useContext, useEffect, useState } from "react"
import { scopedKey } from "@/lib/user-scope"

export type LeverageRequestStatus =
  | "pending" // activation requested, awaiting admin
  | "approved" // active leverage line
  | "rejected" // activation declined
  | "switchoff_pending" // client requested switch-off, awaiting admin
  | "closed" // switched off and settled

export type LeverageAccountKey = "master" | "instruments" | "naftahub"

export interface LeverageAccountOption {
  key: LeverageAccountKey
  label: string
  description: string
}

// The three funding sources a leverage line can be opened against, per the
// platform's risk-management specification.
export const LEVERAGE_ACCOUNTS: LeverageAccountOption[] = [
  {
    key: "master",
    label: "Master Account",
    description: "Cash equity held in the MCC master treasury account.",
  },
  {
    key: "instruments",
    label: "Bank Instruments",
    description: "Monetizable bank instruments (SBLC, BG, MTN) pledged as collateral.",
  },
  {
    key: "naftahub",
    label: "NAFTAhub Trading",
    description: "Equity allocated to the NAFTAhub NQAi trading desk.",
  },
]

// Fixed maximum leverage offered by the platform (1:30).
export const MAX_LEVERAGE = 30

// Selectable leverage ratios offered to clients.
export const LEVERAGE_RATIOS = [2, 5, 10, 20, 30]

// Annual debit interest rate charged on the borrowed (leveraged) funds.
export const DEBIT_INTEREST_RATE = 0.018 // 1.8% per year

// Risk thresholds expressed as a margin level percentage (equity / used margin).
export const RISK_THRESHOLDS = {
  warning: 150, // below this -> margin warning
  marginCall: 100, // below this -> margin call
  stopOut: 50, // below this -> positions liquidated
}

export interface LeverageRequest {
  id: string
  account: LeverageAccountKey
  accountLabel: string
  equity: number // client's own allocated funds (base margin)
  currency: string
  leverageRatio: number // e.g. 5 for 1:5
  buyingPower: number // equity * leverageRatio (total leveraged position)
  borrowedAmount: number // equity * (leverageRatio - 1) -> credited to balance on approval
  interestRate: number // annual debit interest rate on the borrowed amount
  instrumentType: string // asset class to be traded
  notes?: string
  status: LeverageRequestStatus
  submittedAt: string
  decidedAt?: string // when the activation request was approved/rejected
  decisionNote?: string
  activatedAt?: string // when the line went live (interest accrual start)
  creditEntryId?: string // ledger entry id for the borrowed-funds credit
  switchOffRequestedAt?: string // when the client requested switch-off
  closedAt?: string // when the line was switched off and settled
  settledInterest?: number // total debit interest charged at close
  repayEntryId?: string // ledger entry id for the principal repayment debit
  interestEntryId?: string // ledger entry id for the interest settlement debit
}

const KEY_BASE = "mcc.leverage-requests.v1"
const storageKey = () => scopedKey(KEY_BASE)

const MS_PER_YEAR = 365 * 24 * 60 * 60 * 1000

// Compute the debit interest accrued on a line's borrowed amount between
// activation and the given point in time (defaults to now). For closed lines
// the accrual stops at the close timestamp. Returns 0 for lines that were
// never activated.
export function accruedInterest(request: LeverageRequest, asOf: number = Date.now()): number {
  if (!request.activatedAt) return 0
  const start = new Date(request.activatedAt).getTime()
  const end = request.closedAt ? new Date(request.closedAt).getTime() : asOf
  const elapsedMs = Math.max(0, end - start)
  return request.borrowedAmount * request.interestRate * (elapsedMs / MS_PER_YEAR)
}

interface ApproveSwitchOffPayload {
  settledInterest: number
  repayEntryId?: string
  interestEntryId?: string
}

interface LeverageRequestsContextValue {
  requests: LeverageRequest[]
  addRequest: (
    request: Omit<
      LeverageRequest,
      | "status"
      | "submittedAt"
      | "decidedAt"
      | "decisionNote"
      | "activatedAt"
      | "creditEntryId"
      | "switchOffRequestedAt"
      | "closedAt"
      | "settledInterest"
      | "repayEntryId"
      | "interestEntryId"
    >,
  ) => LeverageRequest
  approveRequest: (id: string, creditEntryId?: string) => LeverageRequest | null
  rejectRequest: (id: string, reason?: string) => LeverageRequest | null
  requestSwitchOff: (id: string) => LeverageRequest | null
  approveSwitchOff: (id: string, payload: ApproveSwitchOffPayload) => LeverageRequest | null
  rejectSwitchOff: (id: string, reason?: string) => LeverageRequest | null
  hydrated: boolean
}

const LeverageRequestsContext = createContext<LeverageRequestsContextValue | null>(null)

export function LeverageRequestsProvider({ children }: { children: React.ReactNode }) {
  const [requests, setRequests] = useState<LeverageRequest[]>([])
  const [hydrated, setHydrated] = useState(false)

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(storageKey())
      setRequests(stored ? (JSON.parse(stored) as LeverageRequest[]) : [])
    } catch {
      setRequests([])
    }
    setHydrated(true)
  }, [])

  useEffect(() => {
    if (!hydrated) return
    try {
      window.localStorage.setItem(storageKey(), JSON.stringify(requests))
    } catch {
      // ignore quota/availability errors
    }
  }, [requests, hydrated])

  // Keep state in sync across tabs/windows (e.g. Administrator approves while the
  // client watches) and when returning to a backgrounded tab.
  useEffect(() => {
    if (!hydrated) return
    const resync = () => {
      try {
        const stored = window.localStorage.getItem(storageKey())
        setRequests(stored ? (JSON.parse(stored) as LeverageRequest[]) : [])
      } catch {
        // ignore parse/availability errors
      }
    }
    const onStorage = (e: StorageEvent) => {
      if (e.key === storageKey()) resync()
    }
    const onVisible = () => {
      if (document.visibilityState === "visible") resync()
    }
    window.addEventListener("storage", onStorage)
    window.addEventListener("focus", resync)
    document.addEventListener("visibilitychange", onVisible)
    return () => {
      window.removeEventListener("storage", onStorage)
      window.removeEventListener("focus", resync)
      document.removeEventListener("visibilitychange", onVisible)
    }
  }, [hydrated])

  const addRequest: LeverageRequestsContextValue["addRequest"] = (request) => {
    const full: LeverageRequest = {
      ...request,
      status: "pending",
      submittedAt: new Date().toISOString(),
    }
    setRequests((prev) => [full, ...prev])
    return full
  }

  const approveRequest: LeverageRequestsContextValue["approveRequest"] = (id, creditEntryId) => {
    let updated: LeverageRequest | null = null
    const now = new Date().toISOString()
    setRequests((prev) =>
      prev.map((r) => {
        if (r.id === id && r.status === "pending") {
          updated = { ...r, status: "approved", decidedAt: now, activatedAt: now, creditEntryId }
          return updated
        }
        return r
      }),
    )
    return updated
  }

  const rejectRequest: LeverageRequestsContextValue["rejectRequest"] = (id, reason) => {
    let updated: LeverageRequest | null = null
    setRequests((prev) =>
      prev.map((r) => {
        if (r.id === id && r.status === "pending") {
          updated = {
            ...r,
            status: "rejected",
            decidedAt: new Date().toISOString(),
            decisionNote: reason?.trim() || undefined,
          }
          return updated
        }
        return r
      }),
    )
    return updated
  }

  // Client asks to switch off an active line. Moves it into the admin queue
  // without touching the ledger — settlement happens on admin approval.
  const requestSwitchOff: LeverageRequestsContextValue["requestSwitchOff"] = (id) => {
    let updated: LeverageRequest | null = null
    setRequests((prev) =>
      prev.map((r) => {
        if (r.id === id && r.status === "approved") {
          updated = { ...r, status: "switchoff_pending", switchOffRequestedAt: new Date().toISOString() }
          return updated
        }
        return r
      }),
    )
    return updated
  }

  // Admin approves the switch-off: the line is closed, accrued interest is
  // settled and the borrowed principal is repaid (ledger entries are created by
  // the caller and their ids stored here for the audit trail).
  const approveSwitchOff: LeverageRequestsContextValue["approveSwitchOff"] = (id, payload) => {
    let updated: LeverageRequest | null = null
    setRequests((prev) =>
      prev.map((r) => {
        if (r.id === id && r.status === "switchoff_pending") {
          updated = {
            ...r,
            status: "closed",
            closedAt: new Date().toISOString(),
            settledInterest: payload.settledInterest,
            repayEntryId: payload.repayEntryId,
            interestEntryId: payload.interestEntryId,
          }
          return updated
        }
        return r
      }),
    )
    return updated
  }

  // Admin declines the switch-off: the line stays active.
  const rejectSwitchOff: LeverageRequestsContextValue["rejectSwitchOff"] = (id, reason) => {
    let updated: LeverageRequest | null = null
    setRequests((prev) =>
      prev.map((r) => {
        if (r.id === id && r.status === "switchoff_pending") {
          updated = {
            ...r,
            status: "approved",
            switchOffRequestedAt: undefined,
            decisionNote: reason?.trim() || undefined,
          }
          return updated
        }
        return r
      }),
    )
    return updated
  }

  return (
    <LeverageRequestsContext.Provider
      value={{
        requests,
        addRequest,
        approveRequest,
        rejectRequest,
        requestSwitchOff,
        approveSwitchOff,
        rejectSwitchOff,
        hydrated,
      }}
    >
      {children}
    </LeverageRequestsContext.Provider>
  )
}

export function useLeverageRequests() {
  const ctx = useContext(LeverageRequestsContext)
  if (!ctx) {
    throw new Error("useLeverageRequests must be used within a LeverageRequestsProvider")
  }
  return ctx
}
