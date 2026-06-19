// Maps the platform's display symbols (e.g. "EUR/USD", "SPX") to the symbols
// used by the upstream market-data provider (Yahoo Finance). Kept free of any
// server-only imports so both the API route and client code can reference it.

export const YAHOO_SYMBOLS: Record<string, string> = {
  // FX majors / crosses
  "EUR/USD": "EURUSD=X",
  "GBP/USD": "GBPUSD=X",
  "USD/CHF": "USDCHF=X",
  "USD/JPY": "USDJPY=X",
  "EUR/GBP": "EURGBP=X",
  "AUD/USD": "AUDUSD=X",
  "USD/CAD": "USDCAD=X",
  "EUR/CHF": "EURCHF=X",
  "USD/SGD": "USDSGD=X",
  // Commodities
  "XAU/USD": "GC=F",
  BRENT: "BZ=F",
  WTI: "CL=F",
  NG: "NG=F",
  // Indices
  SPX: "^GSPC",
  NDX: "^NDX",
  UKX: "^FTSE",
  DAX: "^GDAXI",
  // Rates / volatility
  US10Y: "^TNX",
  VIX: "^VIX",
  // Crypto
  "BTC/USD": "BTC-USD",
  "ETH/USD": "ETH-USD",
  // Equities
  AAPL: "AAPL",
  TSLA: "TSLA",
  NVDA: "NVDA",
}

export type MarketQuote = {
  /** Latest traded/market price. */
  price: number
  /** Percent change vs the previous close. */
  changePct: number
}

export type MarketQuoteMap = Record<string, MarketQuote>
