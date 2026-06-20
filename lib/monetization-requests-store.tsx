"use client"

import { createContext, useContext, useEffect, useState } from "react"
import { generateUetr } from "@/lib/swift-gpi"
import { scopedKey } from "@/lib/user-scope"
import { mirrorSubmission } from "@/lib/approval-sync"
import { useApprovalReconcile } from "@/lib/use-approval-reconcile"

export type MonetizationStatus = "pending" | "approved" | "rejected"

// How the monetization is structured against the underlying bank instrument.
export type MonetizationStructure =
  | "CreditLine" // non-recourse credit line / loan secured by the instrument
  | "Discounting" // outright discounting / purchase of the instrument
  | "CollateralTransfer" // collateral transfer (SWIFT MT760) for credit enhancement

export interface MonetizationRequest {
  id: string // platform reference, e.g. "MON-1A2B3C4D"
  /** DB approval id once mirrored, so admin decisions can be reconciled back. */
  approvalId?: string
  uetr: string // SWIFT gpi Unique End-to-End Transaction Reference (UUID v4)

  // Underlying bank instrument being monetized
  instrumentId: string // reference of the instrument in the holder's portfolio
  instrumentType: string // short code, e.g. "SBLC", "BG", "MTN"
  instrumentTypeFull: string // full name, e.g. "Standby Letter of Credit"
  issuer: string // issuing bank of the instrument
  faceValue: number // face / nominal value of the instrument
  currency: string

  // Collateral base actually being monetized. For a plain instrument this equals
  // faceValue; for an instrument pledged to an approved leverage line it is the
  // leveraged value (faceValue × leverageRatio), e.g. €50M BG at 1:5 -> €250M.
  monetizedValue: number
  leverageRatio?: number // leverage multiplier on the underlying, when leveraged

  // Monetization economics
  structure: MonetizationStructure
  advanceRatePercent: number // loan-to-value / advance rate (% of monetized value)
  grossProceeds: number // computed: monetizedValue * advanceRate
  proceedsCurrency: string

  // Coordination / counterparties
  monetizationPlatform: string // monetizer / program name
  receivingBank: string // bank receiving the proceeds (usually MCC master)
  receivingBankBic: string

  // SWIFT messaging + supporting documentation references
  mt760Ref: string // MT760 (guarantee / SBLC issuance or collateral transfer)
  mt799Ref: string // MT799 (free-format pre-advice / RWA assurance)
  mt760Raw?: string // generated MT760 FIN message (full SWIFT block structure)
  mt799Raw?: string // generated MT799 FIN message (full SWIFT block structure)
  pofReference: string // Proof of Funds reference
  bclReference: string // Bank Comfort Letter reference

  notes: string

  status: MonetizationStatus
  submittedAt: string // ISO timestamp
  decidedAt?: string // ISO timestamp of approval/rejection
  decisionNote?: string // administrator note (e.g. rejection reason)
  creditedEntryId?: string // ledger entry id created on approval
}

const KEY_BASE = "mcc.monetization-requests.v1"
const storageKey = () => scopedKey(KEY_BASE)

interface MonetizationRequestsContextValue {
  requests: MonetizationRequest[]
  /** Create a new pending request (no funds move yet). Returns the stored record. */
  addRequest: (
    request: Omit<
      MonetizationRequest,
      "id" | "uetr" | "status" | "submittedAt" | "decidedAt" | "decisionNote" | "creditedEntryId"
    >,
  ) => MonetizationRequest
  /** Mark a pending request approved. Proceeds are credited by the caller (ledger). */
  approveRequest: (id: string, creditedEntryId?: string) => MonetizationRequest | null
  /** Mark a pending request rejected with an optional reason. No funds move. */
  rejectRequest: (id: string, reason?: string) => MonetizationRequest | null
  hydrated: boolean
}

const MonetizationRequestsContext = createContext<MonetizationRequestsContextValue | null>(null)

// Short, human-readable reference for the monetization request.
function generateMonetizationId(): string {
  return `MON-${Math.random().toString(16).slice(2, 10).toUpperCase()}`
}

export function MonetizationRequestsProvider({ children }: { children: React.ReactNode }) {
  const [requests, setRequests] = useState<MonetizationRequest[]>([])
  const [hydrated, setHydrated] = useState(false)

  // Load persisted requests once on mount so submissions survive navigation,
  // reloads, and logout/login.
  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(storageKey())
      setRequests(stored ? (JSON.parse(stored) as MonetizationRequest[]) : [])
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
        setRequests(stored ? (JSON.parse(stored) as MonetizationRequest[]) : [])
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
  useApprovalReconcile("monetization", hydrated, requests, setRequests)

  const addRequest: MonetizationRequestsContextValue["addRequest"] = (request) => {
    const full: MonetizationRequest = {
      ...request,
      id: generateMonetizationId(),
      uetr: generateUetr(),
      status: "pending",
      submittedAt: new Date().toISOString(),
    }
    setRequests((prev) => [full, ...prev])
    // Mirror into the DB so the Administrator can review it cross-client.
    void mirrorSubmission({
      kind: "monetization",
      title: `${full.instrumentTypeFull} · ${full.issuer}`,
      summary: `Monetize ${full.currency} ${full.monetizedValue.toLocaleString("en-US")} ${full.instrumentTypeFull}${full.leverageRatio ? ` (leveraged 1:${full.leverageRatio} on ${full.currency} ${full.faceValue.toLocaleString("en-US")} face)` : ""} at ${full.advanceRatePercent}% (proceeds ${full.proceedsCurrency} ${full.grossProceeds.toLocaleString("en-US")})`,
      amount: full.grossProceeds,
      currency: full.proceedsCurrency,
      payload: { localId: full.id, uetr: full.uetr, structure: full.structure, instrumentId: full.instrumentId },
    }).then((approvalId) => {
      if (!approvalId) return
      setRequests((prev) => prev.map((r) => (r.id === full.id ? { ...r, approvalId } : r)))
    })
    return full
  }

  const approveRequest: MonetizationRequestsContextValue["approveRequest"] = (
    id,
    creditedEntryId,
  ) => {
    let updated: MonetizationRequest | null = null
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

  const rejectRequest: MonetizationRequestsContextValue["rejectRequest"] = (id, reason) => {
    let updated: MonetizationRequest | null = null
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
    <MonetizationRequestsContext.Provider
      value={{ requests, addRequest, approveRequest, rejectRequest, hydrated }}
    >
      {children}
    </MonetizationRequestsContext.Provider>
  )
}

export function useMonetizationRequests() {
  const ctx = useContext(MonetizationRequestsContext)
  if (!ctx) {
    throw new Error("useMonetizationRequests must be used within a MonetizationRequestsProvider")
  }
  return ctx
}
