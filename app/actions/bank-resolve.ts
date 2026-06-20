"use server"

/**
 * External IBAN → bank resolver.
 *
 * The static directory in `lib/iban-swift.ts` only covers major banks. For any
 * other IBAN we query an external directory so bank name / BIC / address
 * resolve worldwide. Resolution order:
 *
 *   1. ibanapi.com  — global coverage (70+ countries). Requires IBANAPI_KEY.
 *   2. openiban.com — free, no key, but only AT/BE/CH/DE/LI/LU/NL.
 *
 * Everything runs server-side (avoids browser CORS) and is best-effort: any
 * failure returns null so the caller falls back to the curated directory /
 * structural label. Successful lookups are cached for a day.
 */

export type ExternalBankData = {
  name?: string
  bic?: string
  city?: string
  postalCode?: string
  address?: string
}

/** Normalise a BIC: uppercase, and drop a trailing generic "XXX" branch code. */
function normaliseBic(bic?: string): string | undefined {
  if (!bic) return undefined
  const up = bic.replace(/\s+/g, "").toUpperCase()
  return up.length === 11 && up.endsWith("XXX") ? up.slice(0, 8) : up
}

/** ibanapi.com — primary, worldwide coverage. */
async function resolveViaIbanApi(iban: string): Promise<ExternalBankData | null> {
  const key = process.env.IBANAPI_KEY
  if (!key) return null
  try {
    const res = await fetch(
      `https://api.ibanapi.com/v1/validate/${iban}?api_key=${encodeURIComponent(key)}`,
      { next: { revalidate: 86400 }, headers: { Accept: "application/json" } },
    )
    if (!res.ok) return null
    const json = (await res.json()) as {
      result?: number | string
      data?: {
        bank?: {
          bank_name?: string
          bankName?: string
          bic?: string
          address?: string
          city?: string
          zip?: string
          postal_code?: string
        }
        swift_code?: string
      }
    }
    // result 200 indicates a successful, valid lookup.
    if (json?.result !== 200 && json?.result !== "200") return null
    const bank = json?.data?.bank ?? {}
    const name = (bank.bank_name || bank.bankName)?.trim() || undefined
    const bic = normaliseBic(bank.bic || json?.data?.swift_code)
    const city = bank.city?.trim() || undefined
    const postalCode = (bank.zip || bank.postal_code)?.trim() || undefined
    const address = bank.address?.trim() || undefined
    if (!name && !bic && !city && !postalCode && !address) return null
    return { name, bic, city, postalCode, address }
  } catch {
    return null
  }
}

/** openiban.com — free fallback, limited to 7 SEPA countries. */
async function resolveViaOpenIban(iban: string): Promise<ExternalBankData | null> {
  try {
    const res = await fetch(
      `https://openiban.com/validate/${iban}?getBIC=true&validateBankCode=true`,
      { next: { revalidate: 86400 }, headers: { Accept: "application/json" } },
    )
    if (!res.ok) return null
    const data = (await res.json()) as {
      valid?: boolean
      bankData?: { name?: string; bic?: string; zip?: string; city?: string }
    }
    const bank = data?.bankData
    if (!bank) return null

    const name = bank.name?.trim() || undefined
    const bic = normaliseBic(bank.bic)
    const city = bank.city?.trim() || undefined
    const postalCode = bank.zip?.trim() || undefined

    if (!name && !bic && !city && !postalCode) return null
    return { name, bic, city, postalCode }
  } catch {
    return null
  }
}

export async function resolveIbanExternal(rawIban: string): Promise<ExternalBankData | null> {
  const iban = rawIban.replace(/[\s-]/g, "").toUpperCase()
  // Basic shape guard — 2 letters + 2 digits + body.
  if (!/^[A-Z]{2}[0-9]{2}[A-Z0-9]{1,30}$/.test(iban)) return null

  // Primary: global provider. Falls back to the free SEPA-only directory.
  const fromGlobal = await resolveViaIbanApi(iban)
  if (fromGlobal) return fromGlobal

  return resolveViaOpenIban(iban)
}
