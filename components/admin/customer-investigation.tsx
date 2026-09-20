"use client"

// ---------------------------------------------------------------------------
// Admin · Customer Investigation
//
// Pick any customer and inspect them in depth:
//   • Current positions — balances, blocked funds, equity saving, and every
//     live facility/exposure (leverage, instruments, monetization, …).
//   • A complete, exact-time-order activity log for a chosen date range that
//     merges the money ledger (each transaction / debit, with resulting
//     balance) with the security audit trail (approvals, blocks, fees,
//     cashback, instrument movements, cTrader, document generation, logins…).
//   • Download the file as PDF or CSV for review and compliance.
//
// Everything is read from authoritative server stores, isolated per customer,
// and restricted to administrators (the whole panel is passcode-gated).
// ---------------------------------------------------------------------------

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import {
  ScrollText,
  Search,
  Loader2,
  Info,
  ChevronLeft,
  Download,
  FileText,
  Wallet,
  Layers,
  ArrowDownLeft,
  ArrowUpRight,
  Lock,
  Clock,
  ListFilter,
} from "lucide-react"
import type { jsPDF } from "jspdf"
import { ADMIN_PASSCODE } from "@/lib/admin-config"
import { cn } from "@/lib/utils"
import type { AuditOverview } from "@/lib/security-audit-service"
import type { CustomerInvestigation, TimelineItem } from "@/lib/investigation-types"
import { buildInvestigationDoc } from "@/lib/investigation-pdf"
import { PdfPreviewModal } from "@/components/pdf-preview-modal"
import { downloadFile } from "@/lib/download-file"

function ymd(d: Date): string {
  return d.toISOString().slice(0, 10)
}

function fmtWhen(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  })
}

