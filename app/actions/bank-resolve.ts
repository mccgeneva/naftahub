"use server"

/**
 * External IBAN → bank resolver.
 *
 * The static directory in `lib/iban-swift.ts` only covers a handful of major
 * banks. For any other IBAN we query the free openiban.com directory, which
 * returns the registered bank name, BIC and (for many countries) the postal
 * code + city. This runs on the server to avoid browser CORS limits and to
 * keep the lookup resilient.
 */

export type ExternalBankData = {
  name?: string
  bic?: string
  city?: string
  postalCode?: string
}

/** Normalise a BIC: uppercase, and drop a trailing generic "XXX" branch code. */
function normaliseBic(bic?: string): string | undefined {
  if (!bic) return undefined
  const up = bic.replace(/\s+/g, "").toUpperCase()
  return up.length === 11 && up.endsWith("XXX") ? up.slice(0, 8) : up
}

export async function resolveIbanExternal(rawIban: string): Promise<ExternalBankData | null> {
  const iban = rawIban.replace(/[\s-]/g, "").toUpperCase()
  // Basic shape guard — 2 letters + 2 digits + body.
  if (!/^[A-Z]{2}[0-9]{2}[A-Z0-9]{1,30}$/.test(iban)) return null

  try {
    const res = await fetch(
      `https://openiban.com/validate/${iban}?getBIC=true&validateBankCode=true`,
      {
        // Cache successful lookups for a day — bank directory data is stable.
        next: { revalidate: 86400 },
        headers: { Accept: "application/json" },
      },
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
