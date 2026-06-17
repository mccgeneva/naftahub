// SWIFT gpi (Global Payments Innovation) helpers.
//
// Provides UETR generation, correspondent-bank routing, and a deterministic
// end-to-end tracking timeline derived from a payment's status. The timeline
// mirrors a real gpi Tracker: ordering institution -> correspondent /
// intermediary bank -> beneficiary's bank -> funds credited, each carrying a
// gpi transaction status code (ACSP / ACSC / RJCT).

export type GpiStageState = "done" | "current" | "pending" | "failed"

export interface GpiStage {
  key: string
  title: string
  institution: string
  bic: string
  location: string
  description: string
  state: GpiStageState
  timestamp?: string // ISO timestamp, omitted while still pending
}

export interface GpiTrackingInfo {
  uetr: string
  // SWIFT gpi transaction status code, e.g. ACSP / ACSC / RJCT.
  statusCode: "ACSP" | "ACSC" | "RJCT" | "PDNG"
  statusLabel: string
  // Confirmed value date (when funds are credited), display string.
  valueDate?: string
  stages: GpiStage[]
}

// The platform ordering institution.
export const ORDERING_INSTITUTION = {
  name: "MCC Capital",
  bic: "MCCBCHZZ",
  location: "Geneva, Switzerland",
}

// Correspondent / intermediary bank selected by settlement currency. These are
// the banks that route the funds between MCC Capital and the beneficiary bank.
const CORRESPONDENTS: Record<string, { name: string; bic: string; location: string }> = {
  EUR: { name: "Deutsche Bank AG", bic: "DEUTDEFF", location: "Frankfurt, Germany" },
  USD: { name: "JP Morgan Chase", bic: "CHASUS33", location: "New York, USA" },
  GBP: { name: "NatWest Bank", bic: "NWBKGB2L", location: "London, UK" },
  CHF: { name: "UBS Switzerland", bic: "UBSWCHZH", location: "Zurich, Switzerland" },
  AED: { name: "HSBC Bank", bic: "HABORUMM", location: "Abu Dhabi, UAE" },
}

const DEFAULT_CORRESPONDENT = { name: "Citibank N.A.", bic: "CITIUS33", location: "New York, USA" }

export function getCorrespondentBank(currency: string) {
  return CORRESPONDENTS[currency?.toUpperCase()] ?? DEFAULT_CORRESPONDENT
}

// Generate a fresh UETR (Unique End-to-End Transaction Reference). A UETR is a
// UUID v4 string as mandated by the SWIFT gpi standard.
export function generateUetr(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID()
  }
  // Fallback RFC-4122 v4 generator.
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0
    const v = c === "x" ? r : (r & 0x3) | 0x8
    return v.toString(16)
  })
}

// Derive a STABLE UETR from a seed string (used for records that predate the
// stored UETR, e.g. incoming ledger credits). Produces a deterministic, valid
// UUID-v4-formatted string so the same payment always shows the same UETR.
export function deriveUetr(seed: string): string {
  // Simple FNV-1a-style hash expanded into 32 hex chars.
  let hex = ""
  let h = 0x811c9dc5
  for (let i = 0; i < 32; i++) {
    const ch = seed.charCodeAt(i % Math.max(seed.length, 1)) + i * 31
    h ^= ch
    h = Math.imul(h, 0x01000193) >>> 0
    hex += (h & 0xf).toString(16)
  }
  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    "4" + hex.slice(13, 16), // version 4
    ((parseInt(hex[16], 16) & 0x3) | 0x8).toString(16) + hex.slice(17, 20), // variant
    hex.slice(20, 32),
  ].join("-")
}

function addMinutes(iso: string, minutes: number): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return new Date(d.getTime() + minutes * 60_000).toISOString()
}

export type GpiPaymentStatus = "completed" | "processing" | "pending" | "failed"

export interface GpiPaymentInput {
  uetr: string
  status: GpiPaymentStatus
  currency: string
  // Beneficiary bank BIC/SWIFT (field 57A). Optional — may be unknown.
  beneficiaryBic?: string
  beneficiaryName: string
  beneficiaryCountry?: string
  // Base timestamp the journey is anchored to (payment submission/value date).
  baseDate: string
  // For incoming payments the funds are received rather than sent.
  direction: "incoming" | "outgoing"
}

function formatValueDate(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })
}

