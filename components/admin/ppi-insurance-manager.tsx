"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { toast } from "sonner"
import { Loader2, ShieldCheck, Search, Handshake, CheckCircle2, XCircle, Umbrella } from "lucide-react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { MoneyInput } from "@/components/ui/money-input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import {
  PPI_INSURER,
  PPI_VALIDITY_DAYS,
  effectivePpiStatus,
  ppiPremiumDue,
  ppiRemainingCover,
  type PpiPolicy,
  type PpiQuote,
  type PpiExposure,
} from "@/lib/ppi-insurance"

type Client = { id: string; fullName: string; company: string; email: string }
type Analysis = {
  exposure: PpiExposure
  quote: PpiQuote
  availableBalanceEur: number
  guaranteesEur: number
  riskBand: string
}

const eur = (n: number) =>
  `EUR ${(Number(n) || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
const pct = (n: number) => `${(n * 100).toFixed(2)}%`

const STATUS_STYLE: Record<string, string> = {
  negotiating: "border-amber-500/40 bg-amber-500/10 text-amber-600",
  active: "border-emerald-500/40 bg-emerald-500/10 text-emerald-600",
  expired: "border-border bg-muted text-muted-foreground",
  cancelled: "border-border bg-muted text-muted-foreground",
}

export function PpiInsuranceManager({ passcode }: { passcode: string }) {
  const [clients, setClients] = useState<Client[]>([])
  const [policies, setPolicies] = useState<PpiPolicy[]>([])
  const [loading, setLoading] = useState(true)
  const [userId, setUserId] = useState("")
  const [analysis, setAnalysis] = useState<Analysis | null>(null)
  const [analyzing, setAnalyzing] = useState(false)
  const [policyId, setPolicyId] = useState<string | null>(null)
  const [negotiated, setNegotiated] = useState("")
  const [reference, setReference] = useState("")
  const [note, setNote] = useState("")
  const [busy, setBusy] = useState<"save" | "activate" | null>(null)

  const call = useCallback(
    async (payload: Record<string, unknown>) => {
      const res = await fetch("/api/admin/ppi", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pin: passcode, ...payload }),
      })
      return res.json()
    },
    [passcode],
  )

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const data = await call({ op: "load" })
      if (data.ok) {
        setClients(data.clients)
        setPolicies(data.policies)
      } else toast.error(data.error ?? "Could not load PPI desk.")
    } finally {
      setLoading(false)
    }
  }, [call])

  useEffect(() => {
    void load()
  }, [load])

  const openDeal = useMemo(
    () => policies.find((p) => p.userId === userId && p.status === "negotiating") ?? null,
    [policies, userId],
  )
  const activePolicy = useMemo(
    () => policies.find((p) => p.userId === userId && effectivePpiStatus(p) === "active") ?? null,
    [policies, userId],
  )

  const selectClient = (id: string) => {
    setUserId(id)
    setAnalysis(null)
    const deal = policies.find((p) => p.userId === id && p.status === "negotiating")
    setPolicyId(deal?.id ?? null)
    setNegotiated(deal?.negotiatedPremium != null ? String(deal.negotiatedPremium) : "")
    setReference(deal?.lloydsReference ?? "")
    setNote(deal?.note ?? "")
  }

  const analyze = async () => {
    if (!userId) return
    setAnalyzing(true)
    try {
      const data = await call({ op: "analyze", userId })
      if (data.ok) setAnalysis(data.analysis)
      else toast.error(data.error ?? "Analysis failed.")
    } finally {
      setAnalyzing(false)
    }
  }

  const negotiatedValue = negotiated.trim() ? Number(negotiated) : null

  const saveDeal = async (): Promise<PpiPolicy | null> => {
    const data = await call({
      op: "save-deal",
      userId,
      policyId,
      negotiatedPremium: negotiatedValue,
      lloydsReference: reference,
      note,
    })
    if (!data.ok) {
      toast.error(data.error ?? "Could not save the deal.")
      return null
    }
    setPolicyId(data.policy.id)
    return data.policy as PpiPolicy
  }

  const handleSave = async () => {
    setBusy("save")
    try {
      const p = await saveDeal()
      if (p) {
        toast.success("Deal saved — in negotiation with Lloyd's of London.")
        await load()
      }
    } finally {
      setBusy(null)
    }
  }

  const handleActivate = async () => {
    setBusy("activate")
    try {
      const p = await saveDeal()
      if (!p) return
      const data = await call({ op: "activate", policyId: p.id })
      if (data.ok) {
        toast.success("PPI approved, premium charged and policy active.")
        setPolicyId(null)
        setNegotiated("")
        setReference("")
        setNote("")
        await load()
      } else toast.error(data.error ?? "Activation failed.")
    } finally {
      setBusy(null)
    }
  }

  const handleCancel = async (id: string) => {
    const data = await call({ op: "cancel", policyId: id })
    if (data.ok) {
      toast.success("Deal cancelled.")
      if (id === policyId) setPolicyId(null)
      await load()
    } else toast.error(data.error ?? "Could not cancel.")
  }

  const finalPremium = analysis
    ? negotiatedValue != null && negotiatedValue > 0
      ? negotiatedValue
      : analysis.quote.premiumEur
    : 0
  const saving = analysis && negotiatedValue != null && negotiatedValue > 0
    ? analysis.quote.premiumEur - negotiatedValue
    : 0

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Umbrella className="h-5 w-5 text-primary" aria-hidden />
            PPI — Payment Protection Insurance
          </CardTitle>
          <CardDescription className="leading-relaxed">
            Select a customer, analyze their exposure, negotiate the premium with {PPI_INSURER} and approve.
            Cover is full, valid {PPI_VALIDITY_DAYS} days, and the premium is charged to the customer&apos;s
            Master Account on approval.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="ppi-client">Customer</Label>
            <div className="flex flex-col gap-2 sm:flex-row">
              <Select value={userId} onValueChange={selectClient} disabled={loading}>
                <SelectTrigger id="ppi-client" className="min-h-11 w-full sm:flex-1">
                  <SelectValue placeholder={loading ? "Loading customers…" : "Select a customer"} />
                </SelectTrigger>
                <SelectContent>
                  {clients.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.fullName || c.email}
                      {c.company ? ` · ${c.company}` : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button onClick={analyze} disabled={!userId || analyzing} className="min-h-11">
                {analyzing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
                Analyze profile
              </Button>
            </div>
          </div>

          {activePolicy && (
            <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-3 text-sm leading-relaxed">
              <span className="font-medium text-foreground">Active policy {activePolicy.id}</span> — cover{" "}
              {eur(activePolicy.coverAmount)}, remaining {eur(ppiRemainingCover(activePolicy))}, valid until{" "}
              {activePolicy.expiresAt ? new Date(activePolicy.expiresAt).toLocaleDateString("en-GB") : "—"}.
            </div>
          )}

          {analysis && (
            <div className="flex flex-col gap-4">
              <div className="rounded-lg border border-border">
                <div className="border-b border-border px-4 py-2 text-sm font-medium">Exposure to insure</div>
                <dl className="flex flex-col divide-y divide-border text-sm">
                  {[
                    ["Debit exposure (leverage, loans, monetization, funding)", analysis.exposure.debitExposureEur],
                    ["Yield / PPP capital committed", analysis.exposure.pppCapitalEur],
                    ["Current overdraft", analysis.exposure.overdraftEur],
                  ].map(([label, value]) => (
                    <div key={label as string} className="flex items-start justify-between gap-3 px-4 py-2">
                      <dt className="text-muted-foreground">{label}</dt>
                      <dd className="shrink-0 font-mono tabular-nums">{eur(value as number)}</dd>
                    </div>
                  ))}
                  <div className="flex items-center justify-between gap-3 px-4 py-2 font-medium">
                    <dt>Full cover (insured sum)</dt>
                    <dd className="font-mono tabular-nums">{eur(analysis.quote.coverEur)}</dd>
                  </div>
                </dl>
              </div>

              <div className="rounded-lg border border-border">
                <div className="border-b border-border px-4 py-2 text-sm font-medium">Calculated premium (annual)</div>
                <dl className="flex flex-col divide-y divide-border text-sm">
                  <div className="flex justify-between gap-3 px-4 py-2">
                    <dt className="text-muted-foreground">Base rate</dt>
                    <dd className="font-mono tabular-nums">{pct(analysis.quote.baseRate)}</dd>
                  </div>
                  <div className="flex justify-between gap-3 px-4 py-2">
                    <dt className="text-muted-foreground">
                      Risk loading (score {analysis.exposure.riskScore.toFixed(2)})
                    </dt>
                    <dd className="font-mono tabular-nums">{pct(analysis.quote.riskLoading)}</dd>
                  </div>
                  <div className="flex justify-between gap-3 px-4 py-2">
                    <dt className="text-muted-foreground">
                      Arrears loading ({analysis.exposure.overdueCharges} overdue)
                    </dt>
                    <dd className="font-mono tabular-nums">{pct(analysis.quote.arrearsLoading)}</dd>
                  </div>
                  <div className="flex justify-between gap-3 px-4 py-2 font-medium">
                    <dt>Premium at {pct(analysis.quote.totalRate)}</dt>
                    <dd className="font-mono tabular-nums">{eur(analysis.quote.premiumEur)}</dd>
                  </div>
                </dl>
              </div>

              {analysis.quote.coverEur <= 0 ? (
                <p className="text-sm text-muted-foreground">This customer has no exposure to insure.</p>
              ) : activePolicy ? null : (
                <div className="flex flex-col gap-4 rounded-lg border border-primary/30 bg-primary/5 p-4">
                  <div className="flex items-center gap-2 text-sm font-medium">
                    <Handshake className="h-4 w-4 text-primary" aria-hidden />
                    Negotiation with {PPI_INSURER}
                    {openDeal && (
                      <Badge variant="outline" className={STATUS_STYLE.negotiating}>
                        In negotiation
                      </Badge>
                    )}
                  </div>
                  <div className="flex flex-col gap-2">
                    <Label htmlFor="ppi-premium">Negotiated premium (EUR) — leave blank to use the calculated premium</Label>
                    <MoneyInput
                      id="ppi-premium"
                      value={negotiated}
                      onValueChange={setNegotiated}
                      placeholder={analysis.quote.premiumEur.toLocaleString("en-US")}
                      className="min-h-11 text-base"
                    />
                  </div>
                  <div className="flex flex-col gap-2">
                    <Label htmlFor="ppi-ref">Lloyd&apos;s slip / reference</Label>
                    <Input
                      id="ppi-ref"
                      value={reference}
                      onChange={(e) => setReference(e.target.value)}
                      placeholder="e.g. B0123PPI2026"
                      className="min-h-11 text-base"
                    />
                  </div>
                  <div className="flex flex-col gap-2">
                    <Label htmlFor="ppi-note">Deal notes</Label>
                    <Textarea
                      id="ppi-note"
                      value={note}
                      onChange={(e) => setNote(e.target.value)}
                      rows={3}
                      className="text-base"
                    />
                  </div>
                  <div className="flex flex-col gap-1 rounded-md bg-background p-3 text-sm">
                    <div className="flex justify-between gap-3">
                      <span className="text-muted-foreground">Premium charged to Master Account</span>
                      <span className="font-mono font-medium tabular-nums">{eur(finalPremium)}</span>
                    </div>
                    {saving > 0 && (
                      <div className="flex justify-between gap-3 text-emerald-600">
                        <span>Negotiated saving</span>
                        <span className="font-mono tabular-nums">−{eur(saving)}</span>
                      </div>
                    )}
                  </div>
                  <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
                    <Button variant="outline" onClick={handleSave} disabled={busy !== null} className="min-h-11">
                      {busy === "save" && <Loader2 className="h-4 w-4 animate-spin" />}
                      Save deal
                    </Button>
                    <Button onClick={handleActivate} disabled={busy !== null} className="min-h-11">
                      {busy === "activate" ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <CheckCircle2 className="h-4 w-4" />
                      )}
                      Approve, charge &amp; activate
                    </Button>
                  </div>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <ShieldCheck className="h-4 w-4 text-primary" aria-hidden />
            Policies
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex justify-center py-6">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : policies.length === 0 ? (
            <p className="text-sm text-muted-foreground">No PPI policies yet.</p>
          ) : (
            <ul className="flex flex-col divide-y divide-border">
              {policies.map((p) => {
                const status = effectivePpiStatus(p)
                return (
                  <li key={p.id} className="flex flex-col gap-2 py-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium text-foreground">{p.holderLabel}</span>
                      <Badge variant="outline" className={STATUS_STYLE[status]}>
                        {status}
                      </Badge>
                    </div>
                    <div className="text-sm leading-relaxed text-muted-foreground">
                      {p.id}
                      {p.lloydsReference ? ` · Lloyd's ${p.lloydsReference}` : ""} · cover {eur(p.coverAmount)} ·
                      premium {eur(ppiPremiumDue(p))}
                      {status === "active" || status === "expired"
                        ? ` · claimed ${eur(p.claimedAmount)} · until ${
                            p.expiresAt ? new Date(p.expiresAt).toLocaleDateString("en-GB") : "—"
                          }`
                        : ""}
                    </div>
                    {status === "negotiating" && (
                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          className="min-h-11"
                          onClick={() => {
                            selectClient(p.userId)
                            void (async () => {
                              const data = await call({ op: "analyze", userId: p.userId })
                              if (data.ok) setAnalysis(data.analysis)
                            })()
                          }}
                        >
                          Open deal
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="min-h-11 text-destructive"
                          onClick={() => handleCancel(p.id)}
                        >
                          <XCircle className="h-4 w-4" />
                          Cancel
                        </Button>
                      </div>
                    )}
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
