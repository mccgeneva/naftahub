"use client"

import Link from "next/link"
import { ArrowUpRight, ArrowDownRight, TrendingUp, Wallet, Building2, FileText, ChevronRight } from "lucide-react"
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

  // Core multi-currency settlement accounts that make up the master account.
  // These are always displayed so the client sees the complete picture of every
  // currency balance the platform tracks, even those still at 0.00.
  const CORE_CURRENCIES = ["EUR", "USD", "GBP", "CHF"]

  // One balance line per currency: the core set first, then any other currency
  // the client holds (e.g. proceeds from a less common currency exchange).
  const orderedCurrencies = [
    ...CORE_CURRENCIES,
    ...currencies.filter((c) => !CORE_CURRENCIES.includes(c)),
  ].filter((c, i, arr) => arr.indexOf(c) === i)
  const heldCurrencies = orderedCurrencies.length
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
      href: "/dashboard/instruments",
    },
    {
      title: "Volume (30d)",
      value: formatEur(monthlyVolume),
      change: `${receiptCount}`,
      trend: "up" as const,
      icon: TrendingUp,
      description: "Payments received",
      href: "/dashboard/transactions",
    },
    {
      title: "Bank Partners",
      value: `${bankPartners}`,
      change: `${activeBeneficiaries.length}`,
      trend: "up" as const,
      icon: Building2,
      description: "Active connections",
      href: "/dashboard/beneficiaries",
    },
  ]

  return (
    <div className="space-y-4">
      {/* Per-currency balances */}
      <Card className="bg-card border-border">
        <CardHeader className="flex flex-row items-center justify-between pb-3">
          <div>
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Account Balances
            </CardTitle>
            <p className="text-xs text-muted-foreground mt-0.5">
              Master multi-currency account
            </p>
          </div>
          <div className="rounded-lg bg-secondary p-2">
            <Wallet className="h-4 w-4 text-primary" />
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {currencyBalances.map((cb) => (
              <Link
                key={cb.currency}
                href={`/dashboard/accounts/${cb.currency === "EUR" ? "ACC-001" : `ACC-${cb.currency}`}`}
                aria-label={`View ${cb.name} account`}
                className="group rounded-lg border border-border bg-secondary/40 p-4 transition-colors hover:border-primary/40 hover:bg-secondary/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <div className="flex items-center gap-2">
                  <span className="flex h-6 min-w-6 items-center justify-center rounded-full bg-primary/15 px-1.5 text-xs font-semibold text-primary">
                    {cb.currency}
                  </span>
                  <span className="text-xs text-muted-foreground">{cb.name}</span>
                  <ChevronRight className="ml-auto h-3.5 w-3.5 text-muted-foreground/50 transition-colors group-hover:text-primary" />
                </div>
                <div className="mt-2 text-xl font-bold text-foreground break-all">
                  {cb.formatted}
                </div>
              </Link>
            ))}
          </div>
          <Link
            href="/dashboard/accounts"
            className="group mt-4 flex items-center justify-between border-t border-border pt-3 transition-colors hover:text-primary focus-visible:outline-none"
          >
            <span className="text-xs text-muted-foreground transition-colors group-hover:text-primary">
              Total across {heldCurrencies} currencies (EUR equivalent)
            </span>
            <span className="flex items-center gap-1 text-sm font-bold text-foreground transition-colors group-hover:text-primary">
              {formatEur(totalBalance)}
              <ChevronRight className="h-3.5 w-3.5 text-muted-foreground/50 transition-colors group-hover:text-primary" />
            </span>
          </Link>
        </CardContent>
      </Card>

      {/* Stat cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {stats.map((stat) => (
        <Link
          key={stat.title}
          href={stat.href}
          aria-label={`View ${stat.title}`}
          className="group rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <Card className="h-full bg-card border-border transition-colors group-hover:border-primary/40 group-hover:bg-secondary/30">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                {stat.title}
              </CardTitle>
              <div className="rounded-lg bg-secondary p-2 transition-colors group-hover:bg-primary/15">
                <stat.icon className="h-4 w-4 text-primary" />
              </div>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-between">
                <div className="text-2xl font-bold text-foreground">{stat.value}</div>
                <ChevronRight className="h-4 w-4 text-muted-foreground/40 transition-all group-hover:translate-x-0.5 group-hover:text-primary" />
              </div>
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
        </Link>
      ))}
      </div>
    </div>
  )
}
