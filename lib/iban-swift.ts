// IBAN & SWIFT/BIC validation + bank directory lookup utilities.
//
// - IBAN: structural length-per-country check + ISO 7064 mod-97-10 checksum.
// - BIC/SWIFT: ISO 9362 structural validation (bank, country, location, branch).
// - Bank lookup: resolves the institution behind a valid BIC or IBAN using a
//   curated directory. Returns a Promise to model a real directory fetch.

export type BankInfo = {
  name: string
  city?: string
  country: string
  countryCode: string
  bic?: string
  branch?: string
  /** Street address of the registered/head office, when known. */
  address?: string
  /** Postal / ZIP code of the registered office, when known. */
  postalCode?: string
}

export type IbanValidation = {
  valid: boolean
  formatted: string
  countryCode?: string
  countryName?: string
  bankCode?: string
  error?: string
}

export type BicValidation = {
  valid: boolean
  normalized: string
  bankCode?: string
  countryCode?: string
  countryName?: string
  locationCode?: string
  branchCode?: string
  error?: string
}

// ISO 3166 country names for the codes we care about (covers the app's markets).
const COUNTRY_NAMES: Record<string, string> = {
  AD: "Andorra", AE: "United Arab Emirates", AT: "Austria", AU: "Australia",
  BE: "Belgium", BG: "Bulgaria", BH: "Bahrain", CH: "Switzerland", CN: "China",
  CY: "Cyprus", CZ: "Czechia", DE: "Germany", DK: "Denmark", EE: "Estonia",
  ES: "Spain", FI: "Finland", FR: "France", GB: "United Kingdom", GR: "Greece",
  HK: "Hong Kong", HR: "Croatia", HU: "Hungary", IE: "Ireland", IL: "Israel",
  IT: "Italy", JP: "Japan", KW: "Kuwait", LI: "Liechtenstein", LT: "Lithuania",
  LU: "Luxembourg", LV: "Latvia", MC: "Monaco", MT: "Malta", NL: "Netherlands",
  NO: "Norway", PL: "Poland", PT: "Portugal", QA: "Qatar", RO: "Romania",
  SA: "Saudi Arabia", SE: "Sweden", SG: "Singapore", SI: "Slovenia",
  SK: "Slovakia", US: "United States",
}

export function countryName(code?: string): string | undefined {
  if (!code) return undefined
  return COUNTRY_NAMES[code.toUpperCase()] ?? code.toUpperCase()
}

// Official IBAN lengths by country (ISO 13616 registry subset).
const IBAN_LENGTHS: Record<string, number> = {
  AD: 24, AE: 23, AT: 20, BE: 16, BG: 22, BH: 22, CH: 21, CY: 28, CZ: 24,
  DE: 22, DK: 18, EE: 20, ES: 24, FI: 18, FR: 27, GB: 22, GR: 27, HR: 21,
  HU: 28, IE: 22, IL: 23, IT: 27, KW: 30, LI: 21, LT: 20, LU: 20, LV: 21,
  MC: 27, MT: 31, NL: 18, NO: 15, PL: 28, PT: 25, QA: 29, RO: 24, SA: 24,
  SE: 24, SI: 19, SK: 24,
}

// How many leading BBAN characters identify the bank, per country.
const IBAN_BANK_CODE_LENGTH: Record<string, number> = {
  DE: 8, CH: 5, GB: 4, FR: 5, AT: 5, NL: 4, ES: 4, IT: 5, BE: 3, AE: 3,
  LI: 5, LU: 3, MC: 5, PT: 4, IE: 6, SA: 2, QA: 4,
}

// Curated bank directory. Each entry can be matched by BIC (full or 6-char
// prefix) and/or by an IBAN national bank code keyed per country.
type DirectoryEntry = {
  name: string
  city: string
  countryCode: string
  bicPrefixes: string[] // 6 or 8 char prefixes
  /** Full 8-char primary SWIFT/BIC, used to auto-fill the SWIFT field from an IBAN. */
  primaryBic?: string
  /** Registered/head-office street address, used to auto-fill the bank address. */
  address?: string
  /** Postal / ZIP code of the registered office. */
  postalCode?: string
  ibanBankCodes?: { country: string; code: string }[]
}

