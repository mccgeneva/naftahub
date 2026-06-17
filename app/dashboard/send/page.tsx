"use client"

import { useEffect, useState } from "react"
import { Send, ArrowUpRight, ArrowDownLeft, Users, Info, Wallet, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { useActivityLog } from "@/components/activity-tracker"
import { useLedger } from "@/lib/ledger-store"
import { sendTransfer, getMyTransfers, type TransferRecord } from "@/app/actions/transfers"
import { toast } from "sonner"

const currencySymbols: Record<string, string> = { EUR: "€", USD: "$", GBP: "£", CHF: "CHF" }

function formatCurrency(amount: number, currency: string): string {
  const symbol = currencySymbols[currency] || currency
  return `${symbol}${amount.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" })
}

export default function SendMoneyPage() {
  const logActivity = useActivityLog()
  const { balanceFor, refreshTransfers } = useLedger()

  const [recipientEmail, setRecipientEmail] = useState("")
  const [amount, setAmount] = useState("")
  const [currency, setCurrency] = useState("EUR")
  const [note, setNote] = useState("")
  const [submitting, setSubmitting] = useState(false)

  const [history, setHistory] = useState<TransferRecord[]>([])
  const [loadingHistory, setLoadingHistory] = useState(true)

  const availableBalance = balanceFor(currency)

  const loadHistory = async () => {
    const rows = await getMyTransfers()
    setHistory(rows)
    setLoadingHistory(false)
  }

  useEffect(() => {
    void loadHistory()
  }, [])

  const resetForm = () => {
    setRecipientEmail("")
    setAmount("")
    setNote("")
  }

  const handleSend = async () => {
    const amountValue = Number.parseFloat(amount)
    const email = recipientEmail.trim().toLowerCase()

    if (!email) {
      toast.error("Enter the recipient's registered email address")
      return
    }
    if (!Number.isFinite(amountValue) || amountValue <= 0) {
      toast.error("Enter a valid amount greater than 0")
      return
    }
    if (amountValue > availableBalance) {
      toast.error("Insufficient balance", {
        description: `Your available ${currency} balance is ${formatCurrency(availableBalance, currency)}.`,
      })
      return
    }

    setSubmitting(true)
    try {
      const result = await sendTransfer({
        recipientEmail: email,
        amount: amountValue,
        currency,
        note: note.trim() || undefined,
      })

      if (!result.ok) {
        toast.error("Transfer failed", { description: result.error })
        return
      }

      const formatted = formatCurrency(amountValue, currency)
      toast.success(`Sent ${formatted}`, {
        description: `${formatted} sent to ${result.transfer.counterpartyName} (ref ${result.transfer.id}).`,
      })
      logActivity({
        action: `Sent internal transfer ${formatted}`,
        category: "Transfers",
        details: {
          summary: `Instant P2P transfer of ${formatted} sent to ${result.transfer.counterpartyName} <${email}> (ref ${result.transfer.id}).`,
          reference: result.transfer.id,
          recipient: `${result.transfer.counterpartyName} <${email}>`,
          amount: formatted,
        },
      })

      resetForm()
      // Refresh both the local history list and the global ledger so the
      // sender's balance updates immediately.
      await Promise.all([loadHistory(), refreshTransfers()])
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-bold text-foreground">Send Money</h1>
        <p className="text-sm text-muted-foreground">
          Instantly transfer funds to another MCC Capital account holder using their registered email address.
        </p>
      </div>

      {/* Info banner */}
      <div className="flex items-start gap-3 rounded-lg border border-border bg-secondary/30 p-4">
        <Info className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
        <p className="text-sm text-muted-foreground">
          <span className="font-medium text-foreground">Instant internal transfers:</span> funds move
          immediately between platform accounts. The recipient is identified by their registered email
          and the amount is credited to them straight away &mdash; on any device they sign in from.
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Send form */}
        <Card className="bg-card border-border">
          <CardHeader>
            <div className="flex items-center gap-2">
              <div className="rounded-lg bg-blue-500/10 p-2 text-blue-400">
                <Send className="h-5 w-5" />
              </div>
              <div>
                <CardTitle className="text-lg">Transfer to a User</CardTitle>
                <CardDescription>Send funds using the recipient&apos;s email address</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Balance summary */}
            <div className="flex items-center justify-between gap-3 rounded-lg bg-secondary/30 px-3 py-2">
              <div className="flex items-center gap-2">
                <Wallet className="h-4 w-4 text-primary" />
                <span className="text-xs text-muted-foreground">Available {currency} balance</span>
              </div>
              <span className="font-semibold text-foreground">
                {formatCurrency(availableBalance, currency)}
              </span>
            </div>

            <div className="grid gap-2">
              <Label htmlFor="recipient">Recipient Email</Label>
              <Input
                id="recipient"
                type="email"
                inputMode="email"
                autoComplete="off"
                placeholder="name@example.com"
                value={recipientEmail}
                onChange={(e) => setRecipientEmail(e.target.value)}
              />
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="grid gap-2">
                <Label htmlFor="amount">Amount</Label>
                <Input
                  id="amount"
                  type="number"
                  min="0"
                  step="0.01"
                  placeholder="0.00"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="currency">Currency</Label>
                <Select value={currency} onValueChange={setCurrency}>
                  <SelectTrigger id="currency">
                    <SelectValue placeholder="EUR" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="EUR">EUR</SelectItem>
                    <SelectItem value="USD">USD</SelectItem>
                    <SelectItem value="GBP">GBP</SelectItem>
                    <SelectItem value="CHF">CHF</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid gap-2">
              <Label htmlFor="note">Note (optional)</Label>
              <Textarea
                id="note"
                placeholder="What's this transfer for?"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                rows={2}
              />
            </div>

            <Button onClick={handleSend} disabled={submitting} className="w-full sm:w-auto">
              {submitting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Sending&hellip;
                </>
              ) : (
                <>
                  <Send className="mr-2 h-4 w-4" />
                  Send Transfer
                </>
              )}
            </Button>
          </CardContent>
        </Card>

        {/* Transfer history */}
        <Card className="bg-card border-border">
          <CardHeader>
            <div className="flex items-center gap-2">
              <div className="rounded-lg bg-primary/10 p-2 text-primary">
                <Users className="h-5 w-5" />
              </div>
              <div>
                <CardTitle className="text-lg">Transfer Activity</CardTitle>
                <CardDescription>Money you&apos;ve sent to and received from other users</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {loadingHistory ? (
              <div className="flex items-center justify-center gap-2 py-10 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                Loading activity&hellip;
              </div>
            ) : history.length === 0 ? (
              <div className="flex flex-col items-center justify-center gap-2 py-10 text-center">
                <Users className="h-8 w-8 text-muted-foreground/50" />
                <p className="text-sm text-muted-foreground">No transfers yet.</p>
                <p className="text-xs text-muted-foreground">
                  Transfers you send or receive will appear here.
                </p>
              </div>
            ) : (
              <ul className="divide-y divide-border">
                {history.map((t) => {
                  const incoming = t.direction === "credit"
                  return (
                    <li key={t.id} className="flex items-center gap-3 py-3">
                      <div
                        className={
                          incoming
                            ? "rounded-lg bg-emerald-500/10 p-2 text-emerald-400"
                            : "rounded-lg bg-blue-500/10 p-2 text-blue-400"
                        }
                      >
                        {incoming ? (
                          <ArrowDownLeft className="h-4 w-4" />
                        ) : (
                          <ArrowUpRight className="h-4 w-4" />
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-foreground">
                          {incoming ? "From" : "To"} {t.counterpartyName}
                        </p>
                        <p className="truncate text-xs text-muted-foreground">
                          {t.counterpartyEmail} &middot; {formatDate(t.createdAt)}
                        </p>
                        {t.note && (
                          <p className="truncate text-xs text-muted-foreground italic">&ldquo;{t.note}&rdquo;</p>
                        )}
                      </div>
                      <div className="text-right">
                        <p
                          className={
                            incoming
                              ? "text-sm font-semibold text-emerald-400"
                              : "text-sm font-semibold text-foreground"
                          }
                        >
                          {incoming ? "+" : "−"}
                          {formatCurrency(t.amount, t.currency)}
                        </p>
                        <Badge variant="outline" className="mt-0.5 text-[10px]">
                          {t.id}
                        </Badge>
                      </div>
                    </li>
                  )
                })}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
