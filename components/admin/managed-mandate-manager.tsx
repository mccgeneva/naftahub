"use client"

import { useCallback, useEffect, useState } from "react"
import { toast } from "sonner"
import { Briefcase, Check, Landmark, Loader2, Plus, X } from "lucide-react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { MoneyInput } from "@/components/ui/money-input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"

type Status = "pending_financing" | "active" | "closed" | "cancelled"

interface Distribution {
  id: string
  periodLabel: string
  amount: number
  interestCharged: number
  note: string
  status: "pending" | "credited" | "rejected"
  recordedBy: string
  recordedAt: string
}

interface Mandate {
  id: string
  userId: string
  holderLabel: string
  title: string
  currency: string
  deposit: number
  leverageRatio: number
  borrowed: number
  annualInterestRate: number
  targetNote: string
  status: Status
  distributions: Distribution[]
  createdBy: string
  activatedAt: string | null
  exchangeRequestedAt: string | null
  exchangedAt: string | null
  bondReference: string | null
}

const STATUS_LABEL: Record<Status, string> = {
  pending_financing: "Pending financing",
  active: "Active",
  closed: "Closed",
  cancelled: "Cancelled",
}

const RATIOS = [1, 2, 5, 10, 15, 20, 25, 30]
const CURRENCIES = ["EUR", "USD", "GBP", "CHF"]

