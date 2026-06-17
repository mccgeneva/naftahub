"use client"

import { createContext, useContext, useEffect, useRef, useState } from "react"
import { scopedKey } from "@/lib/user-scope"
import { getMyBeneficiaries, syncMyBeneficiaries } from "@/app/actions/beneficiaries"

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
