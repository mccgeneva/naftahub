// ---------------------------------------------------------------------------
// Spot Deals & Marine Vessels — shared types and pure helpers.
//
// This module is import-safe on BOTH the client and the server (it pulls in no
// `pg`, no `server-only`). It defines the vessel catalogue + spot-deal shapes
// and small pure helpers (countdown formatting, total value, live-state checks)
// reused by the admin manager, the user-facing board, the dashboard tile and
// the server actions, so the contract stays in exactly one place.
// ---------------------------------------------------------------------------

import type { CommodityUnit } from "@/lib/petroleum-products"

// --- Vessels ----------------------------------------------------------------

/** The three tanker families the desk trades against. */
export type VesselType = "crude" | "product" | "gas"

export const VESSEL_TYPE_LABELS: Record<VesselType, string> = {
  crude: "Crude Oil Tanker",
  product: "Refined Product Tanker",
  gas: "Gas Tanker (LNG / LPG)",
}

export const VESSEL_TYPES: VesselType[] = ["crude", "product", "gas"]

/** Operational status, mirroring the common MarineTraffic navigational states. */
export type VesselStatus = "underway" | "anchored" | "moored" | "loading" | "discharging" | "idle"

export const VESSEL_STATUSES: VesselStatus[] = [
  "underway",
  "anchored",
  "moored",
  "loading",
  "discharging",
  "idle",
]

export const VESSEL_STATUS_LABELS: Record<VesselStatus, string> = {
  underway: "Underway",
  anchored: "At anchor",
  moored: "Moored",
  loading: "Loading",
  discharging: "Discharging",
  idle: "Idle",
}

/** Where the row originated, for the audit trail / import provenance. */
export type VesselSource = "manual" | "marinetraffic" | "seed"

export interface Vessel {
  /** IMO number — the stable, globally-unique vessel identifier (primary key). */
  imo: string
  name: string
  type: VesselType
  /** Size class, e.g. "VLCC", "Suezmax", "Aframax", "MR", "LR2", "LNG", "VLGC". */
  vesselClass?: string
  /** Cargo-carrying capacity (DWT for oil tankers, CBM for gas carriers). */
  capacity: number
  capacityUnit: "DWT" | "CBM"
  status: VesselStatus
  /** Last known location — a port name or sea area. */
  location: string
  lat?: number
  lng?: number
  /** Flag state (country of registry). */
  flag?: string
  builtYear?: number
  /** Type of oil/gas currently being transported, free-form. */
  cargo?: string
  source: VesselSource
  updatedAt: string
}

// --- Spot deals -------------------------------------------------------------

export type SpotDealStatus = "draft" | "published" | "withdrawn" | "expired" | "engaged"

export const SPOT_DEAL_STATUS_LABELS: Record<SpotDealStatus, string> = {
  draft: "Draft",
  published: "Published",
  withdrawn: "Withdrawn",
  expired: "Expired",
  engaged: "Engaged",
}

/** A single recorded user interaction with a published deal (audit trail). */
export interface SpotDealInterest {
  userId: string
  userLabel: string
  action: "viewed" | "engaged" | "accepted"
  at: string
}

export interface SpotDeal {
  /** Platform reference, e.g. "SPOT-1A2B3C4D". */
  id: string

  // Vessel snapshot (denormalised so a deal stays intact even if the vessel
  // catalogue row later changes).
  vesselImo: string
  vesselName: string
  vesselType: VesselType
  vesselClass?: string

  // Commercial terms
  product: string
  productId?: string
  quantity: number
  unit: CommodityUnit
  /** Special spot price PER UNIT (no long-term contract). */
  spotPrice: number
  currency: string
  /** quantity × spotPrice, rounded to cents. Stored so listings never recompute. */
  totalValue: number
  incoterm: string
  loadPort: string
  dischargePort?: string
  terms: string

  // Lifecycle
  status: SpotDealStatus
  /** Limited-time-offer expiry (ISO timestamp). */
  expiresAt: string
  createdAt: string
  publishedAt?: string
  withdrawnAt?: string
  /** Bankeka broadcast id created when the deal was published. */
  broadcastId?: string
  /** Display label of the administrator who created the offer. */
  createdBy: string

  interests?: SpotDealInterest[]
}

// --- Pure helpers -----------------------------------------------------------

/** quantity × unit price, rounded to whole cents (never store raw floats). */
export function computeTotalValue(quantity: number, spotPrice: number): number {
  if (!Number.isFinite(quantity) || !Number.isFinite(spotPrice)) return 0
  return Math.round(quantity * spotPrice * 100) / 100
}

export interface Countdown {
  expired: boolean
  ms: number
  /** Compact human label, e.g. "2d 4h", "3h 12m", "8m 22s", "Expired". */
  label: string
  /** True when under one hour remains (UI urgency styling). */
  urgent: boolean
}

/**
 * Time remaining until `expiresAt`. `now` is injectable so a ticking client
 * component can re-render each second without re-reading the clock here.
 */
export function dealCountdown(expiresAt: string, now: number = Date.now()): Countdown {
  const end = new Date(expiresAt).getTime()
  const ms = end - now
  if (!Number.isFinite(end) || ms <= 0) {
    return { expired: true, ms: 0, label: "Expired", urgent: true }
  }
  const totalSeconds = Math.floor(ms / 1000)
  const days = Math.floor(totalSeconds / 86400)
  const hours = Math.floor((totalSeconds % 86400) / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60

  let label: string
  if (days > 0) label = `${days}d ${hours}h`
  else if (hours > 0) label = `${hours}h ${minutes}m`
  else label = `${minutes}m ${seconds}s`

  return { expired: false, ms, label, urgent: ms < 60 * 60 * 1000 }
}

/** A deal is live (visible & engageable) when published and not past expiry. */
export function isDealLive(deal: Pick<SpotDeal, "status" | "expiresAt">, now: number = Date.now()): boolean {
  if (deal.status !== "published") return false
  return new Date(deal.expiresAt).getTime() > now
}
