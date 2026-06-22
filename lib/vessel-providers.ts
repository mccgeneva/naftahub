// ---------------------------------------------------------------------------
// Live vessel-data providers.
//
// The app can link to any one of several AIS / vessel-data companies by simply
// adding that provider's API token as an environment variable. We auto-select
// the first configured provider (in VESSEL_PROVIDERS priority order) and
// normalize its response into our internal `Vessel` shape.
//
// Adding a new provider only requires:
//   1. an entry in VESSEL_PROVIDERS (lib/spot-deals-shared.ts), and
//   2. a matching adapter in PROVIDER_ADAPTERS below.
// ---------------------------------------------------------------------------

import "server-only"
import {
  VESSEL_PROVIDERS,
  isValidImo,
  type Vessel,
  type VesselCompliance,
  type VesselComplianceStatus,
  type VesselProviderId,
  type VesselProviderInfo,
} from "@/lib/spot-deals-shared"
import { screenImoAgainstOfac } from "@/lib/ofac-screening"

export interface ResolvedProvider extends VesselProviderInfo {
  token: string
}

/** Returns the first provider that has a token configured, or null. */
export function resolveProvider(): ResolvedProvider | null {
  for (const p of VESSEL_PROVIDERS) {
    const token = process.env[p.envVar]
    if (token && token.trim()) {
      return { ...p, token: token.trim() }
    }
  }
  return null
}

/** Public, token-free view of which providers are linked. */
export function providerStatus(): {
  connected: boolean
  active: { id: VesselProviderId; label: string } | null
  providers: Array<{ id: VesselProviderId; label: string; envVar: string; signupUrl: string; configured: boolean }>
  /** The free OFAC sanctions + IMO-validity screening is always available. */
  complianceEnabled: boolean
} {
  const providers = VESSEL_PROVIDERS.map((p) => ({
    id: p.id,
    label: p.label,
    envVar: p.envVar,
    signupUrl: p.signupUrl,
    configured: Boolean(process.env[p.envVar] && process.env[p.envVar]!.trim()),
  }))
  const active = providers.find((p) => p.configured) ?? null
  return {
    connected: Boolean(active),
    active: active ? { id: active.id, label: active.label } : null,
    providers,
    complianceEnabled: true,
  }
}

/**
 * Free, token-free compliance auto-check for a vessel IMO. Runs the official
 * IMO check-digit validation (offline) and screens the number against the
 * public OFAC sanctions lists. Never throws — degrades to "unverified" if the
 * sanctions source is briefly unavailable.
 */
export async function screenVesselImo(imo: string): Promise<VesselCompliance> {
  const clean = (imo ?? "").trim()
  const imoValid = isValidImo(clean)
  const sources = ["IMO check digit"]
  let status: VesselComplianceStatus
  let note: string | undefined
  let matches: VesselCompliance["matches"] = []

  const ofac = await screenImoAgainstOfac(clean)
  if (ofac.available) {
    sources.push(...ofac.sources)
    matches = ofac.matches
    if (matches.length > 0) {
      status = "flagged"
      const programs = [...new Set(matches.flatMap((m) => m.programs))].join("; ")
      note = `Sanctions match: ${matches[0].name}${programs ? ` (${programs})` : ""}. Do not transact.`
    } else {
      status = "clear"
      note = "No match on OFAC sanctions lists."
    }
  } else {
    status = "unverified"
    note = "OFAC sanctions list temporarily unavailable; re-screen recommended."
  }

  return { status, imoValid, sources, matches, checkedAt: new Date().toISOString(), note }
}

/** Minimal catalogue entry created from a token-free, compliance-only import. */
function complianceStub(imo: string, compliance: VesselCompliance): Vessel {
  return {
    imo,
    name: `IMO ${imo}`,
    type: "crude",
    capacity: 0,
    capacityUnit: "DWT",
    status: "idle",
    location: "Unknown",
    source: "compliance",
    compliance,
    updatedAt: new Date().toISOString(),
  }
}

function num(v: unknown): number {
  const n = Number(v)
  return Number.isFinite(n) ? n : 0
}

function classifyType(raw: string): Vessel["type"] {
  const t = raw.toLowerCase()
  if (t.includes("gas") || t.includes("lng") || t.includes("lpg")) return "gas"
  if (t.includes("crude")) return "crude"
  return "product"
}

type Adapter = (imo: string, token: string) => Promise<Vessel | { error: string }>

