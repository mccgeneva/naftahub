"use client"

import { createContext, useContext, useEffect, useState } from "react"
import { scopedKey } from "@/lib/user-scope"

export type FiduciaryRequestStatus = "pending" | "approved" | "rejected"

// The catalogue of fiduciary service jobs a client can raise from the
// Fiduciary & Assets section. Each maps to a back-office workflow that the
// Administrator (custody desk) actions.
export type FiduciaryServiceType =
  | "open_mandate"
  | "deposit_asset"
  | "release_asset"
  | "custody_review"
  | "statement"

export const FIDUCIARY_SERVICE_LABELS: Record<FiduciaryServiceType, string> = {
  open_mandate: "Open Fiduciary Mandate",
  deposit_asset: "Deposit Asset into Custody",
  release_asset: "Release / Withdraw Asset",
  custody_review: "Schedule Custody Review",
  statement: "Request Asset Statement",
}

export interface FiduciaryRequest {
  id: string // platform reference, e.g. "FID-1A2B3C4D"
  serviceType: FiduciaryServiceType
  serviceLabel: string
  /** Free-text asset class / instrument (e.g. "Gold bullion", "SBLC", "Equities"). */
  assetType: string
  /** Indicative value of the asset / mandate, when applicable. */
  estimatedValue: number
  currency: string
  /** Client instructions / supporting context for the custody desk. */
  notes: string
  status: FiduciaryRequestStatus
  submittedAt: string // ISO timestamp
  decidedAt?: string // ISO timestamp of approval/rejection
  decisionNote?: string // administrator note (e.g. rejection reason)
}

const KEY_BASE = "mcc.fiduciary-requests.v1"
const storageKey = () => scopedKey(KEY_BASE)

interface FiduciaryRequestsContextValue {
  requests: FiduciaryRequest[]
  addRequest: (
    request: Omit<
      FiduciaryRequest,
      "id" | "status" | "submittedAt" | "decidedAt" | "decisionNote"
    >,
  ) => FiduciaryRequest
  approveRequest: (id: string, note?: string) => FiduciaryRequest | null
  rejectRequest: (id: string, reason?: string) => FiduciaryRequest | null
  hydrated: boolean
}

const FiduciaryRequestsContext = createContext<FiduciaryRequestsContextValue | null>(null)

function generateFiduciaryId(): string {
  return `FID-${Math.random().toString(16).slice(2, 10).toUpperCase()}`
}

export function FiduciaryRequestsProvider({ children }: { children: React.ReactNode }) {
  const [requests, setRequests] = useState<FiduciaryRequest[]>([])
  const [hydrated, setHydrated] = useState(false)

  // Load persisted requests once on mount so submissions survive navigation,
  // reloads, and logout/login.
  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(storageKey())
      setRequests(stored ? (JSON.parse(stored) as FiduciaryRequest[]) : [])
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
        setRequests(stored ? (JSON.parse(stored) as FiduciaryRequest[]) : [])
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

  const addRequest: FiduciaryRequestsContextValue["addRequest"] = (request) => {
    const full: FiduciaryRequest = {
      ...request,
      id: generateFiduciaryId(),
      status: "pending",
      submittedAt: new Date().toISOString(),
    }
    setRequests((prev) => [full, ...prev])
    return full
  }

  const approveRequest: FiduciaryRequestsContextValue["approveRequest"] = (id, note) => {
    let updated: FiduciaryRequest | null = null
    setRequests((prev) =>
      prev.map((r) => {
        if (r.id === id && r.status === "pending") {
          updated = {
            ...r,
            status: "approved",
            decidedAt: new Date().toISOString(),
            decisionNote: note?.trim() || undefined,
          }
          return updated
        }
        return r
      }),
    )
    return updated
  }

  const rejectRequest: FiduciaryRequestsContextValue["rejectRequest"] = (id, reason) => {
    let updated: FiduciaryRequest | null = null
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
    <FiduciaryRequestsContext.Provider
      value={{ requests, addRequest, approveRequest, rejectRequest, hydrated }}
    >
      {children}
    </FiduciaryRequestsContext.Provider>
  )
}

export function useFiduciaryRequests() {
  const ctx = useContext(FiduciaryRequestsContext)
  if (!ctx) {
    throw new Error("useFiduciaryRequests must be used within a FiduciaryRequestsProvider")
  }
  return ctx
}
