import "server-only"

// ---------------------------------------------------------------------------
// NQAi distributed knowledge layer.
//
// Connects NQAi to public universities, research institutions and scholarly
// repositories through READ-ONLY open APIs — no API key, no model training,
// only retrieval + attribution. This is the "Universities → Knowledge APIs →
// reasoning" pipeline: NQAi retrieves, the model classifies / synthesises.
//
// Sources (all free, open, key-free):
//   • OpenAlex   — 250M+ scholarly works, institutions & a concept knowledge
//                  graph (https://docs.openalex.org). Polite pool via mailto.
//   • arXiv      — physics/CS/math/quant-finance preprints (Atom XML).
//   • Crossref   — DOI registration agency / publication metadata.
//
// Safeguards baked in:
//   • Strictly read-only. We never POST, never submit data, never train.
//   • Polite identification (User-Agent + mailto) per each API's etiquette.
//   • Per-source minimum-interval rate limiting + short-lived response cache.
//   • Bounded result sizes and request timeouts.
//   • Every result carries an explicit source + license/attribution field.
// ---------------------------------------------------------------------------

// Identify ourselves politely to each upstream (required by OpenAlex/Crossref
// "polite pool" etiquette — improves reliability, costs nothing).
const CONTACT = "platform@mccgva.ch"
const UA = `NAFTAhub-NQAi/1.0 (research knowledge layer; mailto:${CONTACT})`
const REQUEST_TIMEOUT_MS = 12_000

export type KnowledgeSource = "openalex" | "arxiv" | "crossref"

// --- response cache ---------------------------------------------------------
type CacheEntry = { at: number; value: unknown }
const cache = new Map<string, CacheEntry>()
const CACHE_TTL_MS = 10 * 60_000

function cacheGet<T>(key: string): T | null {
  const hit = cache.get(key)
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.value as T
  if (hit) cache.delete(key)
  return null
}
function cacheSet(key: string, value: unknown): void {
  cache.set(key, { at: Date.now(), value })
  if (cache.size > 300) {
    const oldest = cache.keys().next().value
    if (oldest) cache.delete(oldest)
  }
}

// --- per-source rate limiting (minimum interval between calls) --------------
const MIN_INTERVAL_MS: Record<KnowledgeSource, number> = {
  openalex: 110, // OpenAlex polite pool ~10 req/s
  crossref: 1_000, // Crossref polite pool ~1 req/s
  arxiv: 3_000, // arXiv asks for >=3s between calls
}
const lastCallAt: Record<string, number> = {}

async function throttle(source: KnowledgeSource): Promise<void> {
  const min = MIN_INTERVAL_MS[source]
  const last = lastCallAt[source] ?? 0
  const wait = last + min - Date.now()
  if (wait > 0) await new Promise((r) => setTimeout(r, wait))
  lastCallAt[source] = Date.now()
}

// --- fetch helpers ----------------------------------------------------------
async function fetchWithTimeout(url: string, accept: string): Promise<Response> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)
  try {
    return await fetch(url, {
      headers: { "User-Agent": UA, Accept: accept, From: CONTACT },
      signal: controller.signal,
      // Knowledge endpoints are public; cache at the platform layer, not the CDN.
      cache: "no-store",
    })
  } finally {
    clearTimeout(timer)
  }
}

// --- types ------------------------------------------------------------------
export interface ResearchWork {
  title: string
  authors: string[]
  year: number | null
  venue: string | null
  doi: string | null
  url: string | null
  abstract: string | null
  citationCount: number | null
  openAccess: boolean | null
  institutions: string[]
  source: KnowledgeSource
  attribution: string
}

export interface InstitutionNode {
  name: string
  ror: string | null
  country: string | null
  type: string | null
  homepage: string | null
  worksCount: number | null
  citedByCount: number | null
  topFields: string[]
  source: "openalex"
  attribution: string
}

