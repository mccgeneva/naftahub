import "server-only"

// ---------------------------------------------------------------------------
// NQAi tool belt — live vessel intelligence & smart oil-deal discovery.
//
// These AI SDK tools let NQAi reach beyond static knowledge and query the
// platform's real data in-flight while answering a client:
//   • verifyVessel        — IMO verification + master data + OFAC compliance
//   • searchVessels       — free-text / type search over the vessel catalogue
//   • listSpotDeals       — the live limited-time spot-deal board
//   • discoverOilDeals    — port → vessel → oil matching (the smart matcher)
//   • vesselDataProvider  — which AIS provider (if any) is linked, for context
//
// All tools run SERVER-SIDE (the /api/nqai route is nodejs runtime). Provider
// API tokens are read from the environment via lib/vessel-providers.ts and are
// NEVER exposed to the client. Vessel lookups are cached briefly to avoid
// hammering upstream providers on rapid consecutive prompts.
// ---------------------------------------------------------------------------

import { tool } from "ai"
import { z } from "zod"
import { listVessels, getVessel } from "@/lib/spot-deals-db"
import { fetchVesselByImo, providerStatus, screenVesselImo } from "@/lib/vessel-providers"
import { listLiveSpotDeals } from "@/app/actions/spot-deals"
import {
  isValidImo,
  dealCountdown,
  VESSEL_TYPE_LABELS,
  VESSEL_STATUS_LABELS,
  type Vessel,
  type VesselType,
  type SpotDeal,
} from "@/lib/spot-deals-shared"
import { PETROLEUM_PRODUCTS } from "@/lib/petroleum-products"

// --- helpers ----------------------------------------------------------------

function norm(s: string | undefined | null): string {
  return (s ?? "").toLowerCase().trim()
}

/** Loose token match: does `haystack` contain `needle` (or vice-versa)? */
function fuzzy(haystack: string | undefined, needle: string | undefined): boolean {
  const h = norm(haystack)
  const n = norm(needle)
  if (!n) return true
  if (!h) return false
  return h.includes(n) || n.includes(h)
}

/**
 * Infer which tanker family can carry a given oil/product description.
 * Resolves against the petroleum catalogue first (by id or name), then falls
 * back to keyword heuristics. Returns null when it can't decide.
 */
function inferVesselType(product: string | undefined): VesselType | null {
  const p = norm(product)
  if (!p) return null

  const match = PETROLEUM_PRODUCTS.find((c) => norm(c.id) === p || fuzzy(c.name, p))
  if (match) {
    if (match.category === "Crude Oil") return "crude"
    if (match.category === "LPG & LNG") return "gas"
    return "product"
  }

  if (/\b(crude|brent|wti|dubai|urals|espo|bonny|murban|maya|basrah|arab (light|heavy)|condensate)\b/.test(p)) {
    return "crude"
  }
  if (/\b(lng|lpg|propane|butane|natural gas|liquefied (natural|petroleum) gas|gas)\b/.test(p)) {
    return "gas"
  }
  if (
    /\b(diesel|gasoil|gas oil|en590|ulsd|jet|kerosene|gasoline|naphtha|fuel oil|mgo|mazut|vgo|bitumen|base oil|petrochemical)\b/.test(
      p,
    )
  ) {
    return "product"
  }
  return null
}

/** A compact, client-safe projection of a vessel for tool output. */
function projectVessel(v: Vessel) {
  return {
    imo: v.imo,
    name: v.name,
    type: VESSEL_TYPE_LABELS[v.type],
    vesselClass: v.vesselClass ?? null,
    capacity: v.capacity ? `${v.capacity.toLocaleString("en-US")} ${v.capacityUnit}` : "n/a",
    status: VESSEL_STATUS_LABELS[v.status],
    location: v.location || "Unknown",
    flag: v.flag ?? null,
    builtYear: v.builtYear ?? null,
    cargo: v.cargo ?? null,
    compliance: v.compliance
      ? {
          status: v.compliance.status,
          imoValid: v.compliance.imoValid,
          note: v.compliance.note ?? null,
          sources: v.compliance.sources,
        }
      : null,
    source: v.source,
  }
}

