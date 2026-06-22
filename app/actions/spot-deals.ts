"use server"

// ---------------------------------------------------------------------------
// Spot Deals & Marine Vessels — Server Actions.
//
// Two audiences:
//  - Administrators (passcode-gated) manage the vessel catalogue and create /
//    publish / withdraw limited-time spot deals. Publishing auto-broadcasts the
//    offer to every active client via Bankeka and writes a full audit trail.
//  - Clients (session-scoped) read the published board and register interest
//    (viewed / engaged / accepted) — the actual deal still flows through the
//    existing commodity-deal approval workflow on the client side.
//
// Vessel data is sourced from a managed catalogue seeded with realistic tanker
// data. If a MARINETRAFFIC_API_KEY is configured, `importVesselFromMarineTraffic`
// fetches a live record; otherwise it returns a clear, non-fatal message.
// ---------------------------------------------------------------------------

import { ADMIN_PASSCODE } from "@/lib/admin-config"
import { resolveCurrentSession } from "@/lib/session-user"
import { logActivity } from "@/app/actions/log-activity"
import { listDynamicUsers } from "@/lib/admin-users-db"
import { insertMessage, recordAudit } from "@/lib/bankeka-db"
import { BANKEKA_ADMIN_ID, BANKEKA_ADMIN_LABEL } from "@/lib/bankeka-shared"
import {
  listVessels as dbListVessels,
  getVessel as dbGetVessel,
  upsertVessel as dbUpsertVessel,
  deleteVessel as dbDeleteVessel,
  listAllDeals,
  listPublishedDeals,
  getDeal,
  saveDeal,
  appendInterest,
} from "@/lib/spot-deals-db"
import {
  computeTotalValue,
  isDealLive,
  VESSEL_TYPE_LABELS,
  type Vessel,
  type SpotDeal,
} from "@/lib/spot-deals-shared"

function adminOk(passcode: string): boolean {
  return passcode === ADMIN_PASSCODE
}

function newDealId(): string {
  return `SPOT-${Date.now().toString(36).toUpperCase()}${Math.random().toString(36).slice(2, 6).toUpperCase()}`
}

