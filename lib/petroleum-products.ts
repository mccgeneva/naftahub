// Petroleum product catalog with the canonical trading unit for each grade.
//
// International petroleum markets price crude oil in BARRELS (bbl) and most
// refined products in METRIC TONNES (MT). A handful of grades (condensate,
// naphtha, VGO, fuel/marine oil cargoes) are quoted either way depending on the
// contract, so they are flagged `dualUnit` and the deal ticket lets the user
// pick. This catalog is the single source of truth the Commodity Trading "New
// deal" form uses to auto-apply the right unit — e.g. selecting "Jet A-1" locks
// the quantity unit to MT, while "Brent Crude" locks it to bbl.

export type CommodityUnit = "bbl" | "MT"

export interface CatalogProduct {
  /** Stable id used as the <Select> value. */
  id: string
  name: string
  /** Short plain-language spec so buyers pick exactly the right grade. */
  description?: string
  category: CommodityCategory
  /** Canonical/default trading unit. */
  unit: CommodityUnit
  /** True when the grade is commonly quoted in EITHER bbl or MT. */
  dualUnit?: boolean
  /**
   * Barrels per metric tonne for this grade. There is NO universal bbl↔MT
   * conversion — it depends on density (API gravity) — so each grade carries
   * its own factor (e.g. Brent ≈ 7.33, EN590 ≈ 7.45, Jet A-1 ≈ 7.9,
   * FO 380 ≈ 6.35, LPG ≈ 11.6). Used by the deal ticket's bbl↔MT converter.
   */
  bblPerMt?: number
}

/** Fallback factor for a generic light/medium petroleum stream (~7.5 bbl/MT). */
export const DEFAULT_BBL_PER_MT = 7.5

export type CommodityCategory =
  | "Crude Oil"
  | "Gasoline"
  | "Diesel & Gasoil"
  | "Jet Fuel & Kerosene"
  | "Fuel Oils"
  | "LPG & LNG"
  | "Petrochemical Feedstocks"
  | "Base Oils & Lubricants"
  | "Asphalt & Residues"

export const COMMODITY_CATEGORIES: CommodityCategory[] = [
  "Crude Oil",
  "Gasoline",
  "Diesel & Gasoil",
  "Jet Fuel & Kerosene",
  "Fuel Oils",
  "LPG & LNG",
  "Petrochemical Feedstocks",
  "Base Oils & Lubricants",
  "Asphalt & Residues",
]

// Sentinel id for the "Other / custom commodity" option, where the user types
// the commodity name and chooses the unit manually (non-petroleum, e.g. metals).
export const CUSTOM_COMMODITY_ID = "__custom__"

