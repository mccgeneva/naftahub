// ---------------------------------------------------------------------------
// Bank-instrument marketplace (server-safe)
//
// A deterministic catalogue of leasable / assignable / purchasable bank
// instruments (SBLC, BG, MTN, DLC) issued by the platform's partner banks.
// Pure module with NO "use client" directive and no React imports, so it can be
// consumed from client components AND server routes (OpenFIGI enrichment).
//
// Identifiers (ISIN, Common Code) are generated DETERMINISTICALLY from a seed
// so a given catalogue instrument always presents the same identifiers across
// renders, devices and reloads — never random per render.
// ---------------------------------------------------------------------------

import { PARTNER_BANKS, type PartnerBank, type BankRegion } from "@/lib/partner-banks"

// --- Indicative acquisition pricing ----------------------------------------
// These mirror the headline rates shown on the Instruments page pricing strip.
export const ACQUISITION_FEE_RATES = {
  /** Assignee fee — assignment of an existing instrument to the client. */
  assign: 0.002, // 0.2%
  /** Lease (collateral transfer for a term) fee on face value. */
  lease: 0.04, // 4%
  /** Outright purchase fee on face value. */
  purchase: 0.23, // 23%
} as const

export type AcquisitionAction = keyof typeof ACQUISITION_FEE_RATES

export const ACQUISITION_ACTION_LABELS: Record<AcquisitionAction, string> = {
  assign: "Assign",
  lease: "Lease",
  purchase: "Purchase",
}

export const ACQUISITION_ACTION_DESCRIPTIONS: Record<AcquisitionAction, string> = {
  assign: "Assignment of the instrument to your name (beneficiary change).",
  lease: "Collateral transfer for the instrument's term (returned at maturity).",
  purchase: "Outright purchase — full ownership of the instrument.",
}

/** Compute the indicative fee for an acquisition action on a face value. */
export function computeAcquisitionFee(action: AcquisitionAction, faceValue: number): number {
  return Math.round(faceValue * ACQUISITION_FEE_RATES[action] * 100) / 100
}

// --- Instrument type catalogue ---------------------------------------------

export interface MarketInstrumentType {
  code: string
  full: string
  /** Short rationale shown in the catalogue. */
  purpose: string
  assignable: boolean
  monetizable: boolean
}

export const MARKET_INSTRUMENT_TYPES: MarketInstrumentType[] = [
  {
    code: "SBLC",
    full: "Standby Letter of Credit",
    purpose: "Credit enhancement & payment guarantee",
    assignable: true,
    monetizable: true,
  },
  {
    code: "BG",
    full: "Bank Guarantee",
    purpose: "Performance & financial guarantee",
    assignable: true,
    monetizable: true,
  },
  {
    code: "MTN",
    full: "Medium Term Note",
    purpose: "Tradable debt security / collateral",
    assignable: true,
    monetizable: true,
  },
  {
    code: "DLC",
    full: "Documentary Letter of Credit",
    purpose: "Trade settlement instrument",
    assignable: false,
    monetizable: true,
  },
]

// --- Catalogue instrument shape --------------------------------------------

export interface MarketInstrument {
  /** Stable catalogue id, e.g. "MKT-HSBC-SBLC-1". */
  id: string
  bankKey: string
  bankName: string
  bankBic: string
  bankCountry: string
  /** Geographic grouping (from the partner-bank directory), for the region filter. */
  region: BankRegion
  rating: string
  type: string
  typeFull: string
  purpose: string
  faceValue: number
  currency: string
  /** Validity term in months (instruments are issued "1 year and 1 day" etc.). */
  tenorMonths: number
  isin: string
  commonCode: string
  assignable: boolean
  monetizable: boolean
  /** Whether the instrument is currently offered (a few are shown reserved). */
  available: boolean
}

// --- Deterministic pseudo-random helpers -----------------------------------