/** A compact projection of a live spot deal for tool output. */
function projectDeal(d: SpotDeal) {
  const cd = dealCountdown(d.expiresAt)
  return {
    id: d.id,
    product: d.product,
    quantity: `${d.quantity.toLocaleString("en-US")} ${d.unit}`,
    spotPrice: `${d.spotPrice} ${d.currency}/${d.unit}`,
    totalValue: `${d.currency} ${d.totalValue.toLocaleString("en-US", { maximumFractionDigits: 0 })}`,
    incoterm: d.incoterm,
    loadPort: d.loadPort || null,
    dischargePort: d.dischargePort || null,
    vessel: `${d.vesselName} (IMO ${d.vesselImo})`,
    vesselType: VESSEL_TYPE_LABELS[d.vesselType],
    expiresIn: cd.expired ? "expired" : cd.label,
    expiresAt: d.expiresAt,
  }
}

// --- lightweight vessel-lookup cache ---------------------------------------
// Caches verifyVessel results per-IMO for a short window so repeated prompts
// about the same ship don't re-hit the upstream provider every time.
type CacheEntry = { at: number; value: unknown }
const lookupCache = new Map<string, CacheEntry>()
const LOOKUP_TTL_MS = 5 * 60_000

function cacheGet(key: string): unknown | null {
  const hit = lookupCache.get(key)
  if (hit && Date.now() - hit.at < LOOKUP_TTL_MS) return hit.value
  if (hit) lookupCache.delete(key)
  return null
}
function cacheSet(key: string, value: unknown): void {
  lookupCache.set(key, { at: Date.now(), value })
  // Bound the cache so it can't grow unbounded across many distinct IMOs.
  if (lookupCache.size > 200) {
    const oldest = lookupCache.keys().next().value
    if (oldest) lookupCache.delete(oldest)
  }
}

// --- tools ------------------------------------------------------------------