function formatMoney(value: number, currency: string): string {
  return `${currency} ${value.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

// --- Vessel catalogue (admin) ----------------------------------------------

export interface VesselListResult {
  ok: boolean
  vessels: Vessel[]
  error?: string
}

export async function listVesselsAdmin(passcode: string, search?: string): Promise<VesselListResult> {
  if (!adminOk(passcode)) return { ok: false, vessels: [], error: "Administrator authorization failed." }
  try {
    return { ok: true, vessels: await dbListVessels(search) }
  } catch (err) {
    console.log("[v0] listVesselsAdmin failed:", (err as Error).message)
    return { ok: false, vessels: [], error: "Could not load the vessel catalogue." }
  }
}

export interface VesselResult {
  ok: boolean
  vessel?: Vessel
  error?: string
}

export async function upsertVesselAdmin(passcode: string, vessel: Vessel): Promise<VesselResult> {
  if (!adminOk(passcode)) return { ok: false, error: "Administrator authorization failed." }
  const imo = (vessel.imo ?? "").trim()
  if (!/^\d{7}$/.test(imo)) return { ok: false, error: "IMO number must be exactly 7 digits." }
  if (!vessel.name?.trim()) return { ok: false, error: "Vessel name is required." }
  try {
    const existing = await dbGetVessel(imo)
    const saved = await dbUpsertVessel({
      ...vessel,
      imo,
      name: vessel.name.trim(),
      source: vessel.source ?? "manual",
      updatedAt: new Date().toISOString(),
    })
    await logActivity({
      action: `Administrator ${existing ? "updated" : "added"} vessel ${saved.name} (IMO ${saved.imo})`,
      category: "Administration",
      details: {
        summary: `Administrator ${existing ? "updated" : "added"} the ${VESSEL_TYPE_LABELS[saved.type]} "${saved.name}" (IMO ${saved.imo}) in the marine vessel catalogue. Status ${saved.status}; last known location ${saved.location || "—"}; cargo ${saved.cargo || "—"}.`,
        referenceId: saved.imo,
        vessel: saved.name,
        vesselType: VESSEL_TYPE_LABELS[saved.type],
        capacity: `${saved.capacity.toLocaleString("en-US")} ${saved.capacityUnit}`,
      },
    })
    return { ok: true, vessel: saved }
  } catch (err) {
    console.log("[v0] upsertVesselAdmin failed:", (err as Error).message)
    return { ok: false, error: "The vessel could not be saved. Please try again." }
  }
}

export async function deleteVesselAdmin(passcode: string, imo: string): Promise<{ ok: boolean; error?: string }> {
  if (!adminOk(passcode)) return { ok: false, error: "Administrator authorization failed." }
  try {
    const existing = await dbGetVessel(imo)
    await dbDeleteVessel(imo)
    if (existing) {
      await logActivity({
        action: `Administrator removed vessel ${existing.name} (IMO ${existing.imo})`,
        category: "Administration",
        details: {
          summary: `Administrator removed the vessel "${existing.name}" (IMO ${existing.imo}) from the catalogue.`,
          referenceId: existing.imo,
        },
      })
    }
    return { ok: true }
  } catch (err) {
    console.log("[v0] deleteVesselAdmin failed:", (err as Error).message)
    return { ok: false, error: "The vessel could not be removed. Please try again." }
  }
}

/**
 * Optional live import. Uses MarineTraffic's single-vessel API when a key is
 * present; otherwise returns a clear message so the admin knows to add the
 * vessel manually. Designed so wiring a key later needs no other changes.
 */
export async function importVesselFromMarineTraffic(passcode: string, imo: string): Promise<VesselResult> {
  if (!adminOk(passcode)) return { ok: false, error: "Administrator authorization failed." }
  const key = process.env.MARINETRAFFIC_API_KEY
  if (!key) {
    return {
      ok: false,
      error:
        "Live MarineTraffic import is not configured (no MARINETRAFFIC_API_KEY). Add the vessel manually, or set the key to enable live import.",
    }
  }
  const clean = (imo ?? "").trim()
  if (!/^\d{7}$/.test(clean)) return { ok: false, error: "IMO number must be exactly 7 digits." }
  try {
    const url = `https://services.marinetraffic.com/api/vesselmasterdata/${key}/imo:${clean}/protocol:jsono`
    const res = await fetch(url, { cache: "no-store" })
    if (!res.ok) return { ok: false, error: `MarineTraffic responded with ${res.status}.` }
    const data = (await res.json()) as Array<Record<string, unknown>>
    const row = Array.isArray(data) ? data[0] : undefined
    if (!row) return { ok: false, error: "No vessel found for that IMO at MarineTraffic." }

    const typeRaw = String(row.SHIPTYPE ?? row.TYPE_NAME ?? "").toLowerCase()
    const type: Vessel["type"] = typeRaw.includes("gas") || typeRaw.includes("lng") || typeRaw.includes("lpg")
      ? "gas"
      : typeRaw.includes("crude")
        ? "crude"
        : "product"

    const vessel: Vessel = {
      imo: clean,
      name: String(row.NAME ?? row.SHIPNAME ?? `IMO ${clean}`),
      type,
      vesselClass: row.TYPE_NAME ? String(row.TYPE_NAME) : undefined,
      capacity: Number(row.SUMMER_DWT ?? row.DWT ?? 0) || 0,
      capacityUnit: type === "gas" ? "CBM" : "DWT",
      status: "idle",
      location: String(row.PORT ?? row.CURRENT_PORT ?? "Unknown"),
      flag: row.FLAG ? String(row.FLAG) : undefined,
      builtYear: row.YEAR_BUILT ? Number(row.YEAR_BUILT) : undefined,
      cargo: undefined,
      source: "marinetraffic",
      updatedAt: new Date().toISOString(),
    }
    const saved = await dbUpsertVessel(vessel)
    await logActivity({
      action: `Administrator imported vessel ${saved.name} (IMO ${saved.imo}) from MarineTraffic`,
      category: "Administration",
      details: {
        summary: `Administrator imported "${saved.name}" (IMO ${saved.imo}) from MarineTraffic into the vessel catalogue.`,
        referenceId: saved.imo,
        source: "MarineTraffic",
      },
    })
    return { ok: true, vessel: saved }
  } catch (err) {
    console.log("[v0] importVesselFromMarineTraffic failed:", (err as Error).message)
    return { ok: false, error: "Live import failed. Please add the vessel manually." }
  }
}

