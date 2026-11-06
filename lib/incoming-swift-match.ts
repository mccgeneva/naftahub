// ---------------------------------------------------------------------------
// Incoming SWIFT → platform account matching (pure, I/O-free, unit-testable)
// ---------------------------------------------------------------------------
//
// When a SWIFT message is received we must decide which platform customer it
// belongs to. The decisive signal is the RECEIVING side of the message: the
// beneficiary account (:59: /IBAN) held at the receiving institution
// (:57a:/receiver BIC). We match that beneficiary IBAN — and, when present, the
// receiver BIC — against the platform's active bank (gateway) accounts, each of
// which carries an assigned IBAN + BIC and is linked to an owning customer.
//
// IBANs are globally unique, so an exact IBAN equality is a strong match on its
// own; the receiver BIC is used to CONFIRM the match and to break the (rare)
// tie when more than one stored account shares the same IBAN. This module never
// touches the database — the server action feeds it the extracted message
// fields and the list of candidate accounts.

/** Strip an IBAN / account string to comparable A–Z0–9 (upper-cased). */
export function normalizeIban(raw: string | undefined | null): string {
  return (raw ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "")
}

/** Strip a BIC to its comparable 8-char institution root (upper-cased). */
export function normalizeBicRoot(raw: string | undefined | null): string {
  const clean = (raw ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "")
  return clean.slice(0, 8)
}

/** A stored platform bank account that an incoming message can be matched to. */
export interface MatchAccount {
  /** Owning customer id. */
  userId: string
  /** Gateway account id (audit reference). */
  accountId: string
  accountHolder: string
  company?: string
  /** Assigned IBAN (IBAN-scheme accounts only). */
  iban?: string
  /** Assigned account BIC. */
  bic?: string
  currency?: string
}

/** The receiving-side fields extracted from a parsed incoming SWIFT message. */
export interface IncomingSwiftExtract {
  /** Beneficiary account / IBAN from :59: (or :58a: for institution transfers). */
  beneficiaryIban?: string
  /** Receiving institution BIC (message receiver / :57a: account-with). */
  receiverBic?: string
  beneficiaryName?: string
}

export interface IncomingSwiftMatch {
  status: "matched" | "unmatched"
  /** The single confident account when status === "matched". */
  account?: MatchAccount
  /** True when the receiver BIC also equalled the matched account's BIC. */
  bicConfirmed: boolean
  /** Human-readable explanation for the audit trail / admin review. */
  reason: string
  /** Accounts sharing the beneficiary IBAN (for admin review when ambiguous). */
  candidates: MatchAccount[]
}

/**
 * Cross-check an incoming SWIFT message against the platform's active bank
 * accounts. Deterministic and pure.
 *
 * Rules:
 *   1. No beneficiary IBAN in the message → cannot auto-match (unmatched).
 *   2. Exactly one active account shares that IBAN → matched (BIC confirms).
 *   3. Several accounts share the IBAN → narrow by receiver BIC; a single
 *      survivor matches, otherwise it is ambiguous (unmatched, for review).
 *   4. No account shares the IBAN → unmatched (logged for admin review).
 */
export function matchIncomingSwift(
  extract: IncomingSwiftExtract,
  accounts: MatchAccount[],
): IncomingSwiftMatch {
  const benIban = normalizeIban(extract.beneficiaryIban)
  const recvBic = normalizeBicRoot(extract.receiverBic)

  if (!benIban) {
    return {
      status: "unmatched",
      bicConfirmed: false,
      reason: "The message carries no beneficiary IBAN, so it cannot be matched to a platform account automatically.",
      candidates: [],
    }
  }

  const ibanMatches = accounts.filter((a) => a.iban && normalizeIban(a.iban) === benIban)

  if (ibanMatches.length === 0) {
    const near = accounts.filter((a) => a.iban && withinOneEdit(normalizeIban(a.iban), benIban))
    const validity = ibanLooksValid(benIban)
      ? ""
      : ` The IBAN on the message is not a valid IBAN (wrong length or checksum) — it was most likely mistyped.`
    const suggestion =
      near.length > 0
        ? ` Closest platform account: ${near
            .map((a) => `${formatIban(a.iban!)}${a.company ? ` (${a.company})` : ""}`)
            .join(", ")} — one character differs.`
        : ""
    return {
      status: "unmatched",
      bicConfirmed: false,
      reason: `No active platform account holds the beneficiary IBAN ${formatIban(benIban)}.${validity}${suggestion} Logged for administrator review.`,
      candidates: near,
    }
  }

  if (ibanMatches.length === 1) {
    const account = ibanMatches[0]
    const bicConfirmed = !!recvBic && normalizeBicRoot(account.bic) === recvBic
    return {
      status: "matched",
      account,
      bicConfirmed,
      reason: bicConfirmed
        ? `Beneficiary IBAN and receiver BIC both match account ${account.accountId} (${account.accountHolder}).`
        : `Beneficiary IBAN matches account ${account.accountId} (${account.accountHolder})${
            recvBic ? "; receiver BIC could not be confirmed against the stored BIC" : ""
          }.`,
      candidates: ibanMatches,
    }
  }

  // Rare: multiple stored accounts share the same IBAN. Break the tie with the
  // receiver BIC before crediting anyone.
  const bicNarrowed = recvBic ? ibanMatches.filter((a) => normalizeBicRoot(a.bic) === recvBic) : []
  if (bicNarrowed.length === 1) {
    const account = bicNarrowed[0]
    return {
      status: "matched",
      account,
      bicConfirmed: true,
      reason: `Multiple accounts share the beneficiary IBAN; the receiver BIC uniquely resolved account ${account.accountId} (${account.accountHolder}).`,
      candidates: ibanMatches,
    }
  }

  return {
    status: "unmatched",
    bicConfirmed: false,
    reason: `${ibanMatches.length} active accounts share the beneficiary IBAN and the receiver BIC did not resolve a single owner. Sent to administrator review.`,
    candidates: ibanMatches,
  }
}

/** Group a normalized IBAN into blocks of four for display. */
function formatIban(raw: string): string {
  return normalizeIban(raw).replace(/(.{4})/g, "$1 ").trim()
}

/** ISO 13616 MOD-97 check — catches missing/extra/swapped characters. */
function ibanLooksValid(iban: string): boolean {
  if (!/^[A-Z]{2}\d{2}[A-Z0-9]{10,30}$/.test(iban)) return false
  const rearranged = iban.slice(4) + iban.slice(0, 4)
  let remainder = 0
  for (const ch of rearranged) {
    const v = /\d/.test(ch) ? ch : String(ch.charCodeAt(0) - 55)
    for (const d of v) remainder = (remainder * 10 + Number(d)) % 97
  }
  return remainder === 1
}

/** True when `a` and `b` differ by at most one insertion, deletion, or substitution. */
function withinOneEdit(a: string, b: string): boolean {
  if (!a || !b || a === b) return false
  if (Math.abs(a.length - b.length) > 1) return false
  let i = 0
  let j = 0
  let edits = 0
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      i++
      j++
      continue
    }
    if (++edits > 1) return false
    if (a.length > b.length) i++
    else if (b.length > a.length) j++
    else {
      i++
      j++
    }
  }
  return edits + (a.length - i) + (b.length - j) <= 1
}
