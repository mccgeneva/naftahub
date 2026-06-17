"use client"

import { createContext, useContext, useEffect, useState } from "react"
import { scopedKey } from "@/lib/user-scope"
import type { AesEquityComponent } from "@/lib/aes"

export type ProjectFundingStatus = "pending" | "approved" | "rejected"

export interface ProjectFundingRequest {
  id: string
  projectName: string
  sector: string
  jurisdiction: string
  description?: string
  currency: string
  /** Total financing facility requested. */
  facility: number
  /** Total equity obligation computed at submission via the AES tiered matrix. */
  totalEquity: number
  /** Blended effective equity rate (snapshot at submission). */
  effectiveRate: number
  /** Equity composition the client intends to provide. */
  equityComponents: AesEquityComponent[]
  /** Cash commitment band (snapshot at submission). */
  cashCommitmentMin: number
  cashCommitmentMax: number
  status: ProjectFundingStatus
  submittedAt: string
  decidedAt?: string
  decisionNote?: string
  /** Risk score (0–10) issued at approval; sets the applicable cash commitment. */
  riskScore?: number
  /** Applicable upfront cash commitment fixed at approval. */
  cashCommitment?: number
}

const KEY_BASE = "mcc.project-funding-requests.v1"
const storageKey = () => scopedKey(KEY_BASE)

export interface ApproveFundingOptions {
  riskScore?: number
  cashCommitment?: number
  note?: string
}

interface ProjectFundingContextValue {
  requests: ProjectFundingRequest[]
  /** Create a new pending project funding application awaiting Administrator approval. */
  addRequest: (
    request: Omit<
      ProjectFundingRequest,
      "status" | "submittedAt" | "decidedAt" | "decisionNote" | "riskScore" | "cashCommitment"
    >,
  ) => ProjectFundingRequest
  /** Approve a pending application, optionally fixing the risk score / cash commitment. */
  approveRequest: (id: string, opts?: ApproveFundingOptions) => ProjectFundingRequest | null
  /** Reject a pending application with an optional reason. */
  rejectRequest: (id: string, reason?: string) => ProjectFundingRequest | null
  hydrated: boolean
}

const ProjectFundingContext = createContext<ProjectFundingContextValue | null>(null)

export function ProjectFundingProvider({ children }: { children: React.ReactNode }) {
  const [requests, setRequests] = useState<ProjectFundingRequest[]>([])
  const [hydrated, setHydrated] = useState(false)

  // Load persisted requests once on mount so applications survive navigation,
  // reloads, and logout/login.
  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(storageKey())
      setRequests(stored ? (JSON.parse(stored) as ProjectFundingRequest[]) : [])
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
        setRequests(stored ? (JSON.parse(stored) as ProjectFundingRequest[]) : [])
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

  const addRequest: ProjectFundingContextValue["addRequest"] = (request) => {
    const full: ProjectFundingRequest = {
      ...request,
      status: "pending",
      submittedAt: new Date().toISOString(),
    }
    setRequests((prev) => [full, ...prev])
    return full
  }

  const approveRequest: ProjectFundingContextValue["approveRequest"] = (id, opts) => {
    let updated: ProjectFundingRequest | null = null
    setRequests((prev) =>
      prev.map((r) => {
        if (r.id === id && r.status === "pending") {
          updated = {
            ...r,
            status: "approved",
            decidedAt: new Date().toISOString(),
            riskScore: opts?.riskScore,
            cashCommitment: opts?.cashCommitment,
            decisionNote: opts?.note?.trim() || undefined,
          }
          return updated
        }
        return r
      }),
    )
    return updated
  }

  const rejectRequest: ProjectFundingContextValue["rejectRequest"] = (id, reason) => {
    let updated: ProjectFundingRequest | null = null
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
    <ProjectFundingContext.Provider
      value={{ requests, addRequest, approveRequest, rejectRequest, hydrated }}
    >
      {children}
    </ProjectFundingContext.Provider>
  )
}

export function useProjectFunding() {
  const ctx = useContext(ProjectFundingContext)
  if (!ctx) {
    throw new Error("useProjectFunding must be used within a ProjectFundingProvider")
  }
  return ctx
}