const fmt = (n: number, ccy: string) =>
  `${ccy} ${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

export function ManagedMandateManager({ passcode }: { passcode: string }) {
  const [mandates, setMandates] = useState<Mandate[]>([])
  const [clients, setClients] = useState<{ id: string; label: string; email: string }[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState<string | null>(null)
  const [showCreate, setShowCreate] = useState(false)
  const [form, setForm] = useState({ userId: "", title: "", currency: "EUR", deposit: "", leverageRatio: "1", targetNote: "" })
  const [bondForm, setBondForm] = useState<Record<string, { isin: string; ref: string }>>({})
  const [distForm, setDistForm] = useState<Record<string, { amount: string; periodLabel: string; note: string }>>({})

  const call = useCallback(
    async (payload: Record<string, unknown>) => {
      const res = await fetch("/api/admin/mandates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pin: passcode, ...payload }),
      })
      return (await res.json().catch(() => ({ ok: false, error: "Network error" }))) as Record<string, unknown>
    },
    [passcode],
  )

  const load = useCallback(async () => {
    const data = await call({ op: "list" })
    if (data.ok) {
      setMandates(data.mandates as Mandate[])
      setClients(data.clients as typeof clients)
    } else toast.error(String(data.error ?? "Could not load mandates"))
    setLoading(false)
  }, [call])

  useEffect(() => {
    void load()
  }, [load])

  async function run(key: string, payload: Record<string, unknown>, success: string) {
    setBusy(key)
    const data = await call(payload)
    setBusy(null)
    if (data.ok) {
      toast.success(success)
      await load()
      return true
    }
    toast.error(String(data.error ?? "Action failed"))
    return false
  }

  async function create() {
    const ok = await run("create", { op: "create", ...form, deposit: Number(form.deposit), leverageRatio: Number(form.leverageRatio) }, "Mandate created — pending financing")
    if (ok) {
      setShowCreate(false)
      setForm({ userId: "", title: "", currency: "EUR", deposit: "", leverageRatio: "1", targetNote: "" })
    }
  }

  return (
    <Card className="min-w-0">
      <CardHeader className="flex flex-col gap-3">
        <div className="flex items-start gap-2">
          <Briefcase className="mt-0.5 h-5 w-5 shrink-0 text-primary" aria-hidden="true" />
          <div className="min-w-0">
            <CardTitle className="text-balance">Managed Mandates</CardTitle>
            <CardDescription className="text-pretty leading-relaxed">
              Reserve a client&apos;s capital, record realised distributions and credit them only after a second
              administrator approves. Nothing is promised in advance and no posting can overdraw the account.
            </CardDescription>
          </div>
        </div>
        <Button className="h-11 w-full sm:w-auto" onClick={() => setShowCreate((v) => !v)} variant={showCreate ? "outline" : "default"}>
          {showCreate ? <X className="h-4 w-4" aria-hidden="true" /> : <Plus className="h-4 w-4" aria-hidden="true" />}
          {showCreate ? "Cancel" : "New mandate"}
        </Button>
      </CardHeader>

      <CardContent className="flex flex-col gap-4">
        {showCreate && (
          <div className="flex flex-col gap-3 rounded-lg border border-border p-4">
            <div className="flex flex-col gap-1.5">
              <Label>Client</Label>
              <Select value={form.userId} onValueChange={(v) => setForm({ ...form, userId: v })}>
                <SelectTrigger className="h-11 w-full text-base">
                  <SelectValue placeholder="Choose a client" />
                </SelectTrigger>
                <SelectContent>
                  {clients.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="mm-title">Mandate name</Label>
              <Input id="mm-title" className="h-11 text-base" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="e.g. Treasury trading mandate" />
            </div>
            <div className="flex gap-3">
              <div className="flex w-28 shrink-0 flex-col gap-1.5">
                <Label>Currency</Label>
                <Select value={form.currency} onValueChange={(v) => setForm({ ...form, currency: v })}>
                  <SelectTrigger className="h-11 w-full text-base">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {CURRENCIES.map((c) => (
                      <SelectItem key={c} value={c}>
                        {c}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                <Label htmlFor="mm-dep">Capital to reserve</Label>
                <MoneyInput id="mm-dep" className="h-11 text-base" value={form.deposit} onValueChange={(v) => setForm({ ...form, deposit: v })} placeholder="10,000,000" />
              </div>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>Leverage (charged at platform debit-interest rates)</Label>
              <Select value={form.leverageRatio} onValueChange={(v) => setForm({ ...form, leverageRatio: v })}>
                <SelectTrigger className="h-11 w-full text-base">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {RATIOS.map((r) => (
                    <SelectItem key={r} value={String(r)}>
                      {r === 1 ? "None (1:1)" : `1:${r}`}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="mm-note">Internal target note (not shown to client, not binding)</Label>
              <Textarea id="mm-note" className="text-base" value={form.targetNote} onChange={(e) => setForm({ ...form, targetNote: e.target.value })} rows={2} />
            </div>
            <Button className="h-11" disabled={busy === "create" || !form.userId || !(Number(form.deposit) > 0)} onClick={create}>
              {busy === "create" && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
              Create (pending financing)
            </Button>
          </div>
        )}

        {loading ? (
          <div className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> Loading mandates…
          </div>
        ) : mandates.length === 0 ? (
          <p className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">No mandates yet.</p>
        ) : (
          mandates.map((m) => {
            const df = distForm[m.id] ?? { amount: "", periodLabel: "", note: "" }
            const bf = bondForm[m.id] ?? { isin: "", ref: "" }
            const pending = m.distributions.filter((d) => d.status === "pending")
            const credited = m.distributions.filter((d) => d.status === "credited")
            const totalCredited = credited.reduce((s, d) => s + d.amount, 0)
            const totalInterest = credited.reduce((s, d) => s + d.interestCharged, 0)
            return (
              <div key={m.id} className="flex min-w-0 flex-col gap-3 rounded-lg border border-border p-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate font-medium">{m.title}</p>
                    <p className="truncate text-sm text-muted-foreground">{m.holderLabel}</p>
                  </div>
                  <Badge variant={m.status === "active" ? "default" : "secondary"} className="shrink-0">
                    {STATUS_LABEL[m.status]}
                  </Badge>
                </div>
                <dl className="grid grid-cols-2 gap-x-3 gap-y-2 text-sm">
                  <dt className="text-muted-foreground">Reserved</dt>
                  <dd className="text-right font-mono tabular-nums">{fmt(m.deposit, m.currency)}</dd>
                  <dt className="text-muted-foreground">Leverage</dt>
                  <dd className="text-right font-mono tabular-nums">
                    {m.leverageRatio > 1 ? `1:${m.leverageRatio} · ${(m.annualInterestRate * 100).toFixed(2)}% p.a.` : "None"}
                  </dd>
                  {m.borrowed > 0 && (
                    <>
                      <dt className="text-muted-foreground">Borrowed</dt>
                      <dd className="text-right font-mono tabular-nums">{fmt(m.borrowed, m.currency)}</dd>
                    </>
                  )}
                  <dt className="text-muted-foreground">Credited to date</dt>
                  <dd className="text-right font-mono tabular-nums">{fmt(totalCredited, m.currency)}</dd>
                  {totalInterest > 0 && (
                    <>
                      <dt className="text-muted-foreground">Interest charged</dt>
                      <dd className="text-right font-mono tabular-nums">{fmt(totalInterest, m.currency)}</dd>
                    </>
                  )}
                </dl>
                {m.targetNote && <p className="rounded-md bg-muted p-2 text-xs leading-relaxed text-muted-foreground">Internal note: {m.targetNote}</p>}

                {m.status === "pending_financing" && (
                  <div className="flex flex-col gap-2 sm:flex-row">
                    <Button className="h-11 flex-1" disabled={busy === `act-${m.id}`} onClick={() => run(`act-${m.id}`, { op: "activate", id: m.id }, "Financing confirmed — capital reserved")}>
                      {busy === `act-${m.id}` && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
                      Confirm financing &amp; activate
                    </Button>
                    <Button variant="outline" className="h-11" disabled={busy === `can-${m.id}`} onClick={() => run(`can-${m.id}`, { op: "cancel", id: m.id }, "Mandate cancelled")}>
                      Cancel
                    </Button>
                  </div>
                )}

                {m.exchangedAt ? (
                  <p className="flex items-start gap-2 rounded-md border border-primary/30 bg-primary/5 p-3 text-sm">
                    <Landmark className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
                    <span className="min-w-0 break-words">
                      HSBC Hong Kong Treasury Bond lodged · {fmt(m.deposit * m.leverageRatio, m.currency)}
                      {m.bondReference ? ` · ${m.bondReference}` : ""}
                    </span>
                  </p>
                ) : (
                  (m.status === "active" || m.exchangeRequestedAt) &&
                  m.status !== "closed" &&
                  m.status !== "cancelled" && (
                    <div className="flex flex-col gap-2 rounded-md border border-border p-3">
                      <p className="flex items-center gap-2 text-sm font-medium">
                        <Landmark className="h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
                        Exchange for HSBC Hong Kong Treasury Bond
                        {m.exchangeRequestedAt && <Badge variant="secondary">Client requested</Badge>}
                      </p>
                      <p className="text-xs leading-relaxed text-muted-foreground">
                        Face value {fmt(m.deposit * m.leverageRatio, m.currency)} ({fmt(m.deposit, m.currency)} × 1:{m.leverageRatio}).
                        Enter the ISIN and reference HSBC Hong Kong issued. The bond is non-transferable, can&apos;t be monetized,
                        and is retired when the mandate closes.
                      </p>
                      {m.status !== "active" ? (
                        <p className="text-xs text-muted-foreground">Confirm financing first — the bond can only be issued on an active mandate.</p>
                      ) : (
                        <>
                          <div className="flex flex-col gap-2 sm:flex-row">
                            <Input className="h-11 text-base sm:w-44" placeholder="ISIN" value={bf.isin} onChange={(e) => setBondForm({ ...bondForm, [m.id]: { ...bf, isin: e.target.value.toUpperCase() } })} aria-label="ISIN" />
                            <Input className="h-11 min-w-0 flex-1 text-base" placeholder="HSBC HK issuance / custody reference" value={bf.ref} onChange={(e) => setBondForm({ ...bondForm, [m.id]: { ...bf, ref: e.target.value } })} aria-label="HSBC reference" />
                          </div>
                          <Button
                            className="h-11"
                            disabled={busy === `bond-${m.id}` || bf.isin.trim().length !== 12 || !bf.ref.trim()}
                            onClick={() => run(`bond-${m.id}`, { op: "issue_bond", id: m.id, isin: bf.isin, bondReference: bf.ref }, "Treasury bond lodged in client's Bank Instruments")}
                          >
                            {busy === `bond-${m.id}` && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
                            Issue &amp; lodge bond
                          </Button>
                        </>
                      )}
                    </div>
                  )
                )}

                {pending.map((d) => (
                  <div key={d.id} className="flex flex-col gap-2 rounded-md border border-amber-500/40 bg-amber-500/5 p-3">
                    <p className="text-sm">
                      <span className="font-medium">{d.periodLabel}</span> · {fmt(d.amount, m.currency)} awaiting second approval
                    </p>
                    {d.note && <p className="text-xs text-muted-foreground">{d.note}</p>}
                    <div className="flex gap-2">
                      <Button className="h-11 flex-1" disabled={busy === `ap-${d.id}`} onClick={() => run(`ap-${d.id}`, { op: "approve", id: m.id, distributionId: d.id }, "Distribution credited")}>
                        <Check className="h-4 w-4" aria-hidden="true" /> Approve &amp; credit
                      </Button>
                      <Button variant="outline" className="h-11" disabled={busy === `rj-${d.id}`} onClick={() => run(`rj-${d.id}`, { op: "reject", id: m.id, distributionId: d.id }, "Distribution rejected")}>
                        Reject
                      </Button>
                    </div>
                  </div>
                ))}

                {m.status === "active" && (
                  <div className="flex flex-col gap-2 rounded-md bg-muted/50 p-3">
                    <p className="text-sm font-medium">Record a realised distribution</p>
                    <div className="flex gap-2">
                      <Input className="h-11 w-28 shrink-0 text-base" placeholder="Period" value={df.periodLabel} onChange={(e) => setDistForm({ ...distForm, [m.id]: { ...df, periodLabel: e.target.value } })} aria-label="Period" />
                      <MoneyInput className="h-11 min-w-0 flex-1 text-base" placeholder="Realised amount" value={df.amount} onValueChange={(v) => setDistForm({ ...distForm, [m.id]: { ...df, amount: v } })} aria-label="Realised amount" />
                    </div>
                    <Input className="h-11 text-base" placeholder="Source / statement reference" value={df.note} onChange={(e) => setDistForm({ ...distForm, [m.id]: { ...df, note: e.target.value } })} aria-label="Note" />
                    <div className="flex flex-col gap-2 sm:flex-row">
                      <Button
                        className="h-11 flex-1"
                        variant="secondary"
                        disabled={busy === `rec-${m.id}` || df.amount === ""}
                        onClick={async () => {
                          const ok = await run(`rec-${m.id}`, { op: "record", id: m.id, amount: Number(df.amount), periodLabel: df.periodLabel, note: df.note }, "Recorded — needs a second administrator to approve")
                          if (ok) setDistForm({ ...distForm, [m.id]: { amount: "", periodLabel: "", note: "" } })
                        }}
                      >
                        Record distribution
                      </Button>
                      <Button variant="outline" className="h-11" disabled={busy === `cl-${m.id}`} onClick={() => run(`cl-${m.id}`, { op: "close", id: m.id }, "Mandate closed — capital released")}>
                        Close mandate
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            )
          })
        )}
      </CardContent>
    </Card>
  )
}
