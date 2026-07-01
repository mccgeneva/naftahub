"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import {
  Search,
  Loader2,
  CheckCircle2,
  XCircle,
  ShieldCheck,
  Globe,
  Copy,
  Building2,
} from "lucide-react"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"
import { toast } from "sonner"
import { isValidIsin } from "@/lib/instrument-identifiers"
import type { ActivityLog } from "@/lib/activity-email"

/** Subset of the OpenFIGI record surfaced by /api/openfigi. */
interface FigiMatch {
  figi: string
  name?: string
  ticker?: string
  exchCode?: string
  securityType?: string
  securityType2?: string
  marketSector?: string
  securityDescription?: string
}

/** 2 letters + 9 alphanumerics + 1 check digit. */
const ISIN_RE = /^[A-Za-z]{2}[A-Za-z0-9]{9}\d$/

type LogFn = (entry: ActivityLog) => void

interface IsinToolsProps {
  /** Pre-fill the input (e.g. the ISIN an admin is about to issue). */
  defaultIsin?: string
  /** Heading shown at the top of the card. */
  title?: string
  /** Supporting copy under the heading. */
  description?: string
  /** Optional audit-trail logger. */
  onLog?: LogFn
  /** Where the log entry is filed. */
  logCategory?: string
  className?: string
}

interface IsinResolution {
  isin: string
  formatValid: boolean
  listed?: boolean
  matches: FigiMatch[]
  note?: string
}

/**
 * Reusable ISIN toolkit used both in the client Bank Instruments workflow and
 * the Admin issuance panel. Provides three capabilities behind one smart input:
 *   1. Instant, offline ISIN validation (format + ISO 6166 Luhn check digit).
 *   2. Market resolution via OpenFIGI (issuer, FIGI, ticker, exchange, type).
 *   3. Free-text securities search (issuer / ticker / name → FIGI records).
 *
 * The OpenFIGI API key stays server-side (all calls go through /api/openfigi),
 * so nothing sensitive reaches the browser and per-user data isolation is
 * unaffected — this only reads public reference data.
 */
