"use client"

import { useMemo, useState } from "react"
import { ChevronRight, CalendarClock, CheckCircle2, Info } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { cn } from "@/lib/utils"
import type { DebitCharge } from "@/lib/debit-schedule"

interface MonthCell {
  key: string // YYYY-MM
  label: string // "Jul 2026"
  longLabel: string // "July 2026"
  total: number
  currency: string
  count: number
  posted: boolean
  hasUpcoming: boolean
  isCurrent: boolean
  charges: DebitCharge[]
}

function money(amount: number, currency: string): string {
  return `${currency} ${Number(amount).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`
}

const KIND_LABELS: Record<string, string> = {
  leverage: "Leverage line",
  funding: "Project funding",
  treasury: "Treasury deposit financing",
  loan: "Internal loan",
  internal_loan: "Internal loan",
  monetization: "Monetization advance",
}

function kindLabel(kind: string): string {
  return KIND_LABELS[kind] ?? kind.replace(/_/g, " ")
}

function chargeDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })
}

/**
 * Year-at-a-glance month grid. Every month between the first charge and the
 * projection horizon is a cell showing the total debited/projected that month
 * and whether it is already posted or upcoming. Tapping a month opens a
 * breakdown of every charge that makes up the total.
 */
export function DebitCalendar({ charges, now = new Date() }: { charges: DebitCharge[]; now?: Date }) {
  const [openKey, setOpenKey] = useState<string | null>(null)

  const months = useMemo<MonthCell[]>(() => {
    if (charges.length === 0) return []
    const map = new Map<string, MonthCell>()
    const currency = charges[0]?.currency ?? "EUR"
    const nowKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`

    for (const c of charges) {
      const existing = map.get(c.yearMonth)
      if (existing) {
        existing.total += c.amount
        existing.count += 1
        existing.posted = existing.posted && c.posted
        existing.hasUpcoming = existing.hasUpcoming || c.upcoming
        existing.charges.push(c)
      } else {
        const d = new Date(c.date)
        map.set(c.yearMonth, {
          key: c.yearMonth,
          label: d.toLocaleDateString("en-GB", { month: "short", year: "numeric" }),
          longLabel: d.toLocaleDateString("en-GB", { month: "long", year: "numeric" }),
          total: c.amount,
          currency,
          count: 1,
          posted: c.posted,
          hasUpcoming: c.upcoming,
          isCurrent: c.yearMonth === nowKey,
          charges: [c],
        })
      }
    }
    for (const m of map.values()) m.charges.sort((a, b) => b.amount - a.amount)
    return Array.from(map.values()).sort((a, b) => a.key.localeCompare(b.key))
  }, [charges, now])

  const open = months.find((m) => m.key === openKey) ?? null

  if (months.length === 0) return null

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Charge calendar</CardTitle>
        <CardDescription className="text-pretty">
          When each monthly debit falls and how much. Past charges are settled; upcoming ones are projected at today&apos;s
          principal and rate. Tap any month to see exactly what it&apos;s made of.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {months.map((m) => (
            <button
              key={m.key}
              type="button"
              onClick={() => setOpenKey(m.key)}
              aria-label={`${m.longLabel}: ${money(m.total, m.currency)}, ${m.count} ${m.count === 1 ? "charge" : "charges"}. Open details`}
              className={cn(
                "flex min-h-11 flex-col gap-1 rounded-lg border p-3 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary active:scale-[0.98]",
                m.hasUpcoming
                  ? "border-primary/40 bg-primary/5 hover:bg-primary/10"
                  : "border-border bg-secondary/30 hover:bg-secondary/60",
                m.isCurrent && "ring-2 ring-primary/50",
              )}
            >
              <div className="flex items-center justify-between gap-1">
                <span className="text-xs font-medium text-muted-foreground">{m.label}</span>
                <Badge
                  variant="outline"
                  className={cn(
                    "px-1.5 py-0 text-[10px]",
                    m.hasUpcoming ? "border-primary/40 text-primary" : "text-muted-foreground",
                  )}
                >
                  {m.hasUpcoming ? "Due" : "Paid"}
                </Badge>
              </div>
              <span className="text-sm font-semibold text-foreground tabular-nums break-words">
                {money(m.total, m.currency)}
              </span>
              <span className="flex items-center justify-between text-[11px] text-muted-foreground">
                <span>
                  {m.count} {m.count === 1 ? "charge" : "charges"}
                </span>
                <span className="flex items-center gap-0.5 text-primary">
                  Details
                  <ChevronRight className="h-3 w-3" aria-hidden />
                </span>
              </span>
            </button>
          ))}
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-4 text-xs text-muted-foreground">
          <span className="flex items-center gap-1.5">
            <span className="inline-block h-3 w-3 rounded-sm border border-border bg-secondary/60" /> Settled
          </span>
          <span className="flex items-center gap-1.5">
            <span className="inline-block h-3 w-3 rounded-sm border border-primary/40 bg-primary/10" /> Upcoming
          </span>
          <span className="flex items-center gap-1.5">
            <span className="inline-block h-3 w-3 rounded-sm ring-2 ring-primary/50" /> Current month
          </span>
        </div>
      </CardContent>

      <Dialog open={!!open} onOpenChange={(v) => !v && setOpenKey(null)}>
        <DialogContent className="flex max-h-[88dvh] max-w-lg flex-col overflow-hidden">
          {open && (
            <>
              <DialogHeader className="shrink-0">
                <DialogTitle className="flex items-center gap-2">
                  {open.hasUpcoming ? (
                    <CalendarClock className="h-5 w-5 text-primary" aria-hidden />
                  ) : (
                    <CheckCircle2 className="h-5 w-5 text-muted-foreground" aria-hidden />
                  )}
                  {open.longLabel}
                </DialogTitle>
                <DialogDescription className="text-pretty">
                  {open.hasUpcoming
                    ? "These charges are upcoming. They will be debited from your Master Account at month-end."
                    : "These charges were already debited from your Master Account."}
                </DialogDescription>
              </DialogHeader>

              <div className="min-h-0 flex-1 overflow-y-auto pr-1">
                <div
                  className={cn(
                    "rounded-lg border p-4",
                    open.hasUpcoming ? "border-primary/40 bg-primary/5" : "border-border bg-secondary/30",
                  )}
                >
                  <p className="text-xs text-muted-foreground">
                    {open.hasUpcoming ? "Total due this month" : "Total paid this month"}
                  </p>
                  <p className="mt-1 text-2xl font-semibold tabular-nums text-foreground break-words">
                    {money(open.total, open.currency)}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {open.count} {open.count === 1 ? "charge" : "charges"} — the breakdown is below.
                  </p>
                </div>

                <ul className="mt-4 flex flex-col gap-3">
                  {open.charges.map((c) => {
                    const share = open.total > 0 ? (c.amount / open.total) * 100 : 0
                    return (
                      <li key={c.id} className="rounded-lg border border-border bg-card p-3">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="text-sm font-medium text-foreground">{c.category || kindLabel(c.kind)}</p>
                            <p className="text-xs text-muted-foreground">{kindLabel(c.kind)}</p>
                          </div>
                          <Badge
                            variant="outline"
                            className={cn(
                              "shrink-0 px-1.5 py-0 text-[10px]",
                              c.upcoming ? "border-primary/40 text-primary" : "text-muted-foreground",
                            )}
                          >
                            {c.posted ? "Paid" : c.upcoming ? "Projected" : "Due"}
                          </Badge>
                        </div>

                        <p className="mt-2 text-lg font-semibold tabular-nums text-foreground break-words">
                          {money(c.amount, c.currency)}
                        </p>

                        <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
                          <dt className="text-muted-foreground">Debit date</dt>
                          <dd className="text-right text-foreground">{chargeDate(c.date)}</dd>
                          <dt className="text-muted-foreground">Share of month</dt>
                          <dd className="text-right text-foreground tabular-nums">{share.toFixed(1)}%</dd>
                          <dt className="text-muted-foreground">Facility ref.</dt>
                          <dd className="truncate text-right font-mono text-foreground">{c.facilityId}</dd>
                          {c.prorated && (
                            <>
                              <dt className="text-muted-foreground">Period</dt>
                              <dd className="text-right text-foreground">Part month (pro-rated)</dd>
                            </>
                          )}
                        </dl>

                        {c.note && (
                          <p className="mt-2 text-xs leading-relaxed text-muted-foreground text-pretty">{c.note}</p>
                        )}
                      </li>
                    )
                  })}
                </ul>

                <div className="mt-4 flex gap-2 rounded-lg border border-border bg-secondary/30 p-3 text-xs leading-relaxed text-muted-foreground">
                  <Info className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
                  <p className="text-pretty">
                    {open.hasUpcoming
                      ? "Projected amounts use today's outstanding principal and rate. Repaying or closing a facility lowers or removes its future charges."
                      : "Settled charges appear in your Transactions with the same amounts."}
                  </p>
                </div>
              </div>

              <DialogFooter className="shrink-0 border-t border-border pt-4">
                <Button className="min-h-11 w-full sm:w-auto" onClick={() => setOpenKey(null)}>
                  Close
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </Card>
  )
}