// --- Spot deals (admin) -----------------------------------------------------

export interface DealListResult {
  ok: boolean
  deals: SpotDeal[]
  error?: string
}

export async function listSpotDealsAdmin(passcode: string): Promise<DealListResult> {
  if (!adminOk(passcode)) return { ok: false, deals: [], error: "Administrator authorization failed." }
  try {
    return { ok: true, deals: await listAllDeals() }
  } catch (err) {
    console.log("[v0] listSpotDealsAdmin failed:", (err as Error).message)
    return { ok: false, deals: [], error: "Could not load spot deals." }
  }
}

export interface DealResult {
  ok: boolean
  deal?: SpotDeal
  delivered?: number
  error?: string
}

/** Input the admin form sends to create a spot deal. */
export interface CreateSpotDealInput {
  vesselImo: string
  product: string
  productId?: string
  quantity: number
  unit: SpotDeal["unit"]
  spotPrice: number
  currency: string
  incoterm: string
  loadPort: string
  dischargePort?: string
  terms: string
  /** Expiry as an ISO timestamp. */
  expiresAt: string
  /** When true, publish immediately (broadcast + visible); else save as draft. */
  publish: boolean
}

export async function createSpotDealAdmin(passcode: string, input: CreateSpotDealInput): Promise<DealResult> {
  if (!adminOk(passcode)) return { ok: false, error: "Administrator authorization failed." }

  const vessel = await dbGetVessel((input.vesselImo ?? "").trim())
  if (!vessel) return { ok: false, error: "Select a vessel from the catalogue." }
  if (!input.product?.trim()) return { ok: false, error: "Product is required." }
  if (!Number.isFinite(input.quantity) || input.quantity <= 0) return { ok: false, error: "Enter a valid quantity." }
  if (!Number.isFinite(input.spotPrice) || input.spotPrice <= 0) return { ok: false, error: "Enter a valid spot price." }
  const expiry = new Date(input.expiresAt).getTime()
  if (!Number.isFinite(expiry) || expiry <= Date.now()) return { ok: false, error: "Expiry must be in the future." }

  const now = new Date().toISOString()
  const totalValue = computeTotalValue(input.quantity, input.spotPrice)
  const deal: SpotDeal = {
    id: newDealId(),
    vesselImo: vessel.imo,
    vesselName: vessel.name,
    vesselType: vessel.type,
    vesselClass: vessel.vesselClass,
    product: input.product.trim(),
    productId: input.productId,
    quantity: input.quantity,
    unit: input.unit,
    spotPrice: input.spotPrice,
    currency: input.currency,
    totalValue,
    incoterm: input.incoterm,
    loadPort: input.loadPort.trim(),
    dischargePort: input.dischargePort?.trim() || undefined,
    terms: input.terms.trim(),
    status: input.publish ? "published" : "draft",
    expiresAt: new Date(expiry).toISOString(),
    createdAt: now,
    publishedAt: input.publish ? now : undefined,
    createdBy: BANKEKA_ADMIN_LABEL,
    interests: [],
  }

  try {
    let delivered = 0
    if (input.publish) {
      delivered = await broadcastDeal(deal)
      deal.broadcastId = `spot_${deal.id}`
    }
    await saveDeal(deal)

    await logActivity({
      action: `Administrator ${input.publish ? "published" : "drafted"} spot deal ${deal.id} (${formatMoney(totalValue, deal.currency)})`,
      category: "Commodity Trading",
      details: {
        summary: `Administrator ${input.publish ? "published" : "saved as draft"} limited-time spot deal ${deal.id}: ${deal.quantity.toLocaleString("en-US")} ${deal.unit} ${deal.product} aboard ${deal.vesselName} (IMO ${deal.vesselImo}) at ${formatMoney(deal.spotPrice, deal.currency)}/${deal.unit}, total ${formatMoney(totalValue, deal.currency)}, ${deal.incoterm} ${deal.loadPort || "—"}. Offer expires ${new Date(deal.expiresAt).toLocaleString("en-GB")}.${input.publish ? ` Broadcast to ${delivered} active client${delivered === 1 ? "" : "s"} via Bankeka.` : ""}`,
        referenceId: deal.id,
        vessel: `${deal.vesselName} (IMO ${deal.vesselImo})`,
        product: deal.product,
        quantity: `${deal.quantity.toLocaleString("en-US")} ${deal.unit}`,
        spotPrice: `${formatMoney(deal.spotPrice, deal.currency)} / ${deal.unit}`,
        totalValue: formatMoney(totalValue, deal.currency),
        expiry: new Date(deal.expiresAt).toLocaleString("en-GB"),
        recipients: input.publish ? String(delivered) : "(draft)",
      },
    })

    return { ok: true, deal, delivered }
  } catch (err) {
    console.log("[v0] createSpotDealAdmin failed:", (err as Error).message)
    return { ok: false, error: "The spot deal could not be created. Please try again." }
  }
}

