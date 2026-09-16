"use client"

import { useMemo } from "react"
import { TrendingUp, CalendarClock, PiggyBank, Lock, Scale, Sparkles } from "lucide-react"
import { Card, CardContent } from "@/components/ui/card"
import { cn } from "@/lib/utils"
import { useLedger } from "@/lib/ledger-store"
import { usePPPRequests } from "@/lib/ppp-requests-store"
import { convertCurrency } from "@/lib/fx"
import { formatMoney } from "@/lib/fund-reservation"
import { analyzeTradingFundPosition } from "@/lib/trading-fund"
import { computePppRoiInfo, type PppRoiInfo } from "@/lib/ppp-roi-info"

const MS_PER_DAY = 24 * 60 * 60 * 1000
const AVG_DAYS_PER_MONTH = 30.4368

// Map a Yield/PPP payout to an equivalent monthly income figure so it can be
// compared like-for-like against the monthly interest cost.
function pppMonthlyClientIncome(info: PppRoiInfo, now: Date): number {
  if (info.periodsInTerm <= 0 || info.clientPerPeriod <= 0) return 0
  if (now.getTime() >= info.termEnd.getTime()) return 0 // program finished
  switch (info.periodUnit) {
    case "day":
      return info.clientPerPeriod * AVG_DAYS_PER_MONTH
    case "week":
      return info.clientPerPeriod * (52 / 12)
    case "month":
      return info.clientPerPeriod
    case "quarter":
      return info.clientPerPeriod / 3
    case "year":
      return info.clientPerPeriod / 12
    case "maturity": {
      // Single payout at maturity — amortise the client's total over the term.
      const months = Math.max(
        1,
        (info.termEnd.getTime() - info.activation.getTime()) / (AVG_DAYS_PER_MONTH * MS_PER_DAY),
      )
      return info.totalClientProjected / months
    }
    default:
      return info.clientPerPeriod
  }
}

// The approval id is embedded in every trading-fund entry id — mirrors the
// reconstruction the Treuhand desk uses so one position = one subscription.
function approvalIdFromEntryId(id: string): string | null {
  if (id.startsWith("TFUND-ROI-")) return id.slice("TFUND-ROI-".length).replace(/-M\d+$/, "")
  if (id.startsWith("TFUND-RETURN-")) return id.slice("TFUND-RETURN-".length)
  if (id.startsWith("TFUND-COMM-")) return id.slice("TFUND-COMM-".length)
  if (id.startsWith("TFUND-PENALTY-")) return id.slice("TFUND-PENALTY-".length)
  if (id.startsWith("TFUND-CHARGE-")) return id.slice("TFUND-CHARGE-".length)
  if (id.startsWith("APPR-")) return id.slice("APPR-".length)
  return null
}

/**
 * Income & ROI panel for the Debits page. It answers the customer's question —
 * "if I owe money, what income is coming in to cover it?" — by reconstructing,
 * straight from the ledger the account already reads:
 *   • projected monthly ROI from every ACTIVE Treuhand fund position (25%/mo),
 *   • projected monthly income from every active Yield / PPP program,
 *   • ROI actually credited so far, and any credited-but-locked ROI,
 * then comparing the projected monthly income to the monthly interest cost so
 * the customer sees at a glance whether incomes exceed the financing.
 *
 * ROI is paid IN ARREARS (first payout ~one period after a position is
 * deployed), so a freshly-deployed position shows financing before its first
 * credit — the panel states this explicitly so it never looks alarming.
 */
