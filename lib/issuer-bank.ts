// Canonical ISSUER / ORDERING bank for every OUTGOING client payment.
//
// All client payments, in every currency, are issued (debited) through the
// platform's fixed correspondent account at UBS Switzerland. The account
// HOLDER on the payment is always the sending client (their own name or
// company), but the issuing bank coordinates below never change — the funds
// always leave via this single UBS account.
//
// This is the single source of truth: reference ISSUER_BANK wherever an
// outgoing payment's originating/ordering bank is displayed or built, never
// hard-code the IBAN/BIC inline.
export const ISSUER_BANK = {
  name: "UBS Switzerland",
  iban: "CH8900230LYJQ5P61QKWH",
  swift: "UBSWCHGG",
} as const

/** The issuer bank rendered as receipt/document lines (Bank / BIC / IBAN). */
export function issuerBankLines(): string[] {
  return [`Bank: ${ISSUER_BANK.name}`, `BIC/SWIFT: ${ISSUER_BANK.swift}`, `IBAN: ${ISSUER_BANK.iban}`]
}

/** One-line "UBS Switzerland (BIC UBSWCHGG)" for a ledger entry's `bank` field.
 *  Every platform payment issues from this bank, so on the RECIPIENT's incoming
 *  credit the sender/issuer bank shown is always this — not the recipient's own
 *  receiving account. The receipt renderer splits this into name + BIC. */
export function issuerBankDisplay(): string {
  return `${ISSUER_BANK.name} (BIC ${ISSUER_BANK.swift})`
}

/** True when a ledger entry's `bank` text names the UBS issuer (by BIC or name). */
export function bankTextIsIssuer(bankText?: string | null): boolean {
  if (!bankText) return false
  const t = bankText.toUpperCase()
  return t.includes(ISSUER_BANK.swift) || t.includes(ISSUER_BANK.name.toUpperCase())
}

/** The IBAN/account to DISPLAY for a ledger entry. On an incoming credit whose
 *  bank is the UBS issuer, the sender's coordinates are the canonical UBS Swiss
 *  IBAN — not the `account` field (which holds the RECIPIENT's own receiving
 *  IBAN, kept unchanged for account-grouping). External payers keep their own. */
export function displayIssuerAccount(opts: {
  direction?: string | null
  bank?: string | null
  account?: string | null
}): string | undefined {
  if (opts.direction === "credit" && bankTextIsIssuer(opts.bank)) return ISSUER_BANK.iban
  return opts.account ?? undefined
}
