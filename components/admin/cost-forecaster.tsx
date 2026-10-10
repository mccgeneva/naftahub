"use client"

import { useEffect, useMemo, useState } from "react"
import { Calculator, Handshake, Loader2, Send, ShieldAlert } from "lucide-react"
import { Textarea } from "@/components/ui/textarea"
import { toast } from "sonner"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { MoneyInput } from "@/components/ui/money-input"
import { Badge } from "@/components/ui/badge"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { ADMIN_PASSCODE } from "@/lib/admin-config"
import { convertCurrency } from "@/lib/fx"
import { leverageApplicationCharges } from "@/lib/leverage-audit-fee"
import { borrowedFundsFor, debitInterestRateFor, LEVERAGE_RATIOS } from "@/lib/leverage-rates"
import { computeMonetizationEquity } from "@/lib/monetization-equity"
import { computeAcquisitionFee, ACQUISITION_FEE_RATES, type AcquisitionAction } from "@/lib/instrument-marketplace"
import { instrumentUpgradeFee } from "@/lib/instrument-upgrade"
import { instrumentManagementFee } from "@/lib/instrument-fees"
import { calculateTieredFee, DEFAULT_FEE_TIERS, type FeeTier } from "@/lib/tiered-fees"
import { applyCashback, type CashbackProduct } from "@/lib/fee-cashback"
import { CARD_FEES } from "@/lib/card-fees"
import { GATEWAY_ACCOUNT_FEE, GATEWAY_TERMINATION_FEE } from "@/lib/gateway-catalog"
import { loanArrangementFee, loanMonthlyInterest, getLoanProduct, type FacilityType } from "@/lib/loan-products"
import { yieldCancellationPenalty } from "@/lib/ppp-yield"
import {
  TRADING_FUND_EARLY_EXIT_PENALTY_RATE,
  TRADING_FUND_EXIT_COMMISSION,
  TRADING_FUND_MONTHLY_ROI,
  TRADING_FUND_ROI_LOCK_MONTHS,
  TRADING_FUND_TERM_MONTHS,
} from "@/lib/trading-fund"

type Client = { id: string; fullName: string; company: string; email: string }
type Context = {
  trustScore: number
  highRisk: boolean
  availableEur: number
  exposureEur: number
  freeEur: number
  overdraftRemainingEur: number
  overdraftLimitEur: number
  cashback: Record<CashbackProduct, number>
  tiers: FeeTier[]
}

type ServiceId =
  | "receive"
  | "acquire"
  | "monetize"
  | "leverage"
  | "upgrade"
  | "exit"
  | "payment"
  | "loan"
  | "yield"
  | "hedge"
  | "card"
  | "gateway"

const SERVICES: { id: ServiceId; label: string; short: string; group: string }[] = [
  { id: "receive", label: "Receive a bank instrument or cash (SWIFT MT760 / MT103)", short: "Receive instrument / cash", group: "Bank instruments" },
  { id: "acquire", label: "Acquire from the marketplace (assign / lease / purchase)", short: "Acquire (assign / lease / buy)", group: "Bank instruments" },
  { id: "upgrade", label: "Instrument upgrade / transformation", short: "Upgrade instrument", group: "Bank instruments" },
  { id: "exit", label: "Delete / settle out an instrument", short: "Delete instrument", group: "Bank instruments" },
  { id: "monetize", label: "Monetize a bank instrument", short: "Monetize", group: "Financing" },
  { id: "leverage", label: "Leverage line", short: "Leverage line", group: "Financing" },
  { id: "loan", label: "Project funding loan", short: "Project funding loan", group: "Financing" },
  { id: "yield", label: "Yield / PPP investment", short: "Yield / PPP", group: "Investments" },
  { id: "hedge", label: "Treuhand AG Hedge Fund investment", short: "Hedge fund (Treuhand)", group: "Investments" },
  { id: "payment", label: "Payments (outgoing / incoming / internal)", short: "Payments", group: "Banking" },
  { id: "card", label: "Card issuance", short: "Card issuance", group: "Banking" },
  { id: "gateway", label: "Payment gateway bank account", short: "Gateway bank account", group: "Banking" },
]
const SERVICE_GROUPS = ["Bank instruments", "Financing", "Investments", "Banking"]

