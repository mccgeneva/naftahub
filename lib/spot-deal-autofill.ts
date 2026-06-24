// ---------------------------------------------------------------------------
// Spot Deal smart-flow helpers.
//
// Pure + import-safe on BOTH client and server (no `pg`, no `server-only`).
// Powers the product-driven "Create Spot Deal" form in the admin panel:
//   1. Product → which tanker families can legally carry it (vessel filtering).
//   2. Vessel → a sensible "quantity available" from its cargo capacity.
//   3. Product + load port + incoterm → a suggested spot price, reusing the
//      deterministic commodity-quotation engine (market price − desk discount).
//
// Every output is a SUGGESTION the admin can override; nothing here mutates
// state or talks to the network.
// ---------------------------------------------------------------------------

import {
  getCatalogProduct,
  bblPerMtFor as catalogBblPerMt,
  type CommodityCategory,
  type CommodityUnit,
} from "@/lib/petroleum-products"
import { VESSEL_TYPES, type Vessel, type VesselType } from "@/lib/spot-deals-shared"
import {
  PRODUCTS,
  PORTS,
  getQuote,
  type Port,
  type PetroleumProduct,
  type ProductCategory,
  type PriceBasis,
} from "@/lib/commodity-quotations"

// --- Product ↔ vessel compatibility -----------------------------------------

/**
 * Which tanker families may carry each product category. Crude grades load on
 * crude tankers; refined "clean" and "dirty" products on product tankers;
 * LPG/LNG on gas carriers. Heavy/dirty streams (fuel oils, residues, some
 * feedstocks) can also move on crude tankers, so they list both.
 */
export const PRODUCT_VESSEL_COMPATIBILITY: Record<CommodityCategory, VesselType[]> = {
  "Crude Oil": ["crude"],
  Gasoline: ["product"],
  "Diesel & Gasoil": ["product"],
  "Jet Fuel & Kerosene": ["product"],
  "Fuel Oils": ["product", "crude"],
  "LPG & LNG": ["gas"],
  "Petrochemical Feedstocks": ["product", "crude"],
  "Base Oils & Lubricants": ["product"],
  "Asphalt & Residues": ["product"],
}

/** Compatible tanker families for a catalogue product id (all types if unknown). */
export function compatibleVesselTypesForProduct(productId: string): VesselType[] {
  const product = getCatalogProduct(productId)
  if (!product) return [...VESSEL_TYPES]
  return PRODUCT_VESSEL_COMPATIBILITY[product.category] ?? [...VESSEL_TYPES]
}

// --- Quantity suggestion from vessel capacity --------------------------------

/**
 * Suggest the "quantity available" from a vessel's cargo capacity. Oil tankers
 * are sized in DWT (≈ tonnes of cargo); a laden cargo is typically ~95% of DWT
 * after bunkers/stores. Gas carriers are sized in CBM, which is not a direct
 * mass, so we don't auto-fill those (admin enters it). When the deal is priced
 * in barrels we convert using the grade's density factor.
 */
export function suggestQuantity(
  vessel: Vessel | undefined,
  unit: CommodityUnit,
  productId?: string,
): number | null {
  if (!vessel || !vessel.capacity || vessel.capacityUnit !== "DWT") return null
  const cargoMt = Math.round(vessel.capacity * 0.95)
  if (cargoMt <= 0) return null
  if (unit === "MT") return cargoMt
  const factor = catalogBblPerMt(productId ? getCatalogProduct(productId) : undefined)
  return Math.round(cargoMt * factor)
}

// --- Spot price suggestion ---------------------------------------------------

// Map catalogue grades to the closest quotation product that carries a base
// price. Anything not listed falls back to a representative grade for its
// category (below), which is accurate enough for a starting suggestion.
const CATALOG_TO_QUOTE_ID: Record<string, string> = {
  // Crude
  brent: "brent",
  wti: "wti",
  dubai: "dubai",
  oman: "oman",
  "arab-light": "arab-light",
  "arab-heavy": "maya",
  "bonny-light": "bonny-light",
  urals: "urals",
  "basrah-light": "dubai",
  espo: "espo",
  murban: "arab-light",
  maya: "maya",
  // Gasoline
  "gasoline-92": "gasoline-92",
  "gasoline-95": "gasoline-95",
  "gasoline-98": "gasoline-98",
  "gasoline-91": "gasoline-92",
  "gasoline-87": "gasoline-92",
  rfg: "gasoline-95",
  pms: "gasoline-92",
  // Diesel & gasoil
  "en590-10": "en590",
  "en590-50": "gasoil-50",
  ago: "gasoil-50",
  ulsd: "ulsd",
  d2: "gasoil-50",
  mdo: "mgo",
  mgo: "mgo",
  // Jet & kero
  "jet-a1": "jet-a1",
  "jet-a": "jet-a1",
  jp54: "jet-a1",
  ts1: "jet-a1",
  atf: "jet-a1",
  // Fuel oils
  "fo-180": "hsfo-180",
  "fo-380": "hsfo-380",
  "fo-500": "hsfo-380",
  hsfo: "hsfo-380",
  vlsfo: "vlsfo",
  lsfo: "vlsfo",
  "residual-fo": "hsfo-380",
  bunker: "vlsfo",
  // LPG & LNG
  lpg: "lpg-propane",
  propane: "lpg-propane",
  butane: "lpg-butane",
  "mixed-lpg": "lpg-propane",
  // Feedstocks
  naphtha: "naphtha",
  "naphtha-heavy": "naphtha",
  "naphtha-light": "naphtha",
  condensate: "brent",
  // Base oils
  sn150: "base-oil",
  sn350: "base-oil",
  sn500: "base-oil",
  sn900: "base-oil",
  "bright-stock": "base-oil",
  "lube-oil": "base-oil",
  // Asphalt & residues
  "bitumen-60-70": "bitumen",
  "bitumen-80-100": "bitumen",
  asphalt: "bitumen",
  petcoke: "petcoke",
}

