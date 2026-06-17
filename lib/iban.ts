// ---------------------------------------------------------------------------
// IBAN generation & validation
// ---------------------------------------------------------------------------
//
// Produces and validates IBANs that conform to the official ISO 13616 country
// structures and the ISO 7064 MOD-97-10 checksum. Every IBAN generated here is
// guaranteed to pass `isValidIban`, so the gateway never issues a malformed or
// fake account number.
//
// Note: the IBAN system does not cover every country. The United States and
// Singapore (and others) settle domestically (ABA routing / local clearing) and
// have no IBAN. For those jurisdictions we issue domestic coordinates instead of
// an IBAN — see `countrySupportsIban`.

// BBAN segment: a run of characters of a given kind.
//  - "n" = digits 0-9
//  - "a" = uppercase letters A-Z
//  - "c" = alphanumeric (digits + uppercase letters)
type SegmentKind = "n" | "a" | "c"

interface BbanSegment {
  kind: SegmentKind
  length: number
  // When set, the generator seeds this segment from the bank's BIC stem
  // (institution identifier) instead of random data, for realism.
  fromBankStem?: boolean
}

interface IbanSpec {
  /** Total IBAN length including the 2-letter country code + 2 check digits. */
  length: number
  /** BBAN structure (everything after the 4-char prefix). */
  bban: BbanSegment[]
}

// Structures for the IBAN countries relevant to the partner-bank network, plus a
// handful of common ones for robustness. Lengths/structures follow the official
// IBAN registry.
export const IBAN_SPECS: Record<string, IbanSpec> = {
  GB: { length: 22, bban: [{ kind: "a", length: 4, fromBankStem: true }, { kind: "n", length: 6 }, { kind: "n", length: 8 }] },
  IE: { length: 22, bban: [{ kind: "a", length: 4, fromBankStem: true }, { kind: "n", length: 6 }, { kind: "n", length: 8 }] },
  CH: { length: 21, bban: [{ kind: "n", length: 5 }, { kind: "c", length: 12 }] },
  LU: { length: 20, bban: [{ kind: "n", length: 3 }, { kind: "c", length: 13 }] },
  FR: { length: 27, bban: [{ kind: "n", length: 5 }, { kind: "n", length: 5 }, { kind: "c", length: 11 }, { kind: "n", length: 2 }] },
  DE: { length: 22, bban: [{ kind: "n", length: 8 }, { kind: "n", length: 10 }] },
  NL: { length: 18, bban: [{ kind: "a", length: 4, fromBankStem: true }, { kind: "n", length: 10 }] },
  ES: { length: 24, bban: [{ kind: "n", length: 4 }, { kind: "n", length: 4 }, { kind: "n", length: 1 }, { kind: "n", length: 1 }, { kind: "n", length: 10 }] },
  IT: { length: 27, bban: [{ kind: "a", length: 1 }, { kind: "n", length: 5 }, { kind: "n", length: 5 }, { kind: "c", length: 12 }] },
  BE: { length: 16, bban: [{ kind: "n", length: 3 }, { kind: "n", length: 7 }, { kind: "n", length: 2 }] },
  AT: { length: 20, bban: [{ kind: "n", length: 5 }, { kind: "n", length: 11 }] },
  PT: { length: 25, bban: [{ kind: "n", length: 4 }, { kind: "n", length: 4 }, { kind: "n", length: 11 }, { kind: "n", length: 2 }] },
  FI: { length: 18, bban: [{ kind: "n", length: 14 }] },
  SE: { length: 24, bban: [{ kind: "n", length: 20 }] },
  NO: { length: 15, bban: [{ kind: "n", length: 11 }] },
  DK: { length: 18, bban: [{ kind: "n", length: 14 }] },
  AE: { length: 23, bban: [{ kind: "n", length: 3 }, { kind: "n", length: 16 }] },
  SA: { length: 24, bban: [{ kind: "n", length: 2 }, { kind: "c", length: 18 }] },
  QA: { length: 29, bban: [{ kind: "a", length: 4, fromBankStem: true }, { kind: "c", length: 21 }] },
}

const DIGITS = "0123456789"
const LETTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ"
const ALNUM = DIGITS + LETTERS

export function countrySupportsIban(countryCode?: string): boolean {
  return !!countryCode && countryCode.toUpperCase() in IBAN_SPECS
}