export const PETROLEUM_PRODUCTS: CatalogProduct[] = [
  // --- Crude oil — barrels (bbl) ---
  { id: "brent", name: "Brent Crude", description: "Light sweet North Sea benchmark, ~38° API, low sulphur.", category: "Crude Oil", unit: "bbl" },
  { id: "wti", name: "WTI Crude", description: "US light sweet benchmark, ~39.6° API, very low sulphur.", category: "Crude Oil", unit: "bbl", bblPerMt: 7.57 },
  { id: "dubai", name: "Dubai Crude", description: "Medium sour Middle East benchmark for Asian exports.", category: "Crude Oil", unit: "bbl" },
  { id: "oman", name: "Oman Crude", description: "Medium sour DME-traded Middle East export grade.", category: "Crude Oil", unit: "bbl" },
  { id: "bonny-light", name: "Bonny Light", description: "Nigerian light sweet crude, ~35° API, very low sulphur.", category: "Crude Oil", unit: "bbl" },
  { id: "arab-light", name: "Arab Light", description: "Saudi light sour benchmark crude, ~33° API.", category: "Crude Oil", unit: "bbl" },
  { id: "arab-heavy", name: "Arab Heavy", description: "Saudi heavy sour crude, ~27° API, high sulphur.", category: "Crude Oil", unit: "bbl", bblPerMt: 6.98 },
  { id: "urals", name: "Urals Crude", description: "Russian medium sour export blend, ~31° API.", category: "Crude Oil", unit: "bbl" },
  { id: "basrah-light", name: "Basrah Light", description: "Iraqi medium sour export crude.", category: "Crude Oil", unit: "bbl" },
  { id: "espo", name: "ESPO Crude", description: "East Siberian medium sweet crude for Asian markets.", category: "Crude Oil", unit: "bbl" },
  { id: "murban", name: "Murban Crude", description: "Abu Dhabi light sour crude, ~40° API, IFAD-traded.", category: "Crude Oil", unit: "bbl", bblPerMt: 7.62 },
  { id: "maya", name: "Maya Crude", description: "Mexican heavy sour crude, ~22° API.", category: "Crude Oil", unit: "bbl", bblPerMt: 6.86 },

  // --- Gasoline — metric tonnes (MT) ---
  { id: "gasoline-87", name: "Gasoline 87 RON", description: "Regular unleaded motor gasoline, 87 octane.", category: "Gasoline", unit: "MT" },
  { id: "gasoline-91", name: "Gasoline 91 RON", description: "Mid-grade unleaded gasoline, 91 octane.", category: "Gasoline", unit: "MT" },
  { id: "gasoline-92", name: "Gasoline 92 RON", description: "Regular unleaded gasoline, 92 octane (Asia/Africa spec).", category: "Gasoline", unit: "MT" },
  { id: "gasoline-95", name: "Gasoline 95 RON", description: "Premium unleaded gasoline, 95 octane (Euro spec).", category: "Gasoline", unit: "MT" },
  { id: "gasoline-98", name: "Gasoline 98 RON", description: "Super premium unleaded gasoline, 98 octane.", category: "Gasoline", unit: "MT" },
  { id: "rfg", name: "Reformulated Gasoline", description: "Cleaner-burning gasoline blended for lower emissions.", category: "Gasoline", unit: "MT" },
  { id: "pms", name: "Premium Motor Spirit (PMS)", description: "Retail motor gasoline, common African market grade.", category: "Gasoline", unit: "MT" },

  // --- Diesel & gasoil — metric tonnes (MT) ---
  { id: "en590-10", name: "EN590 10ppm Diesel", description: "Euro-V automotive diesel, 10 ppm sulphur (ULSD spec).", category: "Diesel & Gasoil", unit: "MT" },
  { id: "en590-50", name: "EN590 50ppm Diesel", description: "EN590 automotive diesel, 50 ppm sulphur.", category: "Diesel & Gasoil", unit: "MT" },
  { id: "ago", name: "Automotive Gas Oil (AGO)", description: "Standard road diesel / gas oil.", category: "Diesel & Gasoil", unit: "MT" },
  { id: "ulsd", name: "Ultra Low Sulfur Diesel (ULSD)", description: "Distillate diesel, ≤15 ppm sulphur.", category: "Diesel & Gasoil", unit: "MT" },
  { id: "d2", name: "Diesel D2", description: "GOST gas oil L-0.2-62, ~0.2% sulphur (CIS grade).", category: "Diesel & Gasoil", unit: "MT" },
  { id: "d6", name: "Diesel D6", description: "Residual virgin fuel oil for power generation.", category: "Diesel & Gasoil", unit: "MT" },
  { id: "mdo", name: "Marine Diesel Oil (MDO)", description: "Distillate/residual blend marine bunker fuel.", category: "Diesel & Gasoil", unit: "MT" },
  { id: "mgo", name: "Marine Gas Oil (MGO)", description: "Pure distillate marine bunker fuel (DMA).", category: "Diesel & Gasoil", unit: "MT" },

  // --- Jet fuel & kerosene — metric tonnes (MT) ---
  { id: "jet-a1", name: "Jet A-1", description: "Aviation kerosene, −47°C freeze point, global jet spec.", category: "Jet Fuel & Kerosene", unit: "MT" },
  { id: "jet-a", name: "Jet A", description: "Aviation kerosene, −40°C freeze point (US spec).", category: "Jet Fuel & Kerosene", unit: "MT" },
  { id: "jp54", name: "JP54", description: "Colonial Grade 54 aviation fuel (Jet A-1 equivalent).", category: "Jet Fuel & Kerosene", unit: "MT" },
  { id: "ts1", name: "TS-1 Jet Fuel", description: "Russian/CIS aviation kerosene, GOST 10227.", category: "Jet Fuel & Kerosene", unit: "MT" },
  { id: "atf", name: "Aviation Turbine Fuel (ATF)", description: "Kerosene-type turbine jet fuel.", category: "Jet Fuel & Kerosene", unit: "MT" },
  { id: "dpk", name: "Dual Purpose Kerosene (DPK)", description: "Kerosene for both aviation and illuminating use.", category: "Jet Fuel & Kerosene", unit: "MT" },
  { id: "kerosene-illum", name: "Illuminating Kerosene", description: "Kerosene for lighting and heating.", category: "Jet Fuel & Kerosene", unit: "MT" },
  { id: "kerosene-household", name: "Household Kerosene", description: "Domestic kerosene for cooking and heating.", category: "Jet Fuel & Kerosene", unit: "MT" },

  // --- Fuel oils — metric tonnes (MT); cargoes occasionally quoted in bbl ---
  { id: "fo-180", name: "Fuel Oil CST 180", description: "Intermediate fuel oil, 180 cSt viscosity bunker grade.", category: "Fuel Oils", unit: "MT", dualUnit: true },
  { id: "fo-380", name: "Fuel Oil CST 380", description: "Heavy fuel oil, 380 cSt viscosity bunker grade.", category: "Fuel Oils", unit: "MT", dualUnit: true },
  { id: "fo-500", name: "Fuel Oil 500 CST", description: "Heavy fuel oil, 500 cSt viscosity.", category: "Fuel Oils", unit: "MT", dualUnit: true },
  { id: "hsfo", name: "High Sulfur Fuel Oil (HSFO)", description: "Residual fuel oil, >0.5% sulphur (non-scrubber).", category: "Fuel Oils", unit: "MT", dualUnit: true },
  { id: "vlsfo", name: "Very Low Sulfur Fuel Oil (VLSFO)", description: "Residual fuel oil, ≤0.5% sulphur (IMO 2020 spec).", category: "Fuel Oils", unit: "MT", dualUnit: true },
  { id: "lsfo", name: "Low Sulfur Fuel Oil (LSFO)", description: "Residual fuel oil, ≤1.0% sulphur.", category: "Fuel Oils", unit: "MT", dualUnit: true },
  { id: "residual-fo", name: "Residual Fuel Oil", description: "Heavy residual bottoms for boilers and power.", category: "Fuel Oils", unit: "MT", dualUnit: true },
  { id: "bunker", name: "Bunker Fuel", description: "Marine bunker fuel for ship propulsion.", category: "Fuel Oils", unit: "MT", dualUnit: true },

  // --- LPG & LNG — metric tonnes (MT) ---
  { id: "lpg", name: "Liquefied Petroleum Gas (LPG)", description: "Propane/butane mix for heating and autogas.", category: "LPG & LNG", unit: "MT" },
  { id: "propane", name: "Propane", description: "Propane (C3) for heating and petrochemical feed.", category: "LPG & LNG", unit: "MT" },
  { id: "butane", name: "Butane", description: "Butane (C4) for blending and petrochemical feed.", category: "LPG & LNG", unit: "MT" },
  { id: "mixed-lpg", name: "Mixed LPG", description: "Mixed propane/butane LPG stream.", category: "LPG & LNG", unit: "MT" },
  { id: "lng", name: "Liquefied Natural Gas (LNG)", description: "Cryogenic liquefied methane (natural gas).", category: "LPG & LNG", unit: "MT" },

  // --- Petrochemical feedstocks — metric tonnes (MT); some dual-unit ---
  { id: "naphtha", name: "Naphtha", description: "Steam-cracker and gasoline blending feedstock.", category: "Petrochemical Feedstocks", unit: "MT", dualUnit: true },
  { id: "naphtha-heavy", name: "Heavy Naphtha", description: "Reformer feed for aromatics production.", category: "Petrochemical Feedstocks", unit: "MT", dualUnit: true },
  { id: "naphtha-light", name: "Light Naphtha", description: "Cracker feed for olefins (ethylene/propylene).", category: "Petrochemical Feedstocks", unit: "MT", dualUnit: true },
  { id: "condensate", name: "Condensate", description: "Ultra-light natural gas condensate.", category: "Petrochemical Feedstocks", unit: "bbl", dualUnit: true },
  { id: "ethane", name: "Ethane", description: "Ethane (C2) ethylene cracker feedstock.", category: "Petrochemical Feedstocks", unit: "MT" },
  { id: "propane-feed", name: "Propane Feedstock", description: "Propane for petrochemical cracking.", category: "Petrochemical Feedstocks", unit: "MT" },
  { id: "butane-feed", name: "Butane Feedstock", description: "Butane for petrochemical cracking.", category: "Petrochemical Feedstocks", unit: "MT" },
  { id: "vgo", name: "Vacuum Gas Oil (VGO)", description: "FCC / hydrocracker feedstock.", category: "Petrochemical Feedstocks", unit: "MT", dualUnit: true },

  // --- Base oils & lubricants — metric tonnes (MT) ---
  { id: "sn150", name: "Base Oil SN150", description: "Solvent Neutral 150 — low-viscosity Group I base oil.", category: "Base Oils & Lubricants", unit: "MT" },
  { id: "sn350", name: "Base Oil SN350", description: "Solvent Neutral 350 — medium-viscosity base oil.", category: "Base Oils & Lubricants", unit: "MT" },
  { id: "sn500", name: "Base Oil SN500", description: "Solvent Neutral 500 — high-viscosity base oil.", category: "Base Oils & Lubricants", unit: "MT" },
  { id: "sn900", name: "Base Oil SN900", description: "Solvent Neutral 900 — heavy base oil.", category: "Base Oils & Lubricants", unit: "MT" },
  { id: "bright-stock", name: "Bright Stock", description: "Heavy residual base oil for high-viscosity blends.", category: "Base Oils & Lubricants", unit: "MT" },
  { id: "lube-oil", name: "Lubricating Oil", description: "Finished lubricating oil.", category: "Base Oils & Lubricants", unit: "MT" },

  // --- Asphalt & residues — metric tonnes (MT) ---
  { id: "bitumen-60-70", name: "Bitumen 60/70", description: "Penetration-grade 60/70 paving bitumen.", category: "Asphalt & Residues", unit: "MT" },
  { id: "bitumen-80-100", name: "Bitumen 80/100", description: "Penetration-grade 80/100 paving bitumen.", category: "Asphalt & Residues", unit: "MT" },
  { id: "asphalt", name: "Asphalt", description: "Bitumen binder for road construction.", category: "Asphalt & Residues", unit: "MT" },
  { id: "petcoke", name: "Petroleum Coke (Pet Coke)", description: "Solid carbon fuel / anode feedstock.", category: "Asphalt & Residues", unit: "MT" },
  { id: "sulfur", name: "Sulfur", description: "Elemental sulphur recovered from refining.", category: "Asphalt & Residues", unit: "MT" },
  { id: "slurry", name: "Slurry Oil", description: "Heavy FCC bottoms (carbon black feedstock).", category: "Asphalt & Residues", unit: "MT" },
]

