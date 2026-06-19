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
  MSFT: "MSFT",
  AMZN: "AMZN",
  GOOGL: "GOOGL",
  META: "META",
  TSLA: "TSLA",
  NVDA: "NVDA",
  AMD: "AMD",
  JPM: "JPM",
}

// Maps the platform's display symbols to TradingView's "EXCHANGE:SYMBOL"
// format, used by the embedded TradingView widgets (ticker tape, charts,
// quotes). TradingView is the source of truth for what clients see on screen.
export const TRADINGVIEW_SYMBOLS: Record<string, string> = {
  // FX majors / crosses
  "EUR/USD": "FX:EURUSD",
  "GBP/USD": "FX:GBPUSD",
  "USD/CHF": "FX:USDCHF",
  "USD/JPY": "FX:USDJPY",
  "EUR/GBP": "FX:EURGBP",
  "AUD/USD": "FX:AUDUSD",
  "USD/CAD": "FX:USDCAD",
  "EUR/CHF": "FX:EURCHF",
  "USD/SGD": "FX:USDSGD",
  // Commodities
  "XAU/USD": "OANDA:XAUUSD",
  BRENT: "TVC:UKOIL",
  WTI: "TVC:USOIL",
  NG: "NYMEX:NG1!",
  // Indices — use FOREXCOM CFD index symbols, which render with delayed data
  // in free TradingView widgets (the native SP:/NASDAQ: feeds require a paid
  // real-time data agreement and otherwise show an error in the widget).
  SPX: "FOREXCOM:SPXUSD",
  NDX: "FOREXCOM:NSXUSD",
  UKX: "FOREXCOM:UKXGBP",
  DAX: "FOREXCOM:DEUIDXEUR",
  // Rates / volatility
  US10Y: "TVC:US10Y",
  VIX: "TVC:VIX",
  // Crypto
  "BTC/USD": "BITSTAMP:BTCUSD",
  "ETH/USD": "BITSTAMP:ETHUSD",
  // Equities
  AAPL: "NASDAQ:AAPL",
  MSFT: "NASDAQ:MSFT",
  AMZN: "NASDAQ:AMZN",
  GOOGL: "NASDAQ:GOOGL",
  META: "NASDAQ:META",
  TSLA: "NASDAQ:TSLA",
  NVDA: "NASDAQ:NVDA",
  AMD: "NASDAQ:AMD",
  JPM: "NYSE:JPM",
}

/** TradingView symbol for a display symbol, falling back to the raw symbol. */
export function tradingViewSymbol(display: string): string {
  return TRADINGVIEW_SYMBOLS[display] ?? display.replace("/", "")
}

export type MarketQuote = {
  /** Latest traded/market price. */
  price: number
  /** Percent change vs the previous close. */
  changePct: number
}

export type MarketQuoteMap = Record<string, MarketQuote>