export interface ConceptNode {
  name: string
  level: number | null
  description: string | null
  worksCount: number | null
  related: string[]
  ancestors: string[]
  source: "openalex"
  attribution: string
  /** True when the field was derived from a works search rather than a direct
   * concept match (e.g. multi-word terms not in the controlled vocabulary). */
  derived?: boolean
}

// --- OpenAlex ---------------------------------------------------------------
function truncate(s: string | null | undefined, max = 600): string | null {
  if (!s) return null
  const t = s.trim()
  return t.length > max ? `${t.slice(0, max)}…` : t
}

/** OpenAlex stores abstracts as an inverted index; reconstruct readable text. */
function reconstructAbstract(inverted: Record<string, number[]> | null | undefined): string | null {
  if (!inverted) return null
  const slots: string[] = []
  for (const [word, positions] of Object.entries(inverted)) {
    for (const pos of positions) slots[pos] = word
  }
  const text = slots.filter(Boolean).join(" ").trim()
  return text || null
}

interface OpenAlexWork {
  display_name?: string
  publication_year?: number
  doi?: string
  primary_location?: { landing_page_url?: string; source?: { display_name?: string } }
  authorships?: { author?: { display_name?: string }; institutions?: { display_name?: string }[] }[]
  abstract_inverted_index?: Record<string, number[]>
  cited_by_count?: number
  open_access?: { is_oa?: boolean }
}

