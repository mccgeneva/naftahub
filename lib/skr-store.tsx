"use client"

import { createContext, useContext, useCallback, useEffect, useRef, useState } from "react"
import { scopedKey } from "@/lib/user-scope"
import {
  getMySkrRecords,
  getMySkrRequests,
  syncMySkrRequests,
} from "@/app/actions/skr"

// ---------------------------------------------------------------------------
// SKR (Safe Keeping Receipt) Trading Platform store.
//
// SKR records are administrator-managed instruments held under custody and
// assigned to a specific client account. Customers have READ-ONLY access to
// their own records; only administrators may create, modify, delete, transfer,
// or change the status of a record.
//
// Persistence mirrors the rest of the platform: the durable source of truth is
// Neon (lib/skr-db.ts + app/actions/skr.ts), keyed by the owning client's id,
// so administrators can assign and manage receipts that the client then sees on
// any device. The client view hydrates from the server and keeps a local
// localStorage cache purely for fast first paint. Administrators read/write any
// client's data through the passcode-gated server actions.
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
  /**
   * Whether this SKR's value has been credited to the owner's treasury balance
   * as pledged collateral for trading. Kept on the record so the credit is
   * idempotent (it can only be applied once) and reversible.
   */
  creditedToTreasury?: boolean
  /** EUR amount credited to treasury (may differ from faceValue if converted). */
  treasuryCreditAmount?: number
  /** When the treasury credit was applied (ISO). */
  treasuryCreditedAt?: string
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

// Per-user namespaced cache keys. The durable source of truth is now Neon (see
// lib/skr-db.ts + app/actions/skr.ts); localStorage is retained only as a
// non-authoritative cache so the client view paints instantly before the
// server reconciliation resolves.
const RECORDS_KEY = "mcc.skr-records.v1"
const REQUESTS_KEY = "mcc.skr-requests.v1"

const recordsKey = () => scopedKey(RECORDS_KEY)
const requestsKey = () => scopedKey(REQUESTS_KEY)

function readCache<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback
  try {
    const raw = window.localStorage.getItem(key)
    return raw ? (JSON.parse(raw) as T) : fallback
  } catch {
    return fallback
  }
}

function writeCache(key: string, value: unknown) {
  if (typeof window === "undefined") return
  try {
    window.localStorage.setItem(key, JSON.stringify(value))
  } catch {
    // ignore quota/availability errors
  }
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
  // Skip the server-mirror that the hydration/refresh setState would trigger,
  // so we never echo freshly-loaded data straight back to the server.
  const skipNextSync = useRef(true)

  // Reconcile records + requests with the authoritative server copy. Records are
  // read-only for the client (administrator-owned); requests are mirrored back
  // on change. We guard the next request-mirror so applying server data doesn't
  // bounce straight back.
  const reconcile = useCallback(() => {
    return Promise.all([getMySkrRecords(), getMySkrRequests()])
      .then(([rec, req]) => {
        if (rec.ok) {
          skipNextSync.current = true
          setRecords(rec.items.map((r) => r.data as unknown as SkrRecord))
        }
        if (req.ok) {
          skipNextSync.current = true
          setRequests(req.items.map((r) => r.data as unknown as SkrRequest))
        }
      })
      .catch(() => {})
  }, [])

  // Load once on mount: paint instantly from the local cache, then reconcile
  // with Neon (durable, cross-device, admin-managed).
  useEffect(() => {
    let active = true
    const cachedRecords = readCache<SkrRecord[]>(recordsKey(), [])
    const cachedRequests = readCache<SkrRequest[]>(requestsKey(), [])
    if (cachedRecords.length) setRecords(cachedRecords)
    if (cachedRequests.length) setRequests(cachedRequests)
    reconcile().finally(() => {
      if (active) setHydrated(true)
    })
    return () => {
      active = false
    }
  }, [reconcile])

  // Cache records locally on change for fast subsequent paints (read-only — no
  // server write; records are authored by the administrator).
  useEffect(() => {
    if (!hydrated) return
    writeCache(recordsKey(), records)
  }, [records, hydrated])

  // Cache requests and mirror them to the server (non-destructive: only new
  // requests are inserted; the custody desk's decisions are preserved).
  useEffect(() => {
    if (!hydrated) return
    writeCache(requestsKey(), requests)
    if (skipNextSync.current) {
      skipNextSync.current = false
      return
    }
    void syncMySkrRequests(requests.map((r) => ({ id: r.id, data: r as unknown as Record<string, unknown>, status: r.status })))
  }, [requests, hydrated])

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
      value={{ records, requests, addRequest, hydrated, refresh: reconcile }}
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
