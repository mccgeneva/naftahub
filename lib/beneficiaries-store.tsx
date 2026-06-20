"use client"

import { createContext, useContext, useEffect, useRef, useState } from "react"
import { scopedKey, getActiveUserId } from "@/lib/user-scope"
import { getMyBeneficiaries, syncMyBeneficiaries } from "@/app/actions/beneficiaries"
import { DEMO_USER_ID } from "@/lib/users"
import { demoBeneficiaries } from "@/lib/demo-beneficiaries"

export type BeneficiaryType = "individual" | "corporate" | "financial_institution"
export type BeneficiaryStatus = "active" | "pending" | "suspended" | "blocked"

export interface Beneficiary {
  id: string
  type: BeneficiaryType
  name: string
  alias?: string
  accountNumber: string
  iban?: string
  swiftBic: string
  bankName: string
  bankAddress: string
  bankCountry: string
  beneficiaryAddress: string
  beneficiaryCity: string
  beneficiaryCountry: string
  beneficiaryPostalCode?: string
  currency: string
  status: BeneficiaryStatus
  isFavorite: boolean
  createdAt: string
  lastUsed?: string
  totalTransactions: number
  totalVolume: number
  notes?: string
  registrationNumber?: string
  vatNumber?: string
  dateOfBirth?: string
  nationality?: string
  kycVerified: boolean
  riskLevel: "low" | "medium" | "high"
  amlScreeningDate?: string
  correspondentBank?: string
  correspondentSwift?: string
  intermediaryBank?: string
  intermediarySwift?: string
}

const KEY_BASE = "mcc.beneficiaries.v1"
const storageKey = () => scopedKey(KEY_BASE)

// One-time marker (per user) for the demo beneficiary-book backfill. Ensures the
// rich petroleum/trade/finance counterparty list is merged in exactly once, so a
// demo user who later removes some entries doesn't see them re-appear.
const DEMO_BACKFILL_MARKER = "mcc.demo-beneficiaries-backfill.v1"

interface BeneficiariesContextValue {
  beneficiaries: Beneficiary[]
  setBeneficiaries: React.Dispatch<React.SetStateAction<Beneficiary[]>>
  addBeneficiary: (beneficiary: Beneficiary) => void
}

const BeneficiariesContext = createContext<BeneficiariesContextValue | null>(null)

export function BeneficiariesProvider({ children }: { children: React.ReactNode }) {
  const [beneficiaries, setBeneficiaries] = useState<Beneficiary[]>([])
  const [hydrated, setHydrated] = useState(false)
  // Skip the very first server-sync that the hydration setState would trigger,
  // so we never echo freshly-loaded data straight back to the server.
  const skipNextSync = useRef(true)
  // Guards the demo beneficiary-book backfill so it runs at most once per mount.
  const demoBackfillDone = useRef(false)

  // Load persisted beneficiaries once on mount. The durable source of truth is
  // the server (Neon), so admins can manage beneficiaries on behalf of users and
  // data survives across devices. We fall back to the local cache when the
  // server is unavailable (e.g. local dev without DATABASE_URL).
  useEffect(() => {
    let active = true

    // Seed instantly from the local cache for a fast first paint.
    let cached: Beneficiary[] = []
    try {
      const stored = window.localStorage.getItem(storageKey())
      if (stored) cached = JSON.parse(stored) as Beneficiary[]
    } catch {
      // ignore malformed storage
    }
    if (cached.length) setBeneficiaries(cached)

    // Then reconcile with the authoritative server copy.
    getMyBeneficiaries()
      .then((res) => {
        if (!active) return
        if (res.ok && res.beneficiaries.length) {
          setBeneficiaries(res.beneficiaries.map((b) => b.data as unknown as Beneficiary))
        }
      })
      .catch(() => {})
      .finally(() => {
        if (active) setHydrated(true)
      })

    return () => {
      active = false
    }
  }, [])

  // Persist on change: write the local cache (instant) and mirror to the server
  // (durable). Mirroring after hydration keeps the admin-visible copy in sync.
  useEffect(() => {
    if (!hydrated) return
    try {
      window.localStorage.setItem(storageKey(), JSON.stringify(beneficiaries))
    } catch {
      // ignore quota/availability errors
    }
    if (skipNextSync.current) {
      skipNextSync.current = false
      return
    }
    void syncMyBeneficiaries(
      beneficiaries.map((b) => ({ id: b.id, data: b as unknown as Record<string, unknown>, status: b.status })),
    ).catch(() => {})
  }, [beneficiaries, hydrated])

  // One-time demo backfill: after hydration, merge the rich petroleum / trade /
  // finance beneficiary book into the demo account. This runs against the
  // already-hydrated state (which reflects the durable server copy), so any
  // missing counterparties are added and then mirrored back to Neon by the
  // persist effect above. Strictly scoped to the demo user and guarded by a
  // per-user marker so it never touches other accounts or re-adds removed rows.
  useEffect(() => {
    if (!hydrated || demoBackfillDone.current) return
    demoBackfillDone.current = true
    if (getActiveUserId() !== DEMO_USER_ID) return
    try {
      if (window.localStorage.getItem(scopedKey(DEMO_BACKFILL_MARKER))) return
    } catch {
      return
    }
    const existing = new Set(beneficiaries.map((b) => b.id))
    const missing = demoBeneficiaries().filter((b) => !existing.has(b.id))
    try {
      window.localStorage.setItem(
        scopedKey(DEMO_BACKFILL_MARKER),
        JSON.stringify({ at: new Date().toISOString(), added: missing.length }),
      )
    } catch {
      // ignore availability errors — marker is best-effort
    }
    if (missing.length) {
      setBeneficiaries((prev) => {
        const have = new Set(prev.map((b) => b.id))
        return [...missing.filter((m) => !have.has(m.id)), ...prev]
      })
    }
  }, [hydrated, beneficiaries])

  const addBeneficiary = (beneficiary: Beneficiary) =>
    setBeneficiaries((prev) => [beneficiary, ...prev])

  return (
    <BeneficiariesContext.Provider value={{ beneficiaries, setBeneficiaries, addBeneficiary }}>
      {children}
    </BeneficiariesContext.Provider>
  )
}

export function useBeneficiaries() {
  const ctx = useContext(BeneficiariesContext)
  if (!ctx) {
    throw new Error("useBeneficiaries must be used within a BeneficiariesProvider")
  }
  return ctx
}
