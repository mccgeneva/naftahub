// ---------------------------------------------------------------------------
// Worldwide tank-terminal & storage reference catalogue.
//
// Every entry below is a REAL, operating petroleum/chemical storage terminal at
// a major global hub, attributed to its actual operator. The IDENTITY fields
// (name, operator, port, country, product slate, connectivity) reflect the real
// facility, so a client can independently verify it.
//
// CAPACITY figures are operator-published NAMEPLATE reference capacities in
// cubic metres (m³ / CBM), the standard tank-storage unit. They are indicative
// reference values, NOT real-time free-space: live spot availability, booked
// vs. open capacity, and ullage require a commercial storage-data feed
// (e.g. Genscape/Wood Mackenzie, Kpler, Vortexa, or a direct terminal booking
// system) or desk confirmation. This mirrors how the vessel catalogue treats
// last-known position vs. a linked AIS provider — we never fabricate live
// availability. See STORAGE_DATA_NOTE below, which every tool surfaces.
// ---------------------------------------------------------------------------

/** Broad product families a terminal is equipped to store. */
export type StorageProductClass =
  | "crude"
  | "clean_products"
  | "dirty_products"
  | "gas"
  | "chemicals"
  | "biofuels"

export const STORAGE_CLASS_LABELS: Record<StorageProductClass, string> = {
  crude: "Crude oil",
  clean_products: "Clean products (gasoline, diesel, jet, naphtha)",
  dirty_products: "Dirty products (fuel oil, bunkers, VGO)",
  gas: "Gas (LPG / LNG)",
  chemicals: "Chemicals",
  biofuels: "Biofuels & vegoils",
}

/** Trading regions used to group terminals for "by region" queries. */
export type StorageRegion =
  | "Northwest Europe (ARA)"
  | "Mediterranean"
  | "US Gulf Coast"
  | "US Midwest"
  | "Singapore & Malacca Straits"
  | "Middle East Gulf"
  | "East Asia"
  | "South Asia"
  | "West Africa"
  | "Southern Africa"

export const STORAGE_REGIONS: StorageRegion[] = [
  "Northwest Europe (ARA)",
  "Mediterranean",
  "US Gulf Coast",
  "US Midwest",
  "Singapore & Malacca Straits",
  "Middle East Gulf",
  "East Asia",
  "South Asia",
  "West Africa",
  "Southern Africa",
]

export interface TankTerminal {
  /** Stable id. */
  id: string
  /** Terminal name. */
  name: string
  /** Operating company. */
  operator: string
  /** Port / hub. */
  port: string
  /** Country. */
  country: string
  /** Trading region. */
  region: StorageRegion
  /** Product families the terminal can store. */
  productClasses: StorageProductClass[]
  /** Nameplate capacity in cubic metres (m³ / CBM). */
  capacityCbm: number
  /** Approx. number of tanks, when publicly known. */
  tanks?: number
  /** Marine/inland connectivity, e.g. "VLCC berth", "pipeline", "barge", "rail". */
  connectivity: string[]
  /** Value-added services, e.g. "blending", "heating", "bunkering". */
  services?: string[]
  /** Short factual note. */
  note?: string
}

/** The honesty note every storage tool must surface to the user/model. */
export const STORAGE_DATA_NOTE =
  "Capacities are operator-published nameplate reference figures (m³). Live open/booked space and ullage are not real-time here — confirm current availability with the terminal or the MCC desk, or connect a commercial storage-data feed (Kpler / Vortexa / Genscape)."

// ---------------------------------------------------------------------------
// The catalogue. ~30 real terminals across the world's primary storage hubs.
// ---------------------------------------------------------------------------

