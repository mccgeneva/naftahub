// Commodity quotations engine for the Commodity Trading desk.
//
// There is no live market-data integration available in this environment, so
// this module produces realistic, *deterministic* near-real-time quotations:
//   - A stable daily base price per product (seeded by the calendar day) so the
//     board does not jump on every render and is consistent across the session.
//   - A small intraday wobble (seeded by the day + hour) to convey "live" motion.
//   - A per-port FOB differential (loading-region premium/discount).
//   - A CIF premium over FOB (freight + insurance) that scales with the port's
//     freight tier and the product's volatility.
//
// Everything is pure and deterministic for a given (date, hour) so server and
// client renders agree and prices only move on a real time boundary.

export type PriceBasis = "FOB" | "CIF"

export type ProductCategory =
  | "Crude Oil"
  | "LPG & Gas"
  | "Light Distillates"
  | "Middle Distillates"
  | "Fuel Oils & Residuals"
  | "Specialities"

export interface PetroleumProduct {
  /** Stable id used for filtering. */
  id: string
  name: string
  category: ProductCategory
  /** Pricing unit, e.g. "bbl" (barrel) or "MT" (metric tonne). */
  unit: "bbl" | "MT"
  /** Reference USD base price used as the daily anchor. */
  base: number
  /** Relative daily volatility (fraction). Higher = larger daily swings. */
  volatility: number
}

export interface Port {
  id: string
  name: string
  country: string
  region: string
  /**
   * FOB differential vs the global base, as a fraction (e.g. +0.015 = +1.5%).
   * Reflects loading-region quality/logistics premium or discount.
   */
  fobDiff: number
  /** Freight tier 1-3 driving the CIF premium over FOB. */
  freightTier: 1 | 2 | 3
}

// --- Ports & terminals (major world petroleum hubs) --------------------------

export const PORTS: Port[] = [
  { id: "ras-tanura", name: "Ras Tanura", country: "Saudi Arabia", region: "Middle East Gulf", fobDiff: 0.004, freightTier: 2 },
  { id: "juaymah", name: "Ju'aymah", country: "Saudi Arabia", region: "Middle East Gulf", fobDiff: 0.003, freightTier: 2 },
  { id: "yanbu", name: "Yanbu", country: "Saudi Arabia", region: "Red Sea", fobDiff: 0.006, freightTier: 2 },
  { id: "ras-laffan", name: "Ras Laffan", country: "Qatar", region: "Middle East Gulf", fobDiff: 0.002, freightTier: 2 },
  { id: "fujairah", name: "Fujairah", country: "UAE", region: "Gulf of Oman", fobDiff: 0.009, freightTier: 2 },
  { id: "mina-al-ahmadi", name: "Mina Al Ahmadi", country: "Kuwait", region: "Middle East Gulf", fobDiff: 0.005, freightTier: 2 },
  { id: "basra", name: "Basra Oil Terminal", country: "Iraq", region: "Middle East Gulf", fobDiff: -0.008, freightTier: 2 },
  { id: "kharg", name: "Kharg Island", country: "Iran", region: "Middle East Gulf", fobDiff: -0.012, freightTier: 3 },
  { id: "corpus-christi", name: "Corpus Christi", country: "United States", region: "US Gulf Coast", fobDiff: 0.011, freightTier: 2 },
  { id: "houston", name: "Houston", country: "United States", region: "US Gulf Coast", fobDiff: 0.012, freightTier: 2 },
  { id: "sidi-kerir", name: "Sidi Kerir", country: "Egypt", region: "Mediterranean", fobDiff: 0.007, freightTier: 1 },
  { id: "ceyhan", name: "Ceyhan", country: "Türkiye", region: "Mediterranean", fobDiff: 0.005, freightTier: 1 },
  { id: "trieste", name: "Trieste", country: "Italy", region: "Mediterranean", fobDiff: 0.013, freightTier: 1 },
  { id: "marseille-fos", name: "Marseille-Fos", country: "France", region: "Mediterranean", fobDiff: 0.014, freightTier: 1 },
  { id: "rotterdam", name: "Rotterdam", country: "Netherlands", region: "Northwest Europe", fobDiff: 0.015, freightTier: 1 },
  { id: "antwerp-bruges", name: "Antwerp-Bruges", country: "Belgium", region: "Northwest Europe", fobDiff: 0.014, freightTier: 1 },
  { id: "sullom-voe", name: "Sullom Voe", country: "United Kingdom", region: "North Sea", fobDiff: 0.016, freightTier: 1 },
  { id: "primorsk", name: "Primorsk", country: "Russia", region: "Baltic", fobDiff: -0.018, freightTier: 2 },
  { id: "ust-luga", name: "Ust-Luga", country: "Russia", region: "Baltic", fobDiff: -0.02, freightTier: 2 },
  { id: "novorossiysk", name: "Novorossiysk", country: "Russia", region: "Black Sea", fobDiff: -0.017, freightTier: 2 },
  { id: "bonny", name: "Bonny", country: "Nigeria", region: "West Africa", fobDiff: 0.008, freightTier: 3 },
  { id: "singapore-jurong", name: "Singapore (Jurong)", country: "Singapore", region: "Southeast Asia", fobDiff: 0.012, freightTier: 2 },
  { id: "qingdao", name: "Qingdao", country: "China", region: "North Asia", fobDiff: 0.01, freightTier: 3 },
  { id: "dalian", name: "Dalian", country: "China", region: "North Asia", fobDiff: 0.009, freightTier: 3 },
]

