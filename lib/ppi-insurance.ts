/**
 * PPI — Payment Protection Insurance underwritten through Lloyd's of London.
 *
 * Pure, client-safe pricing engine. Coverage is FULL: the insured sum equals the
 * client's whole debit exposure (borrowed/financed principal across leverage,
 * loans, monetization, project funding, financed treasury deposit) plus capital
 * committed to Yield/PPP programs plus any current overdraft. The policy runs
 * for one year from activation.
 */

export const PPI_INSURER = "Lloyd's of London"
export const PPI_CURRENCY = "EUR"
export const PPI_VALIDITY_DAYS = 365

/** Base annual premium rate on the insured sum. */
export const PPI_BASE_RATE = 0.0125
/** Extra rate per point of Guarantees Accumulator risk score. */
export const PPI_RISK_RATE_PER_POINT = 0.002
/** Cap on the risk loading. */
export const PPI_RISK_LOADING_CAP = 0.05
/** Extra rate per overdue charge on the account. */
export const PPI_ARREARS_RATE_PER_ITEM = 0.0025
export const PPI_ARREARS_LOADING_CAP = 0.01
/** Floor premium so tiny exposures still cover underwriting cost. */
export const PPI_MIN_PREMIUM = 500

export type PpiExposure = {
  /** Outstanding borrowed / financed principal (debits, loans, leverage…), EUR. */
  debitExposureEur: number
  /** Capital committed to live Yield / PPP programs, EUR. */
  pppCapitalEur: number
  /** Current negative balance (overdraft), EUR. */
  overdraftEur: number
  /** Guarantees Accumulator final risk score. */
  riskScore: number
  /** Overdue financing charges on the account. */
  overdueCharges: number
}

export type PpiQuote = {
  coverEur: number
  baseRate: number
  riskLoading: number
  arrearsLoading: number
  totalRate: number
  premiumEur: number
}

const round2 = (n: number) => Math.round(n * 100) / 100
const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n))

export function computePpiQuote(x: PpiExposure): PpiQuote {
  const coverEur = round2(
    Math.max(0, x.debitExposureEur) + Math.max(0, x.pppCapitalEur) + Math.max(0, x.overdraftEur),
  )
  const riskLoading = clamp((Number(x.riskScore) || 0) * PPI_RISK_RATE_PER_POINT, 0, PPI_RISK_LOADING_CAP)
  const arrearsLoading = clamp(
    (Number(x.overdueCharges) || 0) * PPI_ARREARS_RATE_PER_ITEM,
    0,
    PPI_ARREARS_LOADING_CAP,
  )
  const totalRate = PPI_BASE_RATE + riskLoading + arrearsLoading
  const premiumEur = coverEur > 0 ? round2(Math.max(PPI_MIN_PREMIUM, coverEur * totalRate)) : 0
  return { coverEur, baseRate: PPI_BASE_RATE, riskLoading, arrearsLoading, totalRate, premiumEur }
}

export type PpiPolicyStatus =
  | "negotiating"
  | "active"
  | "paused"
  | "terminated"
  | "used"
  | "expired"
  | "cancelled"

export const PPI_STATUS_LABEL: Record<PpiPolicyStatus, string> = {
  negotiating: "In negotiation",
  active: "Active",
  paused: "Paused",
  terminated: "Deactivated",
  used: "Used — terminated",
  expired: "Expired",
  cancelled: "Cancelled",
}

/** Statuses in which treasury and the customer can still exchange messages. */
export const PPI_DISCUSSION_STATUSES: PpiPolicyStatus[] = ["negotiating", "active", "paused", "terminated", "used"]

export type PpiMessage = {
  id: string
  author: "treasury" | "client"
  authorName: string
  text: string
  at: string
}

const SLIP_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"

/**
 * Platform-issued slip reference in Lloyd's Unique Market Reference shape
 * (B + 4-digit broker code + free text, 17 chars max). It is an internal
 * placeholder until Lloyd's confirms the real UMR, which the admin can paste over it.
 */
export function generateLloydsSlipRef(now = new Date()): string {
  let suffix = ""
  for (let i = 0; i < 5; i++) suffix += SLIP_CHARS[Math.floor(Math.random() * SLIP_CHARS.length)]
  return `B1204NAF${now.getUTCFullYear()}${suffix}`
}

export type PpiPolicy = {
  id: string
  userId: string
  ownerId: string
  holderLabel: string
  status: PpiPolicyStatus
  insurer: string
  currency: string
  coverAmount: number
  computedPremium: number
  negotiatedPremium: number | null
  lloydsReference: string
  note: string
  claimedAmount: number
  createdAt: string
  activatedAt: string | null
  expiresAt: string | null
  chargeEntryId: string | null
  messages: PpiMessage[]
}

/** Effective status: an active policy past its expiry reads as expired. */
export function effectivePpiStatus(p: Pick<PpiPolicy, "status" | "expiresAt">, now = Date.now()): PpiPolicyStatus {
  if (
    (p.status === "active" || p.status === "paused" || p.status === "terminated") &&
    p.expiresAt &&
    new Date(p.expiresAt).getTime() < now
  )
    return "expired"
  return p.status
}

export function ppiRemainingCover(p: Pick<PpiPolicy, "coverAmount" | "claimedAmount">): number {
  return round2(Math.max(0, p.coverAmount - p.claimedAmount))
}

export function ppiPremiumDue(p: Pick<PpiPolicy, "negotiatedPremium" | "computedPremium">): number {
  return p.negotiatedPremium != null ? p.negotiatedPremium : p.computedPremium
}
