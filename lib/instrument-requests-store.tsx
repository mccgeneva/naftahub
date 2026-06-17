"use client"

import { createContext, useContext, useEffect, useState } from "react"
import { scopedKey } from "@/lib/user-scope"

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
      setInstruments(stored ? (JSON.parse(stored) as Instrument[]) : [])
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
        setInstruments(stored ? (JSON.parse(stored) as Instrument[]) : [])
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
