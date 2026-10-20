"use client"

import { useTheme } from "next-themes"
import { TradingViewWidget } from "@/components/market/tradingview-widget"
import { tradingViewSymbol } from "@/lib/market-symbols"
import { DESK_FUNCTIONS, type DeskFnView } from "@/lib/desk-functions"

const GROUPS: Record<"WEI" | "GLCO" | "WB", Array<{ name: string; symbols: Array<{ name: string; displayName: string }> }>> = {
  WEI: [
    { name: "Americas", symbols: [
      { name: "FOREXCOM:SPXUSD", displayName: "S&P 500" },
      { name: "FOREXCOM:NSXUSD", displayName: "Nasdaq 100" },
      { name: "FOREXCOM:DJI", displayName: "Dow 30" },
      { name: "TSX:TSX", displayName: "S&P/TSX" },
    ] },
    { name: "Europe", symbols: [
      { name: "INDEX:DEU40", displayName: "DAX" },
      { name: "FOREXCOM:UKXGBP", displayName: "FTSE 100" },
      { name: "INDEX:CAC40", displayName: "CAC 40" },
      { name: "INDEX:SMI", displayName: "SMI" },
    ] },
    { name: "Asia / Pacific", symbols: [
      { name: "INDEX:NKY", displayName: "Nikkei 225" },
      { name: "INDEX:HSI", displayName: "Hang Seng" },
      { name: "SSE:000001", displayName: "Shanghai Comp." },
      { name: "ASX:XJO", displayName: "ASX 200" },
    ] },
  ],
  GLCO: [
    { name: "Energy", symbols: [
      { name: "TVC:USOIL", displayName: "WTI Crude" },
      { name: "TVC:UKOIL", displayName: "Brent Crude" },
      { name: "NYMEX:NG1!", displayName: "Natural Gas" },
      { name: "NYMEX:HO1!", displayName: "Heating Oil" },
    ] },
    { name: "Metals", symbols: [
      { name: "TVC:GOLD", displayName: "Gold" },
      { name: "TVC:SILVER", displayName: "Silver" },
      { name: "TVC:PLATINUM", displayName: "Platinum" },
      { name: "COMEX:HG1!", displayName: "Copper" },
    ] },
    { name: "Agriculture", symbols: [
      { name: "CBOT:ZC1!", displayName: "Corn" },
      { name: "CBOT:ZW1!", displayName: "Wheat" },
      { name: "CBOT:ZS1!", displayName: "Soybeans" },
      { name: "ICEUS:KC1!", displayName: "Coffee" },
    ] },
  ],
  WB: [
    { name: "United States", symbols: [
      { name: "TVC:US02Y", displayName: "US 2Y" },
      { name: "TVC:US10Y", displayName: "US 10Y" },
      { name: "TVC:US30Y", displayName: "US 30Y" },
    ] },
    { name: "Europe", symbols: [
      { name: "TVC:DE10Y", displayName: "Germany 10Y" },
      { name: "TVC:GB10Y", displayName: "UK 10Y" },
      { name: "TVC:FR10Y", displayName: "France 10Y" },
      { name: "TVC:IT10Y", displayName: "Italy 10Y" },
      { name: "TVC:CH10Y", displayName: "Switzerland 10Y" },
    ] },
    { name: "Asia / Pacific", symbols: [
      { name: "TVC:JP10Y", displayName: "Japan 10Y" },
      { name: "TVC:CN10Y", displayName: "China 10Y" },
      { name: "TVC:AU10Y", displayName: "Australia 10Y" },
    ] },
  ],
}

export function FunctionPanel({
  view,
  symbol,
  onRun,
}: {
  view: DeskFnView
  symbol: string
  onRun: (code: string) => void
}) {
  const { resolvedTheme } = useTheme()
  const colorTheme = resolvedTheme === "light" ? "light" : "dark"
  const base = { width: "100%", height: "100%", isTransparent: true, colorTheme, locale: "en" }
  const k = `${view}-${symbol}-${colorTheme}`

  switch (view) {
    case "DES":
      return <TradingViewWidget key={k} scriptSrc="embed-widget-symbol-profile.js" config={{ ...base, symbol: tradingViewSymbol(symbol) }} />
    case "FA":
      return (
        <TradingViewWidget
          key={k}
          scriptSrc="embed-widget-financials.js"
          config={{ ...base, symbol: tradingViewSymbol(symbol), displayMode: "regular", largeChartUrl: "" }}
        />
      )
    case "WEI":
    case "GLCO":
    case "WB":
      return (
        <TradingViewWidget key={k} scriptSrc="embed-widget-market-quotes.js" config={{ ...base, showSymbolLogo: true, symbolsGroups: GROUPS[view] }} />
      )
    case "FX":
      return (
        <TradingViewWidget
          key={k}
          scriptSrc="embed-widget-forex-cross-rates.js"
          config={{ ...base, currencies: ["EUR", "USD", "JPY", "GBP", "CHF", "AUD", "CAD", "CNY"] }}
        />
      )
    case "MOST":
      return (
        <TradingViewWidget
          key={k}
          scriptSrc="embed-widget-hotlists.js"
          config={{ ...base, dateRange: "1D", exchange: "US", showChart: true, showSymbolLogo: true, largeChartUrl: "", showFloatingTooltip: false }}
        />
      )
    case "ECO":
      return (
        <TradingViewWidget
          key={k}
          scriptSrc="embed-widget-events.js"
          config={{ ...base, importanceFilter: "0,1", countryFilter: "us,eu,gb,de,jp,cn,ch" }}
        />
      )
    default:
      return <FunctionDirectory onRun={onRun} />
  }
}

function FunctionDirectory({ onRun }: { onRun: (code: string) => void }) {
  const groups = [...new Set(DESK_FUNCTIONS.map((f) => f.group))]
  return (
    <div className="h-full overflow-y-auto">
      <p className="border-b border-border px-3 py-2 text-xs leading-relaxed text-muted-foreground">
        Type a code then GO, e.g. <span className="text-foreground">TOP CMD</span>,{" "}
        <span className="text-foreground">NSE oil</span>, <span className="text-foreground">AAPL EQUITY DES</span>,{" "}
        <span className="text-foreground">CL1 CMDTY GP</span>. Tap a function to run it.
      </p>
      {groups.map((g) => (
        <section key={g}>
          <h3 className="bg-muted px-3 py-1 font-mono text-[11px] font-semibold uppercase tracking-wider text-foreground">{g}</h3>
          <ul className="divide-y divide-border">
            {DESK_FUNCTIONS.filter((f) => f.group === g).map((f) => (
              <li key={f.code}>
                <button
                  type="button"
                  onClick={() => onRun(f.code)}
                  disabled={f.action.kind === "unavailable"}
                  className="flex min-h-11 w-full items-center gap-3 px-3 py-2 text-left hover:bg-muted disabled:opacity-50"
                >
                  <span className="w-14 shrink-0 font-mono text-xs font-semibold text-primary">{f.code}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm text-foreground">{f.title}</span>
                    <span className="block truncate text-xs text-muted-foreground">{f.desc}</span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  )
}
