"use client"

import { createContext, useContext, useEffect, useState } from "react"
import { scopedKey } from "@/lib/user-scope"
import { mirrorSubmission } from "@/lib/approval-sync"
import { useApprovalReconcile } from "@/lib/use-approval-reconcile"

export type PPPRequestStatus = "pending" | "approved" | "rejected"

export interface PPPRequest {
  id: string
  /** DB approval id once mirrored, so admin decisions can be reconciled back. */
  approvalId?: string
  programId: string
  programName: string
  expectedReturn: string
  returnFrequency: string
  duration: string
  currency: string
  amount: number // requested investment amount
  sourceOfFunds: string
  payoutAccount: string
  status: PPPRequestStatus
  submittedAt: string // ISO timestamp of the client request
  decidedAt?: string // ISO timestamp of approval/rejection
  decisionNote?: string // administrator note (e.g. rejection reason)
}

const KEY_BASE = "mcc.ppp-requests.v1"
const storageKey = () => scopedKey(KEY_BASE)

interface PPPRequestsContextValue {
  requests: PPPRequest[]
  /** Create a new pending PPP application awaiting Administrator approval. */
  addRequest: (
    request: Omit<PPPRequest, "status" | "submittedAt" | "decidedAt" | "decisionNote">,
  ) => PPPRequest
  /** Approve a pending application — the investment is activated. */
  approveRequest: (id: string) => PPPRequest | null
  /** Reject a pending application with an optional reason. */
  rejectRequest: (id: string, reason?: string) => PPPRequest | null
  hydrated: boolean
}

const PPPRequestsContext = createContext<PPPRequestsContextValue | null>(null)

export function PPPRequestsProvider({ children }: { children: React.ReactNode }) {
  const [requests, setRequests] = useState<PPPRequest[]>([])
  const [hydrated, setHydrated] = useState(false)

  // Load persisted requests once on mount so applications survive navigation,
  // reloads, and logout/login.
  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(storageKey())
      setRequests(stored ? (JSON.parse(stored) as PPPRequest[]) : [])
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
        setRequests(stored ? (JSON.parse(stored) as PPPRequest[]) : [])
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
  useApprovalReconcile("ppp", hydrated, requests, setRequests)

  const addRequest: PPPRequestsContextValue["addRequest"] = (request) => {
    const full: PPPRequest = {
      ...request,
      status: "pending",
      submittedAt: new Date().toISOString(),
    }
    setRequests((prev) => [full, ...prev])
    // Mirror into the DB so the Administrator can review it cross-client.
    void mirrorSubmission({
      kind: "ppp",
      title: full.programName,
      summary: `${full.currency} ${full.amount.toLocaleString("en-US")} into ${full.programName} (${full.expectedReturn} ${full.returnFrequency})`,
      amount: full.amount,
      currency: full.currency,
      payload: { localId: full.id, programId: full.programId, sourceOfFunds: full.sourceOfFunds },
    }).then((approvalId) => {
      if (!approvalId) return
      setRequests((prev) => prev.map((r) => (r.id === full.id ? { ...r, approvalId } : r)))
    })
    return full
  }

  const approveRequest: PPPRequestsContextValue["approveRequest"] = (id) => {
    let updated: PPPRequest | null = null
    setRequests((prev) =>
      prev.map((r) => {
        if (r.id === id && r.status === "pending") {
          updated = { ...r, status: "approved", decidedAt: new Date().toISOString() }
          return updated
        }
        return r
      }),
    )
    return updated
  }

  const rejectRequest: PPPRequestsContextValue["rejectRequest"] = (id, reason) => {
    let updated: PPPRequest | null = null
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
    <PPPRequestsContext.Provider
      value={{ requests, addRequest, approveRequest, rejectRequest, hydrated }}
    >
      {children}
    </PPPRequestsContext.Provider>
  )
}

export function usePPPRequests() {
  const ctx = useContext(PPPRequestsContext)
  if (!ctx) {
    throw new Error("usePPPRequests must be used within a PPPRequestsProvider")
  }
  return ctx
}
