"use client"

import { useMemo } from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { ShieldCheck, ChevronRight } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { useLedger } from "@/lib/ledger-store"
import { useLeverageRequests } from "@/lib/leverage-requests-store"
import useSWR from "swr"
import {
  PPI_INSURER,
  PPI_STATUS_LABEL,
  effectivePpiStatus,
  ppiPremiumDue,
  type PpiPolicy,
} from "@/lib/ppi-insurance"

interface CoverPolicy {
  id: string
  label: string
  premium: number
  currency: string
  coverAmount: number | null
  purchasedAt: string
  active: boolean
  statusLabel: string
  coverLabel: string
  covers: string
  expiresAt?: string | null
  remainingCover?: number | null
  reference?: string | null
}

type PpiResponse = { ok: boolean; policy: (PpiPolicy & { remainingCover?: number }) | null }

async function fetchPpi(url: string): Promise<PpiResponse> {
  const res = await fetch(url, { cache: "no-store" })
  if (!res.ok) return { ok: false, policy: null }
  return res.json()
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

  const { data: ppiData } = useSWR<PpiResponse>("/api/ppi", fetchPpi, {
    refreshInterval: 60000,
    revalidateOnFocus: false,
  })

  const policies = useMemo<CoverPolicy[]>(() => {
    const out: CoverPolicy[] = []
    const lp = ppiData?.ok ? ppiData.policy : null
    if (lp) {
      const status = effectivePpiStatus(lp)
      if (status !== "negotiating" && status !== "cancelled") {
        out.push({
          id: lp.id,
          label: `${lp.insurer || PPI_INSURER} — account PPI`,
          premium: ppiPremiumDue(lp),
          currency: lp.currency || "EUR",
          coverAmount: lp.coverAmount,
          purchasedAt: lp.activatedAt ?? lp.createdAt,
          active: status === "active",
          statusLabel: PPI_STATUS_LABEL[status],
          coverLabel: "Sum insured",
          expiresAt: lp.expiresAt,
          remainingCover: lp.remainingCover ?? null,
          reference: lp.lloydsReference || null,
          covers: "All debits, leverage, loans, PPP & overdraft",
        })
      }
    }

    const premiums = entries.filter(
      (e) =>
        e.direction === "debit" &&
        e.status === "completed" &&
        e.id.startsWith(PPI_PREFIX) &&
        !NON_POLICY_SUFFIXES.some((s) => e.id.slice(PPI_PREFIX.length).startsWith(s)),
    )

    const linePolicies = premiums.map((e): CoverPolicy => {
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
          ? `Leverage line PPI · 1:${line.leverageRatio} ${line.accountLabel}`
          : "Leverage line PPI",
        premium: Math.max(0, e.amount - refunds),
        currency: e.currency,
        coverAmount: line?.buyingPower ?? null,
        purchasedAt: e.date,
        active,
        statusLabel: active ? "Active" : "Ended",
        coverLabel: "Position covered",
        covers: "This leverage line",
      }
    })
    return [...out, ...linePolicies]
  }, [entries, requests, ppiData])

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
                {p.statusLabel}
              </Badge>
            </div>
            <dl className="grid grid-cols-2 gap-x-3 gap-y-2 text-sm">
              {p.coverAmount != null && (
                <div className="flex min-w-0 flex-col">
                  <dt className="text-xs text-muted-foreground">{p.coverLabel}</dt>
                  <dd className="break-all font-mono tabular-nums">{fmt(p.coverAmount, p.currency)}</dd>
                </div>
              )}
              <div className="flex min-w-0 flex-col">
                <dt className="text-xs text-muted-foreground">Premium paid</dt>
                <dd className="break-all font-mono tabular-nums">{fmt(p.premium, p.currency)}</dd>
              </div>
              {p.remainingCover != null && p.coverAmount != null && p.remainingCover < p.coverAmount && (
                <div className="flex min-w-0 flex-col">
                  <dt className="text-xs text-muted-foreground">Cover remaining</dt>
                  <dd className="break-all font-mono tabular-nums">{fmt(p.remainingCover, p.currency)}</dd>
                </div>
              )}
              <div className="flex flex-col">
                <dt className="text-xs text-muted-foreground">In force since</dt>
                <dd>{formatDate(p.purchasedAt)}</dd>
              </div>
              {p.expiresAt && (
                <div className="flex flex-col">
                  <dt className="text-xs text-muted-foreground">Valid until</dt>
                  <dd>{formatDate(p.expiresAt)}</dd>
                </div>
              )}
              <div className="col-span-2 flex flex-col">
                <dt className="text-xs text-muted-foreground">Covers</dt>
                <dd>{p.covers}</dd>
              </div>
              {p.reference && (
                <div className="col-span-2 flex flex-col">
                  <dt className="text-xs text-muted-foreground">Policy reference</dt>
                  <dd className="break-all font-mono text-xs">{p.reference}</dd>
                </div>
              )}
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
