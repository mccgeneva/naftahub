// ---------------------------------------------------------------------------
// Multi-user registry.
//
// The platform supports multiple fully independent clients. Each user is a
// standalone tenant: their own credentials, their own session token, their own
// displayed identity, and (via lib/user-scope.ts) their own isolated data.
// There is NO shared state or link between users.
// ---------------------------------------------------------------------------

import type { ElementType } from "react"
import {
  User,
  Building2,
  Mail,
  Phone,
  Globe,
  MapPin,
  CalendarDays,
  BadgeCheck,
  Briefcase,
  Flag,
  Landmark,
  FileText,
  Hash,
} from "lucide-react"

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
}

// User 1 — the existing IPOSTRAD client. Kept on the legacy (un-suffixed)
// storage keys so all previously stored data remains intact.
const USER_IPOSTRAD: UserProfile = {
  id: "u1",
  email: "mesa@ipostrad.com",
  password: "mcc120626",
  sessionToken: "mcc.session.u1.7f3c9a2e8b41d6",

  firstName: "Jesus",
  shortName: "Jesus S. Alvarez",
  fullName: "Jesus Santos Alvarez Fernandez",
  initials: "JA",
  company: "IPOSTRAD Securities SL",
  role: "CEO",
  headerTag: "IPOSTRAD · PRO",
  accountBadge: "PRO Account",
  accountEmail: "ceo@ipostar.es",
  supportEmail: "ceo@ipostar.es",

  cardHolderPerson: "J. S. ALVAREZ FERNANDEZ",
  cardHolderCompany: "IPOSTRAD SECURITIES SL",

  principal: [
    { label: "Represented By", value: "Jesus Santos Alvarez Fernandez", icon: User },
    { label: "Nationality", value: "Spanish (Española)", icon: Flag },
    { label: "Sex", value: "M", icon: User },
    { label: "Occupation", value: "CEO", icon: Briefcase },
    { label: "Passport Number", value: "PAL399074", icon: BadgeCheck },
    { label: "ID Number", value: "A1019690900", icon: Hash },
    { label: "Place of Birth", value: "Villavante, Santa Marina Rey (Leon)", icon: MapPin },
    { label: "Date of Birth", value: "16-10-1967 — Leon, Spain", icon: CalendarDays },
    { label: "Date of Issue", value: "19-10-2020", icon: CalendarDays },
    { label: "Date of Expiration", value: "19-10-2030", icon: CalendarDays },
    { label: "Issuing Authority", value: "DGP-24337A6P1", icon: BadgeCheck },
    { label: "Mobile", value: "+34 608 773 297", icon: Phone },
    { label: "E-mail", value: "ceo@ipostar.es", icon: Mail },
  ],
  companyInfo: [
    { label: "Business Name", value: "IPOSTRAD Securities SL", icon: Building2 },
    { label: "LEI Number", value: "9598005DKYQFG05LJB36", icon: BadgeCheck },
    { label: "CIF", value: "ES-B-09770793", icon: BadgeCheck },
    { label: "NIF (Tax ID)", value: "B09770793", icon: Hash },
    { label: "Registered Address", value: "Calle Santa Marina 40, 24393 Santa Marina del Rey (Leon)", icon: MapPin },
    { label: "Fiscal Address", value: "Calle Santa Marina 40, Villavante, 24393 Santa Marina del Rey (Leon)", icon: MapPin },
    { label: "Tax Office (AEAT)", value: "24009 Astorga · Delegación de León", icon: FileText },
    { label: "NIF Issue Date", value: "03-03-2022", icon: CalendarDays },
    { label: "Website", value: "www.ipostrad.com", icon: Globe },
    { label: "Contact E-mail", value: "mesa@ipostrad.com", icon: Mail },
  ],
  banking: [
    { label: "Bank Name", value: "Banking Circle - German Branch", icon: Landmark },
    { label: "Bank Address", value: "80333 München, Germany", icon: MapPin },
    { label: "Account Holder", value: "MCC Capital", icon: User },
    { label: "Beneficiary Address", value: "Rue du Rhone 14, 1204 Geneva, Switzerland", icon: MapPin },
    { label: "IBAN", value: "DE73202208000029290819", icon: Hash },
    { label: "BIC / SWIFT", value: "SXPYDEHHXXX", icon: Hash },
  ],
  passportImage: "/passport-jesus-alvarez.jpeg",
  passportMeta: {
    type: "P · ESP",
    passportNo: "PAL399074",
    surname: "Alvarez Fernandez",
    givenNames: "Jesus Santos",
    validUntil: "19-10-2030",
    country: "Reino de España",
  },
}

