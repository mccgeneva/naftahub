// ---------------------------------------------------------------------------
// Pure, environment-agnostic certificate logic.
//
// This module holds everything about bank certificates that does NOT depend on
// the browser (no localStorage, no React): the data shapes, the type metadata,
// reference/id generators, and the pure lifecycle transforms (approve / reject /
// re-issue). Because it has no client-only dependencies it can be imported from
// BOTH the client store (lib/certificates-store.tsx) AND server code (the Neon
// persistence layer + server actions), so the approval logic is defined once
// and can never drift between the customer and administrator surfaces.
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

/** Build a brand-new pending request record from a client's input. */
export function buildCertificateRequest(input: NewCertificateInput, now = new Date().toISOString()): CertificateRequest {
  return {
    ...input,
    id: generateCertificateId(),
    reference: generateCertificateReference(input.type),
    verificationCode: generateVerificationCode(),
    status: "pending",
    version: 0,
    submittedAt: now,
    events: [{ at: now, action: "Requested", actor: "Client" }],
  }
}

// --- Pure lifecycle transforms (single request) -----------------------------

const ADMIN_SIGNATORY = "MCC Capital — Compliance Office"

/** Approve a pending request: assign issuance date + version 1, append audit. */
export function applyApproval(req: CertificateRequest, note?: string): CertificateRequest {
  if (req.status !== "pending") return req
  const now = new Date().toISOString()
  return {
    ...req,
    status: "approved",
    version: req.version > 0 ? req.version : 1,
    decidedAt: now,
    issuedAt: now,
    approvedBy: ADMIN_SIGNATORY,
    decisionNote: note?.trim() || undefined,
    events: [{ at: now, action: "Approved", actor: "Compliance", note: note?.trim() || undefined }, ...req.events],
  }
}

/** Reject a pending request with an optional reason. */
export function applyRejection(req: CertificateRequest, reason?: string): CertificateRequest {
  if (req.status !== "pending") return req
  const now = new Date().toISOString()
  return {
    ...req,
    status: "rejected",
    decidedAt: now,
    decisionNote: reason?.trim() || undefined,
    events: [{ at: now, action: "Rejected", actor: "Compliance", note: reason?.trim() || undefined }, ...req.events],
  }
}

/** Re-issue an already-approved certificate, bumping the version + issuance date. */
export function applyReissue(req: CertificateRequest, note?: string): CertificateRequest {
  if (req.status !== "approved") return req
  const now = new Date().toISOString()
  return {
    ...req,
    version: req.version + 1,
    issuedAt: now,
    events: [{ at: now, action: "Re-issued", actor: "Compliance", note: note?.trim() || undefined }, ...req.events],
  }
}

// --- List-based wrappers (kept for backward compatibility) ------------------

export function approveCertificateInList(
  list: CertificateRequest[],
  id: string,
  note?: string,
): CertificateRequest[] {
  return list.map((r) => (r.id === id ? applyApproval(r, note) : r))
}

export function rejectCertificateInList(
  list: CertificateRequest[],
  id: string,
  reason?: string,
): CertificateRequest[] {
  return list.map((r) => (r.id === id ? applyRejection(r, reason) : r))
}

export function reissueCertificateInList(
  list: CertificateRequest[],
  id: string,
  note?: string,
): CertificateRequest[] {
  return list.map((r) => (r.id === id ? applyReissue(r, note) : r))
}

// --- Audit-event merge (used when reconciling client + server copies) -------

const eventKey = (e: CertificateAuditEvent) => `${e.at}|${e.action}|${e.actor}`

/**
 * Union two audit-event lists without duplicates, newest first. Used by the
 * server when a client mirrors its copy: the client may have appended a
 * "Downloaded" event while the administrator appended an "Approved" event — both
 * must be preserved.
 */
export function mergeAuditEvents(
  serverEvents: CertificateAuditEvent[] = [],
  clientEvents: CertificateAuditEvent[] = [],
): CertificateAuditEvent[] {
  const seen = new Set(serverEvents.map(eventKey))
  const merged = [...serverEvents]
  for (const ev of clientEvents) {
    if (!seen.has(eventKey(ev))) {
      seen.add(eventKey(ev))
      merged.push(ev)
    }
  }
  return merged.sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0))
}
