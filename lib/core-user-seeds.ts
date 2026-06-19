// ---------------------------------------------------------------------------
// Core account seeds.
//
// Historically the platform shipped three hand-authored "static" accounts
// (IPOSTRAD, MCC Capital Group, and the Demo portfolio). The platform has since
// moved to a single, unified model where EVERY account is a dynamic record in
// the Neon `admin_users` table so it can be edited, suspended, or deleted from
// the administrator panel like any other client.
//
// To make that migration lossless, these three accounts are seeded into the
// database on first connect — keeping their EXACT ids, emails, passwords and
// session tokens so:
//   • all previously stored per-user data (namespaced by id) stays intact,
//   • current login sessions (keyed by the session token) keep working,
//   • the demo seeding (keyed by id "u3") continues to populate.
//
// After seeding they are ordinary dynamic accounts. The seed runs once via
// `INSERT ... ON CONFLICT DO NOTHING`, so editing/deleting them later never
// causes them to reappear.
//
// This module is intentionally free of React/lucide imports so it is safe to
// import from the server-only database layer. Icons are re-attached on the
// client by `hydrateProfile` (lib/profile-types.ts) based on each row's label.
// ---------------------------------------------------------------------------

import type { SerializableUserProfile, UserStatus } from "@/lib/profile-types"

export interface CoreUserSeed {
  email: string
  password: string
  status: UserStatus
  profile: SerializableUserProfile
}

// User 1 — the existing IPOSTRAD client. Kept on id "u1" (the legacy,
// un-suffixed storage namespace) so all previously stored data is preserved.
const SEED_IPOSTRAD: CoreUserSeed = {
  email: "mesa@ipostrad.com",
  password: "mcc120626",
  status: "active",
  profile: {
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
      { label: "Represented By", value: "Jesus Santos Alvarez Fernandez" },
      { label: "Nationality", value: "Spanish (Española)" },
      { label: "Sex", value: "M" },
      { label: "Occupation", value: "CEO" },
      { label: "Passport Number", value: "PAL399074" },
      { label: "ID Number", value: "A1019690900" },
      { label: "Place of Birth", value: "Villavante, Santa Marina Rey (Leon)" },
      { label: "Date of Birth", value: "16-10-1967 — Leon, Spain" },
      { label: "Date of Issue", value: "19-10-2020" },
      { label: "Date of Expiration", value: "19-10-2030" },
      { label: "Issuing Authority", value: "DGP-24337A6P1" },
      { label: "Mobile", value: "+34 608 773 297" },
      { label: "E-mail", value: "ceo@ipostar.es" },
    ],
    companyInfo: [
      { label: "Business Name", value: "IPOSTRAD Securities SL" },
      { label: "LEI Number", value: "9598005DKYQFG05LJB36" },
      { label: "CIF", value: "ES-B-09770793" },
      { label: "NIF (Tax ID)", value: "B09770793" },
      { label: "Registered Address", value: "Calle Santa Marina 40, 24393 Santa Marina del Rey (Leon)" },
      { label: "Fiscal Address", value: "Calle Santa Marina 40, Villavante, 24393 Santa Marina del Rey (Leon)" },
      { label: "Tax Office (AEAT)", value: "24009 Astorga · Delegación de León" },
      { label: "NIF Issue Date", value: "03-03-2022" },
      { label: "Website", value: "www.ipostrad.com" },
      { label: "Contact E-mail", value: "mesa@ipostrad.com" },
    ],
    banking: [
      { label: "Bank Name", value: "Banking Circle - German Branch" },
      { label: "Bank Address", value: "80333 München, Germany" },
      { label: "Account Holder", value: "MCC Capital" },
      { label: "Beneficiary Address", value: "Rue du Rhone 14, 1204 Geneva, Switzerland" },
      { label: "IBAN", value: "DE73202208000029290819" },
      { label: "BIC / SWIFT", value: "SXPYDEHHXXX" },
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
  },
}

