// Shared foreign-exchange rates and conversion helper. Lives in its own module
// (no "use client") so it can be used from both client components and server
// actions. The client ledger store re-exports `convertCurrency` from here so
// existing imports from "@/lib/ledger-store" keep working.

/** Indicative USD value of one unit of each supported currency. */
export const usdPerUnit: Record<string, number> = {
  USD: 1,
  EUR: 1.0892,
  GBP: 1.2645,
  CHF: 1.1303,
  JPY: 0.006688,
  AUD: 0.6542,
  CAD: 0.7416,
  SGD: 0.7407,
}

/** Convert an amount from one currency into another using the USD-based rates. */
export function convertCurrency(amount: number, from: string, to: string): number {
  const fromUsd = usdPerUnit[from] ?? 1
  const toUsd = usdPerUnit[to] ?? 1
  return (amount * fromUsd) / toUsd
}
