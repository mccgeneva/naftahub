"use client"

import { createContext, useContext, useEffect, useState } from "react"
import { scopedKey, scopedKeyForUser } from "@/lib/user-scope"

// ---------------------------------------------------------------------------
// Official bank certificates store.
//
// Clients REQUEST one of four official certificates (Good Standing, Endorsement
// / Bank Reference Letter, Proof of Funds, Ownership). A request captures an
// immutable, verified snapshot of the account's identity + banking + balance
// data AT THE MOMENT OF REQUEST, so the issued certificate always reflects real
// account data and the audit trail can never be altered after the fact.
//
// An administrator (Compliance desk) must APPROVE a request before the
// certificate can be issued/downloaded — no certificate is ever produced
// without sign-off. Approval assigns the issuance date and the issued version.
//
// Persistence mirrors the rest of the platform: per-user namespaced
// localStorage. Customers see/manage only their own requests (reactive provider
// below). Administrators read and decide on ANY client's requests through the
// `*ForUser` helpers, which dispatch a same-tab StorageEvent so an open client
// view updates immediately. This keeps strict per-user data isolation.
// ---------------------------------------------------------------------------

export type CertificateType = "good-standing" | "endorsement" | "proof-of-funds" | "ownership"

export type CertificateStatus = "pending" | "approved" | "rejected"

/** A per-currency cleared-balance snapshot taken when the request is created. */
export interface CertificateBalance {
  currency: string
  amount: number
}

/** Immutable audit-trail entry appended on every lifecycle action. */
export interface CertificateAuditEvent {
  at: string // ISO timestamp
  action: "Requested" | "Approved" | "Rejected" | "Downloaded" | "Re-issued"
  actor: string // "Client" | "Compliance" | "Administrator"
  note?: string
}

export interface CertificateRequest {
  /** Internal request reference, e.g. CERT-1A2B3C4D. */
  id: string
  /** Public certificate reference printed on the document, e.g. MCC-COS-20260618-1842. */
  reference: string
  /** Short verification code used to authenticate the certificate. */
  verificationCode: string

  type: CertificateType
  /** Account scope this certificate covers: "master" | "cur:EUR" | "instruments". */
  accountScope: string
  accountLabel: string
  /** Why the client needs the certificate (shown to compliance + on the document). */
  purpose: string
  /** Optional named recipient (e.g. a correspondent bank) for reference letters / POF. */
  addressee?: string

  // ---- Immutable verified snapshot captured at request time ----------------
  holderName: string
  holderCompany?: string
  bankName?: string
  bankAddress?: string
  beneficiaryAddress?: string
  iban?: string
  bic?: string
  accountEmail?: string
  /** Per-currency cleared balances (Proof of Funds). */
  balances: CertificateBalance[]
  /** Aggregate of all balances converted to EUR (headline figure). */
  totalEur: number
  /** Primary currency used for the headline funds figure. */
  displayCurrency: string

  // ---- Lifecycle -----------------------------------------------------------
  status: CertificateStatus
  /** Issued version. 0 while pending/rejected; 1 on first issuance, incremented on re-issue. */
  version: number
  submittedAt: string // ISO
  decidedAt?: string // ISO
  decisionNote?: string
  issuedAt?: string // ISO — issuance date printed on an approved certificate
  approvedBy?: string
  events: CertificateAuditEvent[]
}

const REQUESTS_KEY = "mcc.certificate-requests.v1"
const requestsKey = () => scopedKey(REQUESTS_KEY)

// --- Type metadata shared across surfaces -----------------------------------

export const CERTIFICATE_TYPE_LABELS: Record<CertificateType, string> = {
  "good-standing": "Certificate of Good Standing",
  endorsement: "Certificate of Endorsement",
  "proof-of-funds": "Certificate of Proof of Funds",
  ownership: "Certificate of Ownership",
}

