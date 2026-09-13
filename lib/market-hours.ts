// Lightweight, dependency-free market-session indicator used by the trading
// desk to show clear "market closed" states and to block order entry when a
// symbol is not tradable. Times are evaluated in UTC. This is an indicative
// session guide (not an exchange-holiday calendar): crypto is 24/7, FX / metals
// / commodities trade continuously Mon–Fri, and equities/indices use a broad
// cash-session window that covers the LSE/EU/US overlap.

export type MarketState = { open: boolean; label: string }

export function marketStatus(category: string, now: Date = new Date()): MarketState {
  const cat = (category || "").toLowerCase()
  const day = now.getUTCDay() // 0 Sun … 6 Sat
  const minutes = now.getUTCHours() * 60 + now.getUTCMinutes()

  // Crypto never closes.
  if (cat.includes("crypto")) return { open: true, label: "24/7" }

  // FX, metals, commodities and energy trade continuously from Sunday 22:00 UTC
  // to Friday 22:00 UTC.
  if (
    cat.includes("forex") ||
    cat.includes("fx") ||
    cat.includes("metal") ||
    cat.includes("commodit") ||
    cat.includes("energy")
  ) {
    const closed =
      day === 6 || // Saturday
      (day === 0 && minutes < 22 * 60) || // Sunday before 22:00
      (day === 5 && minutes >= 22 * 60) // Friday after 22:00
    return closed ? { open: false, label: "Closed · weekend" } : { open: true, label: "Open" }
  }

  // Equities and indices: Monday–Friday, broad 08:00–21:00 UTC session window.
  if (day === 0 || day === 6) return { open: false, label: "Closed · weekend" }
  const inSession = minutes >= 8 * 60 && minutes < 21 * 60
  return inSession ? { open: true, label: "Open" } : { open: false, label: "Closed · after hours" }
}
