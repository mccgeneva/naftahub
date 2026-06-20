"use client"

import { useEffect, useMemo, useState } from "react"
import {
  ShieldCheck,
  Layers,
  Wallet,
  Inbox,
  Users,
  ArrowRight,
  Clock,
  RefreshCw,
  AlertTriangle,
} from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"
import { adminListAllSkr, type SkrOverviewRow } from "@/app/actions/skr"
import { ADMIN_PASSCODE } from "@/lib/admin-config"
import { formatSkrValue, SKR_STATUS_LABELS, type SkrStatus, type SkrRecord } from "@/lib/skr-store"

const STATUS_TONE: Record<SkrStatus, string> = {
  active: "bg-emerald-500/10 text-emerald-600 border-emerald-500/20",
  pending: "bg-amber-500/10 text-amber-600 border-amber-500/20",
  matured: "bg-sky-500/10 text-sky-600 border-sky-500/20",
  transferred: "bg-indigo-500/10 text-indigo-600 border-indigo-500/20",
  suspended: "bg-orange-500/10 text-orange-600 border-orange-500/20",
  cancelled: "bg-rose-500/10 text-rose-600 border-rose-500/20",
}

const formatDate = (iso?: string) => {
  if (!iso) return "—"
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleDateString("en-GB")
}

interface SkrOverviewProps {
  /** Switch the admin panel into the SKR Management section. */
  onManage: () => void
}

