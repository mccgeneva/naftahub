"use client"

import { createContext, useContext } from "react"
import { generateUetr } from "@/lib/swift-gpi"
import { mirrorSubmission } from "@/lib/approval-sync"
import { useServerRequestList } from "@/lib/use-server-request-list"

export type EuroclearRequestStatus = "pending" | "approved" | "rejected"

// Which side of the trade the client is on.
//  - "deliver"  = deliver securities OUT and (for DVP) receive cash IN  -> credit
//  - "receive"  = receive securities IN and (for DVP) pay cash OUT      -> debit
export type EuroclearDirection = "deliver" | "receive"

// Settlement basis: Delivery/Receive vs Payment (cash leg moves) or Free of
// Payment (book-entry only, no cash movement).
export type EuroclearSettlementBasis = "DVP" | "FOP"

export interface EuroclearRequest {
  id: string // platform reference, e.g. "EOC-1A2B3C4D"
  /** DB approval id once mirrored, so admin decisions can be reconciled back. */
  approvalId?: string
  uetr: string // SWIFT gpi Unique End-to-End Transaction Reference (UUID v4)

  // Trade direction + settlement basis
  direction: EuroclearDirection
  settlementBasis: EuroclearSettlementBasis

  // Security being settled (Euroclear is book-entry; ISIN is the primary id)
  securityName: string // issuer / security description
  securityType: string // e.g. Bond, Eurobond, MTN, Equity, Treasury Note
  isin: string
  quantity: number // units / nominal (face) amount of the security
  pricePercent: string // clean price as % of par (free text, e.g. "99.250")

  // Cash leg (only meaningful for DVP settlement)
  cashAmount: number
  currency: string

  // Euroclear participant / custodian coordination
  euroclearAccount: string // client's Euroclear securities account number
  custodianBank: string // custodian / settlement agent bank
  custodianBic: string

  // Counterparty
  counterpartyName: string
  counterpartyAccount: string // counterparty Euroclear account
  counterpartyBic: string

  // Dates
  tradeDate: string // ISO yyyy-mm-dd
  valueDate: string // settlement date, ISO yyyy-mm-dd

  // Settlement messaging / documentation
  mt54xRef: string // MT540-543 securities settlement instruction reference
  mt54xRaw?: string // generated FIN message (if produced)
  safekeepingRef: string // safekeeping / power of attorney / authorization reference

  notes: string

  status: EuroclearRequestStatus
  submittedAt: string // ISO timestamp
  decidedAt?: string // ISO timestamp of approval/rejection
  decisionNote?: string // administrator note (e.g. rejection reason)
  settledEntryId?: string // ledger entry id created on approval (DVP cash leg)
}

interface EuroclearRequestsContextValue {
  requests: EuroclearRequest[]
  /** Create a new pending request (no settlement yet). Returns the stored record. */
  addRequest: (
    request: Omit<
      EuroclearRequest,
      "id" | "uetr" | "status" | "submittedAt" | "decidedAt" | "decisionNote" | "settledEntryId"
    >,
  ) => EuroclearRequest
  /** Mark a pending request approved/settled. Cash leg is moved by the caller. */
  approveRequest: (id: string, settledEntryId?: string) => EuroclearRequest | null
  /** Mark a pending request rejected with an optional reason. No settlement. */
  rejectRequest: (id: string, reason?: string) => EuroclearRequest | null
  hydrated: boolean
}

const EuroclearRequestsContext = createContext<EuroclearRequestsContextValue | null>(null)

// Short, human-readable reference for the securities settlement request.
function generateEuroclearId(): string {
  return `EOC-${Math.random().toString(16).slice(2, 10).toUpperCase()}`
}

export function EuroclearRequestsProvider({ children }: { children: React.ReactNode }) {
  // List sourced entirely from the server (Neon), so submissions and admin
  // decisions are visible on any device/browser. No localStorage involved.
  const { records: requests, setRecords: setRequests, hydrated, refresh } =
    useServerRequestList<EuroclearRequest>("euroclear")

  const addRequest: EuroclearRequestsContextValue["addRequest"] = (request) => {
    const full: EuroclearRequest = {
      ...request,
      id: generateEuroclearId(),
      uetr: generateUetr(),
      status: "pending",
      submittedAt: new Date().toISOString(),
    }
    setRequests([full, ...requests])
    // Mirror into the DB so the Administrator can review it cross-client; persist
    // the COMPLETE record under `payload.record` so the server rebuilds it anywhere.
    void mirrorSubmission({
      kind: "euroclear",
      title: `Euroclear ${full.direction === "deliver" ? "Deliver" : "Receive"} · ${full.securityName}`,
      summary: `${full.settlementBasis} ${full.direction} ${full.quantity.toLocaleString("en-US")} ${full.securityType} (${full.isin}) @ ${full.pricePercent}%${full.settlementBasis === "DVP" ? ` — cash ${full.currency} ${full.cashAmount.toLocaleString("en-US")}` : ""}`,
      amount: full.cashAmount || undefined,
      currency: full.currency,
      payload: { localId: full.id, uetr: full.uetr, direction: full.direction, isin: full.isin, record: full },
    }).then(() => {
      void refresh()
    })
    return full
  }

  // Admin decisions flow through the DB and surface here via server hydration.
  // These local mutators update the in-memory view immediately for interface
  // compatibility; the next refresh reconciles against authoritative state.
  const approveRequest: EuroclearRequestsContextValue["approveRequest"] = (id, settledEntryId) => {
    let updated: EuroclearRequest | null = null
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

  const rejectRequest: EuroclearRequestsContextValue["rejectRequest"] = (id, reason) => {
    let updated: EuroclearRequest | null = null
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
    <EuroclearRequestsContext.Provider
      value={{ requests, addRequest, approveRequest, rejectRequest, hydrated }}
    >
      {children}
    </EuroclearRequestsContext.Provider>
  )
}

export function useEuroclearRequests() {
  const ctx = useContext(EuroclearRequestsContext)
  if (!ctx) {
    throw new Error("useEuroclearRequests must be used within a EuroclearRequestsProvider")
  }
  return ctx
}