function randomChars(kind: SegmentKind, length: number): string {
  const alphabet = kind === "n" ? DIGITS : kind === "a" ? LETTERS : ALNUM
  let out = ""
  for (let i = 0; i < length; i++) {
    out += alphabet[Math.floor(Math.random() * alphabet.length)]
  }
  return out
}

// Convert a string to its numeric form for MOD-97: letters map A=10 … Z=35.
function toNumericString(input: string): string {
  let out = ""
  for (const ch of input.toUpperCase()) {
    if (ch >= "0" && ch <= "9") out += ch
    else if (ch >= "A" && ch <= "Z") out += (ch.charCodeAt(0) - 55).toString()
    else throw new Error(`Invalid IBAN character: ${ch}`)
  }
  return out
}

// MOD-97 over an arbitrarily long numeric string (avoids BigInt overflow).
function mod97(numeric: string): number {
  let remainder = 0
  for (let i = 0; i < numeric.length; i++) {
    remainder = (remainder * 10 + (numeric.charCodeAt(i) - 48)) % 97
  }
  return remainder
}

// Compute the 2 check digits for a country + BBAN per ISO 7064 MOD-97-10.
function computeCheckDigits(countryCode: string, bban: string): string {
  const rearranged = bban + countryCode + "00"
  const remainder = mod97(toNumericString(rearranged))
  const check = 98 - remainder
  return check.toString().padStart(2, "0")
}

/** Normalize an IBAN: strip spaces, uppercase. */
export function normalizeIban(iban: string): string {
  return iban.replace(/\s+/g, "").toUpperCase()
}

/** Format an IBAN in groups of four for display. */
export function formatIban(iban: string): string {
  return normalizeIban(iban).replace(/(.{4})/g, "$1 ").trim()
}

/**
 * Validate an IBAN's country structure (known country, exact length, allowed
 * characters per segment) AND its MOD-97 checksum. Returns true only for a
 * fully valid IBAN.
 */
export function isValidIban(value: string): boolean {
  const iban = normalizeIban(value)
  if (!/^[A-Z]{2}[0-9]{2}[A-Z0-9]+$/.test(iban)) return false
  const country = iban.slice(0, 2)
  const spec = IBAN_SPECS[country]
  if (!spec) return false
  if (iban.length !== spec.length) return false

  // Validate each BBAN segment against its allowed character class.
  const bban = iban.slice(4)
  let pos = 0
  for (const seg of spec.bban) {
    const chunk = bban.slice(pos, pos + seg.length)
    if (chunk.length !== seg.length) return false
    const pattern = seg.kind === "n" ? /^[0-9]+$/ : seg.kind === "a" ? /^[A-Z]+$/ : /^[A-Z0-9]+$/
    if (!pattern.test(chunk)) return false
    pos += seg.length
  }
  if (pos !== bban.length) return false

  // MOD-97 checksum: rearrange (BBAN + country + check) and confirm remainder 1.
  const rearranged = iban.slice(4) + iban.slice(0, 4)
  return mod97(toNumericString(rearranged)) === 1
}

/**
 * Generate a valid IBAN for a country. The institution segment is seeded from
 * `bankStem` (e.g. the first 4 chars of a BIC) where the structure uses a bank
 * code, for realism. Throws if the country has no IBAN structure.
 */
export function generateIban(countryCode: string, bankStem?: string): string {
  const country = countryCode.toUpperCase()
  const spec = IBAN_SPECS[country]
  if (!spec) throw new Error(`No IBAN structure for country ${country}`)

  let bban = ""
  let stemUsed = false
  for (const seg of spec.bban) {
    if (seg.fromBankStem && bankStem && !stemUsed) {
      // Pad/truncate the BIC stem to the segment length, uppercased letters only.
      const cleaned = bankStem.toUpperCase().replace(/[^A-Z]/g, "")
      const seeded = (cleaned + randomChars("a", seg.length)).slice(0, seg.length)
      bban += seeded
      stemUsed = true
    } else {
      bban += randomChars(seg.kind, seg.length)
    }
  }

  const check = computeCheckDigits(country, bban)
  const iban = `${country}${check}${bban}`
  // Defensive: a generation bug would be caught here rather than shipped.
  if (!isValidIban(iban)) {
    throw new Error(`Generated IBAN failed validation for ${country}`)
  }
  return iban
}
