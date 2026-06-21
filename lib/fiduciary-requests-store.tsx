"use client"

import { createContext, useContext } from "react"
import { mirrorSubmission } from "@/lib/approval-sync"
import { useServerRequestList } from "@/lib/use-server-request-list"

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
  /** DB approval id once mirrored, so admin decisions can be reconciled back. */
  approvalId?: string
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
  // List sourced entirely from the server (Neon), so submissions and admin
  // decisions are visible on any device/browser. No localStorage involved.
  const { records: requests, setRecords: setRequests, hydrated, refresh } =
    useServerRequestList<FiduciaryRequest>("fiduciary")

  const addRequest: FiduciaryRequestsContextValue["addRequest"] = (request) => {
    const full: FiduciaryRequest = {
      ...request,
      id: generateFiduciaryId(),
      status: "pending",
      submittedAt: new Date().toISOString(),
    }
    setRequests([full, ...requests])
    // Mirror into the DB so the custody desk can review it; persist the COMPLETE
    // record under `payload.record` so the server can rebuild the view anywhere.
    void mirrorSubmission({
      kind: "fiduciary",
      title: `${full.serviceLabel} · ${full.assetType}`,
      summary: `${full.serviceLabel} — ${full.assetType}${full.estimatedValue ? ` (${full.currency} ${full.estimatedValue.toLocaleString("en-US")})` : ""}`,
      amount: full.estimatedValue || undefined,
      currency: full.currency,
      payload: { localId: full.id, serviceType: full.serviceType, assetType: full.assetType, record: full },
    }).then(() => {
      void refresh()
    })
    return full
  }

  // Admin decisions flow through the DB and surface here via server hydration.
  // These local mutators update the in-memory view immediately for interface
  // compatibility; the next refresh reconciles against authoritative state.
  const approveRequest: FiduciaryRequestsContextValue["approveRequest"] = (id, note) => {
    let updated: FiduciaryRequest | null = null
    setRequests(
      requests.map((r) => {
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
    setRequests(
      requests.map((r) => {
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
