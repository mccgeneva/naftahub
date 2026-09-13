"use client"

import { useEffect, useMemo, useState } from "react"
import { Search, Plus, Check, Loader2, X } from "lucide-react"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"

export type WatchEntry = { symbol: string; name: string; category: string }
type SearchResult = WatchEntry & { type?: string; exchange?: string }

/**
 * Dialog to search the whole market and build/manage the preferred AI-signal
 * watchlist. Curated NAFTAhub instruments (with guaranteed live-price mapping)
 * are offered first; anything else comes from the live Yahoo symbol search.
 */
export function WatchlistManager({
  open,
  onOpenChange,
  catalog,
  watch,
  onAdd,
  onRemove,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  catalog: WatchEntry[]
  watch: string[]
  onAdd: (entry: WatchEntry) => void
  onRemove: (symbol: string) => void
}) {
  const [query, setQuery] = useState("")
  const [remote, setRemote] = useState<SearchResult[]>([])
  const [loading, setLoading] = useState(false)
  const watchSet = useMemo(() => new Set(watch), [watch])

  // Debounced live-market search across all instruments.
  useEffect(() => {
    const term = query.trim()
    if (term.length < 2) {
      setRemote([])
      setLoading(false)
      return
    }
    setLoading(true)
    const controller = new AbortController()
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`/api/market/search?q=${encodeURIComponent(term)}`, {
          signal: controller.signal,
        })
        if (res.ok) {
          const data = (await res.json()) as { results?: SearchResult[] }
          setRemote(data.results ?? [])
        }
      } catch {
        // ignore aborted/failed searches
      } finally {
        setLoading(false)
      }
    }, 300)
    return () => {
      clearTimeout(timer)
      controller.abort()
    }
  }, [query])

  // Curated catalog rows matching the query (reliable live-price mapping).
  const localMatches = useMemo(() => {
    const term = query.trim().toLowerCase()
    if (!term) return catalog
    return catalog.filter(
      (c) => c.symbol.toLowerCase().includes(term) || c.name.toLowerCase().includes(term),
    )
  }, [query, catalog])

  // Remote results, minus anything already covered by the curated catalog so
  // the same instrument is never listed twice.
  const localSymbols = useMemo(() => new Set(catalog.map((c) => c.symbol.toUpperCase())), [catalog])
  const remoteMatches = useMemo(
    () => remote.filter((r) => !localSymbols.has(r.symbol.toUpperCase())),
    [remote, localSymbols],
  )

  const watchedEntries = useMemo(
    () =>
      watch.map(
        (sym) => catalog.find((c) => c.symbol === sym) ?? { symbol: sym, name: sym, category: "—" },
      ),
    [watch, catalog],
  )

  const Row = ({ entry }: { entry: WatchEntry }) => {
    const added = watchSet.has(entry.symbol)
    return (
      <div className="flex items-center justify-between gap-2 rounded-lg border border-border bg-secondary/20 px-3 py-2">
        <div className="min-w-0">
          <div className="flex items-center gap-1.5">
            <span className="text-sm font-semibold text-foreground">{entry.symbol}</span>
            <Badge
              variant="outline"
              className="text-[9px] uppercase tracking-wide text-muted-foreground"
            >
              {entry.category}
            </Badge>
          </div>
          <p className="truncate text-xs text-muted-foreground">{entry.name}</p>
        </div>
        {added ? (
          <Button
            size="sm"
            variant="ghost"
            className="shrink-0 text-muted-foreground"
            onClick={() => onRemove(entry.symbol)}
          >
            <Check className="mr-1 h-4 w-4 text-green-500" />
            Added
          </Button>
        ) : (
          <Button size="sm" variant="outline" className="shrink-0" onClick={() => onAdd(entry)}>
            <Plus className="mr-1 h-4 w-4" />
            Add
          </Button>
        )}
      </div>
    )
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[88dvh] flex-col overflow-hidden sm:max-w-lg">
        <DialogHeader className="shrink-0">
          <DialogTitle>Manage signal watchlist</DialogTitle>
          <DialogDescription>
            Search stocks, ETFs, commodities, FX, indices and crypto, then add them to your preferred
            NQAi signal list.
          </DialogDescription>
        </DialogHeader>

        <div className="relative shrink-0">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search e.g. Apple, SPY, gold, BTC…"
            className="pl-9"
          />
          {loading && (
            <Loader2 className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-muted-foreground" />
          )}
        </div>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto pr-1">
          {watchedEntries.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Your list · {watchedEntries.length}
              </p>
              <div className="flex flex-wrap gap-2">
                {watchedEntries.map((e) => (
                  <button
                    key={e.symbol}
                    type="button"
                    onClick={() => onRemove(e.symbol)}
                    className="inline-flex items-center gap-1 rounded-full border border-border bg-secondary/40 px-2.5 py-1 text-xs text-foreground hover:border-red-500/40 hover:text-red-500"
                  >
                    {e.symbol}
                    <X className="h-3 w-3" />
                  </button>
                ))}
              </div>
            </div>
          )}

          {localMatches.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                NAFTAhub markets
              </p>
              {localMatches.map((e) => (
                <Row key={e.symbol} entry={e} />
              ))}
            </div>
          )}

          {remoteMatches.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                All markets
              </p>
              {remoteMatches.map((e) => (
                <Row key={`${e.symbol}-${e.exchange ?? ""}`} entry={e} />
              ))}
            </div>
          )}

          {query.trim().length >= 2 &&
            !loading &&
            localMatches.length === 0 &&
            remoteMatches.length === 0 && (
              <p className="py-6 text-center text-sm text-muted-foreground">
                No instruments found for “{query}”.
              </p>
            )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
