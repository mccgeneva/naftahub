// ---------------------------------------------------------------------------
// Free, token-free vessel sanctions screening via the U.S. Treasury OFAC lists.
//
// The OFAC Specially Designated Nationals (SDN) list and the Consolidated
// (non-SDN) list are published as public CSV exports with no API key required.
// Sanctioned vessels carry their IMO number in the free-text "remarks" field,
// e.g. "Vessel Registration Identification IMO 9176187". We download both
// lists, extract every IMO -> sanctioned-entity mapping, cache it in memory,
// and screen incoming IMOs against it.
//
// Server-only (uses fetch against an external host with a custom User-Agent and
// keeps a process-level cache).
// ---------------------------------------------------------------------------

import "server-only"
import type { VesselComplianceMatch } from "@/lib/spot-deals-shared"

const OFAC_BASE = "https://sanctionslistservice.ofac.treas.gov/api/PublicationPreview/exports"
const LISTS: Array<{ file: string; label: string }> = [
  { file: "SDN.CSV", label: "OFAC SDN" },
  { file: "CONS.CSV", label: "OFAC Consolidated" },
]

// Cache the assembled IMO index for 12h; on failure, retry sooner.
const TTL_MS = 12 * 60 * 60 * 1000
const ERROR_TTL_MS = 10 * 60 * 1000

interface OfacIndex {
  byImo: Map<string, VesselComplianceMatch>
  builtAt: number
  ok: boolean
}

let cache: OfacIndex | null = null
let inflight: Promise<OfacIndex> | null = null

/** Split a single CSV record into fields, honoring double-quoted values. */
function parseCsvLine(line: string): string[] {
  const out: string[] = []
  let cur = ""
  let inQuotes = false
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          cur += '"'
          i++
        } else {
          inQuotes = false
        }
      } else {
        cur += ch
      }
    } else if (ch === '"') {
      inQuotes = true
    } else if (ch === ",") {
      out.push(cur)
      cur = ""
    } else {
      cur += ch
    }
  }
  out.push(cur)
  return out
}

/** OFAC uses the literal "-0-" to denote an empty field. */
function clean(field: string | undefined): string {
  const f = (field ?? "").trim()
  return f === "-0-" ? "" : f
}

function ingestCsv(text: string, label: string, byImo: Map<string, VesselComplianceMatch>): void {
  // SDN.CSV columns (no header):
  // 0 ent_num, 1 SDN_Name, 2 SDN_Type, 3 Program, ... 11 Remarks
  const lines = text.split(/\r?\n/)
  for (const line of lines) {
    if (!line || !/IMO\s+\d{7}/i.test(line)) continue
    const fields = parseCsvLine(line)
    const name = clean(fields[1]) || "Unknown entity"
    const program = clean(fields[3])
    const remarks = clean(fields[11]) || line
    const imoMatches = remarks.match(/IMO\s+(\d{7})/gi) ?? []
    for (const m of imoMatches) {
      const imo = (m.match(/(\d{7})/) ?? [])[1]
      if (!imo) continue
      const existing = byImo.get(imo)
      const programLabel = program ? `${label}: ${program}` : label
      if (existing) {
        if (!existing.programs.includes(programLabel)) existing.programs.push(programLabel)
      } else {
        byImo.set(imo, { name, programs: [programLabel] })
      }
    }
  }
}

async function buildIndex(): Promise<OfacIndex> {
  const byImo = new Map<string, VesselComplianceMatch>()
  let anyOk = false
  for (const list of LISTS) {
    try {
      const res = await fetch(`${OFAC_BASE}/${list.file}`, {
        // OFAC returns 403 without a browser-like User-Agent.
        headers: { "User-Agent": "NaftaHub-Compliance/1.0 (+vessel-screening)" },
        cache: "no-store",
        signal: AbortSignal.timeout(15000),
      })
      if (!res.ok) {
        console.log(`[v0] OFAC ${list.file} responded ${res.status}`)
        continue
      }
      const text = await res.text()
      ingestCsv(text, list.label, byImo)
      anyOk = true
    } catch (err) {
      console.log(`[v0] OFAC ${list.file} fetch failed:`, (err as Error).message)
    }
  }
  return { byImo, builtAt: Date.now(), ok: anyOk }
}

async function getIndex(): Promise<OfacIndex> {
  const now = Date.now()
  if (cache) {
    const ttl = cache.ok ? TTL_MS : ERROR_TTL_MS
    if (now - cache.builtAt < ttl) return cache
  }
  if (inflight) return inflight
  inflight = buildIndex()
    .then((idx) => {
      cache = idx
      return idx
    })
    .finally(() => {
      inflight = null
    })
  return inflight
}

export interface OfacScreenResult {
  /** True when the sanctions lists were successfully consulted. */
  available: boolean
  matches: VesselComplianceMatch[]
  /** Source labels actually consulted. */
  sources: string[]
}

/** Screen a single IMO against the OFAC sanctions lists. */
export async function screenImoAgainstOfac(imo: string): Promise<OfacScreenResult> {
  const idx = await getIndex()
  if (!idx.ok) return { available: false, matches: [], sources: [] }
  const hit = idx.byImo.get(imo.trim())
  return {
    available: true,
    matches: hit ? [hit] : [],
    sources: LISTS.map((l) => l.label),
  }
}
