"use client"

import { useState } from "react"
import Link from "next/link"
import { toast } from "sonner"
import { ArrowUpRight, ArrowDownLeft, MoreHorizontal, ExternalLink, Download } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { cn } from "@/lib/utils"
import { useLedger, type LedgerEntry } from "@/lib/ledger-store"
import { generateReceiptPdf } from "@/lib/receipt-pdf"

const currencySymbols: Record<string, string> = {
  EUR: "€",
  USD: "$",
  GBP: "£",
  CHF: "CHF",
}

function formatAmount(amount: number, currency: string): string {
  const symbol = currencySymbols[currency] || currency
  return `${symbol}${amount.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

const statusColors = {
  completed: "bg-green-500/10 text-green-500 border-green-500/20",
  pending: "bg-yellow-500/10 text-yellow-500 border-yellow-500/20",
  processing: "bg-blue-500/10 text-blue-500 border-blue-500/20",
  failed: "bg-red-500/10 text-red-500 border-red-500/20",
}

export function RecentTransactions() {
  const { entries } = useLedger()
  const [selected, setSelected] = useState<LedgerEntry | null>(null)

  // Derive the latest activity from the persisted ledger so recorded incoming
  // and outgoing payments (and the opening balance) appear here automatically.
  const transactions = entries.slice(0, 5).map((e) => ({
    id: e.id,
    entry: e,
    type: e.direction === "credit" ? "incoming" : "outgoing",
    amount: formatAmount(e.amount, e.currency),
    from: e.counterparty,
    to: e.counterparty,
    status: e.status === "completed" ? "completed" : "pending",
    date: (() => {
      const d = new Date(e.date)
      return Number.isNaN(d.getTime()) ? e.date : d.toLocaleDateString("en-GB")
    })(),
    time: (() => {
      const d = new Date(e.date)
      return Number.isNaN(d.getTime())
        ? ""
        : d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })
    })(),
    reference: e.reference || e.id,
  }))

  const formatDateTime = (iso: string) => {
    const d = new Date(iso)
    if (Number.isNaN(d.getTime())) return iso
    return `${d.toLocaleDateString("en-GB")} ${d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}`
  }

  const handleDownloadReceipt = (e: LedgerEntry) => {
    // Split a combined "BANK NAME (BIC XXXX)" string into name + BIC.
    const bicMatch = e.bank?.match(/\(?\b(?:BIC|SWIFT)[:\s]+([A-Z0-9]{8,11})\)?/i)
    const bankName = e.bank?.replace(/\s*\(?\b(?:BIC|SWIFT)[:\s]+[A-Z0-9]{8,11}\)?/i, "").trim()
    generateReceiptPdf({
      reference: e.reference || e.id,
      direction: e.direction,
      amount: formatAmount(e.amount, e.currency),
      currency: e.currency,
      status: e.status,
      date: e.date,
      category: e.category,
      counterparty: e.counterparty,
      bank: bankName || e.bank,
      bic: bicMatch?.[1],
      iban: e.account,
      notes: e.comment,
    })
    toast.success("Receipt downloaded", {
      description: `PDF receipt for ${e.id} has started downloading.`,
    })
  }

  const handleReportIssue = (e: LedgerEntry) => {
    toast.info("Issue reported", {
      description: `Our support team has been notified about transaction ${e.id} and will be in touch.`,
    })
  }

  return (
    <Card className="bg-card border-border">
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardTitle className="text-lg font-semibold">Recent Transactions</CardTitle>
          <p className="text-xs text-muted-foreground mt-1">
            Your latest payment activity
          </p>
        </div>
        <Button asChild variant="outline" size="sm" className="text-xs">
          <Link href="/dashboard/transactions">
            View All
            <ExternalLink className="ml-2 h-3 w-3" />
          </Link>
        </Button>
      </CardHeader>
      <CardContent>
        {transactions.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-secondary mb-3">
              <ArrowUpRight className="h-5 w-5 text-muted-foreground" />
            </div>
            <p className="text-sm font-medium text-foreground">No transactions yet</p>
            <p className="text-xs text-muted-foreground mt-1">
              Your payment activity will appear here
            </p>
          </div>
        ) : (
          <div className="space-y-4">
          {transactions.map((txn) => (
            <div
              key={txn.id}
              className="flex items-center justify-between py-3 border-b border-border last:border-0"
            >
              <div className="flex items-center gap-3">
                <div
                  className={cn(
                    "flex h-10 w-10 items-center justify-center rounded-full",
                    txn.type === "incoming"
                      ? "bg-green-500/10"
                      : "bg-red-500/10"
                  )}
                >
                  {txn.type === "incoming" ? (
                    <ArrowDownLeft className="h-5 w-5 text-green-500" />
                  ) : (
                    <ArrowUpRight className="h-5 w-5 text-red-500" />
                  )}
                </div>
                <div>
                  <p className="text-sm font-medium text-foreground">
                    {txn.type === "incoming" ? txn.from : txn.to}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {txn.reference} • {txn.date} {txn.time}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <div className="text-right">
                  <p
                    className={cn(
                      "text-sm font-semibold",
                      txn.type === "incoming" ? "text-green-500" : "text-foreground"
                    )}
                  >
                    {txn.type === "incoming" ? "+" : "-"}{txn.amount}
                  </p>
                  <Badge
                    variant="outline"
                    className={cn(
                      "text-[10px] capitalize",
                      statusColors[txn.status as keyof typeof statusColors]
                    )}
                  >
                    {txn.status}
                  </Badge>
                </div>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon" className="h-8 w-8">
                      <MoreHorizontal className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onSelect={() => setSelected(txn.entry)}>
                      <ExternalLink className="mr-2 h-4 w-4" />
                      View Details
                    </DropdownMenuItem>
                    <DropdownMenuItem onSelect={() => handleDownloadReceipt(txn.entry)}>
                      <Download className="mr-2 h-4 w-4" />
                      Download Receipt
                    </DropdownMenuItem>
                    <DropdownMenuItem onSelect={() => handleReportIssue(txn.entry)}>
                      Report Issue
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </div>
          ))}
          </div>
        )}
      </CardContent>

      <Dialog open={!!selected} onOpenChange={(open) => !open && setSelected(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Transaction Details</DialogTitle>
            <DialogDescription>
              {selected?.category} &middot; {selected ? formatDateTime(selected.date) : ""}
            </DialogDescription>
          </DialogHeader>
          {selected && (
            <div className="space-y-3">
              {[
                { label: "Reference", value: selected.reference || selected.id },
                {
                  label: "Direction",
                  value: selected.direction === "credit" ? "Incoming / Credit" : "Outgoing / Debit",
                },
                { label: "Amount", value: formatAmount(selected.amount, selected.currency) },
                { label: "Status", value: selected.status },
                {
                  label: selected.direction === "credit" ? "Sender" : "Beneficiary",
                  value: selected.counterparty,
                },
                { label: "Bank", value: selected.bank },
                { label: "IBAN / Account", value: selected.account },
              ]
                .filter((row) => row.value)
                .map((row) => (
                  <div
                    key={row.label}
                    className="flex items-start justify-between gap-4 border-b border-border pb-2 last:border-0"
                  >
                    <span className="text-xs text-muted-foreground">{row.label}</span>
                    <span className="text-sm font-medium text-foreground capitalize text-right break-all">
                      {row.value}
                    </span>
                  </div>
                ))}
              {selected.comment && (
                <p className="rounded-lg bg-secondary/40 p-3 text-xs text-muted-foreground">
                  {selected.comment}
                </p>
              )}
              <Button
                className="w-full"
                variant="outline"
                onClick={() => handleDownloadReceipt(selected)}
              >
                <Download className="mr-2 h-4 w-4" />
                Download Receipt
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </Card>
  )
}