/** Publish an existing draft (broadcasts + makes it visible). */
export async function publishSpotDealAdmin(passcode: string, id: string): Promise<DealResult> {
  if (!adminOk(passcode)) return { ok: false, error: "Administrator authorization failed." }
  try {
    const deal = await getDeal(id)
    if (!deal) return { ok: false, error: "Spot deal not found." }
    if (new Date(deal.expiresAt).getTime() <= Date.now()) return { ok: false, error: "Cannot publish an expired offer." }
    const delivered = await broadcastDeal(deal)
    const updated: SpotDeal = {
      ...deal,
      status: "published",
      publishedAt: new Date().toISOString(),
      broadcastId: `spot_${deal.id}`,
    }
    await saveDeal(updated)
    await logActivity({
      action: `Administrator published spot deal ${updated.id}`,
      category: "Commodity Trading",
      details: {
        summary: `Administrator published spot deal ${updated.id} and broadcast it to ${delivered} active client${delivered === 1 ? "" : "s"} via Bankeka.`,
        referenceId: updated.id,
        recipients: String(delivered),
      },
    })
    return { ok: true, deal: updated, delivered }
  } catch (err) {
    console.log("[v0] publishSpotDealAdmin failed:", (err as Error).message)
    return { ok: false, error: "The spot deal could not be published. Please try again." }
  }
}

/** Withdraw a deal so it disappears from the public board. */
export async function withdrawSpotDealAdmin(passcode: string, id: string): Promise<DealResult> {
  if (!adminOk(passcode)) return { ok: false, error: "Administrator authorization failed." }
  try {
    const deal = await getDeal(id)
    if (!deal) return { ok: false, error: "Spot deal not found." }
    const updated: SpotDeal = { ...deal, status: "withdrawn", withdrawnAt: new Date().toISOString() }
    await saveDeal(updated)
    await logActivity({
      action: `Administrator withdrew spot deal ${updated.id}`,
      category: "Commodity Trading",
      details: {
        summary: `Administrator withdrew spot deal ${updated.id} (${updated.product} aboard ${updated.vesselName}). It is no longer visible to clients.`,
        referenceId: updated.id,
      },
    })
    return { ok: true, deal: updated }
  } catch (err) {
    console.log("[v0] withdrawSpotDealAdmin failed:", (err as Error).message)
    return { ok: false, error: "The spot deal could not be withdrawn. Please try again." }
  }
}

/**
 * Broadcast a published spot deal to every active client through Bankeka.
 * Mirrors the adminBroadcast flow (one directed message per recipient + a
 * single audit row per recipient). Returns the number of recipients reached.
 */
