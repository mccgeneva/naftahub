"use client"

import Link from "next/link"
import { Building2, Copy, ExternalLink, CheckCircle2 } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { useState } from "react"
import { cn } from "@/lib/utils"
import { useLedger } from "@/lib/ledger-store"

const bankLogos: Record<string, string> = {
  "Banking Circle - German Branch": "BC",
  "Banking Circle - US Branch": "BC",
  "Banking Circle - UK Branch": "BC",
  "Banking Circle - Swiss Branch": "BC",
  "Banking Circle - Japan Branch": "BC",
  "Banking Circle - Australia Branch": "BC",
  "Banking Circle - Canada Branch": "BC",
  "Banking Circle - Singapore Branch": "BC",
}

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

// Per-currency settlement account metadata. A card is shown for each currency
// the client holds (e.g. proceeds from a currency exchange).
const currencyAccounts: Record<
  string,
  { bank: string; country: string; type: string; iban: string; swift: string }
> = {
  EUR: {
    bank: "Banking Circle - German Branch",
    country: "DE",
    type: "MCC Capital Bank Account",
    iban: "DE73 2022 0800 0029 2908 19",
    swift: "SXPYDEHHXXX",
  },
  USD: {
    bank: "Banking Circle - US Branch",
    country: "US",
    type: "USD Settlement Account",
    iban: "USD-2908 19",
    swift: "SXPYUS33XXX",
  },
  GBP: {
    bank: "Banking Circle - UK Branch",
    country: "GB",
    type: "GBP Settlement Account",
    iban: "GBP-2908 19",
    swift: "SXPYGB2LXXX",
  },
  CHF: {
    bank: "Banking Circle - Swiss Branch",
    country: "CH",
    type: "CHF Settlement Account",
    iban: "CHF-2908 19",
    swift: "SXPYCHGGXXX",
  },
  JPY: {
    bank: "Banking Circle - Japan Branch",
    country: "JP",
    type: "JPY Settlement Account",
    iban: "JPY-2908 19",
    swift: "SXPYJPJTXXX",
  },
  AUD: {
    bank: "Banking Circle - Australia Branch",
    country: "AU",
    type: "AUD Settlement Account",
    iban: "AUD-2908 19",
    swift: "SXPYAU2SXXX",
  },
  CAD: {
    bank: "Banking Circle - Canada Branch",
    country: "CA",
    type: "CAD Settlement Account",
    iban: "CAD-2908 19",
    swift: "SXPYCATTXXX",
  },
  SGD: {
    bank: "Banking Circle - Singapore Branch",
    country: "SG",
    type: "SGD Settlement Account",
    iban: "SGD-2908 19",
    swift: "SXPYSGSGXXX",
  },
}

export function BankAccounts() {
  const [copiedId, setCopiedId] = useState<string | null>(null)
  const { balanceFor, currencies } = useLedger()

  // Always show EUR (the master account), then any other currency held.
  const displayCurrencies = ["EUR", ...currencies.filter((c) => c !== "EUR" && currencyAccounts[c])]

  // One account card per currency, each reflecting its live ledger balance.
  const accounts = displayCurrencies
    .filter((cur) => currencyAccounts[cur])
    .map((cur, index) => {
      const meta = currencyAccounts[cur]
      const symbol = currencySymbols[cur] || `${cur} `
      return {
        id: index + 1,
        bank: meta.bank,
        country: meta.country,
        type: meta.type,
        holder: "MCC Capital",
        iban: meta.iban,
        swift: meta.swift,
        balance: `${symbol}${balanceFor(cur).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
        currency: cur,
        status: "active",
      }
    })

  const copyToClipboard = (text: string, id: string) => {
    navigator.clipboard.writeText(text)
    setCopiedId(id)
    setTimeout(() => setCopiedId(null), 2000)
  }

  return (
    <Card className="bg-card border-border">
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardTitle className="text-lg font-semibold">Bank Accounts</CardTitle>
          <p className="text-xs text-muted-foreground mt-1">
            Connected partner banks
          </p>
        </div>
        <Button asChild variant="outline" size="sm" className="text-xs">
          <Link href="/dashboard/accounts">Add Account</Link>
        </Button>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {accounts.map((account) => (
            <div
              key={account.id}
              className="rounded-lg border border-border bg-secondary/30 p-4"
            >
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                    <span className="text-sm font-bold text-primary">
                      {bankLogos[account.bank]}
                    </span>
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-semibold text-foreground">
                        {account.bank}
                      </p>
                      <Badge variant="outline" className="text-[10px]">
                        {account.country}
                      </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground">{account.type}</p>
                    <p className="text-[11px] text-muted-foreground">{account.holder}</p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-lg font-bold text-foreground">{account.balance}</p>
                  <Badge
                    variant="outline"
                    className="bg-green-500/10 text-green-500 border-green-500/20 text-[10px]"
                  >
                    Active
                  </Badge>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4 pt-3 border-t border-border">
                <div>
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">
                    IBAN
                  </p>
                  <div className="flex items-center gap-2">
                    <code className="text-xs font-mono text-foreground">
                      {account.iban}
                    </code>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6"
                      onClick={() => copyToClipboard(account.iban, `iban-${account.id}`)}
                    >
                      {copiedId === `iban-${account.id}` ? (
                        <CheckCircle2 className="h-3 w-3 text-green-500" />
                      ) : (
                        <Copy className="h-3 w-3" />
                      )}
                    </Button>
                  </div>
                </div>
                <div>
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">
                    SWIFT/BIC
                  </p>
                  <div className="flex items-center gap-2">
                    <code className="text-xs font-mono text-foreground">
                      {account.swift}
                    </code>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6"
                      onClick={() => copyToClipboard(account.swift, `swift-${account.id}`)}
                    >
                      {copiedId === `swift-${account.id}` ? (
                        <CheckCircle2 className="h-3 w-3 text-green-500" />
                      ) : (
                        <Copy className="h-3 w-3" />
                      )}
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  )
}
