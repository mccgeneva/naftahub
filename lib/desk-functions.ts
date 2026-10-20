// Terminal function mnemonics adapted from the desk training handbook.
// Client-safe: parsed by the Trading Desk command line.

export type DeskFnView = "MENU" | "DES" | "FA" | "WEI" | "GLCO" | "WB" | "FX" | "MOST" | "ECO"

export type DeskFnAction =
  | { kind: "view"; view: DeskFnView }
  | { kind: "panel"; panel: "chart" | "messages" | "instruments" | "quotes" }
  | { kind: "headlines"; query: (symbol: string, arg: string) => string }
  | { kind: "search"; query: (symbol: string, arg: string) => string }
  | { kind: "unavailable" }

export type DeskFn = { code: string; title: string; group: string; desc: string; action: DeskFnAction }

const view = (v: DeskFnView): DeskFnAction => ({ kind: "view", view: v })
const news = (fixed: string): DeskFnAction => ({ kind: "headlines", query: (_s, arg) => arg || fixed })

export const DESK_FUNCTIONS: DeskFn[] = [
  { code: "MENU", title: "Function directory", group: "General", desc: "List every desk function", action: view("MENU") },
  { code: "MSG", title: "Desk messages", group: "General", desc: "Message the desk", action: { kind: "panel", panel: "messages" } },

  { code: "TOP", title: "Top news", group: "News", desc: "Main market headlines", action: news("markets") },
  { code: "N", title: "News", group: "News", desc: "Market headlines", action: news("markets") },
  { code: "READ", title: "Most read", group: "News", desc: "Popular market stories", action: news("stock market") },
  { code: "NSE", title: "News search", group: "News", desc: "NSE <keyword> — filter news by topic", action: news("earnings") },
  { code: "CN", title: "Company news", group: "News", desc: "News for the loaded security", action: { kind: "headlines", query: (s) => s.replace("/", "") } },
  { code: "NI", title: "News by topic", group: "News", desc: "NI ERN — earnings news monitor", action: { kind: "headlines", query: (_s, a) => (a === "ERN" ? "earnings" : a || "markets") } },
  { code: "BI", title: "Industry intelligence", group: "News", desc: "BI <sector> — industry headlines", action: { kind: "headlines", query: (_s, a) => (a ? `${a} industry` : "industry outlook") } },

  { code: "WEI", title: "World equity indices", group: "Equities", desc: "Global indices: Americas, Europe, Asia", action: view("WEI") },
  { code: "MOST", title: "Most active", group: "Equities", desc: "Volume leaders, gainers and losers", action: view("MOST") },
  { code: "MOV", title: "Top movers", group: "Equities", desc: "Largest movers up and down", action: view("MOST") },
  { code: "LVI", title: "Volume leaders", group: "Equities", desc: "Largest volume movers", action: view("MOST") },
  { code: "EQS", title: "Equity search", group: "Equities", desc: "EQS <name> — find listed companies", action: { kind: "search", query: (_s, a) => a } },

  { code: "DES", title: "Description", group: "Fundamentals", desc: "Company profile of the loaded security", action: view("DES") },
  { code: "FA", title: "Financial analysis", group: "Fundamentals", desc: "Statements, ratios, revenue, EPS", action: view("FA") },
  { code: "ERN", title: "Earnings", group: "Fundamentals", desc: "Reported EPS and revenue", action: view("FA") },
  { code: "EE", title: "Earnings & estimates", group: "Fundamentals", desc: "Earnings figures", action: view("FA") },
  { code: "DVD", title: "Dividends", group: "Fundamentals", desc: "Dividend data in the financials", action: view("FA") },
  { code: "ANR", title: "Analyst ratings", group: "Fundamentals", desc: "Analyst rating headlines", action: { kind: "headlines", query: (s) => `${s.replace("/", "")} analyst rating` } },
  { code: "RV", title: "Relative valuation", group: "Fundamentals", desc: "Requires a licensed terminal", action: { kind: "unavailable" } },
  { code: "SPLC", title: "Supply chain", group: "Fundamentals", desc: "Requires a licensed terminal", action: { kind: "unavailable" } },
  { code: "OWN", title: "Ownership", group: "Fundamentals", desc: "Requires a licensed terminal", action: { kind: "unavailable" } },

  { code: "GP", title: "Price graph", group: "Technical", desc: "Chart of the loaded security", action: { kind: "panel", panel: "chart" } },
  { code: "G", title: "Chart", group: "Technical", desc: "Chart with studies", action: { kind: "panel", panel: "chart" } },
  { code: "TECH", title: "Technical studies", group: "Technical", desc: "Add SMA, RSI, MACD in the chart", action: { kind: "panel", panel: "chart" } },
  { code: "HP", title: "Historical pricing", group: "Technical", desc: "Daily/weekly/monthly history", action: { kind: "panel", panel: "chart" } },

  { code: "WB", title: "World bonds", group: "Fixed income", desc: "Sovereign 2Y/10Y/30Y yields", action: view("WB") },
  { code: "BTMM", title: "Treasury & money markets", group: "Fixed income", desc: "Rates and treasury yields", action: view("WB") },
  { code: "FOMC", title: "Federal Reserve", group: "Fixed income", desc: "Fed headlines", action: news("Federal Reserve FOMC") },
  { code: "SECF", title: "Security finder", group: "Fixed income", desc: "SECF <issuer> — find securities", action: { kind: "search", query: (_s, a) => a } },
  { code: "BOND", title: "Bank instruments", group: "Fixed income", desc: "SBLC, BG, MTN catalogue", action: { kind: "panel", panel: "instruments" } },

  { code: "ECO", title: "Economic calendar", group: "Economics", desc: "Upcoming releases and events", action: view("ECO") },
  { code: "EVTS", title: "Events calendar", group: "Economics", desc: "Upcoming events", action: view("ECO") },
  { code: "ECFC", title: "Economic forecasts", group: "Economics", desc: "Forecast headlines", action: news("economic forecast") },

  { code: "GLCO", title: "Global commodities", group: "Commodities", desc: "Energy, metals, agriculture prices", action: view("GLCO") },
  { code: "FXC", title: "FX cross rates", group: "Currency", desc: "Major currency cross matrix", action: view("FX") },
  { code: "WCRS", title: "World currencies", group: "Currency", desc: "Major currency cross matrix", action: view("FX") },
]

