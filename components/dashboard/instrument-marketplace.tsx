"use client"

import { useMemo, useState } from "react"
import {
  Search,
  Loader2,
  ShieldCheck,
  BadgeCheck,
  CheckCircle2,
  XCircle,
  Landmark,
  Globe,
  Sparkles,
} from "lucide-react"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogFooter,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog"
import { cn } from "@/lib/utils"
import { toast } from "sonner"
import { useInstrumentRequests } from "@/lib/instrument-requests-store"
import { useActivityLog } from "@/components/activity-tracker"
import { buildInstrumentIdentifiers } from "@/lib/instrument-identifiers"
import {
  buildMarketplaceCatalogue,
  computeAcquisitionFee,
  ACQUISITION_FEE_RATES,
  ACQUISITION_ACTION_LABELS,
  ACQUISITION_ACTION_DESCRIPTIONS,
  MARKET_INSTRUMENT_TYPES,
  tenorLabel,
  type MarketInstrument,
  type AcquisitionAction,
} from "@/lib/instrument-marketplace"

function money(value: number, currency: string): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(value)
}

// --- Live OpenFIGI search result shape (subset of the API response) --------
interface FigiMatch {
  figi: string
  name?: string
  ticker?: string
  exchCode?: string
  securityType?: string
  marketSector?: string
}

const ACTIONS: AcquisitionAction[] = ["lease", "assign", "purchase"]