const CATALOG_CAT_TO_QUOTE_CAT: Record<CommodityCategory, ProductCategory> = {
  "Crude Oil": "Crude Oil",
  Gasoline: "Light Distillates",
  "Diesel & Gasoil": "Middle Distillates",
  "Jet Fuel & Kerosene": "Middle Distillates",
  "Fuel Oils": "Fuel Oils & Residuals",
  "LPG & LNG": "LPG & Gas",
  "Petrochemical Feedstocks": "Light Distillates",
  "Base Oils & Lubricants": "Specialities",
  "Asphalt & Residues": "Specialities",
}

function resolveQuoteProduct(productId: string): PetroleumProduct | null {
  const catalog = getCatalogProduct(productId)
  if (!catalog) return null
  const mapped = CATALOG_TO_QUOTE_ID[productId]
  if (mapped) {
    const found = PRODUCTS.find((p) => p.id === mapped)
    if (found) return found
  }
  const quoteCat = CATALOG_CAT_TO_QUOTE_CAT[catalog.category]
  return PRODUCTS.find((p) => p.category === quoteCat) ?? null
}

// Delivered-style incoterms price on a CIF (cost+insurance+freight) basis; the
// rest price on FOB. Drives the quotation engine's freight premium.
const CIF_BASIS_INCOTERMS = new Set(["CIF", "CFR", "DES", "DAP", "DDP"])
function basisForIncoterm(incoterm: string): PriceBasis {
  return CIF_BASIS_INCOTERMS.has((incoterm || "").toUpperCase()) ? "CIF" : "FOB"
}

// Neutral global hub used when no specific load port is chosen yet (no regional
// FOB differential, mid freight tier) so a price can still be suggested.
const GLOBAL_PORT: Port = {
  id: "__global__",
  name: "Global reference",
  country: "",
  region: "",
  fobDiff: 0,
  freightTier: 2,
}

export interface SpotPriceSuggestion {
  price: number
  unit: CommodityUnit
  currency: "USD"
  basis: PriceBasis
}

/**
 * Suggested spot price for a grade at a load port on the given incoterm basis,
 * already net of the desk's competitive market discount. Returns null when the
 * product is unknown. Price is expressed in the catalogue grade's native unit
 * (converted from the quotation unit when they differ, e.g. condensate).
 */
export function suggestSpotPrice(opts: {
  productId: string
  portId?: string
  incoterm: string
}): SpotPriceSuggestion | null {
  const catalog = getCatalogProduct(opts.productId)
  const quote = resolveQuoteProduct(opts.productId)
  if (!catalog || !quote) return null

  const port = (opts.portId && PORTS.find((p) => p.id === opts.portId)) || GLOBAL_PORT
  const basis = basisForIncoterm(opts.incoterm)
  let price = getQuote(quote, port, basis).price // per quote.unit

  if (quote.unit !== catalog.unit) {
    const factor = catalogBblPerMt(catalog)
    // price/MT → price/bbl divides by bbl-per-tonne; price/bbl → price/MT multiplies.
    price = quote.unit === "MT" ? price / factor : price * factor
  }

  return { price: Math.round(price * 100) / 100, unit: catalog.unit, currency: "USD", basis }
}

// --- Load port resolution ----------------------------------------------------

/** Find a known terminal whose name overlaps a free-form vessel location. */
export function findPortByLocation(location?: string): Port | null {
  const loc = (location || "").trim().toLowerCase()
  if (!loc) return null
  return (
    PORTS.find((p) => {
      const name = p.name.toLowerCase()
      return loc.includes(name) || name.includes(loc) || loc.includes(p.country.toLowerCase())
    }) ?? null
  )
}

/** Ports grouped by region for a tidy, populated load-port dropdown. */
export function portsByRegion(): { region: string; ports: Port[] }[] {
  const groups = new Map<string, Port[]>()
  for (const p of PORTS) {
    const list = groups.get(p.region) ?? []
    list.push(p)
    groups.set(p.region, list)
  }
  return [...groups.entries()].map(([region, ports]) => ({ region, ports }))
}
