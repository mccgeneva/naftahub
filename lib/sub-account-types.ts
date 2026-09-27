/**
 * Client-safe types for client-managed SUB-ACCOUNTS.
 *
 * A sub-account is an isolated money compartment that belongs to the SAME user
 * (no separate login, no other person involved). The user opens one from the
 * dashboard; an administrator then assigns it an IBAN/BIC and activates it.
 * Once active it holds funds independently of the main balance, and the user
 * moves money between their Main account and any sub-account via instant,
 * zero-sum internal transfers.
 *
 * No server-only imports here so both server actions and client components can
 * share the shape.
 */

export type SubAccountStatus =
  | "pending" // requested by the client, awaiting administrator IBAN assignment
  | "active" // administrator assigned an IBAN/BIC — usable, can hold funds
  | "rejected" // administrator declined the request
  | "closed" // closed by an administrator (kept for the audit trail)

/**
 * How the sub-account's beneficiary / UBO is verified:
 * - "declared": the client uploaded the beneficiary's passport + a KYC document,
 *   so the ultimate beneficial owner is fully declared and identity-verified.
 * - "alias": no KYC/passport supplied. The compartment is allowed to operate as
 *   an unverified alias, but ALL activity under it is the account holder's own
 *   legal responsibility (acknowledged at request time). This liability is
 *   removed once the UBO is declared with KYC + passport.
 */
export type SubAccountVerification = "declared" | "alias"

/** A single identity/compliance document uploaded for the sub-account's UBO.
 *  The file lives in Blob so an administrator can download and study it. */
export interface SubAccountDoc {
  /** Which document this is. */
  kind: "passport" | "kyc" | "bank_statement"
  fileName: string
  uploadedAt: string
  /** Blob coordinates for the stored file (absent for legacy/metadata-only). */
  pathname?: string
  url?: string
  contentType?: string
  size?: number
}

/** One extracted field surfaced from a document by the OCR pass. */
export interface SubAccountExtractedField {
  label: string
  value: string
}

/** Per-document result of the administrator-side automatic data extraction. */
export interface SubAccountExtractedDoc {
  kind: SubAccountDoc["kind"]
  fileName: string
  /** What the model actually detected the document to be. */
  detectedType: string
  personName: string
  documentNumber: string
  issuingAuthority: string
  issueDate: string
  expiryDate: string
  fields: SubAccountExtractedField[]
  redFlags: string[]
  riskLevel: "low" | "medium" | "high"
  summary: string
  /** Set when this single document could not be analysed. */
  error?: string
}

/**
 * Structured data the administrator panel automatically retrieves from the
 * furnished documents (passport, KYC, last bank statement). The top-level
 * fields are the consolidated best guesses used to pre-fill the activation form
 * (name, passport number, nationality, address, and the bank statement's
 * bank / IBAN / BIC); `documents` holds the per-file detail for review.
 */
export interface SubAccountExtraction {
  analyzedAt: string
  fullName: string
  passportNo: string
  nationality: string
  address: string
  bankName: string
  iban: string
  bic: string
  documents: SubAccountExtractedDoc[]
}

export interface SubAccount {
  /** Stable id, also used as the ledger `sub_account_id` tag. */
  id: string
  /** The owning user id (the requester / data owner). */
  userId: string
  /** Friendly name the client chose, e.g. "Operations", "Escrow — Project A". */
  label: string
  /** ISO 4217 currency this compartment operates in. */
  currency: string
  /** Why the client opened it (free text, optional). */
  purpose?: string
  /** The sub-account's OWN beneficiary — the party this compartment is held for
   *  / pays out to. Distinct from the user's main-account holder, so the
   *  sub-account is managed as a separate account. Set by the client, editable. */
  beneficiaryName?: string
  /** Optional free-text beneficiary details (address, bank, reference…). */
  beneficiaryDetails?: string
  /** Whether the UBO is fully declared (KYC + passport) or an unverified alias. */
  verification: SubAccountVerification
  /** Identity documents uploaded for the UBO (passport + KYC) when declared. */
  kycDocuments?: SubAccountDoc[]
  /** When the client accepted personal legal responsibility for an alias. */
  legalResponsibilityAcceptedAt?: string
  status: SubAccountStatus
  /** Assigned by the administrator on activation. */
  iban?: string
  bic?: string
  /** Administrator note attached on activation / rejection. */
  adminNote?: string
  createdAt: string
  /** When the administrator activated (assigned the IBAN) or rejected it. */
  decidedAt?: string
  /** When the sub-account was first activated — the anchor for annual fees.
   *  Preserved even after closure (unlike decidedAt, which tracks the last
   *  decision). */
  activatedAt?: string
  /** When an administrator closed the sub-account (stops annual accrual). */
  closedAt?: string
  /** Data the administrator panel automatically retrieved from the furnished
   *  documents (OCR), reviewed before approving. Absent until analysed. */
  extractedData?: SubAccountExtraction
}

/**
 * Link that grants a VISITOR-tier user operational access to a single
 * sub-account created by ANOTHER user. Set by an administrator. Exactly one per
 * visitor (the visitor's id is the primary key). While linked, the visitor's
 * whole dashboard is confined to that one sub-account: they can VIEW it, MOVE
 * funds between it and the owner's main account, and request outgoing PAYMENTS
 * from it (administrator-approved). All money movement posts to the OWNER's
 * ledger, tagged to this sub-account's compartment.
 */
export interface VisitorSubLink {
  /** The linked visitor's own user id (their login). One link per visitor. */
  visitorUserId: string
  /** The sub-account the visitor is linked to. */
  subAccountId: string
  /** The user who OWNS that sub-account (whose ledger the compartment lives on). */
  ownerId: string
  /** The administrator account id that created the link (audit). */
  linkedBy?: string
  linkedAt: string
}

export const SUB_ACCOUNT_STATUS_LABEL: Record<SubAccountStatus, string> = {
  pending: "Awaiting activation",
  active: "Active",
  rejected: "Declined",
  closed: "Closed",
}

/** Ledger tag used for the user's MAIN (default) account. Ledger rows with no
 *  `sub_account_id` are treated as main, so this is only used conceptually in
 *  the UI/transfer layer as the "from/to = main" sentinel. */
export const MAIN_ACCOUNT_ID = "main"