// Build the gpi tracking timeline and status for a payment. Pure + deterministic.
export function buildGpiTracking(payment: GpiPaymentInput): GpiTrackingInfo {
  const correspondent = getCorrespondentBank(payment.currency)
  const beneficiaryBankBic =
    payment.beneficiaryBic && payment.beneficiaryBic !== "—" ? payment.beneficiaryBic : "BENEFICIARY"
  const base = payment.baseDate

  // Incoming payments are presented as already received & credited.
  if (payment.direction === "incoming") {
    return {
      uetr: payment.uetr,
      statusCode: "ACSC",
      statusLabel: "Credited — funds received",
      valueDate: formatValueDate(base),
      stages: [
        {
          key: "sent",
          title: "Payment sent by ordering bank",
          institution: correspondent.name,
          bic: correspondent.bic,
          location: correspondent.location,
          description: "The remitting institution dispatched the gpi credit transfer.",
          state: "done",
          timestamp: base,
        },
        {
          key: "intermediary",
          title: "Processed by correspondent",
          institution: correspondent.name,
          bic: correspondent.bic,
          location: correspondent.location,
          description: "Funds cleared through the correspondent network.",
          state: "done",
          timestamp: addMinutes(base, 45),
        },
        {
          key: "credited",
          title: "Credited to your account",
          institution: ORDERING_INSTITUTION.name,
          bic: ORDERING_INSTITUTION.bic,
          location: ORDERING_INSTITUTION.location,
          description: "Funds were credited to the MCC Capital beneficiary account.",
          state: "done",
          timestamp: addMinutes(base, 90),
        },
      ],
    }
  }

  // Outgoing journey stages.
  const initiated: GpiStage = {
    key: "initiated",
    title: "Payment initiated",
    institution: ORDERING_INSTITUTION.name,
    bic: ORDERING_INSTITUTION.bic,
    location: ORDERING_INSTITUTION.location,
    description: "MT103 created and submitted to the SWIFT gpi network.",
    state: "done",
    timestamp: base,
  }

  if (payment.status === "pending") {
    return {
      uetr: payment.uetr,
      statusCode: "PDNG",
      statusLabel: "Awaiting authorization",
      stages: [
        initiated,
        {
          key: "authorize",
          title: "Pending authorization",
          institution: ORDERING_INSTITUTION.name,
          bic: ORDERING_INSTITUTION.bic,
          location: ORDERING_INSTITUTION.location,
          description: "Payment is awaiting Administrator approval before release.",
          state: "current",
        },
        {
          key: "intermediary",
          title: "Correspondent / intermediary bank",
          institution: correspondent.name,
          bic: correspondent.bic,
          location: correspondent.location,
          description: "Will route the funds once the payment is released.",
          state: "pending",
        },
        {
          key: "beneficiary-bank",
          title: "Beneficiary's bank",
          institution: payment.beneficiaryName,
          bic: beneficiaryBankBic,
          location: payment.beneficiaryCountry || "—",
          description: "Awaiting receipt of the credit transfer.",
          state: "pending",
        },
        {
          key: "credited",
          title: "Funds credited to beneficiary",
          institution: payment.beneficiaryName,
          bic: beneficiaryBankBic,
          location: payment.beneficiaryCountry || "—",
          description: "Confirmation of credit (ACSC) will appear here.",
          state: "pending",
        },
      ],
    }
  }

  if (payment.status === "failed") {
    return {
      uetr: payment.uetr,
      statusCode: "RJCT",
      statusLabel: "Rejected / returned",
      stages: [
        initiated,
        {
          key: "rejected",
          title: "Payment rejected",
          institution: ORDERING_INSTITUTION.name,
          bic: ORDERING_INSTITUTION.bic,
          location: ORDERING_INSTITUTION.location,
          description: "The payment was not authorized and no funds were sent.",
          state: "failed",
          timestamp: addMinutes(base, 5),
        },
      ],
    }
  }

  // processing -> in transit (intermediary reached, not yet credited)
  // completed  -> fully credited (ACSC)
  const credited = payment.status === "completed"
  return {
    uetr: payment.uetr,
    statusCode: credited ? "ACSC" : "ACSP",
    statusLabel: credited ? "Credited — ACSC" : "In transit — ACSP",
    valueDate: credited ? formatValueDate(addMinutes(base, 180)) : undefined,
    stages: [
      initiated,
      {
        key: "intermediary",
        title: "Routed via correspondent bank",
        institution: correspondent.name,
        bic: correspondent.bic,
        location: correspondent.location,
        description: "Funds cleared through the correspondent / intermediary bank.",
        state: "done",
        timestamp: addMinutes(base, 30),
      },
      {
        key: "beneficiary-bank",
        title: "Received by beneficiary's bank",
        institution: payment.beneficiaryName,
        bic: beneficiaryBankBic,
        location: payment.beneficiaryCountry || "—",
        description: credited
          ? "The beneficiary's bank received and processed the credit."
          : "In progress at the beneficiary's bank.",
        state: credited ? "done" : "current",
        timestamp: credited ? addMinutes(base, 120) : undefined,
      },
      {
        key: "credited",
        title: "Funds credited to beneficiary",
        institution: payment.beneficiaryName,
        bic: beneficiaryBankBic,
        location: payment.beneficiaryCountry || "—",
        description: credited
          ? "Settlement completed — funds credited to the beneficiary."
          : "Awaiting final credit confirmation (ACSC).",
        state: credited ? "done" : "pending",
        timestamp: credited ? addMinutes(base, 180) : undefined,
      },
    ],
  }
}
