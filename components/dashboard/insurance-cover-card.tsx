"use client"

import { useMemo } from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { ShieldCheck, ChevronRight } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { useLedger } from "@/lib/ledger-store"
import { useLeverageRequests } from "@/lib/leverage-requests-store"

interface CoverPolicy {
  id: string
  label: string
  premium: number
  currency: string
  coverAmount: number | null
  purchasedAt: string
  active: boolean
}

const PPI_PREFIX = "LEV-PPI-"
const NON_POLICY_SUFFIXES = ["REFUND-", "ADJUST-", "APPEAL-"]

function fmt(amount: number, currency: string) {
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency,
      maximumFractionDigits: 2,
    }).format(amount)
  } catch {
    return `${currency} ${amount.toLocaleString("en-US", { maximumFractionDigits: 2 })}`
  }
}

function formatDate(iso: string) {
  const d = new Date(iso)
  return Number.isNaN(d.getTime())
    ? "—"
    : d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })
}

export function InsuranceCoverCard({ compact = false }: { compact?: boolean }) {
  const pathname = usePathname()
  const { entries } = useLedger()
  const { requests } = useLeverageRequests()

  const policies = useMemo<CoverPolicy[]>(() => {
    const premiums = entries.filter(
      (e) =>
        e.direction === "debit" &&
        e.status === "completed" &&
        e.id.startsWith(PPI_PREFIX) &&
        !NON_POLICY_SUFFIXES.some((s) => e.id.slice(PPI_PREFIX.length).startsWith(s)),
    )

    return premiums.map((e) => {
      const lineId = e.id.slice(PPI_PREFIX.length)
      const refunds = entries
        .filter(
          (r) =>
            r.direction === "credit" &&
            (r.id === `LEV-PPI-ADJUST-${lineId}` || r.id === `LEV-PPI-REFUND-${lineId}`),
        )
        .reduce((sum, r) => sum + r.amount, 0)
      const line = requests.find((r) => r.approvalId === lineId || r.id === lineId)
      const active = line ? line.status === "approved" || line.status === "switchoff_pending" : true
      return {
        id: lineId,
        label: line
          ? `${line.accountLabel} · 1:${line.leverageRatio} leverage line`
          : "Leverage line",
        premium: Math.max(0, e.amount - refunds),
        currency: e.currency,
        coverAmount: line?.buyingPower ?? null,
        purchasedAt: e.date,
        active,
      }
    })
  }, [entries, requests])

  if (policies.length === 0) return null

  const activePolicies = policies.filter((p) => p.active)
  const shown = compact ? activePolicies : policies

  if (shown.length === 0) return null

  return (
    <Card className="border-primary/30">
      <CardHeader className="flex flex-row items-start gap-3 pb-3">
        <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
          <ShieldCheck className="size-5" aria-hidden="true" />
        </div>
        <div className="min-w-0 flex-1">
          <CardTitle className="text-base text-balance">Payment Protection Insurance in place</CardTitle>
          <p className="mt-1 text-sm leading-relaxed text-muted-foreground text-pretty">
            {activePolicies.length > 0
              ? "Your PPI cover protects your trading and debit positions against loss, default and repayment risk while the line is open."
              : "Your past PPI cover is listed below for your records."}
          </p>
        </div>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {shown.map((p) => (
          <div key={p.id} className="flex flex-col gap-2 rounded-lg border border-border bg-muted/40 p-3">
            <div className="flex items-center justify-between gap-2">
              <span className="min-w-0 truncate text-sm font-medium">{p.label}</span>
              <Badge variant={p.active ? "default" : "secondary"} className="shrink-0">
                {p.active ? "Active" : "Ended"}
              </Badge>
            </div>
            <dl className="grid grid-cols-2 gap-x-3 gap-y-2 text-sm">
              {p.coverAmount != null && (
                <div className="flex flex-col">
                  <dt className="text-xs text-muted-foreground">Position covered</dt>
                  <dd className="font-mono tabular-nums">{fmt(p.coverAmount, p.currency)}</dd>
                </div>
              )}
              <div className="flex flex-col">
                <dt className="text-xs text-muted-foreground">Premium paid</dt>
                <dd className="font-mono tabular-nums">{fmt(p.premium, p.currency)}</dd>
              </div>
              <div className="flex flex-col">
                <dt className="text-xs text-muted-foreground">In force since</dt>
                <dd>{formatDate(p.purchasedAt)}</dd>
              </div>
              <div className="flex flex-col">
                <dt className="text-xs text-muted-foreground">Covers</dt>
                <dd>Trading &amp; debits</dd>
              </div>
            </dl>
          </div>
        ))}
        <Link
          href="/dashboard/leverage?tab=lines"
          onClick={(e) => {
            if (pathname === "/dashboard/leverage") {
              e.preventDefault()
              window.dispatchEvent(new CustomEvent("nqai:leverage-tab", { detail: "lines" }))
            }
          }}
          className="flex min-h-11 items-center justify-between rounded-md px-1 text-sm font-medium text-primary"
        >
          View my leverage lines
          <ChevronRight className="size-4" aria-hidden="true" />
        </Link>
      </CardContent>
    </Card>
  )
}