export const nqaiTools = {
  /**
   * Verify a vessel by IMO. Runs the official IMO check-digit validation, the
   * free OFAC sanctions screen, and (if an AIS provider is linked) live master
   * data. Falls back to free public-registry enrichment when no key is set.
   */
  verifyVessel: tool({
    description:
      "Verify and look up a marine vessel by its 7-digit IMO number. Returns name, tanker type/class, deadweight or gas capacity, flag, build year, last known location/status, and an OFAC sanctions + IMO-validity compliance verdict. Use whenever a user gives an IMO or asks to verify/identify a specific ship.",
    inputSchema: z.object({
      imo: z.string().describe("The vessel's 7-digit IMO number, e.g. '9782522'."),
    }),
    execute: async ({ imo }) => {
      const clean = (imo ?? "").trim()
      if (!/^\d{7}$/.test(clean)) {
        return { ok: false, error: "An IMO number must be exactly 7 digits." }
      }
      if (!isValidImo(clean)) {
        const compliance = await screenVesselImo(clean)
        return {
          ok: false,
          error: "That IMO fails the official check-digit algorithm — it is not a structurally valid IMO number.",
          compliance: { status: compliance.status, imoValid: false, note: compliance.note ?? null },
        }
      }

      const cached = cacheGet(`vessel:${clean}`)
      if (cached) return cached as object

      // Already in the catalogue? Return the stored, compliance-stamped record.
      const existing = await getVessel(clean)
      if (existing) {
        const out = {
          ok: true,
          source: "platform catalogue",
          vessel: projectVessel(existing),
        }
        cacheSet(`vessel:${clean}`, out)
        return out
      }

      const result = await fetchVesselByImo(clean)
      if ("error" in result) {
        return {
          ok: false,
          error: result.error,
          compliance: {
            status: result.compliance.status,
            imoValid: result.compliance.imoValid,
            note: result.compliance.note ?? null,
          },
        }
      }
      const out = {
        ok: true,
        source: result.providerLabel,
        vessel: projectVessel(result.vessel),
      }
      cacheSet(`vessel:${clean}`, out)
      return out
    },
  }),

  /**
   * Search the platform's vessel catalogue by free text and/or tanker type.
   */
  searchVessels: tool({
    description:
      "Search the platform's marine vessel catalogue by name, IMO, cargo, or tanker type. Use to find vessels matching a description (e.g. 'VLCC crude tankers', 'LNG carriers near Qatar', 'diesel product tankers'). Returns up to 12 matching vessels with capacity, status and location.",
    inputSchema: z.object({
      query: z
        .string()
        .nullable()
        .describe("Free-text search over vessel name, IMO, location, class or cargo. Pass null for no text filter."),
      type: z
        .enum(["crude", "product", "gas"])
        .nullable()
        .describe("Restrict to a tanker family: crude (crude oil), product (refined products), or gas (LNG/LPG)."),
    }),
    execute: async ({ query, type }) => {
      const all = await listVessels(query ?? undefined)
      const filtered = all.filter((v) => {
        if (type && v.type !== type) return false
        if (query) {
          return (
            fuzzy(v.name, query) ||
            fuzzy(v.imo, query) ||
            fuzzy(v.location, query) ||
            fuzzy(v.vesselClass, query) ||
            fuzzy(v.cargo, query) ||
            fuzzy(v.flag, query)
          )
        }
        return true
      })
      return {
        ok: true,
        count: filtered.length,
        vessels: filtered.slice(0, 12).map(projectVessel),
        note:
          filtered.length === 0
            ? "No vessels in the catalogue match that query. Try a broader term or verify a specific IMO."
            : undefined,
      }
    },
  }),

  /**
   * The live, limited-time spot-deal board, with optional filters.
   */
  listSpotDeals: tool({
    description:
      "List the live, limited-time spot-deal board (published, unexpired cargoes). Optionally filter by product, port, or vessel type. Use when a user asks what oil/cargo deals are currently available, or about a specific product or port.",
    inputSchema: z.object({
      product: z.string().nullable().describe("Filter by product/grade, e.g. 'crude', 'diesel', 'LNG'. Null = any."),
      port: z.string().nullable().describe("Filter by load or discharge port, e.g. 'Rotterdam'. Null = any."),
      vesselType: z
        .enum(["crude", "product", "gas"])
        .nullable()
        .describe("Filter by tanker family. Null = any."),
    }),
    execute: async ({ product, port, vesselType }) => {
      const deals = await listLiveSpotDeals()
      const filtered = deals.filter((d) => {
        if (product && !fuzzy(d.product, product)) return false
        if (vesselType && d.vesselType !== vesselType) return false
        if (port && !(fuzzy(d.loadPort, port) || fuzzy(d.dischargePort, port))) return false
        return true
      })
      return {
        ok: true,
        count: filtered.length,
        deals: filtered.slice(0, 12).map(projectDeal),
        note:
          filtered.length === 0
            ? "No live spot deals match those criteria right now. Clients can register interest; nothing executes automatically — confirm with the desk."
            : "Indicative limited-time offers. Clients accept/negotiate via Commodity Trading → Spot Deals; nothing executes automatically.",
      }
    },
  }),

  /**
   * Smart oil-deal discovery: match a target delivery port + desired oil type
   * to (a) live spot deals routing there and (b) candidate vessels in the
   * catalogue whose cargo capability and position make them routable.
   */
  discoverOilDeals: tool({
    description:
      "Smart oil-deal discovery. Given a target delivery (discharge) port and an optional oil/product type, finds: (1) live spot deals routing to or loading for that port that match the product, and (2) candidate vessels in the catalogue whose cargo capability matches and that could be routed there for a new deal. Use for requests like 'Find vessels approaching Rotterdam with crude oil capacity' or 'What crude can I get delivered to Singapore?'.",
    inputSchema: z.object({
      targetPort: z
        .string()
        .describe("The desired delivery / discharge port (or load port if the user specifies loading)."),
      product: z
        .string()
        .nullable()
        .describe("Desired oil/product type, e.g. 'crude oil', 'EN590 diesel', 'LNG'. Null = any."),
      minQuantity: z
        .number()
        .nullable()
        .describe("Optional minimum cargo capacity (in DWT for oil, CBM for gas) a candidate vessel must have."),
    }),
    execute: async ({ targetPort, product, minQuantity }) => {
      const desiredType = inferVesselType(product ?? undefined)

      // (1) Live spot deals routing to/from the target port matching the product.
      const liveDeals = await listLiveSpotDeals()
      const matchingDeals = liveDeals
        .filter((d) => {
          const portHit = fuzzy(d.dischargePort, targetPort) || fuzzy(d.loadPort, targetPort)
          if (!portHit) return false
          if (product && !fuzzy(d.product, product)) return false
          if (desiredType && d.vesselType !== desiredType) return false
          return true
        })
        .slice(0, 8)
        .map(projectDeal)

      // (2) Candidate vessels: right cargo family, adequate capacity, and
      // plausibly routable (near the port, or underway/anchored and available).
      const catalogue = await listVessels()
      const candidates = catalogue
        .filter((v) => {
          if (desiredType && v.type !== desiredType) return false
          if (minQuantity && v.capacity > 0 && v.capacity < minQuantity) return false
          // Only suggest vessels that are clear (or unverified) on sanctions.
          if (v.compliance?.status === "flagged") return false
          return true
        })
        .map((v) => {
          const nearPort = fuzzy(v.location, targetPort)
          const available = v.status === "underway" || v.status === "anchored" || v.status === "idle"
          // Score: nearest gets the most weight, then availability, then capacity.
          const score = (nearPort ? 100 : 0) + (available ? 20 : 0) + Math.min(v.capacity / 100000, 10)
          return { v, nearPort, available, score }
        })
        .sort((a, b) => b.score - a.score)
        .slice(0, 8)
        .map(({ v, nearPort, available }) => ({
          ...projectVessel(v),
          nearTargetPort: nearPort,
          availableForRouting: available,
          routingNote: nearPort
            ? `Currently at/near ${v.location} — well positioned for ${targetPort}.`
            : `Last known ${VESSEL_STATUS_LABELS[v.status].toLowerCase()} at ${v.location || "unknown"}; routable to ${targetPort} subject to laycan.`,
        }))

      const provider = providerStatus()
      return {
        ok: true,
        targetPort,
        desiredProduct: product ?? "any",
        inferredVesselType: desiredType ? VESSEL_TYPE_LABELS[desiredType] : "any",
        matchingDeals,
        candidateVessels: candidates,
        liveTrackingEnabled: provider.connected,
        notes: [
          matchingDeals.length === 0
            ? "No live spot deals currently route to that port for the requested product."
            : `${matchingDeals.length} live spot deal(s) match.`,
          candidates.length === 0
            ? "No catalogue vessels match the cargo/capacity criteria."
            : `${candidates.length} candidate vessel(s) could carry this cargo.`,
          provider.connected
            ? `Live AIS positions via ${provider.active?.label}.`
            : "Real-time ETA/position requires a connected AIS provider (MarineTraffic/Datalastic/VesselFinder); positions shown are last-known catalogue values. Exact ETA and firm terms must be confirmed with the desk.",
        ],
      }
    },
  }),

  /**
   * Report which live AIS / vessel-data provider is connected (token-free
   * status only — never exposes the key itself).
   */
  vesselDataProviderStatus: tool({
    description:
      "Check which live vessel-data (AIS) provider is linked to the platform and whether real-time tracking is available. Use when a user asks about data sources, live tracking, or why ETA/position data may be limited.",
    inputSchema: z.object({}),
    execute: async () => {
      const status = providerStatus()
      return {
        ok: true,
        liveTrackingEnabled: status.connected,
        activeProvider: status.active?.label ?? null,
        complianceScreeningEnabled: status.complianceEnabled,
        availableProviders: status.providers.map((p) => ({ label: p.label, configured: p.configured })),
        note: status.connected
          ? `Live vessel intelligence is active via ${status.active?.label}. Free OFAC sanctions + IMO-validity screening always runs.`
          : "No paid AIS provider is linked. Free OFAC sanctions screening, IMO validation, and public-registry lookups are always available; live real-time positions/ETA require connecting a provider API key.",
      }
    },
  }),
}