/** Look up a catalog product by id. */
export function getCatalogProduct(id: string): CatalogProduct | undefined {
  return PETROLEUM_PRODUCTS.find((p) => p.id === id)
}

/** Human-readable label for a unit. */
export function unitLabel(unit: CommodityUnit): string {
  return unit === "bbl" ? "Barrels (bbl)" : "Metric Tonnes (MT)"
}

// Typical barrels-per-tonne by product family (density driven). Used when a
// specific grade does not carry its own `bblPerMt`. Heavier products yield
// fewer barrels per tonne; lighter products (LPG) yield more.
const CATEGORY_BBL_PER_MT: Record<CommodityCategory, number> = {
  "Crude Oil": 7.33,
  Gasoline: 8.5,
  "Diesel & Gasoil": 7.45,
  "Jet Fuel & Kerosene": 7.9,
  "Fuel Oils": 6.35,
  "LPG & LNG": 11.6,
  "Petrochemical Feedstocks": 8.9,
  "Base Oils & Lubricants": 7.0,
  "Asphalt & Residues": 6.06,
}

/**
 * Resolve the barrels-per-tonne factor for a grade: the product's own
 * `bblPerMt` if defined, otherwise its category default, otherwise a generic
 * light/medium stream. Conversion is approximate and density dependent.
 */