// User 2 — a separate, standalone MCC Capital Group client. Identity reflects
// the verified KYC on file (Ref. MCC-KYC-2026-0001) for Louis Thyssen, Director
// & UBO. Thanks to per-user data scoping, this account has an entirely separate
// data set with no link to User 1.
const USER_MCC_GROUP: UserProfile = {
  id: "u2",
  email: "admin@mccgva.ch",
  password: "mcc270476",
  sessionToken: "mcc.session.u2.b9d41e6a2c83f7",

  firstName: "Louis",
  shortName: "L. Thyssen",
  fullName: "Louis Thyssen",
  initials: "LT",
  company: "MCC Capital Group Inc.",
  role: "Director & Authorised Signatory",
  headerTag: "MCC GROUP · ADMIN",
  accountBadge: "Institutional",
  accountEmail: "admin@mccgva.ch",
  supportEmail: "admin@mccgva.ch",

  cardHolderPerson: "L. THYSSEN",
  cardHolderCompany: "MCC CAPITAL GROUP INC.",

  principal: [
    { label: "Represented By", value: "Louis Thyssen", icon: User },
    { label: "Nationality", value: "French (Française)", icon: Flag },
    { label: "Sex", value: "M", icon: User },
    { label: "Occupation", value: "Director & Authorised Signatory", icon: Briefcase },
    { label: "Capacity", value: "Ultimate Beneficial Owner (UBO)", icon: BadgeCheck },
    { label: "Passport Number", value: "24AK850371", icon: BadgeCheck },
    { label: "Place of Birth", value: "Luxembourg", icon: MapPin },
    { label: "Date of Birth", value: "20-07-1980", icon: CalendarDays },
    { label: "Date of Issue", value: "21-06-2024", icon: CalendarDays },
    { label: "Date of Expiration", value: "20-06-2034", icon: CalendarDays },
    { label: "Issuing Authority", value: "Préfecture de Police (France)", icon: BadgeCheck },
    { label: "Residential Address", value: "Plankengasse 3, 1010 Wien, Austria", icon: MapPin },
    { label: "Mobile", value: "+43 670 803 0807", icon: Phone },
    { label: "E-mail", value: "admin@mccgva.ch", icon: Mail },
  ],
  companyInfo: [
    { label: "Business Name", value: "MCC Capital Group Inc.", icon: Building2 },
    { label: "Operating Entities", value: "MCC Capital · MCC Petroli · MCC Oil & Gas", icon: Building2 },
    { label: "Capacity", value: "Ultimate Beneficial Owner (UBO)", icon: BadgeCheck },
    { label: "PEP Status", value: "Not a Politically Exposed Person", icon: BadgeCheck },
    { label: "Sanctions", value: "Not subject to any sanctions list", icon: BadgeCheck },
    { label: "Source of Funds", value: "Corporate / Business Income", icon: Landmark },
    { label: "Source of Wealth", value: "Entrepreneurial & Investment Activity", icon: Briefcase },
    { label: "AML Declaration", value: "Compliant — no adverse findings", icon: FileText },
    { label: "KYC Reference", value: "MCC-KYC-2026-0001", icon: Hash },
    { label: "Contact E-mail", value: "admin@mccgva.ch", icon: Mail },
  ],
  banking: [
    { label: "Bank Name", value: "Banque Cantonale de Genève (BCGE)", icon: Landmark },
    { label: "Bank Address", value: "Quai de l'Île 17, 1204 Genève, Switzerland", icon: MapPin },
    { label: "Account Holder", value: "MCC Capital Group Inc.", icon: User },
    { label: "Beneficiary Address", value: "Rue du Rhône 14, 1204 Genève, Switzerland", icon: MapPin },
    { label: "IBAN", value: "CH54 0078 8000 0504 7641 9", icon: Hash },
    { label: "BIC / SWIFT", value: "BCGECHGGXXX", icon: Hash },
  ],
  // No passport scan on file for this account — the profile shows the verified
  // document record without a scanned image.
  passportMeta: {
    type: "P · FRA",
    passportNo: "24AK850371",
    surname: "Thyssen",
    givenNames: "Louis",
    validUntil: "20-06-2034",
    country: "République française",
  },
}