const BANK_DIRECTORY: DirectoryEntry[] = [
  { name: "MCC Capital Bank", city: "Geneva", countryCode: "CH", bicPrefixes: ["MCCBCH"], primaryBic: "MCCBCHGG", address: "Rue du Rhône 100", postalCode: "1204", ibanBankCodes: [{ country: "CH", code: "08390" }] },
  { name: "UBS Switzerland AG", city: "Zurich", countryCode: "CH", bicPrefixes: ["UBSWCH"], primaryBic: "UBSWCHZH", address: "Bahnhofstrasse 45", postalCode: "8001", ibanBankCodes: [{ country: "CH", code: "00273" }] },
  { name: "Credit Suisse (Schweiz) AG", city: "Zurich", countryCode: "CH", bicPrefixes: ["CRESCH"], primaryBic: "CRESCHZZ", address: "Paradeplatz 8", postalCode: "8001", ibanBankCodes: [{ country: "CH", code: "04835" }] },
  { name: "Banking Circle / SX Payments", city: "Hamburg", countryCode: "DE", bicPrefixes: ["SXPYDE"], primaryBic: "SXPYDEHH", address: "Willy-Brandt-Strasse 23", postalCode: "20457", ibanBankCodes: [{ country: "DE", code: "20220800" }] },
  { name: "Deutsche Bank AG", city: "Frankfurt", countryCode: "DE", bicPrefixes: ["DEUTDE"], primaryBic: "DEUTDEFF", address: "Taunusanlage 12", postalCode: "60325", ibanBankCodes: [{ country: "DE", code: "50070010" }] },
  { name: "Commerzbank AG", city: "Frankfurt", countryCode: "DE", bicPrefixes: ["COBADE"], primaryBic: "COBADEFF", address: "Kaiserplatz 16", postalCode: "60311", ibanBankCodes: [{ country: "DE", code: "50040000" }] },
  { name: "BNP Paribas", city: "Paris", countryCode: "FR", bicPrefixes: ["BNPAFR"], primaryBic: "BNPAFRPP", address: "16 Boulevard des Italiens", postalCode: "75009", ibanBankCodes: [{ country: "FR", code: "30004" }] },
  { name: "Société Générale", city: "Paris", countryCode: "FR", bicPrefixes: ["SOGEFR"], primaryBic: "SOGEFRPP", address: "29 Boulevard Haussmann", postalCode: "75009", ibanBankCodes: [{ country: "FR", code: "30003" }] },
  { name: "JPMorgan Chase Bank, N.A.", city: "New York", countryCode: "US", bicPrefixes: ["CHASUS"], primaryBic: "CHASUS33", address: "383 Madison Avenue", postalCode: "10179" },
  { name: "Citibank N.A.", city: "New York", countryCode: "US", bicPrefixes: ["CITIUS"], primaryBic: "CITIUS33", address: "388 Greenwich Street", postalCode: "10013" },
  { name: "Bank of America, N.A.", city: "Charlotte", countryCode: "US", bicPrefixes: ["BOFAUS"], primaryBic: "BOFAUS3N", address: "100 North Tryon Street", postalCode: "28255" },
  { name: "NatWest Bank", city: "London", countryCode: "GB", bicPrefixes: ["NWBKGB"], primaryBic: "NWBKGB2L", address: "250 Bishopsgate", postalCode: "EC2M 4AA", ibanBankCodes: [{ country: "GB", code: "NWBK" }] },
  { name: "Barclays Bank PLC", city: "London", countryCode: "GB", bicPrefixes: ["BARCGB"], primaryBic: "BARCGB22", address: "1 Churchill Place", postalCode: "E14 5HP", ibanBankCodes: [{ country: "GB", code: "BARC" }] },
  { name: "HSBC Bank PLC", city: "London", countryCode: "GB", bicPrefixes: ["HBUKGB", "MIDLGB"], primaryBic: "HBUKGB4B", address: "8 Canada Square", postalCode: "E14 5HQ", ibanBankCodes: [{ country: "GB", code: "HBUK" }, { country: "GB", code: "MIDL" }] },
  { name: "HSBC Bank Middle East", city: "Abu Dhabi", countryCode: "AE", bicPrefixes: ["HABORU", "BBMEAE"], primaryBic: "BBMEAEAD", address: "Al Maqam Tower, ADGM Square, Al Maryah Island" },
  { name: "Emirates NBD", city: "Dubai", countryCode: "AE", bicPrefixes: ["EBILAE"], primaryBic: "EBILAEAD", address: "Baniyas Road, Deira", ibanBankCodes: [{ country: "AE", code: "033" }] },
  { name: "DBS Bank Ltd", city: "Singapore", countryCode: "SG", bicPrefixes: ["DBSSSG"], primaryBic: "DBSSSGSG", address: "12 Marina Boulevard, Marina Bay Financial Centre Tower 3", postalCode: "018982" },
  { name: "Standard Chartered Bank", city: "Singapore", countryCode: "SG", bicPrefixes: ["SCBLSG"], primaryBic: "SCBLSGSG", address: "8 Marina Boulevard, Marina Bay Financial Centre Tower 1", postalCode: "018981" },
  { name: "MUFG Bank, Ltd.", city: "Tokyo", countryCode: "JP", bicPrefixes: ["BOTKJP"], primaryBic: "BOTKJPJT", address: "2-7-1 Marunouchi, Chiyoda-ku", postalCode: "100-8388" },
  { name: "The Hongkong and Shanghai Banking Corp.", city: "Hong Kong", countryCode: "HK", bicPrefixes: ["HSBCHK"], primaryBic: "HSBCHKHH", address: "1 Queen's Road Central" },
  { name: "ING Bank N.V.", city: "Amsterdam", countryCode: "NL", bicPrefixes: ["INGBNL"], primaryBic: "INGBNL2A", address: "Bijlmerdreef 106", postalCode: "1102 CT", ibanBankCodes: [{ country: "NL", code: "INGB" }] },
  { name: "CaixaBank S.A.", city: "Barcelona", countryCode: "ES", bicPrefixes: ["CAIXES"], primaryBic: "CAIXESBB", address: "Calle Pintor Sorolla 2-4", postalCode: "46002", ibanBankCodes: [{ country: "ES", code: "2100" }] },
  { name: "UniCredit S.p.A.", city: "Milan", countryCode: "IT", bicPrefixes: ["UNCRIT"], primaryBic: "UNCRITMM", address: "Piazza Gae Aulenti 3", postalCode: "20154", ibanBankCodes: [{ country: "IT", code: "02008" }] },
]

