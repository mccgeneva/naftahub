"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { toast } from "sonner"
import {
  Loader2,
  ShieldCheck,
  Search,
  Handshake,
  CheckCircle2,
  XCircle,
  Umbrella,
  Wand2,
  Pause,
  Play,
  Power,
  RotateCcw,
  MessagesSquare,
} from "lucide-react"
import { PpiDiscussion } from "@/components/ppi-discussion"
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
  PPI_STATUS_LABEL,
  generateLloydsSlipRef,
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
  paused: "border-sky-500/40 bg-sky-500/10 text-sky-600",
  terminated: "border-destructive/40 bg-destructive/10 text-destructive",
  used: "border-border bg-muted text-muted-foreground",
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
  /** The customer's paid policy (active, paused or deactivated) if it hasn't expired. */
  const livePolicy = useMemo(
    () =>
      policies.find((p) => {
        const s = effectivePpiStatus(p)
        return p.userId === userId && (s === "active" || s === "paused" || s === "terminated")
      }) ?? null,
    [policies, userId],
  )
  /** Active or paused cover blocks a second deal; a deactivated one does not. */
  const blockingPolicy = livePolicy && effectivePpiStatus(livePolicy) !== "terminated" ? livePolicy : null
  const threadPolicy = openDeal ?? livePolicy

  const [lifecycleBusy, setLifecycleBusy] = useState<string | null>(null)
  const [confirmDeactivate, setConfirmDeactivate] = useState<string | null>(null)

  const selectClient = (id: string) => {
    setUserId(id)
    setAnalysis(null)
    setConfirmDeactivate(null)
    const deal = policies.find((p) => p.userId === id && p.status === "negotiating")
    setPolicyId(deal?.id ?? null)
    setNegotiated(deal?.negotiatedPremium != null ? String(deal.negotiatedPremium) : "")
    setReference(deal?.lloydsReference || generateLloydsSlipRef())
    setNote(deal?.note ?? "")
  }

  const runLifecycle = async (p: PpiPolicy, action: "pause" | "resume" | "deactivate" | "reinstate") => {
    setLifecycleBusy(`${p.id}:${action}`)
    try {
      const data = await call({ op: "lifecycle", policyId: p.id, action })
      if (data.ok) {
        const label = {
          pause: "Policy paused.",
          resume: "Policy reactivated.",
          deactivate: "Policy deactivated.",
          reinstate: "Termination cancelled — policy active again.",
        }[action]
        toast.success(label)
        setConfirmDeactivate(null)
        await load()
      } else toast.error(data.error ?? "Action failed.")
    } finally {
      setLifecycleBusy(null)
    }
  }

  const sendTreasuryMessage = async (text: string): Promise<boolean> => {
    let target = threadPolicy
    if (!target) {
      // No deal yet: open one so the conversation has a policy to live on.
      target = await saveDeal()
      if (!target) return false
    }
    const data = await call({ op: "message", policyId: target.id, text })
    if (!data.ok) {
      toast.error(data.error ?? "Message not sent.")
      return false
    }
    await load()
    return true
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

  useEffect(() => {
    if (analysis && !reference.trim()) setReference(generateLloydsSlipRef())
  }, [analysis, reference])

  const discussionRef = useRef<HTMLDivElement>(null)
  const openDiscussion = () => {
    discussionRef.current?.scrollIntoView({ behavior: "smooth", block: "center" })
    discussionRef.current?.querySelector<HTMLTextAreaElement | HTMLInputElement>("textarea, input")?.focus()
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

  const [forceShortfall, setForceShortfall] = useState<number | null>(null)

  const handleActivate = async (force = false) => {
    setBusy("activate")
    try {
      const p = await saveDeal()
      if (!p) return
      const data = await call({ op: "activate", policyId: p.id, force })
      if (data.ok) {
        toast.success(
          force
            ? "PPI force-approved. Premium charged into the customer's debit; policy active."
            : "PPI approved, premium charged and policy active.",
        )
        setForceShortfall(null)
        setPolicyId(null)
        setNegotiated("")
        setReference("")
        setNote("")
        await load()
      } else if (data.needsForce) {
        setForceShortfall(Number(data.shortfall) || 0)
        toast.error(data.error ?? "The customer cannot cover the premium.")
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

          {livePolicy && (
            <div className="flex flex-col gap-3 rounded-lg border border-border p-3 text-sm leading-relaxed">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-medium text-foreground">Policy {livePolicy.id}</span>
                <Badge variant="outline" className={STATUS_STYLE[effectivePpiStatus(livePolicy)]}>
                  {PPI_STATUS_LABEL[effectivePpiStatus(livePolicy)]}
                </Badge>
              </div>
              <p className="text-muted-foreground">
                Cover {eur(livePolicy.coverAmount)}, remaining {eur(ppiRemainingCover(livePolicy))}, valid until{" "}
                {livePolicy.expiresAt ? new Date(livePolicy.expiresAt).toLocaleDateString("en-GB") : "—"}
                {livePolicy.lloydsReference ? ` · Lloyd's ${livePolicy.lloydsReference}` : ""}.
              </p>
              <LifecycleButtons
                policy={livePolicy}
                busy={lifecycleBusy}
                confirming={confirmDeactivate === livePolicy.id}
                onConfirm={(v) => setConfirmDeactivate(v ? livePolicy.id : null)}
                onRun={runLifecycle}
                call={call}
                onChanged={load}
              />
            </div>
          )}

          {userId && (threadPolicy || (analysis && analysis.quote.coverEur > 0)) && (
            <div ref={discussionRef} id="ppi-discussion" className="scroll-mt-24">
              <PpiDiscussion
                messages={threadPolicy?.messages ?? []}
                viewer="treasury"
                onSend={sendTreasuryMessage}
                placeholder={threadPolicy ? "Message the customer…" : "Message the customer (opens a deal)…"}
              />
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
              ) : blockingPolicy ? null : (
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
                  <Button type="button" variant="outline" onClick={openDiscussion} className="min-h-11 w-full">
                    <MessagesSquare className="h-4 w-4" />
                    Discuss with customer
                    {threadPolicy?.messages?.length ? ` (${threadPolicy.messages.length})` : ""}
                  </Button>
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
                    <div className="flex gap-2">
                      <Input
                        id="ppi-ref"
                        value={reference}
                        onChange={(e) => setReference(e.target.value.toUpperCase())}
                        className="min-h-11 flex-1 font-mono text-base"
                        autoCapitalize="characters"
                        autoCorrect="off"
                        spellCheck={false}
                      />
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => setReference(generateLloydsSlipRef())}
                        className="min-h-11 shrink-0"
                        aria-label="Generate a new slip reference"
                      >
                        <Wand2 className="h-4 w-4" />
                        <span className="hidden sm:inline">Generate</span>
                      </Button>
                    </div>
                    <p className="text-xs leading-relaxed text-muted-foreground">
                      Generated automatically. Replace it with the Unique Market Reference once Lloyd&apos;s confirms the
                      slip.
                    </p>
                  </div>
                  <div className="flex flex-col gap-2">
                    <Label htmlFor="ppi-note">Message to the customer</Label>
                    <Textarea
                      id="ppi-note"
                      value={note}
                      onChange={(e) => setNote(e.target.value)}
                      rows={3}
                      className="text-base"
                    />
                    <p className="text-xs leading-relaxed text-muted-foreground">
                      Sent to the customer&apos;s Bankeka and bell when you save the deal.
                    </p>
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
                    <Button onClick={() => handleActivate(false)} disabled={busy !== null} className="min-h-11">
                      {busy === "activate" ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <CheckCircle2 className="h-4 w-4" />
                      )}
                      Approve, charge &amp; activate
                    </Button>
                  </div>
                  {forceShortfall != null && (
                    <div className="flex flex-col gap-3 rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm">
                      <p className="text-pretty leading-relaxed">
                        The customer can&apos;t cover {eur(finalPremium)}. Forcing approval charges the full premium and
                        pushes the Master Account about <b>{eur(forceShortfall)}</b> further into debit, beyond the
                        authorized overdraft. The customer is notified to top up.
                      </p>
                      <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
                        <Button
                          variant="outline"
                          onClick={() => setForceShortfall(null)}
                          disabled={busy !== null}
                          className="min-h-11"
                        >
                          Keep it pending
                        </Button>
                        <Button
                          variant="destructive"
                          onClick={() => handleActivate(true)}
                          disabled={busy !== null}
                          className="min-h-11"
                        >
                          {busy === "activate" && <Loader2 className="h-4 w-4 animate-spin" />}
                          Force approve &amp; charge into debit
                        </Button>
                      </div>
                    </div>
                  )}
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
                        {PPI_STATUS_LABEL[status]}
                      </Badge>
                      {p.messages.length > 0 && (
                        <span className="text-xs text-muted-foreground">
                          {p.messages.length} message{p.messages.length === 1 ? "" : "s"}
                        </span>
                      )}
                    </div>
                    <div className="text-sm leading-relaxed text-muted-foreground">
                      {p.id}
                      {p.lloydsReference ? ` · Lloyd's ${p.lloydsReference}` : ""} · cover {eur(p.coverAmount)} ·
                      premium {eur(ppiPremiumDue(p))}
                      {p.expiresAt
                        ? ` · claimed ${eur(p.claimedAmount)} · until ${new Date(p.expiresAt).toLocaleDateString("en-GB")}`
                        : ""}
                    </div>
                    {(status === "active" || status === "paused" || status === "terminated") && (
                      <div className="flex flex-col gap-2">
                        <LifecycleButtons
                          policy={p}
                          busy={lifecycleBusy}
                          confirming={confirmDeactivate === p.id}
                          onConfirm={(v) => setConfirmDeactivate(v ? p.id : null)}
                          onRun={runLifecycle}
                          call={call}
                          onChanged={load}
                        />
                        <Button
                          size="sm"
                          variant="ghost"
                          className="min-h-11 self-start"
                          onClick={() => selectClient(p.userId)}
                        >
                          Open &amp; discuss
                        </Button>
                      </div>
                    )}
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

type LifecycleAction = "pause" | "resume" | "deactivate" | "reinstate"

type Deficit = { currency: string; amount: number }

function PpiClaimControl({
  policy,
  call,
  onDone,
}: {
  policy: PpiPolicy
  call: (payload: Record<string, unknown>) => Promise<{ ok: boolean; error?: string; [k: string]: unknown }>
  onDone: () => Promise<void> | void
}) {
  const [preview, setPreview] = useState<{ deficits: Deficit[]; totalEur: number } | null>(null)
  const [busy, setBusy] = useState<"check" | "claim" | null>(null)

  const check = async () => {
    setBusy("check")
    try {
      const data = await call({ op: "deficits", policyId: policy.id })
      if (!data.ok) return toast.error(data.error ?? "Could not read the account.")
      const deficits = (data.deficits as Deficit[]) ?? []
      if (deficits.length === 0) return toast.info("The customer's Master Account has no negative balance.")
      setPreview({ deficits, totalEur: Number(data.totalEur) || 0 })
    } finally {
      setBusy(null)
    }
  }

  const claim = async () => {
    setBusy("claim")
    try {
      const data = await call({ op: "claim", policyId: policy.id })
      if (data.ok) {
        toast.success("Debit consolidated to zero. The PPI policy is now terminated as used.")
        setPreview(null)
        await onDone()
      } else toast.error(data.error ?? "The PPI could not be used.")
    } finally {
      setBusy(null)
    }
  }

  if (preview) {
    return (
      <div className="flex w-full flex-col gap-3 rounded-md border border-primary/40 bg-primary/5 p-3 text-sm leading-relaxed">
        <p className="font-medium">Use PPI to clear this debit?</p>
        <ul className="flex flex-col gap-1">
          {preview.deficits.map((d) => (
            <li key={d.currency} className="flex items-center justify-between gap-3">
              <span className="text-muted-foreground">{d.currency} balance</span>
              <span className="font-mono tabular-nums text-destructive">
                −{d.amount.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} → 0.00
              </span>
            </li>
          ))}
        </ul>
        <p className="text-muted-foreground">
          About {eur(preview.totalEur)} in total. Every negative balance on the Master Account becomes zero. PPI can be
          used only once, so this policy terminates and can&apos;t be reinstated.
        </p>
        <div className="flex flex-col gap-2 sm:flex-row">
          <Button className="min-h-11" disabled={busy !== null} onClick={claim}>
            {busy === "claim" ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />}
            Confirm — clear debit
          </Button>
          <Button variant="ghost" className="min-h-11" disabled={busy !== null} onClick={() => setPreview(null)}>
            Not now
          </Button>
        </div>
      </div>
    )
  }

  return (
    <Button variant="outline" className="min-h-11" disabled={busy !== null} onClick={check}>
      {busy === "check" ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />}
      Use PPI — clear debit
    </Button>
  )
}

function LifecycleButtons({
  policy,
  busy,
  confirming,
  onConfirm,
  onRun,
  call,
  onChanged,
}: {
  policy: PpiPolicy
  busy: string | null
  confirming: boolean
  onConfirm: (open: boolean) => void
  onRun: (p: PpiPolicy, action: LifecycleAction) => void
  call: (payload: Record<string, unknown>) => Promise<{ ok: boolean; error?: string; [k: string]: unknown }>
  onChanged: () => Promise<void> | void
}) {
  const status = effectivePpiStatus(policy)
  const isBusy = (a: LifecycleAction) => busy === `${policy.id}:${a}`
  const anyBusy = busy?.startsWith(`${policy.id}:`) ?? false
  const spin = <Loader2 className="h-4 w-4 animate-spin" />

  if (confirming) {
    return (
      <div className="flex flex-col gap-2 rounded-md border border-destructive/40 bg-destructive/5 p-3">
        <p className="text-sm leading-relaxed">
          Deactivate this policy? The customer loses cover and can&apos;t reconcile a debit with it. You can cancel the
          termination later while the policy is still within its validity.
        </p>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="destructive"
            className="min-h-11"
            disabled={anyBusy}
            onClick={() => onRun(policy, "deactivate")}
          >
            {isBusy("deactivate") ? spin : <Power className="h-4 w-4" />}
            Confirm deactivation
          </Button>
          <Button variant="ghost" className="min-h-11" onClick={() => onConfirm(false)}>
            Keep active
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-wrap gap-2">
      {status === "active" && <PpiClaimControl policy={policy} call={call} onDone={onChanged} />}
      {status === "active" && (
        <Button variant="outline" className="min-h-11" disabled={anyBusy} onClick={() => onRun(policy, "pause")}>
          {isBusy("pause") ? spin : <Pause className="h-4 w-4" />}
          Pause
        </Button>
      )}
      {status === "paused" && (
        <Button className="min-h-11" disabled={anyBusy} onClick={() => onRun(policy, "resume")}>
          {isBusy("resume") ? spin : <Play className="h-4 w-4" />}
          Activate
        </Button>
      )}
      {(status === "active" || status === "paused") && (
        <Button
          variant="outline"
          className="min-h-11 text-destructive"
          disabled={anyBusy}
          onClick={() => onConfirm(true)}
        >
          <Power className="h-4 w-4" />
          Deactivate
        </Button>
      )}
      {status === "terminated" && (
        <Button className="min-h-11" disabled={anyBusy} onClick={() => onRun(policy, "reinstate")}>
          {isBusy("reinstate") ? spin : <RotateCcw className="h-4 w-4" />}
          Cancel termination
        </Button>
      )}
    </div>
  )
}