const CURRENCIES = ["EUR", "USD", "GBP", "CHF"]

type Line = { label: string; amount: number; note?: string; kind?: "upfront" | "recurring" | "info" | "credit" }

function fmt(n: number, ccy: string) {
  return `${ccy} ${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}
function num(v: string) {
  const n = Number((v ?? "").replace(/,/g, ""))
  return Number.isFinite(n) && n > 0 ? n : 0
}
function pct(r: number, d = 2) {
  return `${(r * 100).toLocaleString("en-US", { maximumFractionDigits: d })}%`
}

async function call<T>(body: Record<string, unknown>): Promise<T> {
  const res = await fetch("/api/admin/cost-forecast", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ pin: ADMIN_PASSCODE, ...body }),
  })
  return (await res.json()) as T
}

export function CostForecaster() {
  const [clients, setClients] = useState<Client[]>([])
  const [clientId, setClientId] = useState("")
  const [ctx, setCtx] = useState<Context | null>(null)
  const [loadingCtx, setLoadingCtx] = useState(false)
  const [sending, setSending] = useState(false)

  const [service, setService] = useState<ServiceId>("receive")
  const [currency, setCurrency] = useState("EUR")
  const [amount, setAmount] = useState("25000000")
  const [ratio, setRatio] = useState("5")
  const [funding, setFunding] = useState<"instruments" | "master">("instruments")
  const [ltv, setLtv] = useState("65")
  const [months, setMonths] = useState("12")
  const [acquire, setAcquire] = useState<AcquisitionAction>("assign")
  const [payDir, setPayDir] = useState<"outgoing" | "incoming" | "internal">("outgoing")
  const [receiveKind, setReceiveKind] = useState<"guarantee" | "cash">("guarantee")
  const [receivedCcy, setReceivedCcy] = useState("EUR")
  const [loanType, setLoanType] = useState<Exclude<FacilityType, "aes">>("non_recourse")
  const [collateral, setCollateral] = useState("0")
  const [cardFormat, setCardFormat] = useState<"virtual" | "physical">("physical")

  useEffect(() => {
    call<{ ok: boolean; clients?: Client[] }>({ op: "clients" })
      .then((r) => r.ok && setClients(r.clients ?? []))
      .catch(() => null)
  }, [])

  useEffect(() => {
    if (!clientId) {
      setCtx(null)
      return
    }
    setLoadingCtx(true)
    call<{ ok: boolean; context?: Context; error?: string }>({ op: "context", userId: clientId })
      .then((r) => {
        if (r.ok && r.context) setCtx(r.context)
        else toast.error(r.error ?? "Could not load the client's figures.")
      })
      .catch(() => toast.error("Could not load the client's figures."))
      .finally(() => setLoadingCtx(false))
  }, [clientId])

  const client = clients.find((c) => c.id === clientId)
  const tiers = ctx?.tiers?.length ? ctx.tiers : DEFAULT_FEE_TIERS
  const cb = (p: CashbackProduct) => ctx?.cashback?.[p] ?? 0

  const forecast = useMemo(() => {
    const a = num(amount)
    const lines: Line[] = []
    const ccy = currency
    const withCashback = (label: string, fee: number, product: CashbackProduct, note?: string) => {
      const r = applyCashback(fee, cb(product))
      lines.push({ label, amount: r.netFee, kind: "upfront", note: r.cashbackAmount > 0 ? `Standard ${fmt(r.originalFee, ccy)} − ${pct(r.cashbackRate)} cashback${note ? ` · ${note}` : ""}` : note })
    }

    switch (service) {
      case "receive": {
        if (receiveKind === "guarantee") {
          withCashback("Receipt & booking fee (0.2% of face value)", a * 0.002, "swift", "Charged when the administrator books the guarantee")
          lines.push({ label: "Instrument booked to client (pledgeable, monetizable)", amount: a, kind: "info", note: "Not spendable cash — collateral only" })
        } else {
          const fx = receivedCcy !== ccy ? a * 0.005 : 0
          const tiered = calculateTieredFee(a, tiers)
          if (fx > 0) lines.push({ label: "FX conversion fee (0.5%)", amount: fx, kind: "upfront", note: `${receivedCcy} → ${ccy}` })
          withCashback(`Incoming transaction fee (tiered, ${pct(tiered.effectiveRate, 3)} effective)`, tiered.totalFee, "swift", "Deducted from the credit")
          const net = a - fx - applyCashback(tiered.totalFee, cb("swift")).netFee
          lines.push({ label: "Net credited to Master Account", amount: net, kind: "credit" })
        }
        break
      }
      case "acquire": {
        lines.push({ label: `${acquire[0].toUpperCase()}${acquire.slice(1)} fee (${pct(ACQUISITION_FEE_RATES[acquire], 1)} of face)`, amount: computeAcquisitionFee(acquire, a), kind: "upfront", note: "Balance verified before the request reaches the administrator" })
        if (acquire !== "purchase") lines.push({ label: "Returns split", amount: 0, kind: "info", note: acquire === "assign" ? "Instrument stays owned by MCC HOLDING SA — investment returns split 75% MCC / 25% client" : "Leased instrument — client keeps 100% of returns, instrument returns at maturity" })
        break
      }
      case "monetize": {
        const l = Math.min(100, Math.max(1, num(ltv) || 1))
        const advance = a * (l / 100)
        const q = computeMonetizationEquity(advance, l, ctx?.trustScore)
        lines.push({ label: `Equity deposit (${pct(q.equityRate, 4)} at ${l}% LTV)`, amount: q.equityDeposit, kind: "upfront" })
        lines.push({ label: "PPI insurance premium (trust-score priced)", amount: q.ppi, kind: "upfront", note: ctx ? `Trust score ${ctx.trustScore.toFixed(2)}${ctx.trustScore === 0 ? " → no PPI" : ""}` : "Standard 1% of advance until a client is selected" })
        lines.push({ label: "Advance credited to Master Account", amount: advance, kind: "credit" })
        break
      }
      case "leverage": {
        const r = num(ratio) || 2
        const ch = leverageApplicationCharges(a, r, ctx?.trustScore)
        const borrowed = borrowedFundsFor(a, r, funding)
        const rate = debitInterestRateFor(r)
        const m = Math.max(1, Math.round(num(months)) || 1)
        lines.push({ label: "Audit & compliance fee", amount: ch.auditFee, kind: "upfront", note: "Reserved on submit, charged on approval" })
        lines.push({ label: "PPI insurance premium (trust-score priced)", amount: ch.ppi, kind: "upfront", note: ctx ? `Trust score ${ctx.trustScore.toFixed(2)}` : "Standard 0.75% of buying power" })
        lines.push({ label: `Borrowed funds (${funding === "instruments" ? "instrument-backed: full multiple" : "cash-funded: top-up only"})`, amount: borrowed, kind: "credit", note: `Buying power ${fmt(ch.buyingPower, ccy)}` })
        lines.push({ label: `Debit interest ${pct(rate, 1)} p.a. — monthly`, amount: (borrowed * rate) / 12, kind: "recurring" })
        lines.push({ label: `Debit interest over ${m} month${m === 1 ? "" : "s"}`, amount: ((borrowed * rate) / 12) * m, kind: "recurring" })
        break
      }
      case "upgrade":
        withCashback("Expertise & upgrade fee (0.08% of new face value)", instrumentUpgradeFee(a), "instrument", "Charged only when the client accepts the deal")
        break
      case "exit":
        withCashback("Management & settlement fee (0.035% of face)", instrumentManagementFee(a), "instrument", "Administrator may apply a further cashback at confirmation")
        break
      case "payment": {
        const t = calculateTieredFee(a, tiers)
        const r = applyCashback(t.totalFee, cb("transaction"))
        if (payDir === "outgoing") {
          withCashback(`Transaction fee (tiered, ${pct(t.effectiveRate, 3)} effective)`, t.totalFee, "transaction", "Charged on top of the amount sent")
          lines.push({ label: "Total debited from Master Account", amount: a + r.netFee, kind: "info" })
        } else {
          withCashback(`Transaction fee (tiered, ${pct(t.effectiveRate, 3)} effective)`, t.totalFee, "transaction", payDir === "internal" ? "Deducted from the recipient" : "Deducted from the credit")
          lines.push({ label: payDir === "internal" ? "Recipient receives" : "Net credited", amount: a - r.netFee, kind: "credit" })
        }
        for (const row of t.breakdown) {
          if (row.amountInTier > 0) lines.push({ label: `  ${pct(row.rate)} on ${fmt(row.amountInTier, ccy)}`, amount: row.fee, kind: "info" })
        }
        break
      }
      case "loan": {
        const p = getLoanProduct(loanType)
        const col = num(collateral)
        const fee = loanArrangementFee(a, col, loanType)
        const monthly = loanMonthlyInterest(a, loanType)
        const m = Math.max(1, Math.round(num(months)) || 1)
        lines.push({ label: "Arrangement fee (paid before funding)", amount: fee, kind: "upfront", note: col > 0 ? `Collateral ${fmt(col, ccy)}` : "No collateral → maximum under-collateral surcharge" })
        lines.push({ label: `Interest ${p ? pct(p.annualRate, 1) : ""} p.a. — monthly`, amount: monthly, kind: "recurring" })
        lines.push({ label: `Interest over ${m} month${m === 1 ? "" : "s"}`, amount: monthly * m, kind: "recurring" })
        break
      }
      case "yield":
        lines.push({ label: "Early-exit cost (standard 2% of principal)", amount: yieldCancellationPenalty(a), kind: "upfront", note: "Only if the client resigns early — administrator negotiates the final figure" })
        lines.push({ label: "Capital committed (cash-funded only)", amount: a, kind: "info", note: "Instrument-funded programs move no cash" })
        break
      case "hedge": {
        const m = Math.min(TRADING_FUND_TERM_MONTHS, Math.max(1, Math.round(num(months)) || TRADING_FUND_TERM_MONTHS))
        const remaining = (TRADING_FUND_TERM_MONTHS - m) / TRADING_FUND_TERM_MONTHS
        lines.push({ label: "Capital invested (debited from the master account)", amount: a, kind: "upfront", note: "Must be the client's own funds — no subscription fee" })
        lines.push({ label: `Monthly ROI (${pct(TRADING_FUND_MONTHLY_ROI, 0)} of capital)`, amount: a * TRADING_FUND_MONTHLY_ROI, kind: "credit", note: `If leverage-funded, each ROI is locked ${TRADING_FUND_ROI_LOCK_MONTHS} months` })
        lines.push({ label: `ROI over ${m} month${m === 1 ? "" : "s"}`, amount: a * TRADING_FUND_MONTHLY_ROI * m, kind: "credit" })
        lines.push({ label: `Exit commission (${pct(TRADING_FUND_EXIT_COMMISSION, 0)} of capital returned)`, amount: a * TRADING_FUND_EXIT_COMMISSION, kind: "recurring", note: "Charged on every exit, at term end or early" })
        if (remaining > 0) {
          lines.push({ label: `Early-exit penalty if leaving after ${m} month${m === 1 ? "" : "s"} (suggested)`, amount: a * TRADING_FUND_EARLY_EXIT_PENALTY_RATE * remaining, kind: "recurring", note: `${pct(TRADING_FUND_EARLY_EXIT_PENALTY_RATE, 0)} pro-rated on the remaining term — administrator sets the final figure` })
        }
        break
      }
      case "card":
        withCashback(`${cardFormat === "virtual" ? "Virtual" : "Physical"} card issuance fee (one-time)`, CARD_FEES[cardFormat], "platform")
        break
      case "gateway":
        withCashback("Account setup fee", GATEWAY_ACCOUNT_FEE, "platform")
        lines.push({ label: "Termination fee (if closed later)", amount: GATEWAY_TERMINATION_FEE, kind: "info" })
        break
    }

    const feeCcy = service === "card" || service === "gateway" ? "EUR" : ccy
    const upfront = lines.filter((l) => l.kind === "upfront").reduce((s, l) => s + l.amount, 0)
    return { lines, upfront, feeCcy }
  }, [service, amount, currency, ratio, funding, ltv, months, acquire, payDir, receiveKind, receivedCcy, loanType, collateral, cardFormat, ctx, tiers]) // eslint-disable-line react-hooks/exhaustive-deps

  const [negotiating, setNegotiating] = useState(false)
  const [overrides, setOverrides] = useState<Record<number, string>>({})
  const [dealNote, setDealNote] = useState("")

  useEffect(() => {
    setOverrides({})
  }, [forecast])

  const isNegotiable = (l: Line) => l.kind === "upfront" || l.kind === "recurring"
  const effective = forecast.lines.map((l, i) => {
    const raw = overrides[i]
    const v = raw !== undefined && raw !== "" ? Number(raw) : NaN
    const negotiated = isNegotiable(l) && Number.isFinite(v) && Math.abs(v - l.amount) > 0.004
    return { ...l, standard: l.amount, amount: negotiated ? Math.max(0, v) : l.amount, negotiated }
  })
  const anyNegotiated = effective.some((l) => l.negotiated)
  const standardUpfront = forecast.upfront
  const upfront = effective.filter((l) => l.kind === "upfront").reduce((s, l) => s + l.amount, 0)

  const upfrontEur = convertCurrency(upfront, forecast.feeCcy, "EUR")
  const spendableEur = ctx ? ctx.availableEur + ctx.overdraftRemainingEur : 0
  const affordable = ctx ? upfrontEur <= spendableEur + 0.01 : null

  const serviceLabel = SERVICES.find((s) => s.id === service)?.label ?? ""

  async function sendToClient() {
    if (!clientId) return
    setSending(true)
    const body = [
      anyNegotiated ? `Special pricing agreed for you — ${serviceLabel}.` : `Indicative costs for: ${serviceLabel}.`,
      `Amount: ${fmt(num(amount), currency)}.`,
      ...effective
        .filter((l) => l.kind !== "info" || l.amount > 0)
        .map((l) =>
          l.negotiated
            ? `• ${l.label.trim()}: ${fmt(l.amount, forecast.feeCcy)} (special price — standard ${fmt(l.standard, forecast.feeCcy)})`
            : `• ${l.label.trim()}: ${fmt(l.amount, forecast.feeCcy)}${l.note ? ` (${l.note})` : ""}`,
        ),
      anyNegotiated && Math.abs(standardUpfront - upfront) > 0.004
        ? `Total upfront: ${fmt(upfront, forecast.feeCcy)} (standard ${fmt(standardUpfront, forecast.feeCcy)} — you save ${fmt(standardUpfront - upfront, forecast.feeCcy)}).`
        : `Total upfront: ${fmt(upfront, forecast.feeCcy)}.`,
      ...(dealNote.trim() ? [`Note from the administrator: ${dealNote.trim()}`] : []),
      anyNegotiated
        ? "These prices were set by the administrator for your account. Mention this forecast when you apply."
        : "This forecast is indicative; final figures are confirmed when you apply.",
    ].join("\n")
    try {
      const r = await call<{ ok: boolean; error?: string }>({ op: "send", userId: clientId, text: body })
      if (r.ok) toast.success("Forecast sent to the client's Bankeka.")
      else toast.error(r.error ?? "Could not send.")
    } catch {
      toast.error("Could not send.")
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="flex min-w-0 flex-col gap-4">
      <Card className="min-w-0">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-balance">
            <Calculator className="h-5 w-5 text-primary" aria-hidden />
            Cost & Fee Forecaster
          </CardTitle>
          <CardDescription className="text-pretty leading-relaxed">
            Simulate what any service will cost a specific client before they apply. Uses the live fee rules, the
            client&apos;s trust score (PPI), their cashback and their available funds.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label>Client</Label>
            <Select value={clientId} onValueChange={setClientId}>
              <SelectTrigger className="h-11 w-full min-w-0 text-base [&>span]:min-w-0 [&>span]:truncate">
                <SelectValue placeholder="Choose a client (optional)" />
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
            {loadingCtx && (
              <p className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Loading client figures…
              </p>
            )}
            {ctx && client && (
              <div className="grid grid-cols-2 gap-2 rounded-lg border border-border bg-muted/40 p-3 text-sm">
                <Stat label="Trust score" value={ctx.trustScore.toFixed(2)} warn={ctx.highRisk} />
                <Stat label="Available" value={fmt(ctx.availableEur, "EUR")} />
                <Stat label="Own free funds" value={fmt(ctx.freeEur, "EUR")} />
                <Stat label="Overdraft left" value={fmt(ctx.overdraftRemainingEur, "EUR")} />
                {ctx.highRisk && (
                  <p className="col-span-2 flex items-start gap-2 text-destructive">
                    <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
                    High risk — new financing (leverage, monetization, loans) is currently blocked for this client.
                  </p>
                )}
              </div>
            )}
          </div>

          <div className="flex flex-col gap-2">
            <Label>Service — tap one to forecast</Label>
            {SERVICE_GROUPS.map((group) => (
              <div key={group} className="flex flex-col gap-2">
                <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{group}</span>
                <div className="grid grid-cols-2 gap-2">
                  {SERVICES.filter((s) => s.group === group).map((s) => {
                    const active = s.id === service
                    return (
                      <button
                        key={s.id}
                        type="button"
                        onClick={() => setService(s.id)}
                        aria-pressed={active}
                        className={`min-h-11 rounded-md border px-3 py-2 text-left text-sm leading-snug transition-colors ${
                          active
                            ? "border-primary bg-primary text-primary-foreground"
                            : "border-border bg-card text-foreground hover:bg-muted"
                        }`}
                      >
                        {s.short}
                      </button>
                    )
                  })}
                </div>
              </div>
            ))}
          </div>

          {service !== "card" && service !== "gateway" && (
            <div className="flex gap-2">
              <div className="flex min-w-0 flex-1 flex-col gap-2">
                <Label htmlFor="cf-amount">{amountLabel(service)}</Label>
                <MoneyInput id="cf-amount" value={amount} onValueChange={setAmount} className="h-11 text-base" />
              </div>
              <div className="flex w-24 flex-col gap-2">
                <Label>Currency</Label>
                <Select value={currency} onValueChange={setCurrency}>
                  <SelectTrigger className="h-11 w-full min-w-0 text-base [&>span]:min-w-0 [&>span]:truncate">
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
            </div>
          )}

          {service === "receive" && (
            <Choice
              label="What arrives"
              value={receiveKind}
              onChange={(v) => setReceiveKind(v as "guarantee" | "cash")}
              options={[
                ["guarantee", "Bank instrument (MT760)"],
                ["cash", "Cash transfer (MT103)"],
              ]}
            />
          )}
          {service === "receive" && receiveKind === "cash" && (
            <Choice label="Sent in currency" value={receivedCcy} onChange={setReceivedCcy} options={CURRENCIES.map((c) => [c, c])} />
          )}
          {service === "acquire" && (
            <Choice
              label="Action"
              value={acquire}
              onChange={(v) => setAcquire(v as AcquisitionAction)}
              options={[
                ["assign", "Assign 0.2%"],
                ["lease", "Lease 4%"],
                ["purchase", "Purchase 23%"],
              ]}
            />
          )}
          {service === "monetize" && <NumberField id="cf-ltv" label="LTV % (1–100)" value={ltv} onChange={setLtv} />}
          {service === "leverage" && (
            <>
              <Choice label="Ratio" value={ratio} onChange={setRatio} options={LEVERAGE_RATIOS.map((r) => [String(r), `1:${r}`])} />
              <Choice
                label="Funded by"
                value={funding}
                onChange={(v) => setFunding(v as "instruments" | "master")}
                options={[
                  ["instruments", "Bank instrument"],
                  ["master", "Own cash"],
                ]}
              />
              <NumberField id="cf-months" label="Holding period (months)" value={months} onChange={setMonths} />
            </>
          )}
          {service === "hedge" && (
            <NumberField id="cf-hedge-months" label={`Months invested before exit (1–${TRADING_FUND_TERM_MONTHS})`} value={months} onChange={setMonths} />
          )}
          {service === "payment" && (
            <Choice
              label="Direction"
              value={payDir}
              onChange={(v) => setPayDir(v as "outgoing" | "incoming" | "internal")}
              options={[
                ["outgoing", "Outgoing"],
                ["incoming", "Incoming"],
                ["internal", "Internal"],
              ]}
            />
          )}
          {service === "loan" && (
            <>
              <Choice
                label="Loan type"
                value={loanType}
                onChange={(v) => setLoanType(v as Exclude<FacilityType, "aes">)}
                options={[
                  ["non_recourse", "Non-recourse"],
                  ["bridge", "Bridge"],
                  ["mortgage", "Mortgage"],
                ]}
              />
              <div className="flex flex-col gap-2">
                <Label htmlFor="cf-col">Collateral value</Label>
                <MoneyInput id="cf-col" value={collateral} onValueChange={setCollateral} className="h-11 text-base" />
              </div>
              <NumberField id="cf-months" label="Tenor (months)" value={months} onChange={setMonths} />
            </>
          )}
          {service === "card" && (
            <Choice
              label="Format"
              value={cardFormat}
              onChange={(v) => setCardFormat(v as "virtual" | "physical")}
              options={[
                ["virtual", "Virtual"],
                ["physical", "Physical"],
              ]}
            />
          )}
        </CardContent>
      </Card>

      <Card className="min-w-0">
        <CardHeader>
          <CardTitle className="text-base">Forecast</CardTitle>
          <CardDescription className="text-pretty">{serviceLabel}</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <Button
            type="button"
            variant={negotiating ? "default" : "outline"}
            onClick={() => setNegotiating((v) => !v)}
            className="h-11 w-full"
            aria-pressed={negotiating}
          >
            <Handshake className="mr-2 h-4 w-4" aria-hidden />
            {negotiating ? "Done negotiating" : "Negotiate prices for this client"}
          </Button>
          {negotiating && (
            <p className="text-xs leading-relaxed text-muted-foreground">
              Type the agreed price under any fee. Leave a field empty to keep the standard price. The client will see
              the special price next to the standard one.
            </p>
          )}

          <ul className="flex flex-col divide-y divide-border">
            {effective.map((l, i) => (
              <li key={i} className="flex flex-col gap-1 py-2.5">
                <div className="flex items-start justify-between gap-3">
                  <span className="min-w-0 text-sm leading-relaxed">{l.label}</span>
                  <span className="flex shrink-0 flex-col items-end">
                    {l.negotiated && (
                      <span className="font-mono text-xs tabular-nums text-muted-foreground line-through">
                        {fmt(l.standard, forecast.feeCcy)}
                      </span>
                    )}
                    <span
                      className={`font-mono text-sm tabular-nums ${
                        l.kind === "credit"
                          ? "text-emerald-600 dark:text-emerald-400"
                          : l.kind === "info"
                            ? "text-muted-foreground"
                            : l.negotiated
                              ? "font-semibold text-primary"
                              : "font-semibold"
                      }`}
                    >
                      {l.kind === "credit" ? "+" : ""}
                      {fmt(l.amount, forecast.feeCcy)}
                    </span>
                  </span>
                </div>
                {l.note && <span className="text-xs leading-relaxed text-muted-foreground">{l.note}</span>}
                {negotiating && isNegotiable(l) && (
                  <div className="flex items-center gap-2">
                    <MoneyInput
                      aria-label={`Agreed price for ${l.label.trim()}`}
                      placeholder={`Agreed price (standard ${fmt(l.standard, forecast.feeCcy)})`}
                      value={overrides[i] ?? ""}
                      onValueChange={(v) => setOverrides((o) => ({ ...o, [i]: v }))}
                      className="h-11 min-w-0 flex-1 text-base"
                    />
                    {overrides[i] && (
                      <Button
                        type="button"
                        variant="ghost"
                        className="h-11 shrink-0 px-3"
                        onClick={() =>
                          setOverrides((o) => {
                            const n = { ...o }
                            delete n[i]
                            return n
                          })
                        }
                      >
                        Reset
                      </Button>
                    )}
                  </div>
                )}
              </li>
            ))}
          </ul>

          {negotiating && (
            <div className="flex flex-col gap-2">
              <Label htmlFor="cf-deal-note">Note to the client (optional)</Label>
              <Textarea
                id="cf-deal-note"
                value={dealNote}
                onChange={(e) => setDealNote(e.target.value)}
                placeholder="e.g. Special conditions valid until the end of the month"
                className="min-h-20 text-base"
              />
            </div>
          )}

          <div className="flex items-center justify-between gap-3 rounded-lg bg-primary/10 p-3">
            <span className="text-sm font-medium">
              {anyNegotiated ? "Agreed upfront cost" : "Total upfront cost"}
            </span>
            <span className="flex flex-col items-end">
              {anyNegotiated && Math.abs(standardUpfront - upfront) > 0.004 && (
                <span className="font-mono text-xs tabular-nums text-muted-foreground line-through">
                  {fmt(standardUpfront, forecast.feeCcy)}
                </span>
              )}
              <span className="font-mono text-base font-semibold tabular-nums">{fmt(upfront, forecast.feeCcy)}</span>
            </span>
          </div>
          {anyNegotiated && (
            <Badge variant="secondary" className="w-fit">
              Special price for this client
            </Badge>
          )}

          {ctx && affordable !== null && upfront > 0 && (
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <Badge variant={affordable ? "default" : "destructive"}>{affordable ? "Client can cover it now" : "Client cannot cover it"}</Badge>
              <span className="text-muted-foreground">
                {affordable
                  ? `Available + overdraft: ${fmt(spendableEur, "EUR")}`
                  : `Short by ${fmt(upfrontEur - spendableEur, "EUR")} — needs a top-up first`}
              </span>
            </div>
          )}

          <p className="text-xs leading-relaxed text-muted-foreground">
            Indicative only — final figures are confirmed by the platform when the client applies. Leverage and
            monetization PPI follow the client&apos;s current trust score.
          </p>

          <Button onClick={sendToClient} disabled={!clientId || sending} className="h-11 w-full">
            {sending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden /> : <Send className="mr-2 h-4 w-4" aria-hidden />}
            {!clientId ? "Choose a client to send" : anyNegotiated ? "Send special-price forecast to the client" : "Send this forecast to the client"}
          </Button>
        </CardContent>
      </Card>
    </div>
  )
}

function amountLabel(s: ServiceId): string {
  switch (s) {
    case "receive":
      return "Face value / amount received"
    case "leverage":
      return "Equity / pledged collateral"
    case "upgrade":
      return "New face value"
    case "payment":
      return "Payment amount"
    case "loan":
      return "Facility amount"
    case "yield":
    case "hedge":
      return "Capital invested"
    default:
      return "Face value"
  }
}

function Stat({ label, value, warn }: { label: string; value: string; warn?: boolean }) {
  return (
    <div className="flex min-w-0 flex-col">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className={`truncate font-mono tabular-nums ${warn ? "text-destructive" : ""}`}>{value}</span>
    </div>
  )
}

function NumberField({ id, label, value, onChange }: { id: string; label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        inputMode="decimal"
        value={value}
        onChange={(e) => onChange(e.target.value.replace(/[^0-9.]/g, ""))}
        className="h-11 text-base"
      />
    </div>
  )
}

function Choice({
  label,
  value,
  onChange,
  options,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  options: [string, string][]
}) {
  return (
    <div className="flex flex-col gap-2">
      <Label>{label}</Label>
      <div className="flex flex-wrap gap-2" role="radiogroup" aria-label={label}>
        {options.map(([v, l]) => (
          <Button
            key={v}
            type="button"
            role="radio"
            aria-checked={value === v}
            variant={value === v ? "default" : "outline"}
            onClick={() => onChange(v)}
            className="h-11"
          >
            {l}
          </Button>
        ))}
      </div>
    </div>
  )
}