export function bblPerMtFor(product?: CatalogProduct): number {
  if (product?.bblPerMt) return product.bblPerMt
  if (product) return CATEGORY_BBL_PER_MT[product.category] ?? DEFAULT_BBL_PER_MT
  return DEFAULT_BBL_PER_MT
}

/**
 * Convert a quantity between bbl and MT using the grade's density factor.
 * Returns the converted amount (not rounded); the caller formats for display.
 * `MT × bblPerMt = bbl`, so `bbl ÷ bblPerMt = MT`.
 */
export function convertQuantity(
  amount: number,
  from: CommodityUnit,
  to: CommodityUnit,
  product?: CatalogProduct,
): number {
  if (from === to) return amount
  const factor = bblPerMtFor(product)
  return from === "MT" ? amount * factor : amount / factor
}

/**
 * Parse a free-form quantity string ("200,000 MT", "500,000 BBL") into a numeric
 * amount and normalised unit. Returns null when no amount can be parsed.
 */
export function parseQuantityString(quantity?: string): { amount: number; unit: CommodityUnit } | null {
  const match = (quantity || "").match(/([\d.,]+)\s*([A-Za-z]+)?/)
  if (!match) return null
  const amount = Number.parseFloat(match[1].replace(/,/g, ""))
  if (!Number.isFinite(amount) || amount <= 0) return null
  const unit: CommodityUnit = (match[2] || "MT").toUpperCase().startsWith("B") ? "bbl" : "MT"
  return { amount, unit }
}