// User 2 — the standalone MCC Capital Group client (Louis Thyssen, Director &
// UBO). Kept on id "u2".
const SEED_MCC_GROUP: CoreUserSeed = {
  email: "admin@mccgva.ch",
  password: "mcc270476",
  status: "active",
  profile: {
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
      { label: "Represented By", value: "Louis Thyssen" },
      { label: "Nationality", value: "French (Française)" },
      { label: "Sex", value: "M" },
      { label: "Occupation", value: "Director & Authorised Signatory" },
      { label: "Capacity", value: "Ultimate Beneficial Owner (UBO)" },
      { label: "Passport Number", value: "24AK850371" },
      { label: "Place of Birth", value: "Luxembourg" },
      { label: "Date of Birth", value: "20-07-1980" },
      { label: "Date of Issue", value: "21-06-2024" },
      { label: "Date of Expiration", value: "20-06-2034" },
      { label: "Issuing Authority", value: "Préfecture de Police (France)" },
      { label: "Residential Address", value: "Plankengasse 3, 1010 Wien, Austria" },
      { label: "Mobile", value: "+43 670 803 0807" },
      { label: "E-mail", value: "admin@mccgva.ch" },
    ],
    companyInfo: [
      { label: "Business Name", value: "MCC Capital Group Inc." },
      { label: "Operating Entities", value: "MCC Capital · MCC Petroli · MCC Oil & Gas" },
      { label: "Capacity", value: "Ultimate Beneficial Owner (UBO)" },
      { label: "PEP Status", value: "Not a Politically Exposed Person" },
      { label: "Sanctions", value: "Not subject to any sanctions list" },
      { label: "Source of Funds", value: "Corporate / Business Income" },
      { label: "Source of Wealth", value: "Entrepreneurial & Investment Activity" },
      { label: "AML Declaration", value: "Compliant — no adverse findings" },
      { label: "KYC Reference", value: "MCC-KYC-2026-0001" },
      { label: "Contact E-mail", value: "admin@mccgva.ch" },
    ],
    banking: [
      { label: "Bank Name", value: "Banque Cantonale de Genève (BCGE)" },
      { label: "Bank Address", value: "Quai de l'Île 17, 1204 Genève, Switzerland" },
      { label: "Account Holder", value: "MCC Capital Group Inc." },
      { label: "Beneficiary Address", value: "Rue du Rhône 14, 1204 Genève, Switzerland" },
      { label: "IBAN", value: "CH54 0078 8000 0504 7641 9" },
      { label: "BIC / SWIFT", value: "BCGECHGGXXX" },
    ],
    passportMeta: {
      type: "P · FRA",
      passportNo: "24AK850371",
      surname: "Thyssen",
      givenNames: "Louis",
      validUntil: "20-06-2034",
      country: "République française",
    },
  },
}

// User 3 — the DEMO / showcase account. Kept on id "u3" so its first-login demo
// data seeding (lib/demo-seed.ts) keeps working.
const SEED_DEMO: CoreUserSeed = {
  email: "demo@mccgva.ch",
  password: "mcc080380",
  status: "active",
  profile: {
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
      { label: "Represented By", value: "MCC Capital Demonstration Desk" },
      { label: "Account Type", value: "Demo / Showcase Portfolio" },
      { label: "Nationality", value: "Swiss (Suisse)" },
      { label: "Relationship Manager", value: "André Koller — MCC Geneva" },
      { label: "Onboarding Date", value: "08-03-2025" },
      { label: "Client Tier", value: "Tier 1 — Institutional" },
      { label: "Risk Profile", value: "Balanced / Growth" },
      { label: "Mobile", value: "+41 22 518 08 03" },
      { label: "E-mail", value: "demo@mccgva.ch" },
    ],
    companyInfo: [
      { label: "Business Name", value: "MCC Capital — Demo Portfolio" },
      { label: "Operating Entities", value: "MCC Capital · MCC Petroli · MCC Oil & Gas" },
      { label: "Mandate", value: "Discretionary Institutional Mandate" },
      { label: "KYC Status", value: "Completed — Verified" },
      { label: "KYC Reference", value: "MCC-KYC-DEMO-0003" },
      { label: "AML Declaration", value: "Compliant — no adverse findings" },
      { label: "Sanctions", value: "Not subject to any sanctions list" },
      { label: "Registered Address", value: "Rue du Rhône 14, 1204 Genève, Switzerland" },
      { label: "Website", value: "www.mccgva.ch" },
      { label: "Contact E-mail", value: "demo@mccgva.ch" },
    ],
    banking: [
      { label: "Bank Name", value: "Banque Cantonale de Genève (BCGE)" },
      { label: "Bank Address", value: "Quai de l'Île 17, 1204 Genève, Switzerland" },
      { label: "Account Holder", value: "MCC Capital — Demo Portfolio" },
      { label: "Beneficiary Address", value: "Rue du Rhône 14, 1204 Genève, Switzerland" },
      { label: "IBAN", value: "CH80 0078 8000 0808 0380 3" },
      { label: "BIC / SWIFT", value: "BCGECHGGXXX" },
    ],
    passportMeta: {
      type: "KYC · DEMO",
      passportNo: "MCC-KYC-DEMO-0003",
      surname: "Demo Portfolio",
      givenNames: "MCC Capital",
      validUntil: "Completed — Verified",
      country: "MCC Capital Group · Geneva",
    },
  },
}

/** The three core accounts seeded into the database on first connect. */
export const CORE_USER_SEEDS: CoreUserSeed[] = [SEED_IPOSTRAD, SEED_MCC_GROUP, SEED_DEMO]
