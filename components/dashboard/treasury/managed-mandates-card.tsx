"use client"

import useSWR from "swr"
import { Briefcase, Info } from "lucide-react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"

interface ClientMandate {
  id: string
  title: string
  currency: string
  deposit: number
  leverageRatio: number
  borrowed: number
  annualInterestRate: number
  status: "pending_financing" | "active" | "closed" | "cancelled"
  distributions: { id: string; periodLabel: string; amount: number; interestCharged: number; approvedAt?: string }[]
}

const STATUS_LABEL: Record<ClientMandate["status"], string> = {
  pending_financing: "Pending financing",
  active: "Active",
  closed: "Closed",
  cancelled: "Cancelled",
}

const fmt = (n: number, ccy: string) =>
  `${ccy} ${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

const fetcher = (url: string) => fetch(url).then((r) => r.json())

export function ManagedMandatesCard() {
  const { data } = useSWR<{ ok: boolean; mandates: ClientMandate[] }>("/api/mandates", fetcher, { refreshInterval: 30000 })
  const mandates = data?.mandates ?? []
  if (mandates.length === 0) return null

  return (
    <Card className="min-w-0">
      <CardHeader>
        <div className="flex items-start gap-2">
          <Briefcase className="mt-0.5 h-5 w-5 shrink-0 text-primary" aria-hidden="true" />
          <div className="min-w-0">
            <CardTitle>Managed Mandates</CardTitle>
            <CardDescription className="text-pretty leading-relaxed">Capital managed on your behalf by MCC Capital.</CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {mandates.map((m) => {
          const credited = m.distributions.reduce((s, d) => s + d.amount, 0)
          const interest = m.distributions.reduce((s, d) => s + d.interestCharged, 0)
          return (
            <div key={m.id} className="flex flex-col gap-3 rounded-lg border border-border p-4">
              <div className="flex items-start justify-between gap-2">
                <p className="min-w-0 truncate font-medium">{m.title}</p>
                <Badge variant={m.status === "active" ? "default" : "secondary"} className="shrink-0">
                  {STATUS_LABEL[m.status]}
                </Badge>
              </div>
              <dl className="grid grid-cols-2 gap-x-3 gap-y-2 text-sm">
                <dt className="text-muted-foreground">Capital reserved</dt>
                <dd className="text-right font-mono tabular-nums">{fmt(m.deposit, m.currency)}</dd>
                {m.leverageRatio > 1 && (
                  <>
                    <dt className="text-muted-foreground">Leverage</dt>
                    <dd className="text-right font-mono tabular-nums">
                      1:{m.leverageRatio} · {(m.annualInterestRate * 100).toFixed(2)}% p.a.
                    </dd>
                  </>
                )}
                <dt className="text-muted-foreground">Distributions received</dt>
                <dd className="text-right font-mono tabular-nums">{fmt(credited, m.currency)}</dd>
                {interest > 0 && (
                  <>
                    <dt className="text-muted-foreground">Debit interest paid</dt>
                    <dd className="text-right font-mono tabular-nums">{fmt(interest, m.currency)}</dd>
                  </>
                )}
              </dl>
              {m.distributions.length > 0 && (
                <ul className="flex flex-col divide-y divide-border rounded-md border border-border text-sm">
                  {m.distributions.map((d) => (
                    <li key={d.id} className="flex items-center justify-between gap-2 px-3 py-2">
                      <span className="text-muted-foreground">{d.periodLabel}</span>
                      <span className="font-mono tabular-nums">+{fmt(d.amount, m.currency)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )
        })}
        <p className="flex gap-2 text-xs leading-relaxed text-muted-foreground">
          <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          Returns are not guaranteed. Distributions reflect realised performance only, are credited after
          administrator approval, and past distributions do not indicate future results. Your capital can lose value.
        </p>
      </CardContent>
    </Card>
  )
}