// --- MarineTraffic ---------------------------------------------------------
const marineTraffic: Adapter = async (imo, token) => {
  const url = `https://services.marinetraffic.com/api/vesselmasterdata/${token}/imo:${imo}/protocol:jsono`
  const res = await fetch(url, { cache: "no-store" })
  if (!res.ok) return { error: `MarineTraffic responded with ${res.status}.` }
  const data = (await res.json()) as Array<Record<string, unknown>>
  const row = Array.isArray(data) ? data[0] : undefined
  if (!row) return { error: "No vessel found for that IMO at MarineTraffic." }
  const type = classifyType(String(row.SHIPTYPE ?? row.TYPE_NAME ?? ""))
  return {
    imo,
    name: String(row.NAME ?? row.SHIPNAME ?? `IMO ${imo}`),
    type,
    vesselClass: row.TYPE_NAME ? String(row.TYPE_NAME) : undefined,
    capacity: num(row.SUMMER_DWT ?? row.DWT),
    capacityUnit: type === "gas" ? "CBM" : "DWT",
    status: "idle",
    location: String(row.PORT ?? row.CURRENT_PORT ?? "Unknown"),
    flag: row.FLAG ? String(row.FLAG) : undefined,
    builtYear: row.YEAR_BUILT ? num(row.YEAR_BUILT) : undefined,
    cargo: undefined,
    source: "marinetraffic",
    updatedAt: new Date().toISOString(),
  }
}

// --- Datalastic ------------------------------------------------------------
const datalastic: Adapter = async (imo, token) => {
  const url = `https://api.datalastic.com/api/v0/vessel?api-key=${token}&imo=${imo}`
  const res = await fetch(url, { cache: "no-store" })
  if (!res.ok) return { error: `Datalastic responded with ${res.status}.` }
  const json = (await res.json()) as { data?: Record<string, unknown> }
  const row = json?.data
  if (!row) return { error: "No vessel found for that IMO at Datalastic." }
  const type = classifyType(String(row.type ?? row.type_specific ?? ""))
  return {
    imo,
    name: String(row.name ?? `IMO ${imo}`),
    type,
    vesselClass: row.type_specific ? String(row.type_specific) : row.type ? String(row.type) : undefined,
    capacity: num(row.deadweight ?? row.dwt ?? row.gross_tonnage),
    capacityUnit: type === "gas" ? "CBM" : "DWT",
    status: "idle",
    location: String(row.current_port ?? row.destination ?? "Unknown"),
    flag: row.country_iso ? String(row.country_iso) : row.flag ? String(row.flag) : undefined,
    builtYear: row.year_built ? num(row.year_built) : undefined,
    cargo: undefined,
    source: "datalastic",
    updatedAt: new Date().toISOString(),
  }
}

// --- VesselFinder ----------------------------------------------------------
const vesselFinder: Adapter = async (imo, token) => {
  const url = `https://api.vesselfinder.com/masterdata?userkey=${token}&imo=${imo}&format=json`
  const res = await fetch(url, { cache: "no-store" })
  if (!res.ok) return { error: `VesselFinder responded with ${res.status}.` }
  const data = (await res.json()) as unknown
  const row = (Array.isArray(data) ? (data[0] as Record<string, unknown>)?.AIS ?? data[0] : data) as
    | Record<string, unknown>
    | undefined
  if (!row) return { error: "No vessel found for that IMO at VesselFinder." }
  const type = classifyType(String(row.TYPE ?? row.SHIPTYPE ?? ""))
  return {
    imo,
    name: String(row.NAME ?? row.SHIPNAME ?? `IMO ${imo}`),
    type,
    vesselClass: row.TYPE ? String(row.TYPE) : undefined,
    capacity: num(row.DWT ?? row.GT),
    capacityUnit: type === "gas" ? "CBM" : "DWT",
    status: "idle",
    location: String(row.DESTINATION ?? row.CURRENT_PORT ?? "Unknown"),
    flag: row.FLAG ? String(row.FLAG) : undefined,
    builtYear: row.BUILT ? num(row.BUILT) : undefined,
    cargo: undefined,
    source: "vesselfinder",
    updatedAt: new Date().toISOString(),
  }
}

const PROVIDER_ADAPTERS: Record<VesselProviderId, Adapter> = {
  marinetraffic: marineTraffic,
  datalastic,
  vesselfinder: vesselFinder,
}

/**
 * Fetch a vessel by IMO. The free OFAC + IMO-validity compliance screen always
 * runs and is stamped onto the returned vessel. If a paid provider is linked,
 * we also fetch real master data; otherwise we return a compliance-screened
 * stub so the import still works automatically with no token.
 */
export async function fetchVesselByImo(
  imo: string,
): Promise<{ vessel: Vessel; providerLabel: string; compliance: VesselCompliance } | { error: string; compliance: VesselCompliance }> {
  const compliance = await screenVesselImo(imo)
  const provider = resolveProvider()

  if (!provider) {
    // Token-free path: no master-data subscription, so we return a stub the
    // admin can complete, already stamped with the compliance verdict.
    return {
      vessel: complianceStub(imo, compliance),
      providerLabel: "OFAC compliance screening",
      compliance,
    }
  }

  try {
    const result = await PROVIDER_ADAPTERS[provider.id](imo, provider.token)
    if ("error" in result) return { error: result.error, compliance }
    return { vessel: { ...result, compliance }, providerLabel: provider.label, compliance }
  } catch (err) {
    console.log(`[v0] vessel provider ${provider.id} failed:`, (err as Error).message)
    return { error: `Live import via ${provider.label} failed. Please add the vessel manually.`, compliance }
  }
}
