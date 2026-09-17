/**
 * Debt facility products offered alongside the AES equity product on the
 * Project Funding Application. Pure + client-safe (no "use client"/"server-only")
 * so it can be imported by the client form AND the server approval engine.
 *
 * Institutional defaults (rate / max LTV / tenor / arrangement fee) are the
 * single source of truth; override the numbers here to retune a product.
 */

export type FacilityType = "aes" | "non_recourse" | "bridge" | "mortgage"

export interface LoanProduct {
  id: Exclude<FacilityType, "aes">
  label: string
  short: string
  blurb: string
  /** Annual interest rate (decimal, e.g. 0.075 = 7.5%). */
  annualRate: number
  /** Maximum loan-to-value against pledged collateral (decimal). */
  maxLtv: number
  /** Maximum tenor in months. */
  maxTenorMonths: number
  /** Arrangement fee as a fraction of the facility, charged on approval. */
  arrangementFeeRate: number
  /** Minimum facility size. */
  minFacility: number
}

// Loans are secured lending, not the institutional AES project-funding floor —
// so the real gate is the collateral/LTV, with a small absolute minimum.
export const LOAN_MIN_FACILITY = 50_000

export const FACILITY_TYPE_LABELS: Record<FacilityType, string> = {
  aes: "Advanced Equity Investment (AES)",
  non_recourse: "Non-Recourse Loan",
  bridge: "Bridge Loan",
  mortgage: "Mortgage",
}

export const LOAN_PRODUCTS: Record<Exclude<FacilityType, "aes">, LoanProduct> = {
  non_recourse: {
    id: "non_recourse",
    label: "Non-Recourse Loan",
    short: "Non-Recourse",
    blurb:
      "Secured solely by the project and its pledged collateral — no recourse to the client's other assets on default.",
    annualRate: 0.075,
    maxLtv: 0.65,
    maxTenorMonths: 84,
    arrangementFeeRate: 0.015,
    minFacility: LOAN_MIN_FACILITY,
  },
  bridge: {
    id: "bridge",
    label: "Bridge Loan",
    short: "Bridge",
    blurb:
      "Short-term financing that bridges to a defined takeout event or refinancing. Higher rate, shorter tenor.",
    annualRate: 0.109,
    maxLtv: 0.7,
    maxTenorMonths: 18,
    arrangementFeeRate: 0.02,
    minFacility: LOAN_MIN_FACILITY,
  },
  mortgage: {
    id: "mortgage",
    label: "Mortgage",
    short: "Mortgage",
    blurb: "Long-term lending secured by real estate. Lowest rate, longest tenor.",
    annualRate: 0.054,
    maxLtv: 0.75,
    maxTenorMonths: 300,
    arrangementFeeRate: 0.01,
    minFacility: LOAN_MIN_FACILITY,
  },
}

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100
}

export function isLoanFacility(t: string | undefined | null): t is Exclude<FacilityType, "aes"> {
  return t === "non_recourse" || t === "bridge" || t === "mortgage"
}

export function getLoanProduct(t: string | undefined | null): LoanProduct | null {
  return isLoanFacility(t) ? LOAN_PRODUCTS[t] : null
}

/** Arrangement fee (charged to the Master Account on approval). */
export function loanArrangementFee(facility: number, t: FacilityType): number {
  const p = getLoanProduct(t)
  if (!p || !Number.isFinite(facility) || facility <= 0) return 0
  return round2(facility * p.arrangementFeeRate)
}

/** Maximum advance a given collateral value supports at the product's max LTV. */
export function loanMaxAdvance(collateralValue: number, t: FacilityType): number {
  const p = getLoanProduct(t)
  if (!p || !Number.isFinite(collateralValue) || collateralValue <= 0) return 0
  return round2(collateralValue * p.maxLtv)
}

/** Indicative monthly interest on the facility. */
export function loanMonthlyInterest(facility: number, t: FacilityType): number {
  const p = getLoanProduct(t)
  if (!p || !Number.isFinite(facility) || facility <= 0) return 0
  return round2((facility * p.annualRate) / 12)
}

/** Actual loan-to-value (facility / collateral). 0 when collateral is missing. */
export function loanActualLtv(facility: number, collateralValue: number): number {
  if (!Number.isFinite(collateralValue) || collateralValue <= 0) return 0
  return facility / collateralValue
}

/** Minimum collateral value needed to support a given facility at the max LTV. */
export function loanMinCollateral(facility: number, t: FacilityType): number {
  const p = getLoanProduct(t)
  if (!p || !Number.isFinite(facility) || facility <= 0) return 0
  return Math.ceil(facility / p.maxLtv)
}

export function formatTenor(months: number): string {
  if (months % 12 === 0) {
    const y = months / 12
    return `${y} year${y === 1 ? "" : "s"}`
  }
  return `${months} months`
}
