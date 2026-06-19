"use client"

import { createContext, useContext, useEffect, useState } from "react"
import { generateUetr } from "@/lib/swift-gpi"
import { scopedKey } from "@/lib/user-scope"
import { mirrorSubmission } from "@/lib/approval-sync"
import { useApprovalReconcile } from "@/lib/use-approval-reconcile"

export type DOFRequestStatus = "pending" | "approved" | "rejected"

// Settlement rail used to deliver the institutional funds / assets.
export type DOFSettlementMethod = "SWIFT" | "DTC" | "Euroclear"

export interface DOFRequest {
  id: string // platform reference, e.g. "DOF-1A2B3C4D"
  /** DB approval id once mirrored, so admin decisions can be reconciled back. */
  approvalId?: string
  uetr: string // SWIFT gpi Unique End-to-End Transaction Reference (UUID v4)

  // Core transaction
  amount: number
  currency: string
  valueDate: string // requested value date (ISO yyyy-mm-dd)
  purpose: string // economic purpose / transaction description

  // Originating (sending) institution
  originatorName: string // ultimate originator / sender of funds
  originatorBank: string // sending bank name
  originatorBankBic: string // sending bank BIC/SWIFT
  originatorAccount: string // sending account / IBAN
  originatorCountry: string

  // Correspondent / intermediary coordination
  correspondentBank: string // intermediary bank routing the funds
  correspondentBic: string

  // SWIFT message + supporting documentation references
  mt103Ref: string // MT103 (single customer credit transfer)
  mt202Ref: string // MT202 (general financial institution transfer / cover)
  pofReference: string // Proof of Funds reference
  bclReference: string // Bank Comfort Letter reference

  // Settlement rail (SWIFT cash, or DTC / Euroclear securities delivery)
  settlementMethod: DOFSettlementMethod
  isin: string // for DTC / Euroclear securities settlement
  cusip: string // for DTC settlement

  notes: string

  status: DOFRequestStatus
  submittedAt: string // ISO timestamp
  decidedAt?: string // ISO timestamp of approval/rejection
  decisionNote?: string // administrator note (e.g. rejection reason)
  creditedEntryId?: string // ledger entry id created on approval
}

const KEY_BASE = "mcc.dof-requests.v1"
const storageKey = () => scopedKey(KEY_BASE)

interface DOFRequestsContextValue {
  requests: DOFRequest[]
  /** Create a new pending request (no funds move yet). Returns the stored record. */
  addRequest: (
    request: Omit<
      DOFRequest,
      "id" | "uetr" | "status" | "submittedAt" | "decidedAt" | "decisionNote" | "creditedEntryId"
    >,
  ) => DOFRequest
  /** Mark a pending request approved. Funds are credited by the caller (ledger). */
  approveRequest: (id: string, creditedEntryId?: string) => DOFRequest | null
  /** Mark a pending request rejected with an optional reason. No funds move. */
  rejectRequest: (id: string, reason?: string) => DOFRequest | null
  hydrated: boolean
}

const DOFRequestsContext = createContext<DOFRequestsContextValue | null>(null)

// Short, human-readable reference for the download-of-funds request.
function generateDofId(): string {
  return `DOF-${Math.random().toString(16).slice(2, 10).toUpperCase()}`
}

export function DOFRequestsProvider({ children }: { children: React.ReactNode }) {
  const [requests, setRequests] = useState<DOFRequest[]>([])
  const [hydrated, setHydrated] = useState(false)

  // Load persisted requests once on mount so submissions survive navigation,
  // reloads, and logout/login.
  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(storageKey())
      setRequests(stored ? (JSON.parse(stored) as DOFRequest[]) : [])
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

  // Keep state in sync when the data changes in another tab/window (e.g. the
  // Administrator approves in one place while the client views in another) or
  // when the user returns to a tab that was open in the background.
  useEffect(() => {
    if (!hydrated) return
    const resync = () => {
      try {
        const stored = window.localStorage.getItem(storageKey())
        setRequests(stored ? (JSON.parse(stored) as DOFRequest[]) : [])
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

  // Reconcile administrator decisions made cross-client (in the DB) back here.
  useApprovalReconcile("dof", hydrated, requests, setRequests)

  const addRequest: DOFRequestsContextValue["addRequest"] = (request) => {
    const full: DOFRequest = {
      ...request,
      id: generateDofId(),
      uetr: generateUetr(),
      status: "pending",
      submittedAt: new Date().toISOString(),
    }
    setRequests((prev) => [full, ...prev])
    // Mirror into the DB so the Administrator can review it cross-client.
    void mirrorSubmission({
      kind: "dof",
      title: `Download of Funds · ${full.originatorName}`,
      summary: `${full.currency} ${full.amount.toLocaleString("en-US")} from ${full.originatorName} via ${full.settlementMethod} (value ${full.valueDate}) — ${full.purpose}`,
      amount: full.amount,
      currency: full.currency,
      payload: { localId: full.id, uetr: full.uetr, settlementMethod: full.settlementMethod, originatorBankBic: full.originatorBankBic },
    }).then((approvalId) => {
      if (!approvalId) return
      setRequests((prev) => prev.map((r) => (r.id === full.id ? { ...r, approvalId } : r)))
    })
    return full
  }

  const approveRequest: DOFRequestsContextValue["approveRequest"] = (id, creditedEntryId) => {
    let updated: DOFRequest | null = null
    setRequests((prev) =>
      prev.map((r) => {
        if (r.id === id && r.status === "pending") {
          updated = {
            ...r,
            status: "approved",
            decidedAt: new Date().toISOString(),
            creditedEntryId,
          }
          return updated
        }
        return r
      }),
    )
    return updated
  }

  const rejectRequest: DOFRequestsContextValue["rejectRequest"] = (id, reason) => {
    let updated: DOFRequest | null = null
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
    <DOFRequestsContext.Provider
      value={{ requests, addRequest, approveRequest, rejectRequest, hydrated }}
    >
      {children}
    </DOFRequestsContext.Provider>
  )
}

export function useDOFRequests() {
  const ctx = useContext(DOFRequestsContext)
  if (!ctx) {
    throw new Error("useDOFRequests must be used within a DOFRequestsProvider")
  }
  return ctx
}
