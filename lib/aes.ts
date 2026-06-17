// Adaptive Equity System (AES) — calculation engine.
//
// Encodes MCC Capital's proprietary equity calibration framework exactly as
// defined in the AES Product Specification & the Project Finance Handbook:
//   - a progressive, tiered equity-rate matrix applied per tranche, and
//   - the mandatory upfront cash commitment bounded by risk score.
//
// Pure functions only (no React / no DOM) so they can be shared by the client
// Project Funding page and the Administrator approval panel.

/** Fixed institutional cost of capital quoted by MCC Capital (annual). */
export const AES_ANNUAL_COST_RATE = 0.018 // 1.8%

/** Standard investment tenor in years. */
export const AES_STANDARD_TENOR_YEARS = 15

/** Early redemption settlement: % of residual balance due on early exit. */
export const AES_EARLY_REDEMPTION_RATE = 0.7 // 70%

/**
 * Progressive tiered equity bands. Each band applies its rate ONLY to the
 * portion of the facility that falls within [from, to). Bands are evaluated
 * sequentially and the resulting obligations are summed (not a flat rate).
 */
export interface AesTier {
  from: number
  to: number // Infinity for the top band
  rate: number
  label: string
  positioning: string
}

export const AES_TIERS: AesTier[] = [
  { from: 0, to: 10_000_000, rate: 0.05, label: "USD 1M – 10M", positioning: "Seed / Growth Stage" },
  { from: 10_000_000, to: 25_000_000, rate: 0.04, label: "USD 10M – 25M", positioning: "Expansion Stage" },
  { from: 25_000_000, to: 100_000_000, rate: 0.03, label: "USD 25M – 100M", positioning: "Infrastructure / Mid-Market" },
  { from: 100_000_000, to: 500_000_000, rate: 0.02, label: "USD 100M – 500M", positioning: "Large-Scale / Institutional" },
  { from: 500_000_000, to: Number.POSITIVE_INFINITY, rate: 0.01, label: "Above USD 500M", positioning: "Sovereign / Mega Project" },
]

/** Minimum facility size MCC Capital will structure under AES. */
export const AES_MIN_FACILITY = 1_000_000

/** Per-tranche breakdown of an equity calculation. */
export interface AesTrancheResult {
  tier: AesTier
  amountInBand: number
  equityForBand: number
}

export interface AesEquityResult {
  facility: number
  tranches: AesTrancheResult[]
  totalEquity: number
  /** Blended effective equity rate across the whole facility. */
  effectiveRate: number
}

/**
 * Compute the total equity obligation for a requested facility using the
 * progressive tiered matrix. Returns the per-tranche breakdown plus totals.
 */
export function calculateAesEquity(facility: number): AesEquityResult {
  const safeFacility = Number.isFinite(facility) && facility > 0 ? facility : 0
  const tranches: AesTrancheResult[] = []
  let totalEquity = 0

  for (const tier of AES_TIERS) {
    if (safeFacility <= tier.from) {
      tranches.push({ tier, amountInBand: 0, equityForBand: 0 })
      continue
    }
    const upper = Math.min(safeFacility, tier.to)
    const amountInBand = Math.max(0, upper - tier.from)
    const equityForBand = amountInBand * tier.rate
    totalEquity += equityForBand
    tranches.push({ tier, amountInBand, equityForBand })
  }

  return {
    facility: safeFacility,
    tranches,
    totalEquity,
    effectiveRate: safeFacility > 0 ? totalEquity / safeFacility : 0,
  }
}

export interface AesCashCommitment {
  /** Floor: 0.1% of the total financing facility. */
  min: number
  /** Ceiling: 10% of the total equity obligation. */
  max: number
  /**
   * Applicable amount for a given risk score (0–10). Score 0 → min,
   * score 10 → max, linearly interpolated. Undefined score returns the
   * minimum (the floor that always applies).
   */
  applicable: number
}

/**
 * Determine the mandatory upfront cash commitment. The floor is 0.1% of the
 * facility; the ceiling is 10% of the calculated equity. The risk score issued
 * by the due-diligence body (0–10) sets where in that range the commitment
 * lands. Score is optional because the client sees the range pre-approval and
 * the Administrator sets the score at decision time.
 */
export function calculateCashCommitment(facility: number, totalEquity: number, riskScore?: number): AesCashCommitment {
  const min = Math.max(0, facility) * 0.001
  const max = Math.max(0, totalEquity) * 0.1
  let applicable = min
  if (typeof riskScore === "number" && Number.isFinite(riskScore)) {
    const clamped = Math.min(10, Math.max(0, riskScore))
    applicable = min + ((max - min) * clamped) / 10
  }
  return { min, max, applicable }
}

/** Total annual cost of capital for a facility at the fixed 1.8% rate. */
export function annualCostOfCapital(facility: number): number {
  return Math.max(0, facility) * AES_ANNUAL_COST_RATE
}

/** The 8-stage AES operational lifecycle, in order. */
export const AES_LIFECYCLE_STAGES = [
  { phase: "01", name: "Project Submission", description: "Client submits formal project dossier for preliminary assessment." },
  { phase: "02", name: "External Due Diligence", description: "JURIS TREUHAND AG (Zurich) conducts independent legal, financial, and compliance review." },
  { phase: "03", name: "Risk Scoring & Approval", description: "Due diligence outcome produces a formal risk score (0–10). Approval recommendation issued." },
  { phase: "04", name: "AES Equity Calculation", description: "Tiered equity matrix applied to requested capital. Progressive tranche aggregation performed." },
  { phase: "05", name: "Equity Structuring", description: "Client designates equity composition: tangible assets, bank instruments (BG/SBLC/MTN), and/or cash." },
  { phase: "06", name: "Upfront Cash Commitment", description: "Mandatory liquid commitment: minimum 0.1% of facility; maximum 10% of total equity. Determined by risk score." },
  { phase: "07", name: "Funding Activation", description: "Capital sourced via MCC institutional credit line at 1.8% annual cost; deployed within approximately 5 business days." },
  { phase: "08", name: "Controlled Disbursement", description: "Funds released exclusively to verified suppliers, contractors, and project-designated beneficiaries." },
] as const

export type AesEquityComponent = "assets" | "instruments" | "cash"

export const AES_EQUITY_COMPONENTS: { id: AesEquityComponent; label: string; description: string }[] = [
  {
    id: "assets",
    label: "Tangible Assets",
    description: "Real estate, industrial plant, or infrastructure. Unencumbered; ownership remains with the client.",
  },
  {
    id: "instruments",
    label: "Bank Instruments",
    description: "BG, SBLC, MTN or equivalent AAA-rated instruments from an approved banking institution.",
  },
  {
    id: "cash",
    label: "Cash Component",
    description: "Liquid funds via bank wire. Includes the mandatory upfront cash commitment (0.1%–10%).",
  },
]
