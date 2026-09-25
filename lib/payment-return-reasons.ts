// Standard beneficiary-bank RETURN reason codes for an outgoing payment that
// the receiving bank rejected (refused to credit their customer) and returned.
//
// Codes follow the ISO 20022 / SWIFT payment-return convention used in the MT103
// return `:72:` field (`/RETN/<code>`) and pacs.004 return messages, so the
// generated return printout reads like a genuine bank return.
//
// This module is pure and client-safe (no server-only imports): it feeds the
// admin return-reason menu AND the MT103 return-printout narrative.

export interface PaymentReturnReason {
  /** ISO 20022 / SWIFT return reason code, e.g. "AC04". */
  code: string
  /** Short human label shown in the admin menu. */
  label: string
  /** Longer explanation for tooltips / the printout narrative. */
  description: string
}

export const PAYMENT_RETURN_REASONS: PaymentReturnReason[] = [
  { code: "AC01", label: "Incorrect account number", description: "The beneficiary account number (IBAN) is incorrect or invalid." },
  { code: "AC04", label: "Closed account", description: "The beneficiary account is closed and can no longer receive funds." },
  { code: "AC06", label: "Blocked account", description: "The beneficiary account is blocked or frozen and cannot be credited." },
  { code: "AC02", label: "Invalid account number", description: "The beneficiary account number does not conform to the expected format." },
  { code: "BE01", label: "Beneficiary name / account mismatch", description: "The beneficiary name does not match the account holder on record." },
  { code: "BE04", label: "Missing / incorrect beneficiary address", description: "The beneficiary address is missing or incorrect and prevents crediting." },
  { code: "RC01", label: "Incorrect bank identifier (BIC)", description: "The beneficiary bank identifier (BIC/SWIFT) is incorrect or unreachable." },
  { code: "AG01", label: "Transaction forbidden on account", description: "Crediting this transaction to the beneficiary account is not permitted." },
  { code: "RR01", label: "Missing debtor account / identification", description: "Regulatory information about the sender is missing or incomplete." },
  { code: "RR04", label: "Regulatory reason", description: "The credit was refused for a regulatory or compliance reason at the beneficiary bank." },
  { code: "FRAD", label: "Suspected fraudulent origin", description: "The beneficiary bank flagged the incoming funds as potentially fraudulent." },
  { code: "CUST", label: "Refused by beneficiary customer", description: "The beneficiary declined to accept the incoming funds." },
  { code: "DUPL", label: "Duplicate payment", description: "The beneficiary bank identified the payment as a duplicate." },
  { code: "TECH", label: "Technical / processing problem", description: "A technical or processing problem at the beneficiary bank prevented the credit." },
  { code: "NARR", label: "Other (see note)", description: "Another reason, described in the administrator's note." },
]

/** Look up a return reason by its code. */
export function paymentReturnReason(code: string | null | undefined): PaymentReturnReason | undefined {
  if (!code) return undefined
  return PAYMENT_RETURN_REASONS.find((r) => r.code === code)
}