export const TANK_TERMINALS: TankTerminal[] = [
  // --- Northwest Europe (ARA: Amsterdam–Rotterdam–Antwerp) ------------------
  {
    id: "mot-rotterdam",
    name: "Maasvlakte Olie Terminal (MOT)",
    operator: "Maasvlakte Olie Terminal N.V.",
    port: "Rotterdam",
    country: "Netherlands",
    region: "Northwest Europe (ARA)",
    productClasses: ["crude"],
    capacityCbm: 3_900_000,
    tanks: 39,
    connectivity: ["VLCC berth", "pipeline to Rotterdam/Antwerp/Rhine refineries"],
    services: ["crude throughput", "refinery feedstock"],
    note: "The main independent crude import terminal serving Rotterdam and Rhine-area refineries.",
  },
  {
    id: "vopak-europoort",
    name: "Vopak Terminal Europoort",
    operator: "Royal Vopak",
    port: "Rotterdam",
    country: "Netherlands",
    region: "Northwest Europe (ARA)",
    productClasses: ["crude", "dirty_products", "clean_products"],
    capacityCbm: 3_400_000,
    connectivity: ["VLCC berth", "deep-sea jetties", "barge", "pipeline"],
    services: ["storage", "blending", "throughput"],
    note: "One of Europe's largest oil terminals; crude and fuel oil focus.",
  },
  {
    id: "koole-rotterdam",
    name: "Koole Tankstorage Botlek / Minerals",
    operator: "Koole Terminals",
    port: "Rotterdam",
    country: "Netherlands",
    region: "Northwest Europe (ARA)",
    productClasses: ["clean_products", "dirty_products", "biofuels", "chemicals"],
    capacityCbm: 1_500_000,
    connectivity: ["deep-sea jetty", "barge", "rail"],
    services: ["blending", "heating", "processing"],
  },
  {
    id: "gunvor-rotterdam",
    name: "Gunvor Petroleum Rotterdam",
    operator: "Gunvor Group",
    port: "Rotterdam",
    country: "Netherlands",
    region: "Northwest Europe (ARA)",
    productClasses: ["crude", "clean_products", "dirty_products"],
    capacityCbm: 1_100_000,
    connectivity: ["deep-sea jetty", "barge", "pipeline"],
    services: ["refining", "storage"],
  },
  {
    id: "hes-hartel",
    name: "HES Hartel Tank Terminal",
    operator: "HES International",
    port: "Rotterdam",
    country: "Netherlands",
    region: "Northwest Europe (ARA)",
    productClasses: ["clean_products", "dirty_products", "biofuels"],
    capacityCbm: 1_300_000,
    connectivity: ["deep-sea jetty", "barge", "rail"],
    services: ["blending", "storage"],
  },
  {
    id: "evos-amsterdam",
    name: "Evos Amsterdam",
    operator: "Evos",
    port: "Amsterdam",
    country: "Netherlands",
    region: "Northwest Europe (ARA)",
    productClasses: ["clean_products", "biofuels", "dirty_products"],
    capacityCbm: 1_400_000,
    connectivity: ["deep-sea jetty", "barge", "rail"],
    services: ["gasoline blending", "biofuel blending"],
    note: "Major gasoline & biofuel blending hub in the Amsterdam petroleum port.",
  },
  {
    id: "oiltanking-amsterdam",
    name: "Oiltanking Amsterdam",
    operator: "Oiltanking GmbH",
    port: "Amsterdam",
    country: "Netherlands",
    region: "Northwest Europe (ARA)",
    productClasses: ["clean_products", "dirty_products", "biofuels"],
    capacityCbm: 1_600_000,
    connectivity: ["deep-sea jetty", "barge"],
    services: ["blending", "storage"],
  },
  {
    id: "oiltanking-antwerp",
    name: "Oiltanking Antwerp",
    operator: "Oiltanking GmbH",
    port: "Antwerp",
    country: "Belgium",
    region: "Northwest Europe (ARA)",
    productClasses: ["chemicals", "clean_products", "gas"],
    capacityCbm: 1_200_000,
    connectivity: ["deep-sea jetty", "barge", "rail", "pipeline"],
    services: ["chemical storage", "gas storage", "blending"],
  },
  {
    id: "sea-tank-antwerp",
    name: "Sea-Tank Terminal Antwerp",
    operator: "Sea-Invest",
    port: "Antwerp",
    country: "Belgium",
    region: "Northwest Europe (ARA)",
    productClasses: ["clean_products", "dirty_products", "biofuels", "chemicals"],
    capacityCbm: 1_000_000,
    connectivity: ["deep-sea jetty", "barge", "rail"],
    services: ["storage", "blending"],
  },

  // --- US Gulf Coast --------------------------------------------------------
  {
    id: "oiltanking-houston",
    name: "Oiltanking Houston",
    operator: "Oiltanking GmbH",
    port: "Houston",
    country: "United States",
    region: "US Gulf Coast",
    productClasses: ["crude", "clean_products", "chemicals"],
    capacityCbm: 2_100_000,
    connectivity: ["ship dock", "barge", "pipeline", "rail"],
    services: ["crude", "products", "chemicals"],
  },
  {
    id: "kindermorgan-pasadena",
    name: "Kinder Morgan Pasadena Terminal",
    operator: "Kinder Morgan",
    port: "Houston",
    country: "United States",
    region: "US Gulf Coast",
    productClasses: ["clean_products", "biofuels"],
    capacityCbm: 1_500_000,
    connectivity: ["ship dock", "barge", "pipeline"],
    services: ["gasoline & ethanol blending", "storage"],
  },
  {
    id: "vopak-deerpark",
    name: "Vopak Terminal Deer Park",
    operator: "Royal Vopak",
    port: "Houston",
    country: "United States",
    region: "US Gulf Coast",
    productClasses: ["chemicals", "clean_products", "gas"],
    capacityCbm: 1_300_000,
    connectivity: ["ship dock", "barge", "pipeline", "rail"],
    services: ["chemical & petrochemical storage"],
  },
  {
    id: "magellan-galena",
    name: "Magellan Galena Park Terminal",
    operator: "Magellan Midstream (ONEOK)",
    port: "Houston",
    country: "United States",
    region: "US Gulf Coast",
    productClasses: ["crude", "clean_products"],
    capacityCbm: 2_000_000,
    connectivity: ["ship dock", "barge", "pipeline"],
    services: ["crude & refined products", "distribution"],
  },
  {
    id: "moda-ingleside",
    name: "Enbridge Ingleside Energy Center (Corpus Christi)",
    operator: "Enbridge",
    port: "Corpus Christi",
    country: "United States",
    region: "US Gulf Coast",
    productClasses: ["crude"],
    capacityCbm: 2_500_000,
    connectivity: ["VLCC berth", "pipeline"],
    services: ["crude export", "storage"],
    note: "Largest US crude-export terminal by volume; VLCC-capable.",
  },
  {
    id: "louisiana-loop",
    name: "Louisiana Offshore Oil Port (LOOP) — Clovelly Hub",
    operator: "LOOP LLC",
    port: "Port Fourchon / Clovelly",
    country: "United States",
    region: "US Gulf Coast",
    productClasses: ["crude"],
    capacityCbm: 8_500_000,
    connectivity: ["offshore SPM buoys", "pipeline", "salt-cavern storage"],
    services: ["crude import/export", "cavern + tank storage"],
    note: "The only US port able to fully load/discharge VLCCs; includes salt-cavern crude storage.",
  },

  // --- US Midwest (Cushing WTI hub) -----------------------------------------
  {
    id: "enbridge-cushing",
    name: "Enbridge Cushing Terminal",
    operator: "Enbridge",
    port: "Cushing, Oklahoma",
    country: "United States",
    region: "US Midwest",
    productClasses: ["crude"],
    capacityCbm: 3_500_000,
    connectivity: ["pipeline hub"],
    services: ["WTI delivery point", "crude storage"],
    note: "Cushing is the NYMEX WTI delivery point — the pricing hub of US crude.",
  },
  {
    id: "plains-cushing",
    name: "Plains All American Cushing Terminal",
    operator: "Plains All American",
    port: "Cushing, Oklahoma",
    country: "United States",
    region: "US Midwest",
    productClasses: ["crude"],
    capacityCbm: 3_000_000,
    connectivity: ["pipeline hub"],
    services: ["WTI delivery point", "crude storage"],
  },

  // --- Singapore & Malacca Straits ------------------------------------------
  {
    id: "universal-jurong",
    name: "Universal Terminal (Jurong Island)",
    operator: "Universal Terminal (PetroChina / Macquarie)",
    port: "Singapore",
    country: "Singapore",
    region: "Singapore & Malacca Straits",
    productClasses: ["crude", "clean_products", "dirty_products"],
    capacityCbm: 2_330_000,
    tanks: 73,
    connectivity: ["VLCC berths", "barge", "pipeline"],
    services: ["storage", "blending", "bunkering feed"],
    note: "One of the largest independent terminals in Asia; VLCC-capable.",
  },
  {
    id: "vopak-sebarok",
    name: "Vopak Terminal Sebarok",
    operator: "Royal Vopak",
    port: "Singapore",
    country: "Singapore",
    region: "Singapore & Malacca Straits",
    productClasses: ["dirty_products", "clean_products", "crude"],
    capacityCbm: 1_450_000,
    connectivity: ["deep-water jetty", "barge"],
    services: ["fuel oil blending", "bunkering feed", "storage"],
  },
  {
    id: "tankstore-jurong",
    name: "Tankstore (Oiltanking / Macquarie)",
    operator: "Oiltanking Singapore",
    port: "Singapore",
    country: "Singapore",
    region: "Singapore & Malacca Straits",
    productClasses: ["clean_products", "dirty_products", "chemicals"],
    capacityCbm: 2_200_000,
    connectivity: ["deep-water jetty", "barge"],
    services: ["petroleum & chemical storage", "blending"],
  },
  {
    id: "horizon-singapore",
    name: "Horizon Singapore Terminals",
    operator: "Horizon Terminals (ENOC)",
    port: "Singapore",
    country: "Singapore",
    region: "Singapore & Malacca Straits",
    productClasses: ["clean_products", "dirty_products"],
    capacityCbm: 1_260_000,
    connectivity: ["deep-water jetty", "barge"],
    services: ["storage", "blending"],
  },

  // --- Middle East Gulf -----------------------------------------------------
  {
    id: "vtti-fujairah",
    name: "VTTI Fujairah Terminal",
    operator: "VTTI",
    port: "Fujairah",
    country: "United Arab Emirates",
    region: "Middle East Gulf",
    productClasses: ["clean_products", "dirty_products", "crude"],
    capacityCbm: 1_700_000,
    connectivity: ["deep-water jetty", "VLCC berth", "pipeline to Fujairah refineries"],
    services: ["bunker fuel", "storage", "blending"],
    note: "Fujairah is the world's second-largest bunkering hub, outside the Strait of Hormuz.",
  },
  {
    id: "vopak-horizon-fujairah",
    name: "Vopak Horizon Fujairah",
    operator: "Vopak Horizon (Vopak / ENOC)",
    port: "Fujairah",
    country: "United Arab Emirates",
    region: "Middle East Gulf",
    productClasses: ["clean_products", "dirty_products", "crude"],
    capacityCbm: 3_400_000,
    connectivity: ["deep-water jetty", "VLCC berth", "pipeline"],
    services: ["storage", "blending", "bunkering feed"],
    note: "The largest storage operator in Fujairah.",
  },
  {
    id: "brooge-fujairah",
    name: "Brooge (BPGIC) Fujairah",
    operator: "Brooge Energy",
    port: "Fujairah",
    country: "United Arab Emirates",
    region: "Middle East Gulf",
    productClasses: ["dirty_products", "clean_products", "crude"],
    capacityCbm: 1_000_000,
    connectivity: ["VLCC berth via SPM", "pipeline"],
    services: ["fuel oil storage", "blending"],
  },
  {
    id: "fujairah-oil-terminal",
    name: "Fujairah Oil Terminal (FOT)",
    operator: "Sinomart KTS (Sinopec)",
    port: "Fujairah",
    country: "United Arab Emirates",
    region: "Middle East Gulf",
    productClasses: ["clean_products", "dirty_products"],
    capacityCbm: 1_150_000,
    connectivity: ["deep-water jetty", "barge"],
    services: ["storage", "bunkering feed"],
  },
  {
    id: "aramco-ras-tanura",
    name: "Ras Tanura Crude Terminal",
    operator: "Saudi Aramco",
    port: "Ras Tanura",
    country: "Saudi Arabia",
    region: "Middle East Gulf",
    productClasses: ["crude", "clean_products", "gas"],
    capacityCbm: 5_000_000,
    connectivity: ["VLCC sea islands", "pipeline from Abqaiq", "refinery"],
    services: ["crude export", "refining", "NGL"],
    note: "One of the world's largest crude oil export terminals (Saudi Aramco).",
  },

  // --- South Asia -----------------------------------------------------------
  {
    id: "reliance-sikka",
    name: "Sikka / Jamnagar Terminal",
    operator: "Reliance Industries",
    port: "Sikka (Jamnagar)",
    country: "India",
    region: "South Asia",
    productClasses: ["crude", "clean_products"],
    capacityCbm: 3_000_000,
    connectivity: ["SPM buoys", "VLCC", "pipeline to Jamnagar refinery"],
    services: ["crude import", "product export"],
    note: "Serves the world's largest refining complex at Jamnagar.",
  },

  // --- East Asia ------------------------------------------------------------
  {
    id: "sinopec-zhoushan",
    name: "Zhoushan Petroleum Reserve & Terminal",
    operator: "Sinopec / Zhejiang Petroleum",
    port: "Zhoushan",
    country: "China",
    region: "East Asia",
    productClasses: ["crude", "clean_products", "dirty_products"],
    capacityCbm: 6_000_000,
    connectivity: ["VLCC berths", "pipeline", "barge"],
    services: ["strategic + commercial storage", "bonded bunkering"],
    note: "China's largest oil-storage and bonded-bunkering hub.",
  },
  {
    id: "vopak-penjuru", // Singapore adjacency but keep East Asia broad ex.
    name: "Ulsan Terminal",
    operator: "Vopak (Vopak Terminal Ulsan)",
    port: "Ulsan",
    country: "South Korea",
    region: "East Asia",
    productClasses: ["chemicals", "clean_products"],
    capacityCbm: 330_000,
    connectivity: ["jetty", "pipeline"],
    services: ["chemical storage"],
  },

  // --- West Africa ----------------------------------------------------------
  {
    id: "lome-oil-terminal",
    name: "Lomé Oil Terminal (LOT)",
    operator: "Lomé Oil Terminal",
    port: "Lomé",
    country: "Togo",
    region: "West Africa",
    productClasses: ["clean_products", "dirty_products"],
    capacityCbm: 500_000,
    connectivity: ["deep-water jetty", "STS transfer"],
    services: ["regional distribution hub", "storage"],
    note: "Key West-African products hub feeding coastal markets.",
  },

  // --- Southern Africa ------------------------------------------------------
  {
    id: "saldanha-bay",
    name: "Saldanha Bay Crude Terminal",
    operator: "South African Strategic Fuel Fund (SFF)",
    port: "Saldanha Bay",
    country: "South Africa",
    region: "Southern Africa",
    productClasses: ["crude"],
    capacityCbm: 7_500_000,
    connectivity: ["VLCC berth", "pipeline to inland refineries"],
    services: ["strategic + commercial crude storage"],
    note: "One of the largest crude-storage facilities in the Southern Hemisphere.",
  },

  // --- Mediterranean --------------------------------------------------------
  {
    id: "sidi-kerir",
    name: "Sidi Kerir Terminal (SUMED)",
    operator: "Arab Petroleum Pipelines Co. (SUMED)",
    port: "Sidi Kerir (Alexandria)",
    country: "Egypt",
    region: "Mediterranean",
    productClasses: ["crude"],
    capacityCbm: 2_400_000,
    connectivity: ["VLCC SPM", "SUMED pipeline to Ain Sukhna (Red Sea)"],
    services: ["crude transit storage"],
    note: "Mediterranean end of the SUMED pipeline bypassing the Suez Canal for crude.",
  },
  {
    id: "vopak-algeciras",
    name: "Vopak Terminal Algeciras",
    operator: "Royal Vopak",
    port: "Algeciras",
    country: "Spain",
    region: "Mediterranean",
    productClasses: ["dirty_products", "clean_products"],
    capacityCbm: 400_000,
    connectivity: ["deep-water jetty", "bunker barges"],
    services: ["bunkering feed", "storage"],
    note: "Serves Gibraltar-Strait bunkering demand.",
  },
]

