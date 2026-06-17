"use client"

import { ArrowUpRight, ArrowDownRight, TrendingUp, Wallet, Building2, FileText } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { cn } from "@/lib/utils"
import { useLedger, convertCurrency } from "@/lib/ledger-store"
import { useInstrumentRequests } from "@/lib/instrument-requests-store"
import { useBeneficiaries } from "@/lib/beneficiaries-store"

const currencySymbols: Record<string, string> = {
  EUR: "€",
  USD: "$",
  GBP: "£",
  CHF: "CHF ",
  JPY: "¥",
  AUD: "A$",
  CAD: "C$",
  SGD: "S$",
}

const currencyNames: Record<string, string> = {
  EUR: "Euro",
  USD: "US Dollar",
  GBP: "British Pound",
  CHF: "Swiss Franc",
  JPY: "Japanese Yen",
  AUD: "Australian Dollar",
  CAD: "Canadian Dollar",
  SGD: "Singapore Dollar",
}

function formatMoney(amount: number, currency: string): string {
  const symbol = currencySymbols[currency] || `${currency} `
  return `${symbol}${amount.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

function formatEur(amount: number): string {
  return formatMoney(amount, "EUR")
}

export function PortfolioOverview() {
  const { totalIn, balanceFor, entries, currencies } = useLedger()
  const { instruments } = useInstrumentRequests()
  const { beneficiaries } = useBeneficiaries()

  // Total balance aggregates every currency the client holds, converted to EUR,
  // so balances from currency exchanges (USD, GBP, etc.) are included too.
  const totalBalance = totalIn("EUR")
  const heldCurrencies = currencies.length

  // One balance line per currency the client holds. EUR is always shown first,
  // followed by any other currency (e.g. proceeds from a currency exchange).
  const orderedCurrencies = ["EUR", ...currencies.filter((c) => c !== "EUR")].filter(
    (c, i, arr) => arr.indexOf(c) === i,
  )
  const currencyBalances = orderedCurrencies.map((cur) => ({
    currency: cur,
    name: currencyNames[cur] || cur,
    balance: balanceFor(cur),
    formatted: formatMoney(balanceFor(cur), cur),
  }))

  // Volume received over the trailing 30 days, aggregating every currency's
  // completed credits into their EUR equivalent so the figure reflects the
  // whole portfolio rather than EUR-only inflows.
  const now = new Date()
  const thirtyDaysAgo = now.getTime() - 30 * 24 * 60 * 60 * 1000
  const monthlyVolume = entries
    .filter((e) => e.direction === "credit" && e.status === "completed" && new Date(e.date).getTime() >= thirtyDaysAgo)
    .reduce((sum, e) => sum + convertCurrency(e.amount, e.currency, "EUR"), 0)

  const receiptCount = entries.filter((e) => e.direction === "credit").length

  // Active bank instruments (SBLC / MTN / BG) currently on file.
  const activeInstruments = instruments.filter((i) => i.status === "active").length

  // Distinct partner banks across active beneficiaries.
  const activeBeneficiaries = beneficiaries.filter((b) => b.status === "active")
  const bankPartners = new Set(activeBeneficiaries.map((b) => b.bankName)).size

  const stats = [
    {
      title: "Active Instruments",
      value: `${activeInstruments}`,
      change: `${activeInstruments}`,
      trend: "up" as const,
      icon: FileText,
      description: "SBLC, MTN, BG",
    },
    {
      title: "Volume (30d)",
      value: formatEur(monthlyVolume),
      change: `${receiptCount}`,
      trend: "up" as const,
      icon: TrendingUp,
      description: "Payments received",
    },
    {
      title: "Bank Partners",
      value: `${bankPartners}`,
      change: `${activeBeneficiaries.length}`,
      trend: "up" as const,
      icon: Building2,
      description: "Active connections",
    },
  ]

  return (
    <div className="space-y-4">
      {/* Per-currency balances */}
      <Card className="bg-card border-border">
        <CardHeader className="flex flex-row items-center justify-between pb-3">
          <CardTitle className="text-sm font-medium text-muted-foreground">
            Account Balances
          </CardTitle>
          <div className="rounded-lg bg-secondary p-2">
            <Wallet className="h-4 w-4 text-primary" />
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {currencyBalances.map((cb) => (
              <div
                key={cb.currency}
                className="rounded-lg border border-border bg-secondary/40 p-4"
              >
                <div className="flex items-center gap-2">
                  <span className="flex h-6 min-w-6 items-center justify-center rounded-full bg-primary/15 px-1.5 text-xs font-semibold text-primary">
                    {cb.currency}
                  </span>
                  <span className="text-xs text-muted-foreground">{cb.name}</span>
                </div>
                <div className="mt-2 text-xl font-bold text-foreground break-all">
                  {cb.formatted}
                </div>
              </div>
            ))}
          </div>
          {heldCurrencies > 1 && (
            <div className="mt-4 flex items-center justify-between border-t border-border pt-3">
              <span className="text-xs text-muted-foreground">
                Total ({heldCurrencies} currencies, EUR equivalent)
              </span>
              <span className="text-sm font-bold text-foreground">{formatEur(totalBalance)}</span>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Stat cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {stats.map((stat) => (
        <Card key={stat.title} className="bg-card border-border">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              {stat.title}
            </CardTitle>
            <div className="rounded-lg bg-secondary p-2">
              <stat.icon className="h-4 w-4 text-primary" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-foreground">{stat.value}</div>
            <div className="flex items-center gap-2 mt-1">
              <div
                className={cn(
                  "flex items-center text-xs font-medium",
                  stat.trend === "up" ? "text-green-500" : "text-red-500"
                )}
              >
                {stat.trend === "up" ? (
                  <ArrowUpRight className="h-3 w-3 mr-0.5" />
                ) : (
                  <ArrowDownRight className="h-3 w-3 mr-0.5" />
                )}
                {stat.change}
              </div>
              <span className="text-xs text-muted-foreground">{stat.description}</span>
            </div>
          </CardContent>
        </Card>
      ))}
      </div>
    </div>
  )
}