// --- Products (crude grades + refined products) ------------------------------

export const PRODUCTS: PetroleumProduct[] = [
  // Crude grades (per barrel)
  { id: "brent", name: "Brent Blend", category: "Crude Oil", unit: "bbl", base: 82.4, volatility: 0.018 },
  { id: "wti", name: "WTI (West Texas Intermediate)", category: "Crude Oil", unit: "bbl", base: 78.1, volatility: 0.019 },
  { id: "dubai", name: "Dubai Crude", category: "Crude Oil", unit: "bbl", base: 80.2, volatility: 0.017 },
  { id: "oman", name: "Oman Crude", category: "Crude Oil", unit: "bbl", base: 80.6, volatility: 0.017 },
  { id: "arab-light", name: "Arab Light", category: "Crude Oil", unit: "bbl", base: 83.9, volatility: 0.016 },
  { id: "bonny-light", name: "Bonny Light", category: "Crude Oil", unit: "bbl", base: 83.2, volatility: 0.02 },
  { id: "urals", name: "Urals", category: "Crude Oil", unit: "bbl", base: 69.8, volatility: 0.024 },
  { id: "espo", name: "ESPO Blend", category: "Crude Oil", unit: "bbl", base: 79.3, volatility: 0.021 },
  { id: "maya", name: "Maya Heavy", category: "Crude Oil", unit: "bbl", base: 72.9, volatility: 0.022 },

  // LPG & gas (per MT)
  { id: "lpg-propane", name: "LPG — Propane", category: "LPG & Gas", unit: "MT", base: 612, volatility: 0.025 },
  { id: "lpg-butane", name: "LPG — Butane", category: "LPG & Gas", unit: "MT", base: 638, volatility: 0.025 },

  // Light distillates (per MT)
  { id: "naphtha", name: "Naphtha", category: "Light Distillates", unit: "MT", base: 686, volatility: 0.022 },
  { id: "gasoline-92", name: "Gasoline RON 92", category: "Light Distillates", unit: "MT", base: 742, volatility: 0.021 },
  { id: "gasoline-95", name: "Gasoline RON 95", category: "Light Distillates", unit: "MT", base: 776, volatility: 0.021 },
  { id: "gasoline-98", name: "Gasoline RON 98", category: "Light Distillates", unit: "MT", base: 812, volatility: 0.021 },

  // Middle distillates (per MT)
  { id: "jet-a1", name: "Jet A-1 / Aviation Kerosene", category: "Middle Distillates", unit: "MT", base: 772, volatility: 0.019 },
  { id: "en590", name: "Diesel EN590 10ppm", category: "Middle Distillates", unit: "MT", base: 764, volatility: 0.019 },
  { id: "ulsd", name: "ULSD (Ultra-Low Sulphur Diesel)", category: "Middle Distillates", unit: "MT", base: 758, volatility: 0.019 },
  { id: "gasoil-50", name: "Gasoil 50ppm", category: "Middle Distillates", unit: "MT", base: 745, volatility: 0.019 },

  // Fuel oils & residuals (per MT)
  { id: "vlsfo", name: "VLSFO 0.5%", category: "Fuel Oils & Residuals", unit: "MT", base: 601, volatility: 0.02 },
  { id: "hsfo-380", name: "Fuel Oil 380 CST (HSFO)", category: "Fuel Oils & Residuals", unit: "MT", base: 482, volatility: 0.023 },
  { id: "hsfo-180", name: "Fuel Oil 180 CST", category: "Fuel Oils & Residuals", unit: "MT", base: 498, volatility: 0.023 },
  { id: "mgo", name: "Marine Gasoil (MGO)", category: "Fuel Oils & Residuals", unit: "MT", base: 783, volatility: 0.019 },

  // Specialities (per MT)
  { id: "bitumen", name: "Bitumen 60/70", category: "Specialities", unit: "MT", base: 421, volatility: 0.016 },
  { id: "petcoke", name: "Petroleum Coke (Petcoke)", category: "Specialities", unit: "MT", base: 124, volatility: 0.026 },
  { id: "base-oil", name: "Base Oil Group II", category: "Specialities", unit: "MT", base: 1142, volatility: 0.015 },
]

export const PRODUCT_CATEGORIES: ProductCategory[] = [
  "Crude Oil",
  "LPG & Gas",
  "Light Distillates",
  "Middle Distillates",
  "Fuel Oils & Residuals",
  "Specialities",
]

// --- bbl <-> MT conversion ---------------------------------------------------

/**
 * Typical barrels per metric tonne by product family. There is NO universal
 * bbl<->MT conversion — it is density (API gravity) driven — so each family
 * carries a representative factor (lighter products yield more barrels/tonne).
 */