export function InstrumentMarketplace() {
  const { addInstrument } = useInstrumentRequests()
  const logActivity = useActivityLog()

  const catalogue = useMemo(() => buildMarketplaceCatalogue(), [])

  // --- Catalogue filters ----------------------------------------------------
  const [filter, setFilter] = useState("")
  const [typeFilter, setTypeFilter] = useState<string>("all")
  const [bankFilter, setBankFilter] = useState<string>("all")

  const banks = useMemo(() => {
    const map = new Map<string, string>()
    for (const i of catalogue) map.set(i.bankKey, i.bankName)
    return Array.from(map, ([key, name]) => ({ key, name }))
  }, [catalogue])

  const filtered = useMemo(() => {
    const q = filter.trim().toLowerCase()
    return catalogue.filter((i) => {
      if (typeFilter !== "all" && i.type !== typeFilter) return false
      if (bankFilter !== "all" && i.bankKey !== bankFilter) return false
      if (!q) return true
      return (
        i.bankName.toLowerCase().includes(q) ||
        i.type.toLowerCase().includes(q) ||
        i.typeFull.toLowerCase().includes(q) ||
        i.isin.toLowerCase().includes(q) ||
        i.currency.toLowerCase().includes(q)
      )
    })
  }, [catalogue, filter, typeFilter, bankFilter])

  // --- Live OpenFIGI reference search --------------------------------------
  const [figiQuery, setFigiQuery] = useState("")
  const [figiLoading, setFigiLoading] = useState(false)
  const [figiResults, setFigiResults] = useState<FigiMatch[] | null>(null)
  const [figiError, setFigiError] = useState<string | null>(null)

  const runFigiSearch = async () => {
    const q = figiQuery.trim()
    if (!q) return
    setFigiLoading(true)
    setFigiError(null)
    try {
      const looksIsin = /^[A-Za-z]{2}[A-Za-z0-9]{9}\d$/.test(q)
      const res = await fetch("/api/openfigi", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(looksIsin ? { isin: q } : { query: q }),
      })
      const data = await res.json()
      if (!data.ok) {
        setFigiError(data.error ?? "Lookup failed.")
        setFigiResults([])
        return
      }
      setFigiResults((data.matches ?? []) as FigiMatch[])
    } catch {
      setFigiError("Network error. Please try again.")
      setFigiResults([])
    } finally {
      setFigiLoading(false)
    }
  }

  // --- Acquisition dialog ---------------------------------------------------
  const [target, setTarget] = useState<MarketInstrument | null>(null)
  const [action, setAction] = useState<AcquisitionAction>("lease")
  const [submitting, setSubmitting] = useState(false)
  // OpenFIGI verification for the selected instrument's ISIN.
  const [verify, setVerify] = useState<{
    loading: boolean
    listed?: boolean
    note?: string
  } | null>(null)

  const openAcquire = (inst: MarketInstrument, initial: AcquisitionAction) => {
    setTarget(inst)
    setAction(initial)
    setVerify(null)
  }

  const verifyIsin = async () => {
    if (!target) return
    setVerify({ loading: true })
    try {
      const res = await fetch("/api/openfigi", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isin: target.isin }),
      })
      const data = await res.json()
      if (!data.ok) {
        setVerify({ loading: false, note: data.error ?? "Verification unavailable." })
        return
      }
      if (data.listed && data.matches?.length) {
        const m = data.matches[0] as FigiMatch
        setVerify({
          loading: false,
          listed: true,
          note: `Bloomberg ID ${m.figi}${m.securityType ? ` · ${m.securityType}` : ""}${m.marketSector ? ` · ${m.marketSector}` : ""}`,
        })
      } else {
        setVerify({
          loading: false,
          listed: false,
          note: "Valid ISIN · private bilateral instrument (not exchange-listed on Bloomberg).",
        })
      }
    } catch {
      setVerify({ loading: false, note: "Verification unavailable." })
    }
  }

  const confirmAcquire = () => {
    if (!target) return
    setSubmitting(true)
    try {
      const now = new Date()
      const expiry = new Date(now)
      expiry.setMonth(expiry.getMonth() + target.tenorMonths)
      const daysRemaining = Math.max(
        0,
        Math.round((expiry.getTime() - now.getTime()) / 86_400_000),
      )
      // Rule/serial/BIC fields from the identifier engine; keep the catalogue's
      // own deterministic ISIN / Common Code so the request matches the listing.
      const ids = buildInstrumentIdentifiers(target.bankKey, target.type, now)
      const fee = computeAcquisitionFee(action, target.faceValue)
      const actionLabel = ACQUISITION_ACTION_LABELS[action]

      const created = addInstrument({
        id: `${target.type}-${now.getTime().toString().slice(-6)}`,
        type: target.type,
        typeFull: target.typeFull,
        issuer: target.bankName,
        faceValue: target.faceValue,
        currency: target.currency,
        issuedDate: now.toISOString().split("T")[0],
        expiryDate: expiry.toISOString().split("T")[0],
        daysRemaining,
        rating: target.rating,
        purpose: target.purpose,
        assignable: target.assignable,
        monetizable: target.monetizable,
        tradeType: `${actionLabel} acquisition`,
        ...ids,
        isin: target.isin,
        commonCode: target.commonCode,
        issuerBic: target.bankBic,
      })

      logActivity({
        action: `Requested ${actionLabel.toLowerCase()} of ${target.type} ${created.id} (${money(target.faceValue, target.currency)})`,
        category: "Bank Instruments",
        details: {
          summary: `Client requested to ${actionLabel.toLowerCase()} a ${target.typeFull} (${target.type}) from ${target.bankName} with a face value of ${money(target.faceValue, target.currency)} (ISIN ${target.isin}, rated ${target.rating}). Indicative ${actionLabel.toLowerCase()} fee at ${(ACQUISITION_FEE_RATES[action] * 100).toFixed(action === "assign" ? 1 : 0)}% = ${money(fee, target.currency)}. Awaiting Administrator approval — nothing executes automatically.`,
          referenceId: created.id,
          instrumentType: `${target.type} — ${target.typeFull}`,
          faceValue: money(target.faceValue, target.currency),
          issuingBank: `${target.bankName} (${target.bankBic})`,
          acquisition: `${actionLabel} · fee ${money(fee, target.currency)}`,
          isin: target.isin,
        },
      })

      toast.success(`${actionLabel} request submitted`, {
        description: `${target.type} ${created.id} from ${target.bankName} is pending Administrator approval. It will appear in your portfolio once approved.`,
      })
      setTarget(null)
    } finally {
      setSubmitting(false)
    }
  }

  const fee = target ? computeAcquisitionFee(action, target.faceValue) : 0

  return (
    <div className="space-y-6">
      {/* Live OpenFIGI reference search */}
      <Card className="border-border bg-card">
        <CardContent className="space-y-4 p-5">
          <div className="flex items-start gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <Globe className="h-5 w-5" />
            </span>
            <div>
              <h3 className="text-sm font-semibold text-foreground">Securities reference lookup</h3>
              <p className="text-xs text-muted-foreground text-pretty">
                Live <span className="font-medium text-foreground">Bloomberg</span> reference search — enter an issuer,
                ticker or ISIN. A name/ticker search returns the official Bloomberg security identifier; ISINs are not
                distributed through securities search. To validate a specific ISIN, use the{" "}
                <span className="font-medium text-foreground">ISIN Tools</span> tab.
              </p>
            </div>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row">
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={figiQuery}
                onChange={(e) => setFigiQuery(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && runFigiSearch()}
                placeholder="e.g. HSBC, AAPL, or US0378331005"
                className="pl-9"
                      aria-label="Bloomberg search query"
              />
            </div>
            <Button onClick={runFigiSearch} disabled={figiLoading || !figiQuery.trim()} className="gap-1.5">
              {figiLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
              Search
            </Button>
          </div>

          {figiError ? <p className="text-xs text-destructive">{figiError}</p> : null}
          {figiResults && !figiError ? (
            figiResults.length === 0 ? (
              <p className="text-xs text-muted-foreground">No securities matched that query.</p>
            ) : (
              <div className="max-h-64 overflow-y-auto rounded-lg border border-border">
                <table className="w-full text-left text-xs">
                  <thead className="sticky top-0 bg-muted/60 text-muted-foreground">
                    <tr>
                      <th className="px-3 py-2 font-medium">Name</th>
                      <th className="px-3 py-2 font-medium">Ticker</th>
                      <th className="px-3 py-2 font-medium">Bloomberg ID</th>
                      <th className="px-3 py-2 font-medium">Type</th>
                    </tr>
                  </thead>
                  <tbody>
                    {figiResults.map((m, idx) => (
                      <tr key={`${m.figi}-${idx}`} className="border-t border-border">
                        <td className="px-3 py-2 text-foreground">{m.name ?? "—"}</td>
                        <td className="px-3 py-2 font-mono text-muted-foreground">{m.ticker ?? "—"}</td>
                        <td className="px-3 py-2 font-mono text-muted-foreground">{m.figi}</td>
                        <td className="px-3 py-2 text-muted-foreground">
                          {m.securityType ?? m.marketSector ?? "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )
          ) : null}
          {figiResults && figiResults.length > 0 && !figiError ? (
            <p className="text-[11px] text-muted-foreground text-pretty">
              Results show Bloomberg&apos;s official global security identifier. Securities search does not return ISINs
              — switch to the ISIN Tools tab to validate or resolve a specific ISIN.
            </p>
          ) : null}
        </CardContent>
      </Card>

      {/* Catalogue filters */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="Filter by bank, type, ISIN or currency"
            className="pl-9"
            aria-label="Filter instruments"
          />
        </div>
        <Select value={typeFilter} onValueChange={setTypeFilter}>
          <SelectTrigger className="sm:w-44" aria-label="Filter by instrument type">
            <SelectValue placeholder="All types" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All types</SelectItem>
            {MARKET_INSTRUMENT_TYPES.map((t) => (
              <SelectItem key={t.code} value={t.code}>
                {t.code} — {t.full}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={bankFilter} onValueChange={setBankFilter}>
          <SelectTrigger className="sm:w-48" aria-label="Filter by issuing bank">
            <SelectValue placeholder="All banks" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All banks</SelectItem>
            {banks.map((b) => (
              <SelectItem key={b.key} value={b.key}>
                {b.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <p className="text-xs text-muted-foreground">
        <span className="font-semibold text-foreground">{filtered.length}</span> AAA-rated bank instruments available
        to lease, assign or purchase. Acquisitions are submitted for Administrator approval — nothing executes
        automatically.
      </p>

      {/* Catalogue grid */}
      {filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-border py-16 text-center">
          <Landmark className="h-6 w-6 text-muted-foreground" />
          <p className="text-sm font-medium text-foreground">No instruments match your filters</p>
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {filtered.map((inst) => (
            <Card
              key={inst.id}
              className={cn("border-border bg-card", !inst.available && "opacity-60")}
            >
              <CardContent className="flex flex-col gap-4 p-5">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-start gap-3">
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-secondary text-foreground">
                      <Landmark className="h-5 w-5" />
                    </span>
                    <div className="min-w-0">
                      <p className="text-sm font-semibold leading-tight text-foreground">{inst.bankName}</p>
                      <p className="text-xs text-muted-foreground">{inst.bankCountry}</p>
                    </div>
                  </div>
                  <Badge variant="secondary" className="gap-1 font-mono">
                    <ShieldCheck className="h-3 w-3" />
                    {inst.rating}
                  </Badge>
                </div>

                <div className="flex items-center gap-2">
                  <Badge className="font-mono">{inst.type}</Badge>
                  <span className="text-xs text-muted-foreground">{inst.typeFull}</span>
                </div>

                <div className="grid grid-cols-2 gap-x-4 gap-y-2 rounded-lg border border-border bg-muted/30 p-3 text-xs">
                  <div>
                    <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Face value</p>
                    <p className="text-sm font-bold text-foreground">{money(inst.faceValue, inst.currency)}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Validity</p>
                    <p className="text-sm font-semibold text-foreground">{tenorLabel(inst.tenorMonths)}</p>
                  </div>
                  <div className="col-span-2 flex items-center gap-1.5 border-t border-border pt-2 text-muted-foreground">
                    <span className="text-[11px] uppercase tracking-wide">ISIN</span>
                    <span className="font-mono text-foreground">{inst.isin}</span>
                  </div>
                </div>

                {inst.available ? (
                  <div className="flex flex-wrap gap-2">
                    {ACTIONS.map((a) => {
                      if (a === "assign" && !inst.assignable) return null
                      return (
                        <Button
                          key={a}
                          size="sm"
                          variant={a === "lease" ? "default" : "outline"}
                          onClick={() => openAcquire(inst, a)}
                          className={cn("flex-1 gap-1", a !== "lease" && "bg-transparent")}
                        >
                          {ACQUISITION_ACTION_LABELS[a]}
                          <span className="text-[10px] opacity-70">
                            {(ACQUISITION_FEE_RATES[a] * 100).toFixed(a === "assign" ? 1 : 0)}%
                          </span>
                        </Button>
                      )
                    })}
                  </div>
                ) : (
                  <Badge variant="outline" className="w-fit">
                    Reserved — not currently available
                  </Badge>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Acquisition dialog */}
      <Dialog open={target !== null} onOpenChange={(open) => !open && !submitting && setTarget(null)}>
        <DialogContent className="sm:max-w-md">
          {target ? (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <Sparkles className="h-4 w-4 text-primary" />
                  Acquire {target.type}
                </DialogTitle>
                <DialogDescription className="text-pretty">
                  {target.typeFull} from {target.bankName} — {money(target.faceValue, target.currency)}, rated{" "}
                  {target.rating}.
                </DialogDescription>
              </DialogHeader>

              {/* Action selector */}
              <div className="flex gap-2">
                {ACTIONS.map((a) => {
                  if (a === "assign" && !target.assignable) return null
                  return (
                    <button
                      key={a}
                      type="button"
                      onClick={() => setAction(a)}
                      className={cn(
                        "flex-1 rounded-lg border px-3 py-2 text-center transition-colors",
                        action === a
                          ? "border-primary bg-primary/10 text-foreground"
                          : "border-border text-muted-foreground hover:bg-muted/50",
                      )}
                    >
                      <span className="block text-sm font-semibold">{ACQUISITION_ACTION_LABELS[a]}</span>
                      <span className="block text-[11px]">
                        {(ACQUISITION_FEE_RATES[a] * 100).toFixed(a === "assign" ? 1 : 0)}%
                      </span>
                    </button>
                  )
                })}
              </div>

              <p className="text-xs text-muted-foreground text-pretty">{ACQUISITION_ACTION_DESCRIPTIONS[action]}</p>

              <div className="space-y-2 rounded-lg border border-border bg-muted/40 p-3 text-sm">
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Face value</span>
                  <span className="font-semibold">{money(target.faceValue, target.currency)}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">
                    {ACQUISITION_ACTION_LABELS[action]} fee (
                    {(ACQUISITION_FEE_RATES[action] * 100).toFixed(action === "assign" ? 1 : 0)}%)
                  </span>
                  <span className="font-bold text-primary">{money(fee, target.currency)}</span>
                </div>
              </div>

              {/* OpenFIGI verification */}
              <div className="rounded-lg border border-border p-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <BadgeCheck className="h-3.5 w-3.5" />
                    ISIN <span className="font-mono text-foreground">{target.isin}</span>
                  </span>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={verifyIsin}
                    disabled={verify?.loading}
                    className="h-7 gap-1 text-xs"
                  >
                    {verify?.loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
                    Verify on Bloomberg
                  </Button>
                </div>
                {verify && !verify.loading && verify.note ? (
                  <p
                    className={cn(
                      "mt-2 flex items-start gap-1.5 text-[11px]",
                      verify.listed ? "text-green-500" : "text-muted-foreground",
                    )}
                  >
                    {verify.listed ? (
                      <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                    ) : (
                      <XCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                    )}
                    {verify.note}
                  </p>
                ) : null}
              </div>

              <DialogFooter>
                <Button onClick={confirmAcquire} disabled={submitting} className="w-full gap-1.5">
                  {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                  Submit {ACQUISITION_ACTION_LABELS[action].toLowerCase()} request for approval
                </Button>
              </DialogFooter>
            </>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  )
}
