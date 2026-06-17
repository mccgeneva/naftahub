"use client"

import { createContext, useContext, useEffect, useState } from "react"
import { scopedKey } from "@/lib/user-scope"

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

  // Load persisted beneficiaries once on mount
  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(storageKey())
      if (stored) {
        setBeneficiaries(JSON.parse(stored) as Beneficiary[])
      }
    } catch {
      // ignore malformed storage
    }
    setHydrated(true)
  }, [])

  // Persist on change (after initial hydration to avoid clobbering)
  useEffect(() => {
    if (!hydrated) return
    try {
      window.localStorage.setItem(storageKey(), JSON.stringify(beneficiaries))
    } catch {
      // ignore quota/availability errors
    }
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