/** Secondary / native-language title shown under the main title. */
export const CERTIFICATE_TYPE_SUBTITLES: Record<CertificateType, string> = {
  "good-standing": "Confirmation of Active Account in Good Standing",
  endorsement: "Bank Reference Letter — Lettera di Referenza Bancaria",
  "proof-of-funds": "Verified Statement of Available Cleared Funds",
  ownership: "Confirmation of Legal & Beneficial Account Ownership",
}

export const CERTIFICATE_TYPE_DESCRIPTIONS: Record<CertificateType, string> = {
  "good-standing":
    "Certifies that the account is active, in good standing and that the relationship has been maintained without adverse findings.",
  endorsement:
    "An official bank reference endorsing the account holder's conduct and standing, addressed to a recipient of your choice.",
  "proof-of-funds":
    "A verified statement confirming the cleared funds available on the account as of the issuance date.",
  ownership:
    "Confirms the account holder is the sole legal and beneficial owner of the account and the assets held therein.",
}

/** 3-letter code used inside the public reference number. */
export const CERTIFICATE_TYPE_CODE: Record<CertificateType, string> = {
  "good-standing": "COS",
  endorsement: "REF",
  "proof-of-funds": "POF",
  ownership: "OWN",
}

// --- Low-level cross-user persistence (used by the admin manager) -----------

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
    // Same-tab notification so the active-user provider resyncs immediately
    // (native storage events only fire in *other* tabs).
    window.dispatchEvent(new StorageEvent("storage", { key }))
  } catch {
    // ignore quota/availability errors
  }
}

/** Read every certificate request for a specific client account. */
export function getCertificateRequestsForUser(userId: string): CertificateRequest[] {
  return readJson<CertificateRequest[]>(scopedKeyForUser(REQUESTS_KEY, userId), [])
}

/** Overwrite the certificate requests for a specific client account. */
export function setCertificateRequestsForUser(userId: string, requests: CertificateRequest[]) {
  writeJson(scopedKeyForUser(REQUESTS_KEY, userId), requests)
}

// --- Reference / id generators ----------------------------------------------

export function generateCertificateId(): string {
  return `CERT-${Math.random().toString(16).slice(2, 10).toUpperCase()}`
}

export function generateCertificateReference(type: CertificateType, date = new Date()): string {
  const code = CERTIFICATE_TYPE_CODE[type]
  const stamp = date.toISOString().slice(0, 10).replace(/-/g, "")
  const suffix = String(1000 + Math.floor(Math.random() * 9000))
  return `MCC-${code}-${stamp}-${suffix}`
}

export function generateVerificationCode(): string {
  const part = () => Math.random().toString(36).slice(2, 6).toUpperCase()
  return `${part()}-${part()}-${part()}`
}

// --- Admin decision helpers (pure transforms over a request list) -----------

const ADMIN_SIGNATORY = "MCC Capital — Compliance Office"

/** Approve a pending request: assign issuance date + version 1, append audit. */
export function approveCertificateInList(
  list: CertificateRequest[],
  id: string,
  note?: string,
): CertificateRequest[] {
  const now = new Date().toISOString()
  return list.map((r) =>
    r.id === id && r.status === "pending"
      ? {
          ...r,
          status: "approved" as const,
          version: r.version > 0 ? r.version : 1,
          decidedAt: now,
          issuedAt: now,
          approvedBy: ADMIN_SIGNATORY,
          decisionNote: note?.trim() || undefined,
          events: [
            { at: now, action: "Approved" as const, actor: "Compliance", note: note?.trim() || undefined },
            ...r.events,
          ],
        }
      : r,
  )
}

/** Reject a pending request with an optional reason. */
export function rejectCertificateInList(
  list: CertificateRequest[],
  id: string,
  reason?: string,
): CertificateRequest[] {
  const now = new Date().toISOString()
  return list.map((r) =>
    r.id === id && r.status === "pending"
      ? {
          ...r,
          status: "rejected" as const,
          decidedAt: now,
          decisionNote: reason?.trim() || undefined,
          events: [
            { at: now, action: "Rejected" as const, actor: "Compliance", note: reason?.trim() || undefined },
            ...r.events,
          ],
        }
      : r,
  )
}

