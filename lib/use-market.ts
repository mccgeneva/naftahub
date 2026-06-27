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
 * automatically every 12s and on tab focus, and pauses while the browser tab
 * is hidden so we don't poll needlessly in the background.
 */
export function useMarketQuotes(symbols: string[]) {
  // Stable, order-independent key so the cache is shared across components
  // requesting the same symbols.
  const key = `/api/market?symbols=${[...symbols].sort().join(",")}`

  const { data, error, isLoading, isValidating, mutate } = useSWR<MarketResponse>(
    symbols.length > 0 ? key : null,
    fetcher,
    {
      refreshInterval: 12000,
      dedupingInterval: 8000,
      revalidateOnFocus: true,
      revalidateOnReconnect: true,
      refreshWhenHidden: false,
      keepPreviousData: true,
    },
  )

  return {
    quotes: data?.quotes ?? {},
    updatedAt: data?.updatedAt ? new Date(data.updatedAt) : null,
    isLoading,
    // True whenever a fetch is in flight (initial load or a background poll) —
    // used to drive the live "syncing" pulse in the UI.
    isValidating,
    isError: Boolean(error),
    refresh: () => mutate(),
  }
}
