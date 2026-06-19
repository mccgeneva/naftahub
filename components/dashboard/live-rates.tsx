"use client"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { TradingViewWidget } from "@/components/market/tradingview-widget"

// Live FX rates, streamed directly from TradingView. The Forex Cross Rates
// widget renders a real-time grid of the major currencies against each other.
const CURRENCIES = ["EUR", "USD", "GBP", "JPY", "CHF", "AUD", "CAD"]

export function LiveRates() {
  const config = {
    width: "100%",
    height: "100%",
    currencies: CURRENCIES,
    isTransparent: true,
    colorTheme: "dark",
    locale: "en",
  }

  return (
    <Card className="bg-card border-border gap-0 py-0 overflow-hidden">
      <CardHeader className="flex flex-row items-center justify-between border-b border-border px-4 py-2.5 [.border-b]:pb-2.5">
        <div className="flex items-center gap-2">
          <span className="h-3.5 w-1 rounded-full bg-primary" aria-hidden="true" />
          <div>
            <CardTitle className="text-xs font-semibold uppercase tracking-wider">Live FX Rates</CardTitle>
            <p className="font-mono text-[10px] text-muted-foreground">Real-time · TradingView</p>
          </div>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        <div className="h-[320px]">
          <TradingViewWidget scriptSrc="embed-widget-forex-cross-rates.js" config={config} height="100%" />
        </div>
      </CardContent>
    </Card>
  )
}
