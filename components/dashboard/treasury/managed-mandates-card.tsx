"use client"

import { useState } from "react"
import Link from "next/link"
import useSWR from "swr"
import { toast } from "sonner"
import { Briefcase, Info, Landmark, Loader2 } from "lucide-react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"

interface ClientMandate {
  id: string
  title: string
  currency: string
  deposit: number
  leverageRatio: number
  borrowed: number
  annualInterestRate: number
  status: "pending_financing" | "active" | "closed" | "cancelled"
  exchangeRequestedAt: string | null
  exchangedAt: string | null
  bondReference: string | null
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

function ExchangePanel({ mandate: m, onChange }: { mandate: ClientMandate; onChange: () => void }) {
  const [busy, setBusy] = useState(false)
  if (m.status === "closed" || m.status === "cancelled") return null
  const faceValue = m.deposit * m.leverageRatio

  if (m.exchangedAt) {
    return (
      <div className="flex flex-col gap-2 rounded-md border border-primary/30 bg-primary/5 p-3 text-sm">
        <p className="flex items-center gap-2 font-medium">
          <Landmark className="h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
          Exchanged for HSBC Hong Kong Treasury Bond
        </p>
        <p className="font-mono text-xs tabular-nums text-muted-foreground">
          {fmt(faceValue, m.currency)}
          {m.bondReference ? ` · ${m.bondReference}` : ""}
        </p>
        <Button asChild variant="outline" className="h-11">
          <Link href="/dashboard/instruments">View in Bank Instruments</Link>
        </Button>
      </div>
    )
  }

  async function send(op: "request_exchange" | "withdraw_exchange") {
    setBusy(true)
    try {
      const res = await fetch("/api/mandates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ op, id: m.id }),
      })
      const json = (await res.json()) as { ok: boolean; error?: string }
      if (!json.ok) throw new Error(json.error ?? "Request failed")
      toast.success(op === "request_exchange" ? "Exchange requested" : "Exchange request withdrawn", {
        description:
          op === "request_exchange"
            ? "MCC Capital will lodge the treasury bond once HSBC Hong Kong confirms issuance."
            : undefined,
      })
      onChange()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Request failed")
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex flex-col gap-3 rounded-md border border-border bg-muted/40 p-3 text-sm">
      <div className="flex flex-col gap-1">
        <p className="flex items-center gap-2 font-medium">
          <Landmark className="h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
          Exchange for a Treasury Bond
        </p>
        <p className="leading-relaxed text-muted-foreground">
          Swap this mandate for a Treasury Bond issued by our partner bank HSBC Hong Kong, lodged in your Bank
          Instruments.
        </p>
      </div>
      <dl className="grid grid-cols-2 gap-x-3 gap-y-1">
        <dt className="text-muted-foreground">Bond face value</dt>
        <dd className="text-right font-mono tabular-nums">{fmt(faceValue, m.currency)}</dd>
        <dt className="col-span-2 text-xs text-muted-foreground">
          {fmt(m.deposit, m.currency)} × 1:{m.leverageRatio}
          {m.borrowed > 0 ? ` — includes ${fmt(m.borrowed, m.currency)} financed by MCC, which stays owed` : ""}
        </dt>
      </dl>
      {m.exchangeRequestedAt ? (
        <div className="flex flex-col gap-2">
          <p className="text-xs leading-relaxed text-muted-foreground">
            {m.status === "active"
              ? "Requested — awaiting HSBC Hong Kong issuance."
              : "Requested — the bond is issued once financing is confirmed and the mandate is active."}
          </p>
          <Button variant="outline" className="h-11" disabled={busy} onClick={() => send("withdraw_exchange")}>
            {busy && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
            Withdraw request
          </Button>
        </div>
      ) : (
        <Button className="h-11" disabled={busy} onClick={() => send("request_exchange")}>
          {busy && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
          Request exchange
        </Button>
      )}
    </div>
  )
}

export function ManagedMandatesCard() {
  const { data, mutate } = useSWR<{ ok: boolean; mandates: ClientMandate[] }>("/api/mandates", fetcher, { refreshInterval: 30000 })
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
              <ExchangePanel mandate={m} onChange={() => mutate()} />
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
