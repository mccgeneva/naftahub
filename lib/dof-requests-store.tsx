"use client"

import { createContext, useContext } from "react"
import { generateUetr } from "@/lib/swift-gpi"
import { mirrorSubmission } from "@/lib/approval-sync"
import { useServerRequestList } from "@/lib/use-server-request-list"

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
  // List sourced entirely from the server (Neon), so submissions and admin
  // decisions are visible on any device/browser. No localStorage involved.
  const { records: requests, setRecords: setRequests, hydrated, refresh } =
    useServerRequestList<DOFRequest>("dof")

  const addRequest: DOFRequestsContextValue["addRequest"] = (request) => {
    const full: DOFRequest = {
      ...request,
      id: generateDofId(),
      uetr: generateUetr(),
      status: "pending",
      submittedAt: new Date().toISOString(),
    }
    setRequests([full, ...requests])
    // Mirror into the DB so the Administrator can review it cross-client; persist
    // the COMPLETE record under `payload.record` so the server rebuilds it anywhere.
    void mirrorSubmission({
      kind: "dof",
      title: `Download of Funds · ${full.originatorName}`,
      summary: `${full.currency} ${full.amount.toLocaleString("en-US")} from ${full.originatorName} via ${full.settlementMethod} (value ${full.valueDate}) — ${full.purpose}`,
      amount: full.amount,
      currency: full.currency,
      payload: { localId: full.id, uetr: full.uetr, settlementMethod: full.settlementMethod, originatorBankBic: full.originatorBankBic, record: full },
    }).then(() => {
      void refresh()
    })
    return full
  }

  // Admin decisions flow through the DB and surface here via server hydration.
  // These local mutators update the in-memory view immediately for interface
  // compatibility; the next refresh reconciles against authoritative state.
  const approveRequest: DOFRequestsContextValue["approveRequest"] = (id, creditedEntryId) => {
    let updated: DOFRequest | null = null
    setRequests(
      requests.map((r) => {
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