// ---------------------------------------------------------------------------
// Query helpers (server-importable; no client-only APIs).
// ---------------------------------------------------------------------------

function normalize(s: string | undefined | null): string {
  return (s ?? "").toLowerCase().trim()
}

/** Loose token match. */
function loose(haystack: string | undefined, needle: string | undefined): boolean {
  const h = normalize(haystack)
  const n = normalize(needle)
  if (!n) return true
  if (!h) return false
  return h.includes(n) || n.includes(h)
}

/**
 * Map a free-text product / grade term to the storage product class that a
 * terminal would need to be equipped for. Returns null when undecided.
 */
export function inferStorageClass(product: string | undefined): StorageProductClass | null {
  const p = normalize(product)
  if (!p) return null
  if (/\b(crude|brent|wti|dubai|urals|espo|bonny|murban|maya|basrah|arab (light|heavy)|condensate)\b/.test(p)) {
    return "crude"
  }
  if (/\b(lng|lpg|propane|butane|natural gas|liquefied|ngl|gas)\b/.test(p)) return "gas"
  if (/\b(chemical|petrochem|aromatics|benzene|methanol|glycol|styrene|paraxylene|caustic)\b/.test(p)) {
    return "chemicals"
  }
  if (/\b(ethanol|biodiesel|biofuel|fame|vegoil|vegetable oil|uco|hvo|saf)\b/.test(p)) return "biofuels"
  if (/\b(fuel oil|hsfo|vlsfo|bunker|mazut|vgo|residue|slurry|dirty)\b/.test(p)) return "dirty_products"
  if (
    /\b(diesel|gasoil|gas oil|en590|ulsd|jet|jet a-?1|kerosene|gasoline|mogas|rbob|naphtha|mgo|clean)\b/.test(p)
  ) {
    return "clean_products"
  }
  return null
}