async function broadcastDeal(deal: SpotDeal): Promise<number> {
  const all = (await listDynamicUsers()).filter((u) => u.status === "active")
  const recipients = all.map((u) => u.id)
  if (recipients.length === 0) return 0

  const body = [
    `LIMITED-TIME SPOT DEAL — ${deal.product}`,
    ``,
    `Vessel: ${deal.vesselName} (IMO ${deal.vesselImo}) — ${VESSEL_TYPE_LABELS[deal.vesselType]}`,
    `Quantity: ${deal.quantity.toLocaleString("en-US")} ${deal.unit}`,
    `Spot price: ${formatMoney(deal.spotPrice, deal.currency)} / ${deal.unit} (no long-term contract)`,
    `Total value: ${formatMoney(deal.totalValue, deal.currency)}`,
    `Terms: ${deal.incoterm}${deal.loadPort ? ` — load ${deal.loadPort}` : ""}${deal.dischargePort ? ` → discharge ${deal.dischargePort}` : ""}`,
    `Offer expires: ${new Date(deal.expiresAt).toLocaleString("en-GB")}`,
    deal.terms ? `` : ``,
    deal.terms ? `Notes: ${deal.terms}` : ``,
    ``,
    `Open Commodity Trading → Spot Deals to accept or negotiate. Ref ${deal.id}.`,
  ]
    .filter((line, i, arr) => !(line === "" && arr[i - 1] === ""))
    .join("\n")
    .trim()

  const broadcastId = `spot_${deal.id}`
  for (const rid of recipients) {
    const row = await insertMessage({
      senderId: BANKEKA_ADMIN_ID,
      recipientId: rid,
      body,
      kind: "broadcast",
      broadcastId,
    })
    await recordAudit({
      actorId: BANKEKA_ADMIN_ID,
      actorLabel: BANKEKA_ADMIN_LABEL,
      action: "broadcast",
      recipientId: rid,
      messageId: row.id,
      charCount: body.length,
    })
  }
  return recipients.length
}

// --- Public / client-facing -------------------------------------------------

/** The live spot-deal board (published & not expired). Safe for any client. */
export async function listLiveSpotDeals(): Promise<SpotDeal[]> {
  try {
    return await listPublishedDeals()
  } catch (err) {
    console.log("[v0] listLiveSpotDeals failed:", (err as Error).message)
    return []
  }
}

/**
 * Record a client interaction with a deal for the audit trail. `action` is
 * "viewed" | "engaged" | "accepted". Identity comes from the authoritative
 * session — never a client-supplied id.
 */
export async function recordSpotDealInterest(
  dealId: string,
  action: "viewed" | "engaged" | "accepted",
): Promise<{ ok: boolean; error?: string }> {
  try {
    const session = await resolveCurrentSession()
    if (!session) return { ok: false, error: "Not authenticated." }
    const deal = await getDeal(dealId)
    if (!deal) return { ok: false, error: "Spot deal not found." }
    if (!isDealLive(deal)) return { ok: false, error: "This offer is no longer available." }

    const label = session.profile.fullName || session.profile.shortName || session.id
    await appendInterest(dealId, { userId: session.id, userLabel: label, action, at: new Date().toISOString() })

    // Engagement / acceptance is meaningful enough to surface in the audit log.
    if (action !== "viewed") {
      await logActivity({
        action: `Client ${action} spot deal ${dealId}`,
        category: "Commodity Trading",
        details: {
          summary: `${label} ${action} the limited-time spot deal ${dealId}: ${deal.quantity.toLocaleString("en-US")} ${deal.unit} ${deal.product} aboard ${deal.vesselName} (IMO ${deal.vesselImo}). ${action === "accepted" ? "A commodity deal has been initiated for Administrator review — nothing executes automatically." : "The client opened the offer to negotiate."}`,
          referenceId: dealId,
          vessel: `${deal.vesselName} (IMO ${deal.vesselImo})`,
          product: deal.product,
        },
      })
    }
    return { ok: true }
  } catch (err) {
    console.log("[v0] recordSpotDealInterest failed:", (err as Error).message)
    return { ok: false, error: "Could not record your interest. Please try again." }
  }
}