function mapOpenAlexWork(w: OpenAlexWork): ResearchWork {
  const authors = (w.authorships ?? []).map((a) => a.author?.display_name ?? "").filter(Boolean)
  const institutions = Array.from(
    new Set((w.authorships ?? []).flatMap((a) => (a.institutions ?? []).map((i) => i.display_name ?? "")).filter(Boolean)),
  )
  const doi = w.doi ? w.doi.replace(/^https?:\/\/doi\.org\//, "") : null
  return {
    title: w.display_name ?? "(untitled)",
    authors: authors.slice(0, 8),
    year: w.publication_year ?? null,
    venue: w.primary_location?.source?.display_name ?? null,
    doi,
    url: w.primary_location?.landing_page_url ?? (doi ? `https://doi.org/${doi}` : null),
    abstract: truncate(reconstructAbstract(w.abstract_inverted_index)),
    citationCount: w.cited_by_count ?? null,
    openAccess: w.open_access?.is_oa ?? null,
    institutions: institutions.slice(0, 6),
    source: "openalex",
    attribution: "Data from OpenAlex (https://openalex.org), CC0.",
  }
}

async function searchOpenAlex(query: string, fromYear: number | null, openAccessOnly: boolean): Promise<ResearchWork[]> {
  const filters: string[] = []
  if (fromYear) filters.push(`from_publication_date:${fromYear}-01-01`)
  if (openAccessOnly) filters.push("is_oa:true")
  const params = new URLSearchParams({
    search: query,
    per_page: "8",
    sort: "relevance_score:desc",
    mailto: CONTACT,
  })
  if (filters.length) params.set("filter", filters.join(","))
  const url = `https://api.openalex.org/works?${params.toString()}`

  const cacheKey = `oa:works:${url}`
  const cached = cacheGet<ResearchWork[]>(cacheKey)
  if (cached) return cached

  await throttle("openalex")
  const res = await fetchWithTimeout(url, "application/json")
  if (!res.ok) throw new Error(`OpenAlex responded ${res.status}`)
  const json = (await res.json()) as { results?: OpenAlexWork[] }
  const works = (json.results ?? []).map(mapOpenAlexWork)
  cacheSet(cacheKey, works)
  return works
}

interface OpenAlexInstitution {
  display_name?: string
  ror?: string
  country_code?: string
  type?: string
  homepage_url?: string
  works_count?: number
  cited_by_count?: number
  x_concepts?: { display_name?: string }[]
}

export async function lookupInstitution(name: string): Promise<InstitutionNode[]> {
  const params = new URLSearchParams({ search: name, per_page: "5", mailto: CONTACT })
  const url = `https://api.openalex.org/institutions?${params.toString()}`
  const cacheKey = `oa:inst:${url}`
  const cached = cacheGet<InstitutionNode[]>(cacheKey)
  if (cached) return cached

  await throttle("openalex")
  const res = await fetchWithTimeout(url, "application/json")
  if (!res.ok) throw new Error(`OpenAlex institutions responded ${res.status}`)
  const json = (await res.json()) as { results?: OpenAlexInstitution[] }
  const nodes: InstitutionNode[] = (json.results ?? []).map((i) => ({
    name: i.display_name ?? "(unknown institution)",
    ror: i.ror ?? null,
    country: i.country_code ?? null,
    type: i.type ?? null,
    homepage: i.homepage_url ?? null,
    worksCount: i.works_count ?? null,
    citedByCount: i.cited_by_count ?? null,
    topFields: (i.x_concepts ?? []).map((c) => c.display_name ?? "").filter(Boolean).slice(0, 6),
    source: "openalex",
    attribution: "Institution data from OpenAlex (https://openalex.org), CC0.",
  }))
  cacheSet(cacheKey, nodes)
  return nodes
}

interface OpenAlexConcept {
  display_name?: string
  level?: number
  description?: string
  works_count?: number
  related_concepts?: { display_name?: string }[]
  ancestors?: { display_name?: string }[]
}

export async function exploreConcept(concept: string): Promise<ConceptNode | null> {
  const params = new URLSearchParams({ search: concept, per_page: "1", mailto: CONTACT })
  const url = `https://api.openalex.org/concepts?${params.toString()}`
  const cacheKey = `oa:concept:${url}`
  const cached = cacheGet<ConceptNode | null>(cacheKey)
  if (cached !== null) return cached

  await throttle("openalex")
  const res = await fetchWithTimeout(url, "application/json")
  if (!res.ok) throw new Error(`OpenAlex concepts responded ${res.status}`)
  const json = (await res.json()) as { results?: OpenAlexConcept[] }
  const c = (json.results ?? [])[0]
  if (!c) {
    // Multi-word / emerging terms (e.g. "green hydrogen") often aren't in
    // OpenAlex's controlled concept vocabulary. Degrade gracefully by deriving
    // the field from the concept tags attached to the top matching works.
    const derived = await deriveConceptFromWorks(concept)
    cacheSet(cacheKey, derived)
    return derived
  }
  const related = (c.related_concepts ?? []).map((r) => r.display_name ?? "").filter(Boolean).slice(0, 10)
  const ancestors = (c.ancestors ?? []).map((a) => a.display_name ?? "").filter(Boolean).slice(0, 8)
  // OpenAlex no longer returns related_concepts on the default concepts payload;
  // when the direct match has no graph edges, enrich it from the works tags so
  // the field map is never empty.
  if (related.length === 0) {
    const derived = await deriveConceptFromWorks(concept)
    if (derived) {
      const node: ConceptNode = {
        ...derived,
        name: c.display_name ?? concept,
        level: c.level ?? null,
        description: truncate(c.description ?? null, 400),
        worksCount: c.works_count ?? derived.worksCount,
        ancestors,
      }
      cacheSet(cacheKey, node)
      return node
    }
  }
  const node: ConceptNode = {
    name: c.display_name ?? concept,
    level: c.level ?? null,
    description: truncate(c.description ?? null, 400),
    worksCount: c.works_count ?? null,
    related,
    ancestors,
    source: "openalex",
    attribution: "Concept graph from OpenAlex (https://openalex.org), CC0.",
  }
  cacheSet(cacheKey, node)
  return node
}

/**
 * Fallback concept mapper: aggregate the `concepts` tags OpenAlex attaches to
 * the most relevant works for a free-text query, ranked by summed score. This
 * yields a usable field map for terms outside the controlled vocabulary.
 */
async function deriveConceptFromWorks(concept: string): Promise<ConceptNode | null> {
  const params = new URLSearchParams({
    search: concept,
    per_page: "25",
    sort: "relevance_score:desc",
    select: "concepts",
    mailto: CONTACT,
  })
  const url = `https://api.openalex.org/works?${params.toString()}`
  await throttle("openalex")
  const res = await fetchWithTimeout(url, "application/json")
  if (!res.ok) throw new Error(`OpenAlex works responded ${res.status}`)
  const json = (await res.json()) as {
    meta?: { count?: number }
    results?: { concepts?: { display_name?: string; score?: number; level?: number }[] }[]
  }
  const results = json.results ?? []
  if (results.length === 0) return null

  const scores = new Map<string, { total: number; level: number | null }>()
  for (const w of results) {
    for (const con of w.concepts ?? []) {
      const name = con.display_name
      if (!name) continue
      const prev = scores.get(name) ?? { total: 0, level: con.level ?? null }
      prev.total += con.score ?? 0
      scores.set(name, prev)
    }
  }
  const ranked = [...scores.entries()].sort((a, b) => b[1].total - a[1].total)
  if (ranked.length === 0) return null

  return {
    name: concept,
    level: null,
    description: null,
    worksCount: json.meta?.count ?? null,
    related: ranked.slice(0, 10).map(([name]) => name),
    ancestors: [],
    source: "openalex",
    attribution: "Field map derived from OpenAlex work concept tags (https://openalex.org), CC0.",
    derived: true,
  }
}

// --- Crossref ---------------------------------------------------------------
interface CrossrefItem {
  title?: string[]
  author?: { given?: string; family?: string }[]
  issued?: { "date-parts"?: number[][] }
  "container-title"?: string[]
  DOI?: string
  URL?: string
  abstract?: string
  "is-referenced-by-count"?: number
}

async function searchCrossref(query: string, fromYear: number | null): Promise<ResearchWork[]> {
  const params = new URLSearchParams({ query, rows: "8", select: "title,author,issued,container-title,DOI,URL,abstract,is-referenced-by-count", mailto: CONTACT })
  if (fromYear) params.set("filter", `from-pub-date:${fromYear}-01-01`)
  const url = `https://api.crossref.org/works?${params.toString()}`
  const cacheKey = `cr:${url}`
  const cached = cacheGet<ResearchWork[]>(cacheKey)
  if (cached) return cached

  await throttle("crossref")
  const res = await fetchWithTimeout(url, "application/json")
  if (!res.ok) throw new Error(`Crossref responded ${res.status}`)
  const json = (await res.json()) as { message?: { items?: CrossrefItem[] } }
  const works: ResearchWork[] = (json.message?.items ?? []).map((it) => {
    const year = it.issued?.["date-parts"]?.[0]?.[0] ?? null
    const authors = (it.author ?? []).map((a) => [a.given, a.family].filter(Boolean).join(" ")).filter(Boolean)
    return {
      title: it.title?.[0] ?? "(untitled)",
      authors: authors.slice(0, 8),
      year,
      venue: it["container-title"]?.[0] ?? null,
      doi: it.DOI ?? null,
      url: it.URL ?? (it.DOI ? `https://doi.org/${it.DOI}` : null),
      // Crossref abstracts are JATS XML; strip tags for a readable snippet.
      abstract: truncate(it.abstract ? it.abstract.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ") : null),
      citationCount: it["is-referenced-by-count"] ?? null,
      openAccess: null,
      institutions: [],
      source: "crossref",
      attribution: "Metadata from Crossref (https://crossref.org).",
    }
  })
  cacheSet(cacheKey, works)
  return works
}

// --- arXiv (Atom XML) -------------------------------------------------------
function xmlTag(block: string, tag: string): string | null {
  const m = block.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, "i"))
  return m ? m[1].replace(/\s+/g, " ").trim() : null
}