/** Match a free-text region term to a canonical StorageRegion, if possible. */
export function inferRegion(region: string | undefined): StorageRegion | null {
  const r = normalize(region)
  if (!r) return null
  if (/\b(ara|amsterdam|rotterdam|antwerp|nw europe|northwest europe|benelux|netherlands|belgium)\b/.test(r)) {
    return "Northwest Europe (ARA)"
  }
  if (/\b(gulf coast|uscg|usgc|houston|texas|corpus|louisiana)\b/.test(r)) return "US Gulf Coast"
  if (/\b(cushing|midwest|oklahoma|wti hub)\b/.test(r)) return "US Midwest"
  if (/\b(singapore|malacca|straits|jurong)\b/.test(r)) return "Singapore & Malacca Straits"
  if (/\b(middle east|gulf|persian|arabian|fujairah|ras tanura|uae|saudi|hormuz)\b/.test(r)) {
    return "Middle East Gulf"
  }
  if (/\b(east asia|china|korea|japan|zhoushan|ulsan)\b/.test(r)) return "East Asia"
  if (/\b(south asia|india|jamnagar|sikka|pakistan)\b/.test(r)) return "South Asia"
  if (/\b(west africa|nigeria|togo|lome|ghana|ivory coast)\b/.test(r)) return "West Africa"
  if (/\b(southern africa|south africa|saldanha|durban)\b/.test(r)) return "Southern Africa"
  if (/\b(mediterranean|med|spain|egypt|algeciras|italy|greece)\b/.test(r)) return "Mediterranean"
  return null
}