/** Best-effort match of a commodity name to a catalogue grade for its density factor. */
export function catalogForCommodityName(name?: string): CatalogProduct | undefined {
  if (!name) return undefined
  const n = name.toLowerCase()
  return PETROLEUM_PRODUCTS.find((p) => n.includes(p.name.toLowerCase()) || p.name.toLowerCase().includes(n))
}

/**
 * Format an ordered quantity in its native unit plus the converted equivalent,
 * e.g. "200,000 MT (≈ 1,490,000 BBL)", so the buyer always sees both barrels and
 * tonnes. Falls back to the raw string (or "—") when it cannot be parsed.
 */
export function formatQuantityWithEquivalent(quantity?: string, commodityName?: string): string {
  const parsed = parseQuantityString(quantity)
  if (!parsed) return quantity || "—"
  const product = catalogForCommodityName(commodityName)
  const other: CommodityUnit = parsed.unit === "MT" ? "bbl" : "MT"
  const converted = convertQuantity(parsed.amount, parsed.unit, other, product)
  if (!Number.isFinite(converted) || converted <= 0) return quantity || "—"
  const rounded = other === "bbl" ? Math.round(converted) : Math.round(converted * 1000) / 1000
  const nativeLabel = parsed.unit === "bbl" ? "BBL" : "MT"
  const otherLabel = other === "bbl" ? "BBL" : "MT"
  return `${parsed.amount.toLocaleString("en-US")} ${nativeLabel} (≈ ${rounded.toLocaleString("en-US")} ${otherLabel})`
}

/**
 * Derive a per-unit price string from a total value and quantity, e.g.
 * "USD 691.62 / MT". Returns null when the quantity cannot be parsed.
 */
export function formatUnitPriceFor(totalValue: number, quantity: string | undefined, currency: string): string | null {
  const parsed = parseQuantityString(quantity)
  if (!parsed || !Number.isFinite(totalValue) || totalValue <= 0) return null
  const perUnit = totalValue / parsed.amount
  const unitLabel = parsed.unit === "bbl" ? "BBL" : "MT"
  return `${currency} ${perUnit.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })} / ${unitLabel}`
}
