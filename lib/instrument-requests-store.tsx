"use client"

import { createContext, useContext, useEffect, useState } from "react"
import { scopedKey } from "@/lib/user-scope"
import { buildInstrumentIdentifiers } from "@/lib/instrument-identifiers"

/**
 * Ensure an instrument carries the full identifier set. Records created before
 * identifiers existed (or seeded demo data) are enriched once on load so every
 * instrument — old or new — exposes a valid ISIN, Common Code, serial, issuing
 * BIC and governing rules.
 */
function ensureIdentifiers(inst: Instrument): Instrument {
  if (inst.isin) return inst
  const ids = buildInstrumentIdentifiers(inst.issuer, inst.type, new Date(inst.issuedDate || Date.now()))
  return { ...inst, ...ids }
}

export type InstrumentStatus = "pending" | "active" | "rejected" | "cancelled" | "expired"

export interface Instrument {
  id: string
  type: string
  typeFull: string
  issuer: string
  faceValue: number
  currency: string
  status: InstrumentStatus
  issuedDate: string
  expiryDate: string
  daysRemaining: number
  rating: string
  purpose: string
  assignable: boolean
  monetizable: boolean
  tradeType?: string
  submittedAt?: string // ISO timestamp of the client request
  decidedAt?: string // ISO timestamp of approval/rejection
  decisionNote?: string // administrator note (e.g. rejection reason)

  // ---- Securities / settlement identifiers (optional for legacy records) ----
  /** International Securities Identification Number (valid check digit). */
  isin?: string
  /** Euroclear / Clearstream 9-digit Common Code. */
  commonCode?: string
  /** US CUSIP, present only for US-domiciled issuers. */
  cusip?: string
  /** Unique instrument serial / SWIFT documentary reference. */
  serialNumber?: string
  /** Issuing bank SWIFT/BIC. */
  issuerBic?: string
  /** Issuing bank registered office address. */
  issuerAddress?: string
  /** Issuing bank country of incorporation. */
  issuerCountry?: string
  /** Place of issuance (city/country). */
  placeOfIssue?: string
  /** Governing rules (ISP98 / URDG 758 / English Law, etc.). */
  governingLaw?: string
  /** Delivery method (SWIFT MT760 / book-entry). */
  deliveryMethod?: string
  /** Instrument form (documentary, global note, etc.). */
  form?: string
}

const KEY_BASE = "mcc.instruments.v1"
const storageKey = () => scopedKey(KEY_BASE)

interface InstrumentRequestsContextValue {
  instruments: Instrument[]
  /** Create a new pending instrument request awaiting Administrator approval. */
  addInstrument: (
    instrument: Omit<Instrument, "status" | "submittedAt" | "decidedAt" | "decisionNote">,
  ) => Instrument
  /** Approve a pending request — the instrument becomes active. */
  approveInstrument: (id: string) => Instrument | null
  /** Reject a pending request with an optional reason. */
  rejectInstrument: (id: string, reason?: string) => Instrument | null
  /** Client-side cancel (only meaningful for non-cancelled instruments). */
  cancelInstrument: (id: string) => void
  /** Permanently remove an instrument from the list. */
  deleteInstrument: (id: string) => void
  hydrated: boolean
}

const InstrumentRequestsContext = createContext<InstrumentRequestsContextValue | null>(null)

export function InstrumentRequestsProvider({ children }: { children: React.ReactNode }) {
  const [instruments, setInstruments] = useState<Instrument[]>([])
  const [hydrated, setHydrated] = useState(false)

  // Load persisted instruments once on mount so requests survive navigation,
  // reloads, and logout/login.
  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(storageKey())
      const parsed = stored ? (JSON.parse(stored) as Instrument[]) : []
      setInstruments(parsed.map(ensureIdentifiers))
    } catch {
      setInstruments([])
    }
    setHydrated(true)
  }, [])

  // Persist on change, but only after hydration to avoid clobbering stored data.
  useEffect(() => {
    if (!hydrated) return
    try {
      window.localStorage.setItem(storageKey(), JSON.stringify(instruments))
    } catch {
      // ignore quota/availability errors
    }
  }, [instruments, hydrated])

  // Keep state in sync when the data changes in another tab/window (e.g. the
  // Administrator approves in one place while the client views in another) or
  // when the user returns to a tab that was open in the background.
  useEffect(() => {
    if (!hydrated) return
    const resync = () => {
      try {
        const stored = window.localStorage.getItem(storageKey())
        const parsed = stored ? (JSON.parse(stored) as Instrument[]) : []
        setInstruments(parsed.map(ensureIdentifiers))
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

  const addInstrument: InstrumentRequestsContextValue["addInstrument"] = (instrument) => {
    const full: Instrument = {
      ...instrument,
      status: "pending",
      submittedAt: new Date().toISOString(),
    }
    setInstruments((prev) => [full, ...prev])
    return full
  }

  const approveInstrument: InstrumentRequestsContextValue["approveInstrument"] = (id) => {
    let updated: Instrument | null = null
    setInstruments((prev) =>
      prev.map((i) => {
        if (i.id === id && i.status === "pending") {
          updated = { ...i, status: "active", decidedAt: new Date().toISOString() }
          return updated
        }
        return i
      }),
    )
    return updated
  }

  const rejectInstrument: InstrumentRequestsContextValue["rejectInstrument"] = (id, reason) => {
    let updated: Instrument | null = null
    setInstruments((prev) =>
      prev.map((i) => {
        if (i.id === id && i.status === "pending") {
          updated = {
            ...i,
            status: "rejected",
            decidedAt: new Date().toISOString(),
            decisionNote: reason?.trim() || undefined,
          }
          return updated
        }
        return i
      }),
    )
    return updated
  }

  const cancelInstrument: InstrumentRequestsContextValue["cancelInstrument"] = (id) => {
    setInstruments((prev) =>
      prev.map((i) => (i.id === id ? { ...i, status: "cancelled" } : i)),
    )
  }

  const deleteInstrument: InstrumentRequestsContextValue["deleteInstrument"] = (id) => {
    setInstruments((prev) => prev.filter((i) => i.id !== id))
  }

  return (
    <InstrumentRequestsContext.Provider
      value={{
        instruments,
        addInstrument,
        approveInstrument,
        rejectInstrument,
        cancelInstrument,
        deleteInstrument,
        hydrated,
      }}
    >
      {children}
    </InstrumentRequestsContext.Provider>
  )
}

export function useInstrumentRequests() {
  const ctx = useContext(InstrumentRequestsContext)
  if (!ctx) {
    throw new Error("useInstrumentRequests must be used within an InstrumentRequestsProvider")
  }
  return ctx
}