export interface TerminalQuery {
  port?: string | null
  region?: string | null
  product?: string | null
  productClass?: StorageProductClass | null
  /** Minimum nameplate capacity (m³) a terminal must have. */
  minCapacityCbm?: number | null
}

/** Filter the catalogue by any combination of port, region, product and size. */
export function queryTerminals(q: TerminalQuery): {
  terminals: TankTerminal[]
  resolvedRegion: StorageRegion | null
  resolvedClass: StorageProductClass | null
} {
  const resolvedRegion = q.region ? inferRegion(q.region) : null
  const resolvedClass = q.productClass ?? (q.product ? inferStorageClass(q.product) : null)

  const terminals = TANK_TERMINALS.filter((t) => {
    if (q.port && !loose(t.port, q.port)) return false
    if (resolvedRegion && t.region !== resolvedRegion) return false
    // If the caller named a region we couldn't resolve, still try a loose match.
    if (q.region && !resolvedRegion && !loose(t.region, q.region) && !loose(t.country, q.region)) return false
    if (resolvedClass && !t.productClasses.includes(resolvedClass)) return false
    if (q.minCapacityCbm && t.capacityCbm < q.minCapacityCbm) return false
    return true
  }).sort((a, b) => b.capacityCbm - a.capacityCbm)

  return { terminals, resolvedRegion, resolvedClass }
}