function hashSeed(s: string): number {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

function mulberry32(seed: number): () => number {
  let a = seed
  return function () {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function pick<T>(rng: () => number, arr: readonly T[]): T {
  return arr[Math.floor(rng() * arr.length) % arr.length]
}

// --- Deterministic ISIN (valid check digit) --------------------------------

const NSIN_ALPHABET = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ"

function isinCheckDigit(body: string): number {
  let digits = ""
  for (const ch of body.toUpperCase()) {
    if (ch >= "0" && ch <= "9") digits += ch
    else digits += (ch.charCodeAt(0) - 55).toString()
  }
  let sum = 0
  let double = true
  for (let i = digits.length - 1; i >= 0; i--) {
    let d = digits.charCodeAt(i) - 48
    if (double) {
      d *= 2
      if (d > 9) d -= 9
    }
    sum += d
    double = !double
  }
  return (10 - (sum % 10)) % 10
}

function deterministicIsin(prefix: string, rng: () => number): string {
  let nsin = ""
  for (let i = 0; i < 9; i++) nsin += NSIN_ALPHABET[Math.floor(rng() * NSIN_ALPHABET.length)]
  const body = `${prefix}${nsin}`
  return `${body}${isinCheckDigit(body)}`
}

function deterministicCommonCode(rng: () => number): string {
  let out = ""
  for (let i = 0; i < 9; i++) out += Math.floor(rng() * 10).toString()
  return out
}

// --- Catalogue generation ---------------------------------------------------

const FACE_VALUES = [
  5_000_000, 10_000_000, 25_000_000, 50_000_000, 100_000_000, 250_000_000, 500_000_000,
]
const TENORS = [12, 13, 24, 36]
const RATINGS = ["AAA", "AA+", "AA", "AA-", "A+"]

/** Preferred settlement currencies for a bank: its own list, USD-first, EUR always available. */
function bankCurrencies(bank: Pick<PartnerBank, "currencies">): string[] {
  const set = new Set<string>(bank.currencies)
  set.add("USD")
  set.add("EUR")
  return Array.from(set)
}

/** Build the two deterministic offerings a given bank × instrument type carries. */
function offeringsForBank(
  bank: Pick<PartnerBank, "key" | "name" | "bic" | "country" | "countryCode" | "region">,
): MarketInstrument[] {
  const out: MarketInstrument[] = []
  const currencies = bankCurrencies(bank as PartnerBank)
  for (const t of MARKET_INSTRUMENT_TYPES) {
    // Two distinct offerings per bank × type.
    for (let i = 1; i <= 2; i++) {
      const rng = mulberry32(hashSeed(`${bank.key}|${t.code}|${i}`))
      // All marketplace instruments are internationally cleared (Euroclear/Clearstream),
      // so they carry the neutral international "XS" ISIN prefix — the standard for
      // cross-border bank-issued securities — rather than a domestic country prefix.
      const isinPrefix = "XS"
      out.push({
        id: `MKT-${bank.key.toUpperCase()}-${t.code}-${i}`,
        bankKey: bank.key,
        bankName: bank.name,
        bankBic: bank.bic,
        bankCountry: bank.country,
        region: bank.region,
        rating: pick(rng, RATINGS),
        type: t.code,
        typeFull: t.full,
        purpose: t.purpose,
        faceValue: pick(rng, FACE_VALUES),
        currency: pick(rng, currencies),
        tenorMonths: pick(rng, TENORS),
        isin: deterministicIsin(isinPrefix, rng),
        commonCode: deterministicCommonCode(rng),
        assignable: t.assignable,
        monetizable: t.monetizable,
        // ~1 in 6 shown as reserved for realism.
        available: rng() > 0.16,
      })
    }
  }
  return out
}

/**
 * Build the full marketplace catalogue across the ENTIRE worldwide partner-bank
 * directory (~110 banks, every region). Deterministic: the same bank/type/index
 * always yields the same identifiers, face value, rating and currency.
 */
export function buildMarketplaceCatalogue(): MarketInstrument[] {
  const out: MarketInstrument[] = []
  for (const bank of PARTNER_BANKS) out.push(...offeringsForBank(bank))
  return out
}

// --- Custom (user-typed) issuing bank --------------------------------------
// Lets a client search for an instrument from ANY bank in the world, even one
// not in the curated directory. A deterministic, structurally-valid BIC and a
// neutral international ISIN prefix are synthesised from the typed name so the
// generated instruments look authentic and stay stable across renders.

/** Deterministically synthesise a plausible BIC stem from a bank name. */
function synthesiseBic(name: string, rng: () => number): string {
  const letters = name.toUpperCase().replace(/[^A-Z]/g, "")
  const stem = (letters + "BANK").slice(0, 4)
  const loc = NSIN_ALPHABET.slice(10) // A–Z only
  const l1 = loc[Math.floor(rng() * 26)]
  const l2 = loc[Math.floor(rng() * 26)]
  // XX = international/undetermined country placeholder.
  return `${stem}XX${l1}${l2}`
}

/** Build a stable key for a typed custom bank name. */
export function customBankKey(name: string): string {
  return `custom-${hashSeed(name.trim().toLowerCase()).toString(36)}`
}

/**
 * Generate a full instrument set for an arbitrary, user-typed issuing bank that
 * is not in the curated directory. Returns an empty array for a blank name.
 */
export function buildCustomBankInstruments(name: string): MarketInstrument[] {
  const clean = name.trim()
  if (!clean) return []
  const key = customBankKey(clean)
  const rng = mulberry32(hashSeed(`bic|${clean.toLowerCase()}`))
  const bic = synthesiseBic(clean, rng)
  return offeringsForBank({
    key,
    name: clean,
    bic,
    country: "International",
    // Neutral international ISIN prefix (Euroclear/Clearstream) for cross-border issuers.
    countryCode: "XS",
    region: "Europe",
  })
}

/** Human label for a tenor in months (instruments are "1 year and 1 day" style). */
export function tenorLabel(months: number): string {
  if (months === 12) return "12 months"
  if (months === 13) return "1 year + 1 day"
  return `${months} months`
}
