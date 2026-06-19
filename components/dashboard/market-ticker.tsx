"use client"

import { TradingViewWidget } from "@/components/market/tradingview-widget"
import { TRADINGVIEW_SYMBOLS } from "@/lib/market-symbols"

// Instruments shown in the scrolling ticker, with a friendly label. Prices and
// changes are streamed live by TradingView's Ticker Tape widget.
const TICKER: { display: string; title: string }[] = [
  { display: "EUR/USD", title: "EUR/USD" },
  { display: "GBP/USD", title: "GBP/USD" },
  { display: "USD/CHF", title: "USD/CHF" },
  { display: "USD/JPY", title: "USD/JPY" },
  { display: "XAU/USD", title: "Gold" },
  { display: "BRENT", title: "Brent" },
  { display: "WTI", title: "WTI Crude" },
  { display: "SPX", title: "S&P 500" },
  { display: "NDX", title: "Nasdaq 100" },
  { display: "UKX", title: "FTSE 100" },
  { display: "DAX", title: "DAX" },
  { display: "US10Y", title: "US 10Y" },
  { display: "BTC/USD", title: "Bitcoin" },
  { display: "VIX", title: "VIX" },
]

export function MarketTicker() {
  const config = {
    symbols: TICKER.map((t) => ({ proName: TRADINGVIEW_SYMBOLS[t.display] ?? t.display, title: t.title })),
    showSymbolLogo: true,
    isTransparent: true,
    displayMode: "adaptive",
    colorTheme: "dark",
    locale: "en",
  }

  return (
    <div className="flex h-12 items-center overflow-hidden border-b border-border bg-background">
      <span className="flex h-full shrink-0 items-center gap-1.5 border-r border-border bg-primary px-3 text-[10px] font-bold uppercase tracking-wider text-primary-foreground">
        <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-primary-foreground" />
        Markets
      </span>
      <div className="h-full flex-1 overflow-hidden">
        <TradingViewWidget scriptSrc="embed-widget-ticker-tape.js" config={config} height="100%" />
      </div>
    </div>
  )
}