const BBL_PER_MT_BY_CATEGORY: Record<ProductCategory, number> = {
  "Crude Oil": 7.33,
  "LPG & Gas": 11.6,
  "Light Distillates": 8.5, // naphtha / gasoline
  "Middle Distillates": 7.75, // jet / diesel / gasoil (Jet A-1 ~7.9, EN590 ~7.45)
  "Fuel Oils & Residuals": 6.35,
  Specialities: 6.5, // bitumen / base oils / petcoke
}

/** Per-grade overrides where the grade deviates from its family default. */
const BBL_PER_MT_BY_PRODUCT: Record<string, number> = {
  wti: 7.57,
  maya: 6.86,
  "jet-a1": 7.9,
  en590: 7.45,
  ulsd: 7.46,
  "gasoil-50": 7.45,
  bitumen: 6.06,
  petcoke: 5.5,
}

/** Resolve the barrels-per-tonne factor for a product (override → family). */
export function bblPerMtFor(product: PetroleumProduct): number {
  return BBL_PER_MT_BY_PRODUCT[product.id] ?? BBL_PER_MT_BY_CATEGORY[product.category] ?? 7.5
}

/**
 * Convert an amount between bbl and MT for a given product. Density driven, so
 * the factor comes from the product. `MT × factor = bbl`, `bbl ÷ factor = MT`.
 */
export function convertQuantity(
  amount: number,
  from: "bbl" | "MT",
  to: "bbl" | "MT",
  product: PetroleumProduct,
): number {
  if (from === to) return amount
  const factor = bblPerMtFor(product)
  return from === "MT" ? amount * factor : amount / factor
}

// --- Deterministic pricing ---------------------------------------------------

/** Deterministic string hash → 32-bit unsigned int. */
function hashSeed(str: string): number {
  let h = 2166136261
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

/** Mulberry32 PRNG → deterministic float in [0, 1). */
function rng(seed: number): number {
  let t = (seed += 0x6d2b79f5)
  t = Math.imul(t ^ (t >>> 15), t | 1)
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296
}

/** A signed factor in [-1, 1] derived deterministically from a key. */
function signedFactor(key: string): number {
  return rng(hashSeed(key)) * 2 - 1
}

export interface Quote {
  product: PetroleumProduct
  port: Port
  basis: PriceBasis
  price: number
  /** Day-over-day change as a fraction (e.g. 0.012 = +1.2%). */
  changePct: number
}

const dayKey = (d: Date) => `${d.getUTCFullYear()}-${d.getUTCMonth()}-${d.getUTCDate()}`

/**
 * Competitive market discount applied to every live quotation to keep the desk
 * attractive vs. the wider market: -5% for barrel-priced (bbl) products and
 * -10% for metric-ton-priced (MT) products. Applied uniformly to FOB and CIF.
 */
export const MARKET_DISCOUNT: Record<"bbl" | "MT", number> = {
  bbl: 0.05,
  MT: 0.1,
}

function discountFactor(product: PetroleumProduct): number {
  return 1 - (MARKET_DISCOUNT[product.unit] ?? 0)
}

/** Daily anchor price for a product (stable for the whole calendar day). */
function dailyBase(product: PetroleumProduct, d: Date): number {
  const today = signedFactor(`${product.id}|${dayKey(d)}`)
  return product.base * (1 + today * product.volatility)
}

/**
 * Compute a single quotation for a product at a port on a given basis.
 * `now` defaults to the current time; prices only move on the hour.
 */
export function getQuote(
  product: PetroleumProduct,
  port: Port,
  basis: PriceBasis,
  now: Date = new Date(),
): Quote {
  const base = dailyBase(product, now)

  // Previous-day base to derive a day-over-day change.
  const yesterday = new Date(now)
  yesterday.setUTCDate(now.getUTCDate() - 1)
  const prevBase = dailyBase(product, yesterday)

  // Intraday wobble seeded by the hour so the board "ticks" hourly.
  const hour = now.getUTCHours()
  const wobble = signedFactor(`${product.id}|${port.id}|${dayKey(now)}|${hour}`) * product.volatility * 0.25

  // Competitive market discount (-5%/bbl, -10%/MT) applied to all quotations.
  const discount = discountFactor(product)

  // FOB = daily base × port differential × intraday wobble × market discount.
  const fob = base * (1 + port.fobDiff) * (1 + wobble) * discount

  // CIF premium over FOB scales with freight tier and product volatility.
  const cifPremium = (0.012 + port.freightTier * 0.009 + product.volatility * 0.4)
  const price = basis === "CIF" ? fob * (1 + cifPremium) : fob

  const prevFob = prevBase * (1 + port.fobDiff) * discount
  const prevPrice = basis === "CIF" ? prevFob * (1 + cifPremium) : prevFob
  const changePct = (price - prevPrice) / prevPrice

  return { product, port, basis, price, changePct }
}

/** Format a quotation price with its unit. */
export function formatQuotePrice(price: number, unit: "bbl" | "MT"): string {
  return `$${price.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}/${unit}`
}