function normalize(value: string): string {
  return (value || "").toUpperCase().replace(/[\s-]/g, "")
}

// ISO 7064 mod-97-10 over the rearranged IBAN, computed in chunks so we never
// rely on BigInt and never overflow Number.
function mod97(input: string): number {
  let remainder = ""
  for (let i = 0; i < input.length; i++) {
    remainder += input[i]
    if (remainder.length >= 9) {
      remainder = String(Number(remainder) % 97)
    }
  }
  return Number(remainder) % 97
}

export function validateIban(raw: string): IbanValidation {
  const value = normalize(raw)
  const formatted = (value.match(/.{1,4}/g) || []).join(" ")

  if (!value) {
    return { valid: false, formatted: "", error: "IBAN is required" }
  }
  if (!/^[A-Z]{2}[0-9]{2}[A-Z0-9]+$/.test(value)) {
    return { valid: false, formatted, error: "Invalid IBAN format" }
  }

  const countryCode = value.slice(0, 2)
  const expectedLength = IBAN_LENGTHS[countryCode]
  if (!expectedLength) {
    return { valid: false, formatted, countryCode, error: `Unsupported IBAN country: ${countryCode}` }
  }
  if (value.length !== expectedLength) {
    return {
      valid: false,
      formatted,
      countryCode,
      error: `IBAN must be ${expectedLength} characters for ${countryName(countryCode)}`,
    }
  }

  // Move first 4 chars to the end and convert letters (A=10 … Z=35).
  const rearranged = value.slice(4) + value.slice(0, 4)
  const numeric = rearranged.replace(/[A-Z]/g, (ch) => String(ch.charCodeAt(0) - 55))
  if (mod97(numeric) !== 1) {
    return { valid: false, formatted, countryCode, error: "IBAN checksum failed" }
  }

  const bankLen = IBAN_BANK_CODE_LENGTH[countryCode]
  const bankCode = bankLen ? value.slice(4, 4 + bankLen) : undefined

  return {
    valid: true,
    formatted,
    countryCode,
    countryName: countryName(countryCode),
    bankCode,
  }
}

