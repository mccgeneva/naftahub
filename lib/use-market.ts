"use client"

import useSWR from "swr"
import type { MarketQuoteMap } from "@/lib/market-symbols"

type MarketResponse = { quotes: MarketQuoteMap; updatedAt: string }

const fetcher = async (url: string): Promise<MarketResponse> => {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`Market data request failed: ${res.status}`)
  return res.json()
}

/**
 * Subscribe to live market quotes for a fixed set of display symbols
 * (e.g. "EUR/USD", "XAU/USD", "SPX"). Quotes come from the `/api/market`
 * route, which sources real prices from Yahoo Finance. Data refreshes
 * automatically every 20s and on tab focus.
 */
export function useMarketQuotes(symbols: string[]) {
  // Stable, order-independent key so the cache is shared across components
  // requesting the same symbols.
  const key = `/api/market?symbols=${[...symbols].sort().join(",")}`

  const { data, error, isLoading, mutate } = useSWR<MarketResponse>(
    symbols.length > 0 ? key : null,
    fetcher,
    {
      refreshInterval: 20000,
      dedupingInterval: 15000,
      revalidateOnFocus: true,
      keepPreviousData: true,
    },
  )

  return {
    quotes: data?.quotes ?? {},
    updatedAt: data?.updatedAt ? new Date(data.updatedAt) : null,
    isLoading,
    isError: Boolean(error),
    refresh: () => mutate(),
  }
}
