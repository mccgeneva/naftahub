import { validateIban } from "@/lib/iban-swift"

export type AccountIdCheck =
  | { valid: true; kind: "iban"; formatted: string; countryCode: string; countryName?: string }
  | { valid: true; kind: "account"; formatted: string }
  | { valid: false; error: string }

// Non-IBAN countries (US, CA, AU, JP, …) identify accounts by a plain domestic
// account number. Only a value shaped like an IBAN (2 letters + 2 check digits)
// is held to IBAN rules; anything else is accepted as an account number.
export function checkAccountId(raw: string): AccountIdCheck {
  const compact = raw.replace(/[\s-]/g, "").toUpperCase()
  if (!compact) return { valid: false, error: "Enter an IBAN or account number" }

  if (/^[A-Z]{2}\d{2}/.test(compact)) {
    const c = validateIban(compact)
    if (!c.valid) return { valid: false, error: c.error || "Invalid IBAN" }
    return {
      valid: true,
      kind: "iban",
      formatted: c.formatted,
      countryCode: c.countryCode ?? compact.slice(0, 2),
      countryName: c.countryName,
    }
  }

  if (/^[A-Z0-9]{4,34}$/.test(compact)) return { valid: true, kind: "account", formatted: compact }
  return { valid: false, error: "Enter a valid IBAN or a 4–34 character account number" }
}