const BIC_REGEX = /^[A-Z]{4}[A-Z]{2}[A-Z0-9]{2}([A-Z0-9]{3})?$/

export function validateBic(raw: string): BicValidation {
  const value = normalize(raw)

  if (!value) {
    return { valid: false, normalized: "", error: "SWIFT/BIC is required" }
  }
  if (value.length !== 8 && value.length !== 11) {
    return { valid: false, normalized: value, error: "BIC must be 8 or 11 characters" }
  }
  if (!BIC_REGEX.test(value)) {
    return { valid: false, normalized: value, error: "Invalid SWIFT/BIC format" }
  }

  const countryCode = value.slice(4, 6)
  if (!COUNTRY_NAMES[countryCode]) {
    return { valid: false, normalized: value, countryCode, error: `Unknown country code: ${countryCode}` }
  }

  return {
    valid: true,
    normalized: value,
    bankCode: value.slice(0, 4),
    countryCode,
    countryName: countryName(countryCode),
    locationCode: value.slice(6, 8),
    branchCode: value.length === 11 ? value.slice(8, 11) : undefined,
  }
}

function findByBic(bic: string): DirectoryEntry | undefined {
  const v = normalize(bic)
  const six = v.slice(0, 6)
  return BANK_DIRECTORY.find((e) => e.bicPrefixes.some((p) => p === v || p === six || v.startsWith(p)))
}

function findByIban(countryCode: string, bankCode?: string): DirectoryEntry | undefined {
  if (!bankCode) return undefined
  return BANK_DIRECTORY.find((e) =>
    e.ibanBankCodes?.some((b) => b.country === countryCode && b.code === bankCode),
  )
}

// Simulate an async directory lookup so the UI can show a verifying state.
function delay<T>(value: T, ms = 450): Promise<T> {
  return new Promise((resolve) => setTimeout(() => resolve(value), ms))
}

export async function lookupBankByBic(raw: string): Promise<BankInfo | null> {
  const result = validateBic(raw)
  if (!result.valid || !result.countryCode) return delay(null)

  const entry = findByBic(result.normalized)
  const info: BankInfo = entry
    ? {
        name: entry.name,
        city: entry.city,
        country: countryName(entry.countryCode) ?? entry.countryCode,
        countryCode: entry.countryCode,
        bic: result.normalized,
        address: entry.address,
        postalCode: entry.postalCode,
        branch:
          result.branchCode && result.branchCode !== "XXX"
            ? `Branch ${result.branchCode}`
            : "Head Office",
      }
    : {
        // Valid BIC but not in directory — still resolve country + codes.
        name: `Financial institution (${result.bankCode})`,
        country: result.countryName ?? result.countryCode,
        countryCode: result.countryCode,
        bic: result.normalized,
        branch:
          result.branchCode && result.branchCode !== "XXX"
            ? `Branch ${result.branchCode}`
            : "Head Office",
      }
  return delay(info)
}

export async function lookupBankByIban(raw: string): Promise<BankInfo | null> {
  const result = validateIban(raw)
  if (!result.valid || !result.countryCode) return delay(null)

  const entry = findByIban(result.countryCode, result.bankCode)
  const info: BankInfo = entry
    ? {
        name: entry.name,
        city: entry.city,
        country: countryName(entry.countryCode) ?? entry.countryCode,
        countryCode: entry.countryCode,
        bic: entry.primaryBic,
        address: entry.address,
        postalCode: entry.postalCode,
      }
    : {
        name: result.bankCode
          ? `Bank code ${result.bankCode}`
          : "Registered institution",
        country: result.countryName ?? result.countryCode,
        countryCode: result.countryCode,
      }
  return delay(info)
}
