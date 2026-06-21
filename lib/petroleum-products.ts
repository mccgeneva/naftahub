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
  category: CommodityCategory
  /** Canonical/default trading unit. */
  unit: CommodityUnit
  /** True when the grade is commonly quoted in EITHER bbl or MT. */
  dualUnit?: boolean
}

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
  { id: "brent", name: "Brent Crude", category: "Crude Oil", unit: "bbl" },
  { id: "wti", name: "WTI Crude", category: "Crude Oil", unit: "bbl" },
  { id: "dubai", name: "Dubai Crude", category: "Crude Oil", unit: "bbl" },
  { id: "oman", name: "Oman Crude", category: "Crude Oil", unit: "bbl" },
  { id: "bonny-light", name: "Bonny Light", category: "Crude Oil", unit: "bbl" },
  { id: "arab-light", name: "Arab Light", category: "Crude Oil", unit: "bbl" },
  { id: "arab-heavy", name: "Arab Heavy", category: "Crude Oil", unit: "bbl" },
  { id: "urals", name: "Urals Crude", category: "Crude Oil", unit: "bbl" },
  { id: "basrah-light", name: "Basrah Light", category: "Crude Oil", unit: "bbl" },
  { id: "espo", name: "ESPO Crude", category: "Crude Oil", unit: "bbl" },
  { id: "murban", name: "Murban Crude", category: "Crude Oil", unit: "bbl" },
  { id: "maya", name: "Maya Crude", category: "Crude Oil", unit: "bbl" },

  // --- Gasoline — metric tonnes (MT) ---
  { id: "gasoline-87", name: "Gasoline 87 RON", category: "Gasoline", unit: "MT" },
  { id: "gasoline-91", name: "Gasoline 91 RON", category: "Gasoline", unit: "MT" },
  { id: "gasoline-92", name: "Gasoline 92 RON", category: "Gasoline", unit: "MT" },
  { id: "gasoline-95", name: "Gasoline 95 RON", category: "Gasoline", unit: "MT" },
  { id: "gasoline-98", name: "Gasoline 98 RON", category: "Gasoline", unit: "MT" },
  { id: "rfg", name: "Reformulated Gasoline", category: "Gasoline", unit: "MT" },
  { id: "pms", name: "Premium Motor Spirit (PMS)", category: "Gasoline", unit: "MT" },

  // --- Diesel & gasoil — metric tonnes (MT) ---
  { id: "en590-10", name: "EN590 10ppm Diesel", category: "Diesel & Gasoil", unit: "MT" },
  { id: "en590-50", name: "EN590 50ppm Diesel", category: "Diesel & Gasoil", unit: "MT" },
  { id: "ago", name: "Automotive Gas Oil (AGO)", category: "Diesel & Gasoil", unit: "MT" },
  { id: "ulsd", name: "Ultra Low Sulfur Diesel (ULSD)", category: "Diesel & Gasoil", unit: "MT" },
  { id: "d2", name: "Diesel D2", category: "Diesel & Gasoil", unit: "MT" },
  { id: "d6", name: "Diesel D6", category: "Diesel & Gasoil", unit: "MT" },
  { id: "mdo", name: "Marine Diesel Oil (MDO)", category: "Diesel & Gasoil", unit: "MT" },
  { id: "mgo", name: "Marine Gas Oil (MGO)", category: "Diesel & Gasoil", unit: "MT" },

  // --- Jet fuel & kerosene — metric tonnes (MT) ---
  { id: "jet-a1", name: "Jet A-1", category: "Jet Fuel & Kerosene", unit: "MT" },
  { id: "jet-a", name: "Jet A", category: "Jet Fuel & Kerosene", unit: "MT" },
  { id: "jp54", name: "JP54", category: "Jet Fuel & Kerosene", unit: "MT" },
  { id: "ts1", name: "TS-1 Jet Fuel", category: "Jet Fuel & Kerosene", unit: "MT" },
  { id: "atf", name: "Aviation Turbine Fuel (ATF)", category: "Jet Fuel & Kerosene", unit: "MT" },
  { id: "dpk", name: "Dual Purpose Kerosene (DPK)", category: "Jet Fuel & Kerosene", unit: "MT" },
  { id: "kerosene-illum", name: "Illuminating Kerosene", category: "Jet Fuel & Kerosene", unit: "MT" },
  { id: "kerosene-household", name: "Household Kerosene", category: "Jet Fuel & Kerosene", unit: "MT" },

  // --- Fuel oils — metric tonnes (MT); cargoes occasionally quoted in bbl ---
  { id: "fo-180", name: "Fuel Oil CST 180", category: "Fuel Oils", unit: "MT", dualUnit: true },
  { id: "fo-380", name: "Fuel Oil CST 380", category: "Fuel Oils", unit: "MT", dualUnit: true },
  { id: "fo-500", name: "Fuel Oil 500 CST", category: "Fuel Oils", unit: "MT", dualUnit: true },
  { id: "hsfo", name: "High Sulfur Fuel Oil (HSFO)", category: "Fuel Oils", unit: "MT", dualUnit: true },
  { id: "vlsfo", name: "Very Low Sulfur Fuel Oil (VLSFO)", category: "Fuel Oils", unit: "MT", dualUnit: true },
  { id: "lsfo", name: "Low Sulfur Fuel Oil (LSFO)", category: "Fuel Oils", unit: "MT", dualUnit: true },
  { id: "residual-fo", name: "Residual Fuel Oil", category: "Fuel Oils", unit: "MT", dualUnit: true },
  { id: "bunker", name: "Bunker Fuel", category: "Fuel Oils", unit: "MT", dualUnit: true },

  // --- LPG & LNG — metric tonnes (MT) ---
  { id: "lpg", name: "Liquefied Petroleum Gas (LPG)", category: "LPG & LNG", unit: "MT" },
  { id: "propane", name: "Propane", category: "LPG & LNG", unit: "MT" },
  { id: "butane", name: "Butane", category: "LPG & LNG", unit: "MT" },
  { id: "mixed-lpg", name: "Mixed LPG", category: "LPG & LNG", unit: "MT" },
  { id: "lng", name: "Liquefied Natural Gas (LNG)", category: "LPG & LNG", unit: "MT" },

  // --- Petrochemical feedstocks — metric tonnes (MT); some dual-unit ---
  { id: "naphtha", name: "Naphtha", category: "Petrochemical Feedstocks", unit: "MT", dualUnit: true },
  { id: "naphtha-heavy", name: "Heavy Naphtha", category: "Petrochemical Feedstocks", unit: "MT", dualUnit: true },
  { id: "naphtha-light", name: "Light Naphtha", category: "Petrochemical Feedstocks", unit: "MT", dualUnit: true },
  { id: "condensate", name: "Condensate", category: "Petrochemical Feedstocks", unit: "bbl", dualUnit: true },
  { id: "ethane", name: "Ethane", category: "Petrochemical Feedstocks", unit: "MT" },
  { id: "propane-feed", name: "Propane Feedstock", category: "Petrochemical Feedstocks", unit: "MT" },
  { id: "butane-feed", name: "Butane Feedstock", category: "Petrochemical Feedstocks", unit: "MT" },
  { id: "vgo", name: "Vacuum Gas Oil (VGO)", category: "Petrochemical Feedstocks", unit: "MT", dualUnit: true },

  // --- Base oils & lubricants — metric tonnes (MT) ---
  { id: "sn150", name: "Base Oil SN150", category: "Base Oils & Lubricants", unit: "MT" },
  { id: "sn350", name: "Base Oil SN350", category: "Base Oils & Lubricants", unit: "MT" },
  { id: "sn500", name: "Base Oil SN500", category: "Base Oils & Lubricants", unit: "MT" },
  { id: "sn900", name: "Base Oil SN900", category: "Base Oils & Lubricants", unit: "MT" },
  { id: "bright-stock", name: "Bright Stock", category: "Base Oils & Lubricants", unit: "MT" },
  { id: "lube-oil", name: "Lubricating Oil", category: "Base Oils & Lubricants", unit: "MT" },

  // --- Asphalt & residues — metric tonnes (MT) ---
  { id: "bitumen-60-70", name: "Bitumen 60/70", category: "Asphalt & Residues", unit: "MT" },
  { id: "bitumen-80-100", name: "Bitumen 80/100", category: "Asphalt & Residues", unit: "MT" },
  { id: "asphalt", name: "Asphalt", category: "Asphalt & Residues", unit: "MT" },
  { id: "petcoke", name: "Petroleum Coke (Pet Coke)", category: "Asphalt & Residues", unit: "MT" },
  { id: "sulfur", name: "Sulfur", category: "Asphalt & Residues", unit: "MT" },
  { id: "slurry", name: "Slurry Oil", category: "Asphalt & Residues", unit: "MT" },
]

/** Look up a catalog product by id. */
export function getCatalogProduct(id: string): CatalogProduct | undefined {
  return PETROLEUM_PRODUCTS.find((p) => p.id === id)
}

/** Human-readable label for a unit. */
export function unitLabel(unit: CommodityUnit): string {
  return unit === "bbl" ? "Barrels (bbl)" : "Metric Tonnes (MT)"
}