// User 3 — a standalone DEMO / showcase account. Like every other user it is a
// fully isolated tenant (its own credentials, session token, identity and, via
// per-user data scoping, its own separate data set). On first login its
// environment is pre-populated with strong simulated performance figures across
// every section (see lib/demo-seed.ts) so it can be used for demonstrations.
const USER_DEMO: UserProfile = {
  id: "u3",
  email: "demo@mccgva.ch",
  password: "mcc080380",
  sessionToken: "mcc.session.u3.3d7f1c8a40e29b",

  firstName: "Demo",
  shortName: "Demo Portfolio",
  fullName: "MCC Capital — Demo Portfolio",
  initials: "DP",
  company: "MCC Capital — Demo Portfolio",
  role: "Demonstration Account",
  headerTag: "MCC DEMO · SHOWCASE",
  accountBadge: "Demo / Showcase",
  accountEmail: "demo@mccgva.ch",
  supportEmail: "demo@mccgva.ch",

  cardHolderPerson: "DEMO PORTFOLIO",
  cardHolderCompany: "MCC CAPITAL DEMO",

  principal: [
    { label: "Represented By", value: "MCC Capital Demonstration Desk", icon: User },
    { label: "Account Type", value: "Demo / Showcase Portfolio", icon: Briefcase },
    { label: "Nationality", value: "Swiss (Suisse)", icon: Flag },
    { label: "Relationship Manager", value: "André Koller — MCC Geneva", icon: User },
    { label: "Onboarding Date", value: "08-03-2025", icon: CalendarDays },
    { label: "Client Tier", value: "Tier 1 — Institutional", icon: BadgeCheck },
    { label: "Risk Profile", value: "Balanced / Growth", icon: BadgeCheck },
    { label: "Mobile", value: "+41 22 518 08 03", icon: Phone },
    { label: "E-mail", value: "demo@mccgva.ch", icon: Mail },
  ],
  companyInfo: [
    { label: "Business Name", value: "MCC Capital — Demo Portfolio", icon: Building2 },
    { label: "Operating Entities", value: "MCC Capital · MCC Petroli · MCC Oil & Gas", icon: Building2 },
    { label: "Mandate", value: "Discretionary Institutional Mandate", icon: Briefcase },
    { label: "KYC Status", value: "Completed — Verified", icon: BadgeCheck },
    { label: "KYC Reference", value: "MCC-KYC-DEMO-0003", icon: Hash },
    { label: "AML Declaration", value: "Compliant — no adverse findings", icon: FileText },
    { label: "Sanctions", value: "Not subject to any sanctions list", icon: BadgeCheck },
    { label: "Registered Address", value: "Rue du Rhône 14, 1204 Genève, Switzerland", icon: MapPin },
    { label: "Website", value: "www.mccgva.ch", icon: Globe },
    { label: "Contact E-mail", value: "demo@mccgva.ch", icon: Mail },
  ],
  banking: [
    { label: "Bank Name", value: "Banque Cantonale de Genève (BCGE)", icon: Landmark },
    { label: "Bank Address", value: "Quai de l'Île 17, 1204 Genève, Switzerland", icon: MapPin },
    { label: "Account Holder", value: "MCC Capital — Demo Portfolio", icon: User },
    { label: "Beneficiary Address", value: "Rue du Rhône 14, 1204 Genève, Switzerland", icon: MapPin },
    { label: "IBAN", value: "CH80 0078 8000 0808 0380 3", icon: Hash },
    { label: "BIC / SWIFT", value: "BCGECHGGXXX", icon: Hash },
  ],
  // KYC document record on file (demo) — shown as a verified document.
  passportMeta: {
    type: "KYC · DEMO",
    passportNo: "MCC-KYC-DEMO-0003",
    surname: "Demo Portfolio",
    givenNames: "MCC Capital",
    validUntil: "Completed — Verified",
    country: "MCC Capital Group · Geneva",
  },
}

export const USERS: UserProfile[] = [USER_IPOSTRAD, USER_MCC_GROUP, USER_DEMO]

// Id of the demo/showcase account whose environment is pre-seeded with strong
// simulated performance data on first login.
export const DEMO_USER_ID = USER_DEMO.id

// The primary user stays on the legacy, un-suffixed storage keys so existing
// data is preserved. Additional users get their data namespaced by id.
export const PRIMARY_USER_ID = USER_IPOSTRAD.id

export function findUserByEmail(email: string): UserProfile | undefined {
  const normalized = email.trim().toLowerCase()
  return USERS.find((u) => u.email.toLowerCase() === normalized)
}

// ---------------------------------------------------------------------------
// Internal transfer directory.
//
// A minimal, secrets-free view of every account that can send/receive internal
// P2P transfers. Used by the Internal Transfers module to resolve a recipient
// from their registered email address. Never exposes passwords or session
// tokens.
// ---------------------------------------------------------------------------
export interface TransferDirectoryEntry {
  id: string
  email: string
  /** Best human-readable label for the account. */
  displayName: string
  company: string
  initials: string
}

function toDirectoryEntry(u: UserProfile): TransferDirectoryEntry {
  return {
    id: u.id,
    email: u.email,
    displayName: u.fullName || u.shortName || u.company,
    company: u.company,
    initials: u.initials,
  }
}

/** Every account in the platform directory (secrets-free). */
export function getTransferDirectory(): TransferDirectoryEntry[] {
  return USERS.map(toDirectoryEntry)
}

/**
 * Resolve a transfer recipient by their registered email. Returns undefined if
 * no account matches. The lookup is case-insensitive.
 */
export function findTransferRecipientByEmail(email: string): TransferDirectoryEntry | undefined {
  const user = findUserByEmail(email)
  return user ? toDirectoryEntry(user) : undefined
}

export function getUserById(id: string | undefined | null): UserProfile {
  return USERS.find((u) => u.id === id) ?? USER_IPOSTRAD
}

export function getUserBySessionToken(token: string | undefined | null): UserProfile | undefined {
  if (!token) return undefined
  return USERS.find((u) => u.sessionToken === token)
}

/** Every valid session token, used by the proxy to gate /dashboard. */
export const VALID_SESSION_TOKENS = new Set(USERS.map((u) => u.sessionToken))