/** Find a single terminal by id, name, or operator (best match). */
export function findTerminal(query: string): TankTerminal | null {
  const q = normalize(query)
  if (!q) return null
  return (
    TANK_TERMINALS.find((t) => normalize(t.id) === q) ??
    TANK_TERMINALS.find((t) => normalize(t.name) === q) ??
    TANK_TERMINALS.find((t) => loose(t.name, query)) ??
    TANK_TERMINALS.find((t) => loose(t.operator, query) && loose(t.port, query)) ??
    TANK_TERMINALS.find((t) => loose(t.operator, query)) ??
    null
  )
}

/** Format a capacity in m³ into a compact human string. */
export function formatCbm(cbm: number): string {
  if (cbm >= 1_000_000) return `${(cbm / 1_000_000).toLocaleString("en-US", { maximumFractionDigits: 2 })} million m³`
  return `${cbm.toLocaleString("en-US")} m³`
}

/** A compact projection of a terminal for tool output. */
export function projectTerminal(t: TankTerminal) {
  return {
    id: t.id,
    name: t.name,
    operator: t.operator,
    port: t.port,
    country: t.country,
    region: t.region,
    products: t.productClasses.map((c) => STORAGE_CLASS_LABELS[c]),
    productClasses: t.productClasses,
    nameplateCapacity: formatCbm(t.capacityCbm),
    capacityCbm: t.capacityCbm,
    tanks: t.tanks ?? null,
    connectivity: t.connectivity,
    services: t.services ?? [],
    note: t.note ?? null,
  }
}