export function DebitIncomePanel({
  monthlyInterest,
  currency,
}: {
  monthlyInterest: number
  currency: string
}) {
  const { entries, lockedCreditsFor, currencies } = useLedger()
  const { requests: ppp } = usePPPRequests()

  const income = useMemo(() => {
    const now = new Date()
    const toDisplay = (amt: number, from: string) =>
      from === currency ? amt : convertCurrency(amt, from, currency)

    // ── Treuhand fund positions, grouped by approval id ──────────────────────
    const groups = new Map<string, typeof entries>()
    for (const e of entries) {
      if (!e.category?.startsWith("NAFTAhub Trading —")) continue
      const key = approvalIdFromEntryId(e.id) || e.reference || e.id
      const list = groups.get(key)
      if (list) list.push(e)
      else groups.set(key, [e])
    }

    let projectedMonthly = 0
    let roiReceived = 0
    let deployedActive = 0
    let nextRoiDate: Date | null = null
    let nextRoiAmount = 0

    for (const list of groups.values()) {
      const deployed = list
        .filter((e) => e.status === "completed" && e.direction === "debit" && e.category === "NAFTAhub Trading — Fund Subscription")
        .reduce((s, e) => s + e.amount, 0)
      const returned = list
        .filter((e) => e.status === "completed" && e.direction === "credit" && e.category === "NAFTAhub Trading — Fund Exit")
        .reduce((s, e) => s + e.amount, 0)
      const roiEarned = list
        .filter((e) => e.status === "completed" && e.direction === "credit" && e.category === "NAFTAhub Trading — Fund ROI")
        .reduce((s, e) => s + e.amount, 0)
      const ccy = list[0]?.currency ?? currency
      roiReceived += toDisplay(roiEarned, ccy)

      const active = deployed > 0 && returned <= 0
      if (!active) continue
      const deployEntry = list.find(
        (e) => e.status === "completed" && e.direction === "debit" && e.category === "NAFTAhub Trading — Fund Subscription",
      )
      if (!deployEntry) continue
      const view = analyzeTradingFundPosition({
        capitalStarted: deployed,
        activation: new Date(deployEntry.date),
        roiMatured: roiEarned,
        now,
      })
      if (view.expired) continue
      deployedActive += toDisplay(deployed, ccy)
      projectedMonthly += toDisplay(view.monthlyRoiAmount, ccy)
      if (view.nextRoiDate) {
        if (!nextRoiDate || view.nextRoiDate.getTime() < nextRoiDate.getTime()) {
          nextRoiDate = view.nextRoiDate
          nextRoiAmount = toDisplay(view.monthlyRoiAmount, ccy)
        }
      }
    }

    // ── Yield / PPP programs ─────────────────────────────────────────────────
    for (const r of ppp) {
      if (r.status !== "approved" || r.cancelledAt) continue
      const info = computePppRoiInfo(
        {
          amount: r.amount,
          currency: r.currency,
          expectedReturn: r.expectedReturn,
          returnFrequency: r.returnFrequency,
          duration: r.duration,
          activationIso: r.decidedAt ?? r.submittedAt,
          fundingInstrumentId: r.fundingInstrumentId,
          fundingInstrumentLabel: r.fundingInstrumentLabel,
          mccBenefitRate: r.mccBenefitRate,
          clientBenefitRate: r.clientBenefitRate,
          leverageFunded: r.leverageFunded,
        },
        now,
      )
      projectedMonthly += toDisplay(pppMonthlyClientIncome(info, now), r.currency)
      if (info.nextPayout && (!nextRoiDate || info.nextPayout.getTime() < nextRoiDate.getTime())) {
        if (now.getTime() < info.termEnd.getTime()) {
          nextRoiDate = info.nextPayout
          nextRoiAmount = toDisplay(info.clientPerPeriod, r.currency)
        }
      }
    }

    // Yield ROI already credited (in arrears) is tagged separately.
    for (const e of entries) {
      if (e.status === "completed" && e.direction === "credit" && e.category === "NAFTAhub Yield — ROI") {
        roiReceived += toDisplay(e.amount, e.currency)
      }
    }

    // Credited-but-locked ROI (leverage-funded programs credit each payout but
    // hold it until maturity) across every currency.
    let locked = 0
    for (const ccy of currencies) locked += toDisplay(lockedCreditsFor(ccy), ccy)

    return {
      projectedMonthly,
      roiReceived,
      deployedActive,
      locked,
      nextRoiDate,
      nextRoiAmount,
    }
  }, [entries, ppp, currency, currencies, lockedCreditsFor])

  const net = income.projectedMonthly - monthlyInterest
  const covers = income.projectedMonthly > 0 && net >= 0
  const hasIncome = income.projectedMonthly > 0 || income.roiReceived > 0 || income.deployedActive > 0

  return (
    <Card className={cn("border-emerald-500/40")}>
      <CardContent className="pt-6">
        <div className="flex items-start gap-4">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-emerald-500/15 text-emerald-500">
            <TrendingUp className="h-5 w-5" />
          </div>

          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-foreground">
              {hasIncome ? "Income coming in to cover this financing" : "No active investment income right now"}
            </p>

            {hasIncome ? (
              <>
                <p className="mt-1 text-2xl font-bold text-emerald-500 tabular-nums break-all">
                  {formatMoney(income.projectedMonthly, currency)}
                  <span className="ml-1 text-sm font-medium text-muted-foreground">/ month projected</span>
                </p>
                <p className="text-xs text-muted-foreground text-pretty">
                  Expected monthly ROI from your active deployments — the return the borrowed capital is generating.
                </p>

                {/* The one-glance verdict: does income beat the financing cost? */}
                <div
                  className={cn(
                    "mt-3 flex items-start gap-2 rounded-lg border p-3",
                    covers
                      ? "border-emerald-500/40 bg-emerald-500/10"
                      : "border-amber-500/40 bg-amber-500/10",
                  )}
                >
                  <Scale className={cn("mt-0.5 h-4 w-4 shrink-0", covers ? "text-emerald-500" : "text-amber-500")} />
                  <p className="text-xs text-foreground text-pretty">
                    {covers ? (
                      <>
                        Your projected income of{" "}
                        <span className="font-semibold">{formatMoney(income.projectedMonthly, currency)}/mo</span>{" "}
                        exceeds the financing cost of{" "}
                        <span className="font-semibold">{formatMoney(monthlyInterest, currency)}/mo</span> — a net{" "}
                        <span className="font-semibold text-emerald-500">
                          +{formatMoney(net, currency)}/mo
                        </span>{" "}
                        surplus. You are covered.
                      </>
                    ) : (
                      <>
                        Your projected income of{" "}
                        <span className="font-semibold">{formatMoney(income.projectedMonthly, currency)}/mo</span> is
                        currently below the financing cost of{" "}
                        <span className="font-semibold">{formatMoney(monthlyInterest, currency)}/mo</span> by{" "}
                        <span className="font-semibold text-amber-500">
                          {formatMoney(Math.abs(net), currency)}/mo
                        </span>
                        .
                      </>
                    )}
                  </p>
                </div>

                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  <div className="rounded-lg border border-border bg-secondary/20 p-3">
                    <div className="flex items-center gap-1.5 text-muted-foreground">
                      <Sparkles className="h-3.5 w-3.5" />
                      <span className="text-[11px] font-medium">ROI credited so far</span>
                    </div>
                    <p className="mt-0.5 text-base font-semibold text-foreground tabular-nums break-all">
                      {formatMoney(income.roiReceived, currency)}
                    </p>
                  </div>
                  <div className="rounded-lg border border-border bg-secondary/20 p-3">
                    <div className="flex items-center gap-1.5 text-muted-foreground">
                      <CalendarClock className="h-3.5 w-3.5" />
                      <span className="text-[11px] font-medium">Next ROI credit</span>
                    </div>
                    <p className="mt-0.5 text-base font-semibold text-foreground tabular-nums break-all">
                      {income.nextRoiDate ? formatMoney(income.nextRoiAmount, currency) : "—"}
                    </p>
                    {income.nextRoiDate && (
                      <p className="text-[11px] text-muted-foreground">
                        due{" "}
                        {income.nextRoiDate.toLocaleDateString("en-GB", {
                          day: "2-digit",
                          month: "short",
                          year: "numeric",
                        })}
                      </p>
                    )}
                  </div>
                </div>

                {income.locked > 0 && (
                  <div className="mt-3 flex items-start gap-2 rounded-lg border border-border bg-secondary/20 p-3">
                    <Lock className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                    <p className="text-[11px] text-muted-foreground text-pretty">
                      <span className="font-semibold text-foreground">{formatMoney(income.locked, currency)}</span>{" "}
                      of ROI is already credited but locked until each program matures (leverage-funded returns unlock
                      at maturity).
                    </p>
                  </div>
                )}

                <div className="mt-3 flex items-start gap-2">
                  <PiggyBank className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                  <p className="text-[11px] text-muted-foreground text-pretty">
                    ROI is paid in arrears — the first credit lands about one payout period after capital is deployed,
                    so a newly deployed position shows the financing before its first return arrives.
                  </p>
                </div>
              </>
            ) : (
              <p className="mt-1 text-xs text-muted-foreground text-pretty">
                You have financing running but no active fund or yield position generating ROI right now. Deploy the
                facility into a Treuhand fund or Yield program to generate income against it, or settle the debit to
                stop the interest.
              </p>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
