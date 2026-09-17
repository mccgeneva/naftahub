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
