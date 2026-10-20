// Client-safe Trading Desk layout model (shared by the API route and the UI).

export const DESK_PANELS = [
  { id: "quotes", label: "Monitor", key: "F1", desc: "Live quotes & NQAi bias" },
  { id: "chart", label: "Chart", key: "F2", desc: "Interactive price chart" },
  { id: "news", label: "News", key: "F3", desc: "Live market headlines" },
  { id: "ticket", label: "Ticket", key: "F4", desc: "Order entry via cTrader" },
  { id: "blotter", label: "Blotter", key: "F5", desc: "Open positions & P&L" },
  { id: "risk", label: "Risk", key: "F6", desc: "Exposure, margin, trust score" },
  { id: "alerts", label: "Alerts", key: "F7", desc: "Price alerts watch" },
  { id: "messages", label: "Messages", key: "F8", desc: "Desk messaging" },
  { id: "search", label: "Companies", key: "F9", desc: "Listed companies & FIGI lookup" },
  { id: "instruments", label: "Instruments", key: "F10", desc: "Bank instruments & ISIN check" },
  { id: "headlines", label: "Headlines", key: "F11", desc: "Search news by keyword" },
] as const

export type DeskPanelId = (typeof DESK_PANELS)[number]["id"]
export const DESK_TILE_OPTIONS = [1, 2, 4, 6, 8] as const
export type DeskTiles = (typeof DESK_TILE_OPTIONS)[number]

export type DeskLayout = {
  tiles: DeskTiles
  slots: DeskPanelId[]
  symbol: string
}

const PANEL_IDS = new Set<string>(DESK_PANELS.map((p) => p.id))

export const DEFAULT_DESK_LAYOUT: DeskLayout = {
  tiles: 6,
  slots: ["quotes", "chart", "ticket", "blotter", "risk", "news", "alerts", "messages"],
  symbol: "EUR/USD",
}

export function normalizeDeskLayout(raw: unknown): DeskLayout {
  const r = (raw ?? {}) as Partial<DeskLayout>
  const tiles = (DESK_TILE_OPTIONS as readonly number[]).includes(Number(r.tiles))
    ? (Number(r.tiles) as DeskTiles)
    : DEFAULT_DESK_LAYOUT.tiles
  const given = Array.isArray(r.slots) ? r.slots.filter((s) => PANEL_IDS.has(String(s))) : []
  const slots = [...given, ...DEFAULT_DESK_LAYOUT.slots].slice(0, 8) as DeskPanelId[]
  const symbol =
    typeof r.symbol === "string" && r.symbol.trim().length > 0 && r.symbol.length <= 24
      ? r.symbol.trim().toUpperCase()
      : DEFAULT_DESK_LAYOUT.symbol
  return { tiles, slots, symbol }
}
