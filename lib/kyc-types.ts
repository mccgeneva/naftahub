// ---------------------------------------------------------------------------
// Shared, client-safe types for the KYC PDF auto-fill feature.
//
// An administrator uploads a KYC PDF in the "Create client account" dialog. The
// PDF is rendered to per-page images in the browser, uploaded to Vercel Blob,
// and analysed by a multimodal model which (1) extracts the customer's identity
// details to pre-fill the form and (2) classifies each page as a recognisable
// document (passport, ID card, proof of address, …) so it can be stored and
// displayed on the client's profile.
//
// This module holds only plain serialisable types so both client components and
// server code can import it without pulling in any server-only dependency.
// ---------------------------------------------------------------------------

/** Recognised document categories detected inside an uploaded KYC PDF. */
export type KycDocumentType =
  | "passport"
  | "id_card"
  | "drivers_license"
  | "proof_of_address"
  | "bank_statement"
  | "company_registration"
  | "selfie"
  | "other"

/** Human-friendly label for each document type (used in the UI). */
export const KYC_DOCUMENT_LABELS: Record<KycDocumentType, string> = {
  passport: "Passport",
  id_card: "National ID card",
  drivers_license: "Driver's licence",
  proof_of_address: "Proof of address",
  bank_statement: "Bank statement",
  company_registration: "Company registration",
  selfie: "Identity selfie",
  other: "Document",
}

/** A single document image extracted from the KYC PDF and stored in Blob. */
export interface KycDocument {
  /** Blob pathname — served to authenticated users via /api/file. */
  pathname: string
  /** Detected document category. */
  type: KycDocumentType
  /** Specific label the model assigned (e.g. "Passport — bio page"). */
  label: string
  /** 1-based page number in the original PDF. */
  pageNumber: number
}

/** Passport / identity-document fields shown on the profile page. */
export interface KycPassportMeta {
  type: string
  passportNo: string
  surname: string
  givenNames: string
  validUntil: string
  country: string
}

/** Identity fields the model extracts from the KYC pack to pre-fill the form. */
export interface KycExtractedFields {
  fullName: string
  company: string
  role: string
  email: string
  phone: string
  nationality: string
  address: string
  website: string
}

/** The full response returned by POST /api/kyc/analyze. */
export interface KycAnalysisResult {
  fields: KycExtractedFields
  passportMeta: KycPassportMeta | null
  /** Blob pathname of the passport image, if a passport page was detected. */
  passportImagePathname: string | null
  documents: KycDocument[]
  /** Blob pathname of the original uploaded PDF. */
  pdfPathname: string
}

/** Build the authenticated delivery URL for a private Blob pathname. */
export function blobFileUrl(pathname: string): string {
  return `/api/file?pathname=${encodeURIComponent(pathname)}`
}
