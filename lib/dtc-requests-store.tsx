"use client"

import { createContext, useContext } from "react"
import { generateUetr } from "@/lib/swift-gpi"
import { mirrorSubmission } from "@/lib/approval-sync"
import { useServerRequestList } from "@/lib/use-server-request-list"

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
  /** DB approval id once mirrored, so admin decisions can be reconciled back. */
  approvalId?: string
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
  // List sourced entirely from the server (Neon), so submissions and admin
  // decisions are visible on any device/browser. No localStorage involved.
  const { records: requests, setRecords: setRequests, hydrated, refresh } =
    useServerRequestList<DTCRequest>("dtc")

  const addRequest: DTCRequestsContextValue["addRequest"] = (request) => {
    const full: DTCRequest = {
      ...request,
      id: generateDtcId(),
      uetr: generateUetr(),
      status: "pending",
      submittedAt: new Date().toISOString(),
    }
    setRequests([full, ...requests])
    // Mirror into the DB so the Administrator can review it cross-client; persist
    // the COMPLETE record under `payload.record` so the server rebuilds it anywhere.
    void mirrorSubmission({
      kind: "dtc",
      title: `${full.depository} ${full.direction === "deliver" ? "Deliver" : "Receive"} · ${full.securityName}`,
      summary: `${full.settlementBasis} ${full.direction} ${full.quantity.toLocaleString("en-US")} ${full.securityType} (${full.isin}) @ ${full.pricePercent}%${full.settlementBasis === "DVP" ? ` — cash ${full.currency} ${full.cashAmount.toLocaleString("en-US")}` : ""}`,
      amount: full.cashAmount || undefined,
      currency: full.currency,
      payload: { localId: full.id, uetr: full.uetr, depository: full.depository, direction: full.direction, isin: full.isin, record: full },
    }).then(() => {
      void refresh()
    })
    return full
  }

  // Admin decisions flow through the DB and surface here via server hydration.
  // These local mutators update the in-memory view immediately for interface
  // compatibility; the next refresh reconciles against authoritative state.
  const approveRequest: DTCRequestsContextValue["approveRequest"] = (id, settledEntryId) => {
    let updated: DTCRequest | null = null
    setRequests(
      requests.map((r) => {
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