async function searchArxiv(query: string): Promise<ResearchWork[]> {
  const params = new URLSearchParams({
    search_query: `all:${query}`,
    start: "0",
    max_results: "8",
    sortBy: "relevance",
    sortOrder: "descending",
  })
  const url = `https://export.arxiv.org/api/query?${params.toString()}`
  const cacheKey = `ax:${url}`
  const cached = cacheGet<ResearchWork[]>(cacheKey)
  if (cached) return cached

  await throttle("arxiv")
  const res = await fetchWithTimeout(url, "application/atom+xml")
  if (!res.ok) throw new Error(`arXiv responded ${res.status}`)
  const xml = await res.text()
  const entries = xml.split(/<entry>/).slice(1).map((e) => e.split(/<\/entry>/)[0])
  const works: ResearchWork[] = entries.map((entry) => {
    const title = xmlTag(entry, "title")
    const published = xmlTag(entry, "published")
    const year = published ? Number.parseInt(published.slice(0, 4), 10) : null
    const id = xmlTag(entry, "id")
    const authors = Array.from(entry.matchAll(/<author>[\s\S]*?<name>([\s\S]*?)<\/name>[\s\S]*?<\/author>/gi))
      .map((m) => m[1].trim())
      .filter(Boolean)
    return {
      title: title ?? "(untitled)",
      authors: authors.slice(0, 8),
      year: Number.isFinite(year) ? year : null,
      venue: "arXiv preprint",
      doi: null,
      url: id,
      abstract: truncate(xmlTag(entry, "summary")),
      citationCount: null,
      openAccess: true,
      institutions: [],
      source: "arxiv",
      attribution: "Preprint from arXiv (https://arxiv.org), open access. Thank you to arXiv for use of its open access interoperability.",
    }
  })
  cacheSet(cacheKey, works)
  return works
}