function fmtMoney(amount: number, currency: string): string {
  const sym: Record<string, string> = { EUR: "€", USD: "$", GBP: "£", CHF: "CHF " }
  return `${sym[currency] || `${currency} `}${amount.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

function signedMoney(amount: number | null, currency: string | null): string {
  if (amount === null || currency === null) return "—"
  const sign = amount > 0 ? "+" : amount < 0 ? "-" : ""
  return `${sign}${fmtMoney(Math.abs(amount), currency)}`
}

type SourceFilter = "all" | "Ledger" | "Activity"

export function CustomerInvestigation() {
  const [overview, setOverview] = useState<AuditOverview | null>(null)
  const [loadingOverview, setLoadingOverview] = useState(false)
  const [overviewError, setOverviewError] = useState("")
  const [search, setSearch] = useState("")

  const [selectedId, setSelectedId] = useState<string | null>(null)
  const today = useMemo(() => new Date(), [])
  const [from, setFrom] = useState(() => {
    const d = new Date()
    d.setDate(d.getDate() - 30)
    return ymd(d)
  })
  const [to, setTo] = useState(() => ymd(new Date()))

  const [report, setReport] = useState<CustomerInvestigation | null>(null)
  const [loadingReport, setLoadingReport] = useState(false)
  const [reportError, setReportError] = useState("")
  const [sourceFilter, setSourceFilter] = useState<SourceFilter>("all")
  const [categoryFilter, setCategoryFilter] = useState<string>("all")
  const [eventSearch, setEventSearch] = useState("")
  const [pdfDoc, setPdfDoc] = useState<jsPDF | null>(null)

  // The activity log renders below the (tall) positions card, so on mobile it
  // sits off-screen after "Generate log". Scroll straight to it once the fresh
  // report has rendered — but only when the admin explicitly generated it.
  const logRef = useRef<HTMLDivElement>(null)
  const wantScrollRef = useRef(false)
  useEffect(() => {
    if (report && wantScrollRef.current) {
      wantScrollRef.current = false
      requestAnimationFrame(() => logRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }))
    }
  }, [report])

  const loadOverview = useCallback(async () => {
    setLoadingOverview(true)
    setOverviewError("")
    try {
      const res = await fetch(`/api/admin/audit/overview?p=${encodeURIComponent(ADMIN_PASSCODE)}`, {
        headers: { "x-admin-passcode": ADMIN_PASSCODE },
        cache: "no-store",
      })
      const json = (await res.json().catch(() => null)) as { ok: boolean; data?: AuditOverview; error?: string } | null
      if (res.ok && json?.ok && json.data) setOverview(json.data)
      else setOverviewError(json?.error || "Could not load the account list.")
    } catch {
      setOverviewError("Could not load the account list.")
    } finally {
      setLoadingOverview(false)
    }
  }, [])

  useEffect(() => {
    void loadOverview()
  }, [loadOverview])

  const runInvestigation = useCallback(
    async (userId: string) => {
      setLoadingReport(true)
      setReportError("")
      try {
        const params = new URLSearchParams({ userId, p: ADMIN_PASSCODE })
        if (from) params.set("from", from)
        if (to) params.set("to", to)
        const res = await fetch(`/api/admin/audit/investigation?${params.toString()}`, {
          headers: { "x-admin-passcode": ADMIN_PASSCODE },
          cache: "no-store",
        })
        const json = (await res.json().catch(() => null)) as
          | { ok: boolean; data?: CustomerInvestigation; error?: string }
          | null
        if (res.ok && json?.ok && json.data) setReport(json.data)
        else setReportError(json?.error || "Could not build the investigation.")
      } catch {
        setReportError("Could not build the investigation.")
      } finally {
        setLoadingReport(false)
      }
    },
    [from, to],
  )

  const accounts = overview?.accounts ?? []
  const filteredAccounts = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return accounts
    return accounts.filter((a) =>
      [a.label, a.company, a.email, a.userId].some((v) => v?.toLowerCase().includes(q)),
    )
  }, [accounts, search])

  const visibleTimeline = useMemo(() => {
    if (!report) return []
    const q = eventSearch.trim().toLowerCase()
    return report.timeline.filter((e) => {
      if (sourceFilter !== "all" && e.source !== sourceFilter) return false
      if (categoryFilter !== "all" && e.category !== categoryFilter) return false
      if (!q) return true
      return [e.section, e.type, e.description, e.ref, e.actor, e.ip]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(q))
    })
  }, [report, sourceFilter, categoryFilter, eventSearch])

  const openPdf = useCallback(() => {
    if (!report) return
    setPdfDoc(buildInvestigationDoc(report))
  }, [report])

  const exportCsv = useCallback(async () => {
    if (!report) return
    const header = [
      "timestamp",
      "source",
      "category",
      "pocket",
      "section",
      "type",
      "description",
      "amount",
      "currency",
      "status",
      "balance_after",
      "reference",
      "ip",
      "device",
      "actor",
    ]
    const esc = (v: unknown) => {
      const s = v === null || v === undefined ? "" : String(v)
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
    }
    const lines = [header.join(",")]
    for (const e of report.timeline) {
      lines.push(
        [
          e.at,
          e.source,
          e.category,
          e.compartment,
          e.section,
          e.type,
          e.description,
          e.amount ?? "",
          e.currency ?? "",
          e.status ?? "",
          e.balanceAfter ?? "",
          e.ref ?? "",
          e.ip ?? "",
          e.device ?? "",
          e.actor ?? "",
        ]
          .map(esc)
          .join(","),
      )
    }
    const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8" })
    const url = URL.createObjectURL(blob)
    const slug = report.account.replace(/[^a-z0-9]+/gi, "-").toLowerCase()
    try {
      await downloadFile(url, `investigation-${slug}-${from || "start"}_${to || "now"}.csv`)
    } finally {
      setTimeout(() => URL.revokeObjectURL(url), 4000)
    }
  }, [report, from, to])

  const back = () => {
    setSelectedId(null)
    setReport(null)
    setReportError("")
    setEventSearch("")
    setSourceFilter("all")
    setCategoryFilter("all")
  }

  // ------------------------------------------------------------------ picker
  if (!selectedId) {
    return (
      <Card className="border-border bg-card">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <ScrollText className="h-5 w-5 text-primary" />
            Activity Log (date range)
          </CardTitle>
          <p className="text-sm text-muted-foreground">
            Pick a customer to inspect their current positions and reconstruct a complete, time-ordered activity log
            for any date range.
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by name, company, email or id"
              className="pl-9 text-base"
              autoComplete="off"
              autoCorrect="off"
              autoCapitalize="none"
              spellCheck={false}
            />
          </div>

          {overviewError ? (
            <div className="flex items-start gap-2 rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
              <Info className="mt-0.5 h-4 w-4 shrink-0" />
              <div className="space-y-2">
                <p>{overviewError}</p>
                <Button size="sm" variant="outline" onClick={() => void loadOverview()}>
                  Retry
                </Button>
              </div>
            </div>
          ) : null}

          {loadingOverview ? (
            <div className="flex items-center gap-2 py-8 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading accounts…
            </div>
          ) : (
            <div className="max-h-[60vh] space-y-2 overflow-y-auto">
              {filteredAccounts.length === 0 ? (
                <p className="py-6 text-center text-sm text-muted-foreground">No accounts match your search.</p>
              ) : (
                filteredAccounts.map((a) => (
                  <button
                    key={a.userId}
                    onClick={() => {
                      setSelectedId(a.userId)
                      void runInvestigation(a.userId)
                    }}
                    className="flex w-full items-center justify-between gap-3 rounded-lg border border-border bg-secondary/30 p-3 text-left transition-colors hover:bg-secondary/60 active:bg-secondary"
                  >
                    <div className="min-w-0">
                      <p className="truncate font-medium text-foreground">{a.label}</p>
                      <p className="truncate text-xs text-muted-foreground">
                        {[a.company, a.email].filter(Boolean).join(" · ") || a.userId}
                      </p>
                    </div>
                    <ChevronLeft className="h-4 w-4 shrink-0 rotate-180 text-muted-foreground" />
                  </button>
                ))
              )}
            </div>
          )}
        </CardContent>
      </Card>
    )
  }

  // ------------------------------------------------------------------ report
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="ghost" size="sm" onClick={back} className="gap-1">
          <ChevronLeft className="h-4 w-4" /> All customers
        </Button>
        {report ? (
          <div className="ml-auto flex flex-wrap items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => void exportCsv()} disabled={!report.timeline.length} className="gap-1">
              <Download className="h-4 w-4" /> CSV
            </Button>
            <Button variant="outline" size="sm" onClick={openPdf} className="gap-1">
              <FileText className="h-4 w-4" /> PDF
            </Button>
          </div>
        ) : null}
      </div>

      {/* Date-range controls */}
      <Card className="border-border bg-card">
        <CardContent className="flex flex-wrap items-end gap-3 p-4">
          <div className="flex flex-col gap-1">
            <label className="text-xs text-muted-foreground">From</label>
            <Input type="date" value={from} max={to || ymd(today)} onChange={(e) => setFrom(e.target.value)} className="text-base" />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs text-muted-foreground">To</label>
            <Input type="date" value={to} min={from} max={ymd(today)} onChange={(e) => setTo(e.target.value)} className="text-base" />
          </div>
          <Button
            size="sm"
            onClick={() => {
              if (!selectedId) return
              wantScrollRef.current = true
              void runInvestigation(selectedId)
            }}
            disabled={loadingReport}
            className="gap-1"
          >
            {loadingReport ? <Loader2 className="h-4 w-4 animate-spin" /> : <Clock className="h-4 w-4" />}
            Generate log
          </Button>
        </CardContent>
      </Card>

      {reportError ? (
        <div className="flex items-start gap-2 rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
          <Info className="mt-0.5 h-4 w-4 shrink-0" />
          <div className="space-y-2">
            <p>{reportError}</p>
            <Button size="sm" variant="outline" onClick={() => selectedId && void runInvestigation(selectedId)}>
              Retry
            </Button>
          </div>
        </div>
      ) : null}

      {loadingReport && !report ? (
        <div className="flex items-center gap-2 py-10 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Building investigation…
        </div>
      ) : null}

      {report ? (
        <>
          {/* Subject */}
          <Card className="border-border bg-card">
            <CardContent className="p-4">
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-base font-semibold text-foreground">{report.account}</p>
                {report.accountBadge ? <Badge variant="secondary">{report.accountBadge}</Badge> : null}
                {report.relationship ? <Badge variant="outline">{report.relationship}</Badge> : null}
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                {[report.company, report.email].filter(Boolean).join(" · ") || report.userId}
              </p>
              {report.memberIds.length > 1 ? (
                <p className="mt-1 text-xs text-muted-foreground">
                  Shared pool of {report.memberIds.length} accounts (master + sub/joint members).
                </p>
              ) : null}
            </CardContent>
          </Card>

          {/* Current positions */}
          <Card className="border-border bg-card">
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-sm">
                <Wallet className="h-4 w-4 text-primary" /> Current positions
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 p-4 pt-0">
              {report.balances.length === 0 ? (
                <p className="text-sm text-muted-foreground">No ledger balances on file.</p>
              ) : (
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  {report.balances.map((b) => (
                    <div key={b.currency} className="rounded-lg border border-border bg-secondary/30 p-3">
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-semibold text-foreground">{b.currency}</span>
                        <span className={cn("text-sm font-semibold", b.available < 0 ? "text-destructive" : "text-foreground")}>
                          {fmtMoney(b.available, b.currency)}
                        </span>
                      </div>
                      <div className="mt-1 flex items-center justify-between text-xs text-muted-foreground">
                        <span className="flex items-center gap-1">
                          <Lock className="h-3 w-3" /> Blocked {fmtMoney(b.onHold, b.currency)}
                        </span>
                        {b.equitySaving > 0 ? <span>Equity {fmtMoney(b.equitySaving, b.currency)}</span> : null}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {report.facilities.length ? (
                <div className="space-y-2">
                  <p className="flex items-center gap-1 text-xs font-medium text-muted-foreground">
                    <Layers className="h-3.5 w-3.5" /> Open facilities & exposures
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {report.facilities.map((f) => (
                      <Badge key={f.kind} variant="outline" className="gap-1">
                        {f.label}
                        <span className="rounded bg-primary/15 px-1 text-primary">{f.liveCount}</span>
                      </Badge>
                    ))}
                  </div>
                </div>
              ) : null}

              {/* Balances split per pocket — only meaningful with sub-accounts */}
              {report.compartments.length > 1 ? (
                <div className="space-y-2">
                  <p className="flex items-center gap-1 text-xs font-medium text-muted-foreground">
                    <Layers className="h-3.5 w-3.5" /> Balances by pocket
                  </p>
                  <div className="space-y-2">
                    {report.compartments.map((c) => (
                      <div key={c.id} className="rounded-lg border border-border bg-secondary/20 p-3">
                        <p className="text-xs font-semibold text-foreground">{c.label}</p>
                        <div className="mt-1.5 flex flex-col gap-1">
                          {c.balances.map((b) => (
                            <div key={b.currency} className="flex items-center justify-between text-xs">
                              <span className="text-muted-foreground">{b.currency}</span>
                              <span className="flex items-center gap-2">
                                <span className={cn("font-medium", b.available < 0 ? "text-destructive" : "text-foreground")}>
                                  {fmtMoney(b.available, b.currency)}
                                </span>
                                {b.onHold > 0 ? (
                                  <span className="flex items-center gap-0.5 text-muted-foreground">
                                    <Lock className="h-3 w-3" />
                                    {fmtMoney(b.onHold, b.currency)}
                                  </span>
                                ) : null}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}
            </CardContent>
          </Card>

          {/* Activity log / timeline */}
          <Card ref={logRef} className="scroll-mt-24 border-border bg-card">
            <CardHeader className="pb-2">
              <CardTitle className="flex flex-wrap items-center gap-2 text-sm">
                <Clock className="h-4 w-4 text-primary" /> Activity log
                <span className="text-xs font-normal text-muted-foreground">
                  {report.counts.total} events · {report.counts.ledger} ledger · {report.counts.activity} activity
                </span>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 p-4 pt-0">
              {report.truncated ? (
                <div className="flex items-start gap-2 rounded-lg border border-amber-500/40 bg-amber-500/10 p-2.5 text-xs text-amber-600 dark:text-amber-400">
                  <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                  The log was capped at 5,000 events — narrow the date range for the complete sequence.
                </div>
              ) : null}

              <div className="flex flex-wrap items-center gap-2">
                <div className="relative min-w-0 flex-1">
                  <ListFilter className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    value={eventSearch}
                    onChange={(e) => setEventSearch(e.target.value)}
                    placeholder="Filter events"
                    className="h-9 pl-8 text-base"
                    autoComplete="off"
                    autoCorrect="off"
                    autoCapitalize="none"
                    spellCheck={false}
                  />
                </div>
                <div className="flex overflow-hidden rounded-lg border border-border">
                  {(["all", "Ledger", "Activity"] as SourceFilter[]).map((s) => (
                    <button
                      key={s}
                      onClick={() => setSourceFilter(s)}
                      className={cn(
                        "px-3 py-1.5 text-xs font-medium transition-colors",
                        sourceFilter === s ? "bg-primary text-primary-foreground" : "bg-transparent text-muted-foreground hover:bg-secondary",
                      )}
                    >
                      {s === "all" ? "All" : s}
                    </button>
                  ))}
                </div>
              </div>

              {/* Event-type (category) filter + summary */}
              {report.byCategory.length ? (
                <div className="flex flex-wrap gap-1.5">
                  <button
                    onClick={() => setCategoryFilter("all")}
                    className={cn(
                      "rounded-full border px-2.5 py-1 text-[11px] font-medium transition-colors",
                      categoryFilter === "all"
                        ? "border-primary bg-primary text-primary-foreground"
                        : "border-border bg-secondary/40 text-muted-foreground hover:bg-secondary",
                    )}
                  >
                    All types
                    <span className="ml-1 opacity-70">{report.counts.total}</span>
                  </button>
                  {report.byCategory.map((c) => (
                    <button
                      key={c.category}
                      onClick={() => setCategoryFilter((prev) => (prev === c.category ? "all" : c.category))}
                      className={cn(
                        "rounded-full border px-2.5 py-1 text-[11px] font-medium transition-colors",
                        categoryFilter === c.category
                          ? "border-primary bg-primary text-primary-foreground"
                          : "border-border bg-secondary/40 text-muted-foreground hover:bg-secondary",
                      )}
                    >
                      {c.category}
                      <span className="ml-1 opacity-70">{c.count}</span>
                    </button>
                  ))}
                </div>
              ) : null}

              {visibleTimeline.length === 0 ? (
                <p className="py-8 text-center text-sm text-muted-foreground">
                  No events {report.timeline.length ? "match the filter" : "in the selected period"}.
                </p>
              ) : (
                <ol className="relative space-y-2">
                  {visibleTimeline.map((e, i) => (
                    <TimelineRow key={`${e.ref ?? "e"}-${i}`} event={e} />
                  ))}
                </ol>
              )}
            </CardContent>
          </Card>
        </>
      ) : null}

      {pdfDoc && report ? (
        <PdfPreviewModal
          doc={pdfDoc}
          filename={`investigation-${report.account.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}`}
          title={`Investigation file — ${report.account}`}
          onClose={() => setPdfDoc(null)}
        />
      ) : null}
    </div>
  )
}

function TimelineRow({ event }: { event: TimelineItem }) {
  const isCredit = event.amount !== null && event.amount > 0
  const isDebit = event.amount !== null && event.amount < 0
  return (
    <li className="rounded-lg border border-border bg-secondary/20 p-3">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-1.5">
            <Badge
              variant="outline"
              className={cn(
                "gap-1 text-[10px]",
                event.source === "Ledger" ? "border-primary/40 text-primary" : "border-border text-muted-foreground",
              )}
            >
              {event.source === "Ledger" ? (
                isCredit ? <ArrowDownLeft className="h-3 w-3" /> : <ArrowUpRight className="h-3 w-3" />
              ) : (
                <Clock className="h-3 w-3" />
              )}
              {event.section}
            </Badge>
            <Badge variant="secondary" className="text-[10px]">
              {event.category}
            </Badge>
            {event.compartmentId && event.compartmentId !== "main" ? (
              <Badge variant="outline" className="gap-1 border-amber-500/40 text-[10px] text-amber-600 dark:text-amber-400">
                <Layers className="h-3 w-3" />
                {event.compartment}
              </Badge>
            ) : null}
            <span className="text-xs font-medium text-foreground">{event.type}</span>
          </div>
          {event.description ? (
            <p className="mt-1 break-words text-xs text-muted-foreground">{event.description}</p>
          ) : null}
          <p className="mt-1 text-[10px] text-muted-foreground/80">
            {fmtWhen(event.at)}
            {event.device ? ` · ${event.device}` : ""}
            {event.ip ? ` · ${event.ip}` : ""}
            {event.actor ? ` · ${event.actor}` : ""}
          </p>
        </div>
        {event.amount !== null && event.currency ? (
          <div className="shrink-0 text-right">
            <p className={cn("text-sm font-semibold tabular-nums", isCredit ? "text-emerald-500" : isDebit ? "text-destructive" : "text-foreground")}>
              {signedMoney(event.amount, event.currency)}
            </p>
            {event.balanceAfter !== null ? (
              <p className="text-[10px] text-muted-foreground tabular-nums">
                bal {fmtMoney(event.balanceAfter, event.currency)}
              </p>
            ) : null}
          </div>
        ) : null}
      </div>
    </li>
  )
}
