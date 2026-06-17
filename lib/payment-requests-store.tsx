"use client"

import { createContext, useContext, useEffect, useState } from "react"
import { generateUetr } from "@/lib/swift-gpi"
import { scopedKey } from "@/lib/user-scope"

export type PaymentRequestStatus = "pending" | "approved" | "rejected"

export interface PaymentRequest {
  id: string
  uetr: string // SWIFT gpi Unique End-to-End Transaction Reference (UUID v4)
  beneficiary: string
  beneficiaryCountry: string
  iban: string
  swiftCode: string
  reference: string
  notes: string
  currency: string
  amount: number // principal
  fee: number // 2% platform fee
  total: number // amount + fee
  payeeSource: string
  status: PaymentRequestStatus
  submittedAt: string // ISO timestamp
  decidedAt?: string // ISO timestamp of approval/rejection
  decisionNote?: string // administrator note (e.g. rejection reason)
  // --- Outgoing routing (assigned by the Administrator at approval) ---------
  routedBankKey?: string // PartnerBank.key the payment is settled through
  routedBankName?: string // human-readable partner bank name (denormalised)
  routedBankBic?: string // partner bank BIC (denormalised for display/audit)
}

/** Routing details assigned to an outgoing payment when it is approved. */
export interface PaymentRouting {
  routedBankKey: string
  routedBankName: string
  routedBankBic: string
}

const KEY_BASE = "mcc.payment-requests.v1"
const storageKey = () => scopedKey(KEY_BASE)

interface PaymentRequestsContextValue {
  requests: PaymentRequest[]
  /** Create a new pending request (no funds move yet). Returns the stored record. */
  addRequest: (
    request: Omit<
      PaymentRequest,
      "status" | "submittedAt" | "decidedAt" | "decisionNote" | "uetr"
    >,
  ) => PaymentRequest
  /** Mark a pending request approved. Funds are debited by the caller (ledger). */
  approveRequest: (id: string, routing?: PaymentRouting) => PaymentRequest | null
  /** Mark a pending request rejected with an optional reason. No funds move. */
  rejectRequest: (id: string, reason?: string) => PaymentRequest | null
  hydrated: boolean
}

const PaymentRequestsContext = createContext<PaymentRequestsContextValue | null>(null)

export function PaymentRequestsProvider({ children }: { children: React.ReactNode }) {
  const [requests, setRequests] = useState<PaymentRequest[]>([])
  const [hydrated, setHydrated] = useState(false)

  // Load persisted requests once on mount so submitted payments survive
  // navigation, reloads, and logout/login.
  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(storageKey())
      setRequests(stored ? (JSON.parse(stored) as PaymentRequest[]) : [])
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
        setRequests(stored ? (JSON.parse(stored) as PaymentRequest[]) : [])
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

  const addRequest: PaymentRequestsContextValue["addRequest"] = (request) => {
    const full: PaymentRequest = {
      ...request,
      uetr: generateUetr(),
      status: "pending",
      submittedAt: new Date().toISOString(),
    }
    setRequests((prev) => [full, ...prev])
    return full
  }

  const approveRequest: PaymentRequestsContextValue["approveRequest"] = (id, routing) => {
    let updated: PaymentRequest | null = null
    setRequests((prev) =>
      prev.map((r) => {
        if (r.id === id && r.status === "pending") {
          updated = {
            ...r,
            status: "approved",
            decidedAt: new Date().toISOString(),
            ...(routing
              ? {
                  routedBankKey: routing.routedBankKey,
                  routedBankName: routing.routedBankName,
                  routedBankBic: routing.routedBankBic,
                }
              : {}),
          }
          return updated
        }
        return r
      }),
    )
    return updated
  }

  const rejectRequest: PaymentRequestsContextValue["rejectRequest"] = (id, reason) => {
    let updated: PaymentRequest | null = null
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
    <PaymentRequestsContext.Provider
      value={{ requests, addRequest, approveRequest, rejectRequest, hydrated }}
    >
      {children}
    </PaymentRequestsContext.Provider>
  )
}

export function usePaymentRequests() {
  const ctx = useContext(PaymentRequestsContext)
  if (!ctx) {
    throw new Error("usePaymentRequests must be used within a PaymentRequestsProvider")
  }
  return ctx
}