/** Re-issue an already-approved certificate, bumping the version + issuance date. */
export function reissueCertificateInList(
  list: CertificateRequest[],
  id: string,
  note?: string,
): CertificateRequest[] {
  const now = new Date().toISOString()
  return list.map((r) =>
    r.id === id && r.status === "approved"
      ? {
          ...r,
          version: r.version + 1,
          issuedAt: now,
          events: [
            { at: now, action: "Re-issued" as const, actor: "Compliance", note: note?.trim() || undefined },
            ...r.events,
          ],
        }
      : r,
  )
}

// --- Active-user reactive context (customer facing) -------------------------

export interface NewCertificateInput {
  type: CertificateType
  accountScope: string
  accountLabel: string
  purpose: string
  addressee?: string
  holderName: string
  holderCompany?: string
  bankName?: string
  bankAddress?: string
  beneficiaryAddress?: string
  iban?: string
  bic?: string
  accountEmail?: string
  balances: CertificateBalance[]
  totalEur: number
  displayCurrency: string
}

interface CertificatesContextValue {
  requests: CertificateRequest[]
  hydrated: boolean
  /** Client submits a new certificate request (status pending). Returns the record. */
  addRequest: (input: NewCertificateInput) => CertificateRequest
  /** Append a "Downloaded" audit event when an approved certificate is generated. */
  recordDownload: (id: string) => void
  /** Force a re-read from storage (used after admin writes in the same tab). */
  refresh: () => void
}

const CertificatesContext = createContext<CertificatesContextValue | null>(null)

export function CertificateRequestsProvider({ children }: { children: React.ReactNode }) {
  const [requests, setRequests] = useState<CertificateRequest[]>([])
  const [hydrated, setHydrated] = useState(false)

  const load = () => setRequests(readJson<CertificateRequest[]>(requestsKey(), []))

  useEffect(() => {
    load()
    setHydrated(true)
  }, [])

  // Persist on change (only after hydration to avoid clobbering stored data).
  useEffect(() => {
    if (!hydrated) return
    writeJson(requestsKey(), requests)
  }, [requests, hydrated])

  // Resync on cross-tab/same-tab writes (e.g. compliance approves) and refocus.
  useEffect(() => {
    if (!hydrated) return
    const resync = () => setRequests(readJson<CertificateRequest[]>(requestsKey(), []))
    const onStorage = (e: StorageEvent) => {
      if (e.key === requestsKey()) resync()
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

  const addRequest: CertificatesContextValue["addRequest"] = (input) => {
    const now = new Date().toISOString()
    const full: CertificateRequest = {
      ...input,
      id: generateCertificateId(),
      reference: generateCertificateReference(input.type),
      verificationCode: generateVerificationCode(),
      status: "pending",
      version: 0,
      submittedAt: now,
      events: [{ at: now, action: "Requested", actor: "Client" }],
    }
    setRequests((prev) => [full, ...prev])
    return full
  }

  const recordDownload: CertificatesContextValue["recordDownload"] = (id) => {
    const now = new Date().toISOString()
    setRequests((prev) =>
      prev.map((r) =>
        r.id === id
          ? { ...r, events: [{ at: now, action: "Downloaded", actor: "Client" }, ...r.events] }
          : r,
      ),
    )
  }

  return (
    <CertificatesContext.Provider value={{ requests, hydrated, addRequest, recordDownload, refresh: load }}>
      {children}
    </CertificatesContext.Provider>
  )
}

export function useCertificateRequests() {
  const ctx = useContext(CertificatesContext)
  if (!ctx) {
    throw new Error("useCertificateRequests must be used within a CertificateRequestsProvider")
  }
  return ctx
}