// --- unified research search ------------------------------------------------
export interface ResearchSearchResult {
  query: string
  sources: KnowledgeSource[]
  works: ResearchWork[]
  errors: { source: KnowledgeSource; message: string }[]
}

/**
 * Search scholarly literature across one or more open knowledge sources.
 * Runs the chosen sources in parallel (best-effort: a failing source is
 * reported but never blocks the others), de-duplicates by DOI/title, and
 * returns a relevance/citation-ordered, attributed result set.
 */
export async function searchResearch(opts: {
  query: string
  sources?: KnowledgeSource[]
  fromYear?: number | null
  openAccessOnly?: boolean
}): Promise<ResearchSearchResult> {
  const query = opts.query.trim()
  const sources = opts.sources && opts.sources.length ? opts.sources : (["openalex"] as KnowledgeSource[])
  const fromYear = opts.fromYear ?? null
  const openAccessOnly = opts.openAccessOnly ?? false

  const errors: { source: KnowledgeSource; message: string }[] = []
  const runners: Promise<ResearchWork[]>[] = sources.map((src) => {
    const p =
      src === "openalex"
        ? searchOpenAlex(query, fromYear, openAccessOnly)
        : src === "crossref"
          ? searchCrossref(query, fromYear)
          : searchArxiv(query)
    return p.catch((err: unknown) => {
      errors.push({ source: src, message: err instanceof Error ? err.message : String(err) })
      return [] as ResearchWork[]
    })
  })

  const settled = await Promise.all(runners)
  const merged = settled.flat()

  // De-duplicate by DOI (preferred) or normalized title.
  const seen = new Set<string>()
  const deduped: ResearchWork[] = []
  for (const w of merged) {
    const key = (w.doi ?? w.title).toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 80)
    if (seen.has(key)) continue
    seen.add(key)
    deduped.push(w)
  }

  // Order by citation count (desc), then recency.
  deduped.sort((a, b) => (b.citationCount ?? 0) - (a.citationCount ?? 0) || (b.year ?? 0) - (a.year ?? 0))

  return { query, sources, works: deduped.slice(0, 12), errors }
}