// Yellow keys: market-sector suffixes from the handbook (AAPL EQUITY, CL1 CMDTY).
export const YELLOW_KEYS = new Set(["GOVT", "CORP", "MTGE", "M-MKT", "MUNI", "PFD", "EQUITY", "CMDTY", "COMDTY", "INDEX", "CRNCY", "CURNCY", "PORT"])

// Handbook tickers mapped to desk symbols.
const TICKER_ALIASES: Record<string, string> = {
  CL1: "WTI",
  CO1: "BRENT",
  NG1: "NG",
  XAU: "XAU/USD",
  XAG: "XAG/USD",
  EURUSD: "EUR/USD",
  USDJPY: "USD/JPY",
  BTCUSD: "BTC/USD",
  ETHUSD: "ETH/USD",
}

const FN_BY_CODE = new Map(DESK_FUNCTIONS.map((f) => [f.code, f]))

export type ParsedCommand = { symbol?: string; fn?: DeskFn; arg: string }

/** "TOP CMD", "NSE oil", "AAPL EQUITY DES", "CL1 CMDTY", "HSBC". */
export function parseDeskCommand(raw: string): ParsedCommand {
  const tokens = raw
    .toUpperCase()
    .replace(/<?\bGO\b>?\s*$/, "")
    .trim()
    .split(/\s+/)
    .filter(Boolean)
  if (tokens.length === 0) return { arg: "" }

  const first = FN_BY_CODE.get(tokens[0])
  if (first) {
    const rest = tokens.slice(1)
    const topSuffix: Record<string, string> = { CMD: "commodities", BON: "bond market", ECO: "economy" }
    if (first.code === "TOP" && rest[0] && topSuffix[rest[0]]) return { fn: first, arg: topSuffix[rest[0]] }
    return { fn: first, arg: rest.join(" ").toLowerCase() === "" ? "" : rest.join(" ") }
  }

  const symbol = TICKER_ALIASES[tokens[0]] ?? tokens[0]
  let i = 1
  if (tokens[i] && YELLOW_KEYS.has(tokens[i])) i++
  const fn = tokens[i] ? FN_BY_CODE.get(tokens[i]) : undefined
  return { symbol, fn, arg: tokens.slice(fn ? i + 1 : i).join(" ") }
}
