// ---------------------------------------------------------------------------
// Referral hierarchy — client-safe metadata & helpers.
//
// Pure types/labels with NO server-only imports, so both the admin UI and the
// server may import it. The actual data-owner resolution (which is server-only,
// because it reads the session + the user DB) lives in lib/session-user.ts.
// ---------------------------------------------------------------------------

import type { AccountRelationship } from "@/lib/profile-types"

export type { AccountRelationship }

/** Outgoing approval kinds a Sub-account must route through its Master for
 *  consent (in ADDITION to administrator approval) before they execute. Kept
 *  deliberately narrow: only value-leaving payments require the Master gate. */
export const MASTER_CONSENT_KINDS = new Set<string>(["payment"])

export interface RelationshipOption {
  value: AccountRelationship
  /** Short code shown in the admin UI (M / S / C). */
  code: string
  label: string
  description: string
}

export const RELATIONSHIP_OPTIONS: RelationshipOption[] = [
  {
    value: "master",
    code: "M",
    label: "Master / Standalone",
    description: "A standalone account. Others can be linked under it as Sub or Child accounts.",
  },
  {
    value: "sub",
    code: "S",
    label: "Sub-account (S)",
    description:
      "Independent login that shares the Master's balance and bank instruments. Outgoing payments require Admin + Master approval.",
  },
  {
    value: "child",
    code: "C",
    label: "Child-account (C)",
    description:
      "Fully independent account linked to the Master for referral attribution and network visibility only.",
  },
]

/** Normalise a possibly-absent relationship to its effective value. Absent ⇒
 *  "master" so legacy accounts (created before the hierarchy existed) behave
 *  exactly as standalone accounts. */
export function effectiveRelationship(rel: AccountRelationship | undefined | null): AccountRelationship {
  return rel === "sub" || rel === "child" ? rel : "master"
}

const LABELS: Record<AccountRelationship, string> = {
  master: "Master",
  sub: "Sub-account",
  child: "Child-account",
}

const CODES: Record<AccountRelationship, string> = {
  master: "M",
  sub: "S",
  child: "C",
}

export function relationshipLabel(rel: AccountRelationship | undefined | null): string {
  return LABELS[effectiveRelationship(rel)]
}

export function relationshipCode(rel: AccountRelationship | undefined | null): string {
  return CODES[effectiveRelationship(rel)]
}

/** True when this relationship shares the Master's balance & instruments. */
export function sharesMasterFinances(rel: AccountRelationship | undefined | null): boolean {
  return effectiveRelationship(rel) === "sub"
}
