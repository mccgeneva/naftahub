"use client"

import { createContext, useContext, useEffect, useState } from "react"
import { scopedKey, scopedKeyForUser } from "@/lib/user-scope"

// ---------------------------------------------------------------------------
// SKR (Safe Keeping Receipt) Trading Platform store.
//
// SKR records are administrator-managed instruments held under custody and
// assigned to a specific client account. Customers have READ-ONLY access to
// their own records; only administrators may create, modify, delete, transfer,
// or change the status of a record.
//
// Persistence mirrors the rest of the platform: per-user namespaced
// localStorage. The active-user view is reactive (React state + cross-tab
// resync); administrators mutate any client's namespace through the
// `*ForUser` helpers below, which the storage event then propagates to an open
// client view.
// ---------------------------------------------------------------------------

export type SkrStatus =
  | "active"
  | "pending"
  | "matured"
  | "transferred"
  | "suspended"
  | "cancelled"

export interface SkrTransaction {
  id: string
  date: string // ISO
  type: string // e.g. "Issuance", "Transfer", "Status Update", "Verification"
  description: string
  reference: string
}

export interface SkrDocument {
  id: string
  name: string
  docType: string // e.g. "SKR Certificate", "Custodian Confirmation"
  uploadedAt: string // ISO
  note?: string
}

export interface SkrRecord {
  /** Instrument reference number, e.g. SKR-0001. */
  id: string
  /** Issuing bank or custodian. */
  custodian: string
  /** Beneficial owner (legal name). */
  beneficialOwner: string
  faceValue: number
  currency: string
  issueDate: string // ISO date
  expiryDate?: string // ISO date (if applicable)
  /** Custody account reference. */
  custodyAccountRef: string
  status: SkrStatus
  /** Optional free-text custody / instrument notes. */
  notes?: string
  documents: SkrDocument[]
  transactions: SkrTransaction[]
  /** Id of the client account this record is assigned to. */
  assignedUserId: string
  createdAt: string // ISO
  updatedAt: string // ISO
}

export type SkrRequestType =
  | "Statement"
  | "Verification"
  | "Amendment"
  | "Transfer"
  | "Other"

export type SkrRequestStatus = "pending" | "approved" | "rejected"

export interface SkrRequest {
  id: string
  recordId: string // related SKR reference (may be "" for general)
  type: SkrRequestType
  message: string
  status: SkrRequestStatus
  submittedAt: string // ISO
  decidedAt?: string // ISO
  decisionNote?: string
}

const RECORDS_KEY = "mcc.skr-records.v1"
const REQUESTS_KEY = "mcc.skr-requests.v1"

const recordsKey = () => scopedKey(RECORDS_KEY)
const requestsKey = () => scopedKey(REQUESTS_KEY)

// --- Low-level, cross-user persistence helpers (used by the admin manager) ---

function readJson<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback
  try {
    const raw = window.localStorage.getItem(key)
    return raw ? (JSON.parse(raw) as T) : fallback
  } catch {
    return fallback
  }
}

function writeJson(key: string, value: unknown) {
  if (typeof window === "undefined") return
  try {
    window.localStorage.setItem(key, JSON.stringify(value))
    // Fire a storage-like event in the same tab so the active-user provider can
    // resync immediately (native storage events only fire in *other* tabs).
    window.dispatchEvent(new StorageEvent("storage", { key }))
  } catch {
    // ignore quota/availability errors
  }
}

/** Read every SKR record for a specific client account. */
export function getSkrRecordsForUser(userId: string): SkrRecord[] {
  return readJson<SkrRecord[]>(scopedKeyForUser(RECORDS_KEY, userId), [])
}

/** Overwrite the SKR records for a specific client account. */
export function setSkrRecordsForUser(userId: string, records: SkrRecord[]) {
  writeJson(scopedKeyForUser(RECORDS_KEY, userId), records)
}

/** Read every SKR client request for a specific client account. */
export function getSkrRequestsForUser(userId: string): SkrRequest[] {
  return readJson<SkrRequest[]>(scopedKeyForUser(REQUESTS_KEY, userId), [])
}

/** Overwrite the SKR client requests for a specific client account. */
export function setSkrRequestsForUser(userId: string, requests: SkrRequest[]) {
  writeJson(scopedKeyForUser(REQUESTS_KEY, userId), requests)
}

/** Generate a unique SKR reference number. */
export function generateSkrId(): string {
  const n = Math.floor(100000 + Math.random() * 900000)
  return `SKR-${n}`
}

export function generateSkrRef(prefix: string): string {
  const n = Math.floor(100000 + Math.random() * 900000)
  return `${prefix}-${n}`
}

// --- Active-user reactive context (customer-facing, read-mostly) ------------

interface SkrContextValue {
  records: SkrRecord[]
  requests: SkrRequest[]
  /** Customer submits a request concerning an instrument. */
  addRequest: (input: Omit<SkrRequest, "id" | "status" | "submittedAt">) => SkrRequest
  hydrated: boolean
  /** Force a re-read from storage (used after admin writes in the same tab). */
  refresh: () => void
}

const SkrContext = createContext<SkrContextValue | null>(null)

export function SkrProvider({ children }: { children: React.ReactNode }) {
  const [records, setRecords] = useState<SkrRecord[]>([])
  const [requests, setRequests] = useState<SkrRequest[]>([])
  const [hydrated, setHydrated] = useState(false)

  const load = () => {
    setRecords(readJson<SkrRecord[]>(recordsKey(), []))
    setRequests(readJson<SkrRequest[]>(requestsKey(), []))
  }

  useEffect(() => {
    load()
    setHydrated(true)
  }, [])

  // Persist requests on change (records are written by the admin helpers, not
  // mutated through the reactive provider).
  useEffect(() => {
    if (!hydrated) return
    writeJson(requestsKey(), requests)
  }, [requests, hydrated])

  // Resync when records/requests change in another tab or this tab (admin
  // writes), or when the tab regains focus.
  useEffect(() => {
    if (!hydrated) return
    const resync = () => {
      setRecords(readJson<SkrRecord[]>(recordsKey(), []))
      setRequests(readJson<SkrRequest[]>(requestsKey(), []))
    }
    const onStorage = (e: StorageEvent) => {
      if (e.key === recordsKey() || e.key === requestsKey()) resync()
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

  const addRequest: SkrContextValue["addRequest"] = (input) => {
    const full: SkrRequest = {
      ...input,
      id: generateSkrRef("SKRREQ"),
      status: "pending",
      submittedAt: new Date().toISOString(),
    }
    setRequests((prev) => [full, ...prev])
    return full
  }

  return (
    <SkrContext.Provider
      value={{ records, requests, addRequest, hydrated, refresh: load }}
    >
      {children}
    </SkrContext.Provider>
  )
}

export function useSkr() {
  const ctx = useContext(SkrContext)
  if (!ctx) throw new Error("useSkr must be used within an SkrProvider")
  return ctx
}

// --- Formatting helpers shared across SKR surfaces --------------------------

export function formatSkrValue(value: number, currency: string): string {
  return `${currency} ${value.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`
}

export const SKR_STATUS_LABELS: Record<SkrStatus, string> = {
  active: "Active",
  pending: "Pending",
  matured: "Matured",
  transferred: "Transferred",
  suspended: "Suspended",
  cancelled: "Cancelled",
}