export function IsinTools({
  defaultIsin = "",
  title = "ISIN Tools",
  description = "Validate an ISIN, resolve it to live market reference data, or search issuers and tickers.",
  onLog,
  logCategory = "Bank Instruments",
  className,
}: IsinToolsProps) {
  const [value, setValue] = useState(defaultIsin)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isinResult, setIsinResult] = useState<IsinResolution | null>(null)
  const [searchResult, setSearchResult] = useState<{ query: string; matches: FigiMatch[] } | null>(null)

  // Keep the input in sync when the parent supplies a new subject ISIN (e.g. the
  // admin changes the issuing bank / type and a fresh ISIN is generated).
  useEffect(() => {
    setValue(defaultIsin)
    setIsinResult(null)
    setSearchResult(null)
    setError(null)
  }, [defaultIsin])

  const trimmed = value.trim().toUpperCase()
  const looksIsin = ISIN_RE.test(trimmed)

  // Instant, offline validity for anything shaped like an ISIN.
  const localValid = useMemo(() => (looksIsin ? isValidIsin(trimmed) : null), [looksIsin, trimmed])

  const run = useCallback(async () => {
    const q = value.trim()
    if (!q) return
    const isIsin = ISIN_RE.test(q)
    setLoading(true)
    setError(null)
    setIsinResult(null)
    setSearchResult(null)
    try {
      const res = await fetch("/api/openfigi", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(isIsin ? { isin: q } : { query: q }),
      })
      const data = await res.json()
      if (!data.ok) {
        setError(data.error ?? "Lookup failed.")
        return
      }
      if (isIsin) {
        const upper = q.toUpperCase()
        const formatValid = isValidIsin(upper)
        const matches = (data.matches ?? []) as FigiMatch[]
        const resolution: IsinResolution = {
          isin: upper,
          formatValid,
          listed: Boolean(data.listed && matches.length),
          matches,
          note:
            data.listed && matches.length
              ? undefined
              : "Valid ISIN — private bilateral instrument (not exchange-listed on Bloomberg). SBLC / BG / most private MTNs are delivered bank-to-bank via SWIFT MT760 and carry an ISIN without an exchange listing.",
        }
        setIsinResult(resolution)
        onLog?.({
          action: `Verified ISIN ${upper}`,
          category: logCategory,
          details: {
            summary: `ISIN ${upper} checked — format ${formatValid ? "valid" : "invalid"}, market status: ${
              resolution.listed
                ? `exchange-listed (${matches[0]?.figi ?? "Bloomberg ID"})`
                : "valid, not exchange-listed"
            }.`,
            isin: upper,
            formatValid,
            exchangeListed: resolution.listed,
            figi: matches[0]?.figi,
          },
        })
      } else {
        const matches = (data.matches ?? []) as FigiMatch[]
        setSearchResult({ query: q, matches })
        onLog?.({
          action: `Searched securities reference for "${q}"`,
          category: logCategory,
          details: {
            summary: `Bloomberg securities search for "${q}" returned ${matches.length} match(es).`,
            query: q,
            resultCount: matches.length,
          },
        })
      }
    } catch {
      setError("Network error. Please try again.")
    } finally {
      setLoading(false)
    }
  }, [value, onLog, logCategory])

  const copy = (text: string, label: string) => {
    navigator.clipboard?.writeText(text)
    toast.success(`${label} copied`, { description: text })
  }

  return (
    <Card className={cn("border-border bg-card", className)}>
      <CardContent className="space-y-4 p-5">
        <div className="flex items-start gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <Globe className="h-5 w-5" />
          </span>
          <div className="min-w-0">
            <h3 className="text-sm font-semibold text-foreground">{title}</h3>
            <p className="text-xs text-muted-foreground text-pretty">{description}</p>
          </div>
        </div>

        {/* Smart input — auto-detects ISIN vs free-text query */}
        <div className="flex flex-col gap-2 sm:flex-row">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={value}
              onChange={(e) => setValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.nativeEvent.isComposing && e.keyCode !== 229) run()
              }}
              placeholder="ISIN (e.g. US0378331005) or issuer / ticker"
              className="pl-9 font-mono"
              aria-label="ISIN or securities search"
              autoCapitalize="characters"
              spellCheck={false}
            />
          </div>
          <Button onClick={run} disabled={loading || !value.trim()} className="gap-1.5">
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
            {looksIsin ? "Verify" : "Search"}
          </Button>
        </div>

        {/* Instant offline check-digit badge */}
        {looksIsin ? (
          <div className="flex items-center gap-2 text-xs">
            {localValid ? (
              <Badge className="gap-1 border-green-500/20 bg-green-500/10 text-green-400">
                <CheckCircle2 className="h-3 w-3" />
                Valid ISIN format &amp; check digit
              </Badge>
            ) : (
              <Badge className="gap-1 border-red-500/20 bg-red-500/10 text-red-400">
                <XCircle className="h-3 w-3" />
                Invalid check digit — not a genuine ISIN
              </Badge>
            )}
            <span className="text-muted-foreground">Offline ISO 6166 validation</span>
          </div>
        ) : null}

        {error ? <p className="text-xs text-destructive">{error}</p> : null}

        {/* ISIN market resolution */}
        {isinResult ? (
          <div className="space-y-3 rounded-lg border border-border bg-muted/30 p-4">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-mono text-sm font-semibold text-foreground">{isinResult.isin}</span>
              <button
                type="button"
                onClick={() => copy(isinResult.isin, "ISIN")}
                className="text-muted-foreground transition-colors hover:text-foreground"
                aria-label="Copy ISIN"
              >
                <Copy className="h-3.5 w-3.5" />
              </button>
              {isinResult.formatValid ? (
                <Badge className="gap-1 border-green-500/20 bg-green-500/10 text-green-400">
                  <ShieldCheck className="h-3 w-3" />
                  Format valid
                </Badge>
              ) : (
                <Badge className="gap-1 border-red-500/20 bg-red-500/10 text-red-400">
                  <XCircle className="h-3 w-3" />
                  Invalid format
                </Badge>
              )}
              {isinResult.listed ? (
                <Badge className="gap-1 border-primary/30 bg-primary/10 text-primary">
                  <CheckCircle2 className="h-3 w-3" />
                  Exchange-listed
                </Badge>
              ) : (
                <Badge variant="outline" className="gap-1">
                  <Building2 className="h-3 w-3" />
                  Private / bilateral
                </Badge>
              )}
            </div>

            {isinResult.listed && isinResult.matches.length ? (
              <div className="space-y-2">
                {isinResult.matches.map((m, idx) => (
                  <div
                    key={`${m.figi}-${idx}`}
                    className="grid grid-cols-2 gap-x-4 gap-y-1.5 rounded-md border border-border bg-background p-3 text-xs"
                  >
                    <Detail label="Instrument" value={m.name ?? m.securityDescription} span />
                    <Detail label="Bloomberg ID" value={m.figi} mono />
                    <Detail label="Ticker" value={m.ticker} mono />
                    <Detail label="Exchange" value={m.exchCode} />
                    <Detail label="Type" value={m.securityType2 ?? m.securityType} />
                    <Detail label="Market sector" value={m.marketSector} />
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs text-muted-foreground text-pretty">{isinResult.note}</p>
            )}
          </div>
        ) : null}

        {/* Free-text search results */}
        {searchResult ? (
          searchResult.matches.length === 0 ? (
            <p className="text-xs text-muted-foreground">No securities matched &ldquo;{searchResult.query}&rdquo;.</p>
          ) : (
            <div className="max-h-72 overflow-auto rounded-lg border border-border">
              <table className="w-full text-left text-xs">
                <thead className="sticky top-0 bg-muted/60 text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2 font-medium">Name</th>
                    <th className="px-3 py-2 font-medium">Ticker</th>
                    <th className="px-3 py-2 font-medium">Bloomberg ID</th>
                    <th className="hidden px-3 py-2 font-medium sm:table-cell">Type</th>
                  </tr>
                </thead>
                <tbody>
                  {searchResult.matches.map((m, idx) => (
                    <tr key={`${m.figi}-${idx}`} className="border-t border-border">
                      <td className="px-3 py-2 text-foreground">{m.name ?? "—"}</td>
                      <td className="px-3 py-2 font-mono text-muted-foreground">{m.ticker ?? "—"}</td>
                      <td className="px-3 py-2 font-mono text-muted-foreground">{m.figi}</td>
                      <td className="hidden px-3 py-2 text-muted-foreground sm:table-cell">
                        {m.securityType2 ?? m.securityType ?? m.marketSector ?? "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )
        ) : null}
      </CardContent>
    </Card>
  )
}

function Detail({
  label,
  value,
  mono,
  span,
}: {
  label: string
  value?: string
  mono?: boolean
  span?: boolean
}) {
  return (
    <div className={cn(span && "col-span-2")}>
      <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className={cn("text-foreground", mono && "font-mono")}>{value || "—"}</p>
    </div>
  )
}