export function SkrOverview({ onManage }: SkrOverviewProps) {
  const [records, setRecords] = useState<SkrOverviewRow[]>([])
  const [requests, setRequests] = useState<SkrOverviewRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = () => {
    setLoading(true)
    adminListAllSkr(ADMIN_PASSCODE)
      .then((res) => {
        if (res.ok) {
          setRecords(res.records)
          setRequests(res.requests)
          setError(null)
        } else {
          setError(res.error)
        }
      })
      .catch((err) => setError((err as Error).message))
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Treat each row's JSON data as a full SkrRecord for aggregation.
  const recs = useMemo(
    () => records.map((r) => ({ row: r, rec: r.data as unknown as SkrRecord })),
    [records],
  )

  const totalCount = recs.length
  const activeCount = recs.filter((r) => r.rec.status === "active").length
  const pendingRequests = requests.filter((r) => (r.data as { status?: string }).status === "pending").length

  // Aggregate face value per currency.
  const valueByCurrency = useMemo(() => {
    const map = new Map<string, number>()
    for (const { rec } of recs) {
      const cur = rec.currency || "—"
      map.set(cur, (map.get(cur) ?? 0) + (Number(rec.faceValue) || 0))
    }
    return Array.from(map.entries()).sort((a, b) => b[1] - a[1])
  }, [recs])

  // Count by status.
  const byStatus = useMemo(() => {
    const map = new Map<SkrStatus, number>()
    for (const { rec } of recs) {
      const s = (rec.status ?? "active") as SkrStatus
      map.set(s, (map.get(s) ?? 0) + 1)
    }
    return map
  }, [recs])

  // Top clients by number of SKRs held.
  const topClients = useMemo(() => {
    const map = new Map<string, { name: string; company: string; count: number }>()
    for (const { row } of recs) {
      const cur = map.get(row.userId) ?? { name: row.clientName, company: row.clientCompany, count: 0 }
      cur.count += 1
      map.set(row.userId, cur)
    }
    return Array.from(map.values())
      .sort((a, b) => b.count - a.count)
      .slice(0, 5)
  }, [recs])

  const recent = recs.slice(0, 8)

  const metrics = [
    { label: "Total SKRs", value: String(totalCount), icon: Layers, hint: `${activeCount} active` },
    {
      label: "Currencies",
      value: String(valueByCurrency.length),
      icon: Wallet,
      hint: valueByCurrency.length ? valueByCurrency.map(([c]) => c).join(" · ") : "No holdings",
    },
    { label: "Clients holding", value: String(topClients.length ? new Set(recs.map((r) => r.row.userId)).size : 0), icon: Users, hint: "with SKRs" },
    { label: "Pending requests", value: String(pendingRequests), icon: Inbox, hint: "awaiting the desk" },
  ]

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary/10">
            <ShieldCheck className="h-6 w-6 text-primary" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-foreground">Safe Keeping Receipts — Overview</h2>
            <p className="text-sm text-muted-foreground text-pretty">
              Portfolio-wide custody position across every client account.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={load} disabled={loading}>
            <RefreshCw className={cn("mr-2 h-4 w-4", loading && "animate-spin")} />
            Refresh
          </Button>
          <Button size="sm" onClick={onManage}>
            Manage SKRs
            <ArrowRight className="ml-2 h-4 w-4" />
          </Button>
        </div>
      </div>

      {error && (
        <Card className="border-destructive/30 bg-destructive/5">
          <CardContent className="flex items-center gap-2 p-4 text-sm text-destructive">
            <AlertTriangle className="h-4 w-4" />
            {error}
          </CardContent>
        </Card>
      )}

      {/* Metric tiles */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {metrics.map((m) => {
          const Icon = m.icon
          return (
            <Card key={m.label} className="bg-card border-border">
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <p className="text-xs text-muted-foreground">{m.label}</p>
                  <Icon className="h-4 w-4 text-muted-foreground" />
                </div>
                <p className="mt-2 text-2xl font-bold text-foreground">{loading ? "—" : m.value}</p>
                <p className="mt-1 truncate text-[11px] text-muted-foreground">{m.hint}</p>
              </CardContent>
            </Card>
          )
        })}
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Value by currency */}
        <Card className="bg-card border-border lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-base">Custody value by currency</CardTitle>
          </CardHeader>
          <CardContent>
            {valueByCurrency.length === 0 ? (
              <p className="text-sm text-muted-foreground">No SKRs on record yet.</p>
            ) : (
              <ul className="space-y-3">
                {valueByCurrency.map(([currency, total]) => (
                  <li
                    key={currency}
                    className="flex items-center justify-between rounded-lg border border-border bg-secondary/30 px-4 py-3"
                  >
                    <span className="text-sm font-medium text-foreground">{currency}</span>
                    <span className="font-mono text-sm font-semibold text-foreground">
                      {formatSkrValue(total, currency)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        {/* Status breakdown */}
        <Card className="bg-card border-border">
          <CardHeader>
            <CardTitle className="text-base">By status</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2">
              {(Object.keys(SKR_STATUS_LABELS) as SkrStatus[]).map((status) => (
                <li key={status} className="flex items-center justify-between">
                  <Badge variant="outline" className={cn("font-normal", STATUS_TONE[status])}>
                    {SKR_STATUS_LABELS[status]}
                  </Badge>
                  <span className="text-sm font-semibold text-foreground">{byStatus.get(status) ?? 0}</span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Recent SKRs */}
        <Card className="bg-card border-border lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-base">Recently issued</CardTitle>
          </CardHeader>
          <CardContent>
            {recent.length === 0 ? (
              <p className="text-sm text-muted-foreground">No SKRs to display.</p>
            ) : (
              <div className="overflow-hidden rounded-lg border border-border">
                <table className="w-full text-sm">
                  <thead className="bg-secondary/40 text-xs text-muted-foreground">
                    <tr>
                      <th className="px-3 py-2 text-left font-medium">Reference</th>
                      <th className="px-3 py-2 text-left font-medium">Client</th>
                      <th className="hidden px-3 py-2 text-left font-medium sm:table-cell">Custodian</th>
                      <th className="px-3 py-2 text-right font-medium">Face value</th>
                      <th className="px-3 py-2 text-right font-medium">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {recent.map(({ row, rec }) => (
                      <tr key={row.id} className="bg-card">
                        <td className="px-3 py-2 font-mono text-xs text-foreground">{rec.id}</td>
                        <td className="px-3 py-2 text-foreground">
                          <span className="block truncate">{row.clientName}</span>
                          {row.clientCompany && (
                            <span className="block truncate text-[11px] text-muted-foreground">
                              {row.clientCompany}
                            </span>
                          )}
                        </td>
                        <td className="hidden px-3 py-2 text-muted-foreground sm:table-cell">
                          <span className="block max-w-[160px] truncate">{rec.custodian || "—"}</span>
                        </td>
                        <td className="px-3 py-2 text-right font-mono text-xs text-foreground">
                          {formatSkrValue(Number(rec.faceValue) || 0, rec.currency || "—")}
                        </td>
                        <td className="px-3 py-2 text-right">
                          <Badge
                            variant="outline"
                            className={cn("font-normal", STATUS_TONE[(rec.status ?? "active") as SkrStatus])}
                          >
                            {SKR_STATUS_LABELS[(rec.status ?? "active") as SkrStatus]}
                          </Badge>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Top clients */}
        <Card className="bg-card border-border">
          <CardHeader>
            <CardTitle className="text-base">Top clients by holdings</CardTitle>
          </CardHeader>
          <CardContent>
            {topClients.length === 0 ? (
              <p className="text-sm text-muted-foreground">No client holdings yet.</p>
            ) : (
              <ul className="space-y-3">
                {topClients.map((c, i) => (
                  <li key={`${c.name}-${i}`} className="flex items-center justify-between gap-2">
                    <div className="flex min-w-0 items-center gap-2">
                      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
                        {i + 1}
                      </span>
                      <div className="min-w-0">
                        <span className="block truncate text-sm text-foreground">{c.name}</span>
                        {c.company && (
                          <span className="block truncate text-[11px] text-muted-foreground">{c.company}</span>
                        )}
                      </div>
                    </div>
                    <span className="shrink-0 text-sm font-semibold text-foreground">{c.count}</span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Pending client requests */}
      <Card className="bg-card border-border">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Clock className="h-4 w-4 text-muted-foreground" />
            Open client requests
          </CardTitle>
        </CardHeader>
        <CardContent>
          {pendingRequests === 0 ? (
            <p className="text-sm text-muted-foreground">No open client requests. The desk is all caught up.</p>
          ) : (
            <ul className="space-y-2">
              {requests
                .filter((r) => (r.data as { status?: string }).status === "pending")
                .slice(0, 6)
                .map((r) => {
                  const d = r.data as { type?: string; message?: string; recordId?: string }
                  return (
                    <li
                      key={r.id}
                      className="flex items-start justify-between gap-3 rounded-lg border border-border bg-secondary/30 px-4 py-3"
                    >
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-foreground">
                          {d.type ?? "Request"}
                          {d.recordId ? ` · ${d.recordId}` : ""}
                        </p>
                        <p className="truncate text-xs text-muted-foreground">
                          {r.clientName}
                          {d.message ? ` — ${d.message}` : ""}
                        </p>
                      </div>
                      <Badge variant="outline" className={cn("shrink-0 font-normal", STATUS_TONE.pending)}>
                        {formatDate(r.createdAt)}
                      </Badge>
                    </li>
                  )
                })}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
