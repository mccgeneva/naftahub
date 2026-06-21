// ---------------------------------------------------------------------------
// User identity types & shared constants.
//
// The platform supports multiple fully independent clients. Every account is a
// dynamic record in the Neon `admin_users` table (see lib/admin-users-db.ts):
// administrators create, edit, suspend and delete them at runtime. There is no
// longer any hard-coded "static" registry — the three original accounts are
// seeded into the database on first connect (see lib/core-user-seeds.ts) and
// from then on behave like any other client.
//
// This module holds only the shared identity TYPES, the well-known id constants
// used for data-namespacing, and a neutral placeholder identity. All lookups
// happen against the database via the server-side resolvers in
// lib/session-user.ts and app/actions/admin-users.ts.
// ---------------------------------------------------------------------------

import type { ElementType } from "react"

export interface ProfileItem {
  label: string
  value: string
  icon: ElementType
}

export interface UserProfile {
  /** Stable internal id used to namespace this user's data. */
  id: string
  /** Login email (case-insensitive). */
  email: string
  /** Login password (mock/demo only). */
  password: string
  /** Opaque per-user session token stored in the httpOnly session cookie. */
  sessionToken: string

  // --- Displayed identity ---
  firstName: string // dashboard greeting ("Welcome back, …")
  shortName: string // header line 1
  fullName: string // full legal/representative name
  initials: string // avatar fallback
  /** Optional uploaded profile picture (public Blob URL). When set, it is shown
   *  in place of the initials avatar everywhere the user is represented. */
  avatarUrl?: string
  company: string // entity name
  role: string // job title / role
  headerTag: string // small tag under the short name in the header
  accountBadge: string // account tier badge (e.g. "PRO Account")
  accountEmail: string // primary account contact email shown in header/profile
  supportEmail: string // address support replies are sent to

  // --- Bank card holders ---
  cardHolderPerson: string
  cardHolderCompany: string

  // --- Profile page data ---
  principal: ProfileItem[]
  companyInfo: ProfileItem[]
  banking: ProfileItem[]

  // --- Identity document (optional; not every user has a passport on file) ---
  passportImage?: string
  passportMeta?: {
    type: string
    passportNo: string
    surname: string
    givenNames: string
    validUntil: string
    country: string
  }

  // --- KYC documents (optional; extracted from an uploaded onboarding PDF) ---
  kycDocuments?: import("@/lib/kyc-types").KycDocument[]
  /** Blob pathname of the original uploaded KYC PDF. */
  kycPdfPathname?: string

  // --- Referral hierarchy (see lib/profile-types.ts for semantics) ---
  relationship?: import("@/lib/profile-types").AccountRelationship
  masterId?: string
  masterName?: string
  masterEmail?: string
}

// The primary account keeps the legacy, un-suffixed localStorage keys so data
// stored before per-user namespacing is preserved. It is the seeded IPOSTRAD
// account ("u1"). Additional users get their data namespaced by id.
export const PRIMARY_USER_ID = "u1"

// Id of the demo/showcase account whose environment is pre-seeded with strong
// simulated performance data on first login (see lib/demo-seed.ts).
export const DEMO_USER_ID = "u3"

// Sentinel id used when the active user cannot be determined (e.g. the client
// `mcc_user` cookie is missing/unreadable, or we're on the server). It is NOT a
// real account: it owns its own isolated, empty data namespace and resolves to
// a neutral placeholder identity. This guarantees that an unresolved session can
// never silently read, write, or act as another real user.
export const UNKNOWN_USER_ID = "__unknown__"

// A neutral, secrets-free identity returned for any id that does not match a
// real account. It is intentionally generic so it can never be mistaken for,
// or attributed to, a real client.
const PLACEHOLDER_USER: UserProfile = {
  id: UNKNOWN_USER_ID,
  email: "",
  password: "",
  sessionToken: "",
  firstName: "",
  shortName: "Account",
  fullName: "Account",
  initials: "—",
  company: "—",
  role: "",
  headerTag: "",
  accountBadge: "",
  accountEmail: "",
  supportEmail: "",
  cardHolderPerson: "",
  cardHolderCompany: "",
  principal: [],
  companyInfo: [],
  banking: [],
}

// ---------------------------------------------------------------------------
// Internal transfer directory entry.
//
// A minimal, secrets-free view of an account that can send/receive internal P2P
// transfers. Populated from the dynamic user store via server actions (see
// app/actions/transfers.ts). Never exposes passwords or session tokens.
// ---------------------------------------------------------------------------
export interface TransferDirectoryEntry {
  id: string
  email: string
  /** Best human-readable label for the account. */
  displayName: string
  company: string
  initials: string
}

/**
 * Resolve an id to a neutral placeholder identity. There is no longer a static
 * registry, so this never returns a real account — it exists purely so client
 * code has a deterministic, secrets-free fallback identity to render before the
 * authoritative (database-backed) identity resolves, or when no session exists.
 * Real identities are resolved server-side (see lib/session-user.ts and
 * app/actions/admin-users.ts → getMyIdentity).
 */
export function getUserById(_id?: string | null): UserProfile {
  return PLACEHOLDER_USER
}
