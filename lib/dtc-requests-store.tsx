"use client"

import { createContext, useContext, useEffect, useState } from "react"
import { generateUetr } from "@/lib/swift-gpi"
import { scopedKey } from "@/lib/user-scope"

export type DTCRequestStatus = "pending" | "approved" | "rejected"

// Securities depository / settlement venue.
export type DTCDepository = "DTC" | "Euroclear"

// Which side of the trade the client is on.
//  - "deliver"  = deliver securities OUT and (for DVP) receive cash IN  -> credit
//  - "receive"  = receive securities IN and (for DVP) pay cash OUT      -> debit
export type DTCDirection = "deliver" | "receive"

// Settlement basis: Delivery/Receive vs Payment (cash leg moves) or Free of
// Payment (book-entry only, no cash movement).
export type DTCSettlementBasis = "DVP" | "FOP"

export interface DTCRequest {
  id: string // platform reference, e.g. "DTC-1A2B3C4D"
  uetr: string // SWIFT gpi Unique End-to-End Transaction Reference (UUID v4)

  // Settlement venue + trade direction
  depository: DTCDepository
  direction: DTCDirection
  settlementBasis: DTCSettlementBasis

  // Security being settled
  securityName: string // issuer / security description
  securityType: string // e.g. Bond, Equity, MTN, Treasury Note
  isin: string
  cusip: string // primarily for DTC
  quantity: number // units / nominal (face) amount of the security
  pricePercent: string // clean price as % of par (free text, e.g. "99.250")

  // Cash leg (only meaningful for DVP settlement)
  cashAmount: number
  currency: string

  // Depository participant / agent coordination
  participantNumber: string // DTC participant # or Euroclear account
  agentBank: string // settlement / custodian agent bank
  agentBankBic: string

  // Counterparty
  counterpartyName: string
  counterpartyParticipant: string // counterparty DTC participant # / Euroclear acct
  counterpartyBic: string

  // Dates
  tradeDate: string // ISO yyyy-mm-dd
  valueDate: string // settlement date, ISO yyyy-mm-dd

  // Settlement messaging / documentation
  mt54xRef: string // MT540-543 securities settlement instruction reference
  poaReference: string // safekeeping / power of attorney / authorization reference

  notes: string

  status: DTCRequestStatus
  submittedAt: string // ISO timestamp
  decidedAt?: string // ISO timestamp of approval/rejection
  decisionNote?: string // administrator note (e.g. rejection reason)
  settledEntryId?: string // ledger entry id created on approval (DVP cash leg)
}

const KEY_BASE = "mcc.dtc-requests.v1"
const storageKey = () => scopedKey(KEY_BASE)

interface DTCRequestsContextValue {
  requests: DTCRequest[]
  /** Create a new pending request (no settlement yet). Returns the stored record. */
  addRequest: (
    request: Omit<
      DTCRequest,
      "id" | "uetr" | "status" | "submittedAt" | "decidedAt" | "decisionNote" | "settledEntryId"
    >,
  ) => DTCRequest
  /** Mark a pending request approved/settled. Cash leg is moved by the caller. */
  approveRequest: (id: string, settledEntryId?: string) => DTCRequest | null
  /** Mark a pending request rejected with an optional reason. No settlement. */
  rejectRequest: (id: string, reason?: string) => DTCRequest | null
  hydrated: boolean
}

const DTCRequestsContext = createContext<DTCRequestsContextValue | null>(null)

// Short, human-readable reference for the securities settlement request.
function generateDtcId(): string {
  return `DTC-${Math.random().toString(16).slice(2, 10).toUpperCase()}`
}

export function DTCRequestsProvider({ children }: { children: React.ReactNode }) {
  const [requests, setRequests] = useState<DTCRequest[]>([])
  const [hydrated, setHydrated] = useState(false)

  // Load persisted requests once on mount so submissions survive navigation,
  // reloads, and logout/login.
  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(storageKey())
      setRequests(stored ? (JSON.parse(stored) as DTCRequest[]) : [])
    } catch {
      setRequests([])
    }
    setHydrated(true)
  }, [])

  // Persist on change, but only after hydration to avoid clobbering stored data.
  useEffect(() => {
    if (!hydrated) return
    try {
      window.localStorage.setItem(storageKey(), JSON.stringify(requests))
    } catch {
      // ignore quota/availability errors
    }
  }, [requests, hydrated])

  // Keep state in sync across tabs/windows (e.g. the Administrator approves in
  // one place while the client views in another) and on tab refocus.
  useEffect(() => {
    if (!hydrated) return
    const resync = () => {
      try {
        const stored = window.localStorage.getItem(storageKey())
        setRequests(stored ? (JSON.parse(stored) as DTCRequest[]) : [])
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

  const addRequest: DTCRequestsContextValue["addRequest"] = (request) => {
    const full: DTCRequest = {
      ...request,
      id: generateDtcId(),
      uetr: generateUetr(),
      status: "pending",
      submittedAt: new Date().toISOString(),
    }
    setRequests((prev) => [full, ...prev])
    return full
  }

  const approveRequest: DTCRequestsContextValue["approveRequest"] = (id, settledEntryId) => {
    let updated: DTCRequest | null = null
    setRequests((prev) =>
      prev.map((r) => {
        if (r.id === id && r.status === "pending") {
          updated = {
            ...r,
            status: "approved",
            decidedAt: new Date().toISOString(),
            settledEntryId,
          }
          return updated
        }
        return r
      }),
    )
    return updated
  }

  const rejectRequest: DTCRequestsContextValue["rejectRequest"] = (id, reason) => {
    let updated: DTCRequest | null = null
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

  return (
    <DTCRequestsContext.Provider
      value={{ requests, addRequest, approveRequest, rejectRequest, hydrated }}
    >
      {children}
    </DTCRequestsContext.Provider>
  )
}

export function useDTCRequests() {
  const ctx = useContext(DTCRequestsContext)
  if (!ctx) {
    throw new Error("useDTCRequests must be used within a DTCRequestsProvider")
  }
  return ctx
}
