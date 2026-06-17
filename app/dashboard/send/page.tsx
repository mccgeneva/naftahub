"use client"

import { useMemo, useState } from "react"
import {
  Send,
  ArrowUpRight,
  ArrowDownLeft,
  Users,
  Info,
  Wallet,
  ShieldCheck,
  Clock,
  CheckCircle2,
  XCircle,
} from "lucide-react"
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
import { usePaymentRequests } from "@/lib/payment-requests-store"
import { toast } from "sonner"

const currencySymbols: Record<string, string> = { EUR: "€", USD: "$", GBP: "£", CHF: "CHF" }

// Internal transfers carry no platform fee (unlike external SWIFT payments).
const TRANSFER_FEE_RATE = 0

function formatCurrency(amount: number, currency: string): string {
  const symbol = currencySymbols[currency] || currency
  return `${symbol}${amount.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" })
}

const statusBadge: Record<string, { label: string; className: string; icon: typeof Clock }> = {
  pending: {
    label: "Pending approval",
    className: "border-yellow-500/20 bg-yellow-500/10 text-yellow-500",
    icon: Clock,
  },
  approved: {
    label: "Approved",
    className: "border-green-500/20 bg-green-500/10 text-green-500",
    icon: CheckCircle2,
  },
  rejected: {
    label: "Rejected",
    className: "border-red-500/20 bg-red-500/10 text-red-500",
    icon: XCircle,
  },
}

export default function SendMoneyPage() {
  const logActivity = useActivityLog()
  const { balanceFor } = useLedger()
  const { requests, addRequest } = usePaymentRequests()

  const [recipient, setRecipient] = useState("")
  const [amount, setAmount] = useState("")
  const [currency, setCurrency] = useState("EUR")
  const [note, setNote] = useState("")

  const availableBalance = balanceFor(currency)

  // The history of transfers the customer has submitted is derived directly
  // from the persisted payment-requests store, so rows never disappear on
  // navigation and always reflect the latest Administrator decision.
  const history = useMemo(
    () =>
      requests
        .filter((r) => r.payeeSource === "Send Money (internal transfer)")
        .sort((a, b) => new Date(b.submittedAt).getTime() - new Date(a.submittedAt).getTime()),
    [requests],
  )

  const resetForm = () => {
    setRecipient("")
    setAmount("")
    setNote("")
  }

  const handleSubmit = () => {
    const amountValue = Number.parseFloat(amount)
    const to = recipient.trim()

    if (!to) {
      toast.error("Enter the recipient's name or registered email address")
      return
    }
    if (!Number.isFinite(amountValue) || amountValue <= 0) {
      toast.error("Enter a valid amount greater than 0")
      return
    }

    const feeValue = Math.round(amountValue * TRANSFER_FEE_RATE * 100) / 100
    const totalDebit = amountValue + feeValue

    // Soft pre-check. Funds are NOT moved here — they are only debited once an
    // Administrator approves the request.
    if (totalDebit > availableBalance) {
      toast.error("Insufficient balance", {
        description: `This transfer needs ${formatCurrency(totalDebit, currency)} but only ${formatCurrency(availableBalance, currency)} is available.`,
      })
      return
    }

    const requestId = `TRF-${new Date().getTime().toString().slice(-8)}`
    const formatted = formatCurrency(amountValue, currency)

    // Create a PENDING request. No ledger movement happens until an
    // Administrator approves it — the customer cannot move funds directly.
    addRequest({
      id: requestId,
      beneficiary: to,
      beneficiaryCountry: "—",
      iban: to,
      swiftCode: "—",
      reference: note.trim() || `Internal transfer to ${to}`,
      notes: note.trim(),
      currency,
      amount: amountValue,
      fee: feeValue,
      total: totalDebit,
      payeeSource: "Send Money (internal transfer)",
    })

    logActivity({
      action: `Submitted internal transfer of ${formatted} to ${to} for Administrator approval`,
      category: "Transfers",
      details: {
        summary: `Submitted an internal transfer request of ${formatted} to "${to}" for mandatory Administrator approval. No funds have left the account yet — they will only be debited once the request is approved. Reference: ${requestId}.`,
        reference: requestId,
        recipient: to,
        amount: formatted,
        status: "Pending Administrator Approval",
      },
    })

    toast.success("Transfer submitted for approval", {
      description: `Your transfer of ${formatted} to ${to} is pending Administrator approval. Funds will only be debited once it is approved.`,
    })
    resetForm()
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-bold text-foreground">Send Money</h1>
        <p className="text-sm text-muted-foreground">
          Submit an internal transfer to another MCC Capital account holder for Administrator approval.
        </p>
      </div>

      {/* Approval notice */}
      <div className="flex items-start gap-3 rounded-lg border border-border bg-secondary/30 p-4">
        <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
        <p className="text-sm text-muted-foreground">
          <span className="font-medium text-foreground">Administrator approval required:</span> for your
          security, every outgoing transfer is reviewed and authorised by an MCC Administrator before any
          funds move. When you submit a transfer it is placed in a pending queue &mdash; no funds leave your
          account until the request is approved.
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Request form */}
        <Card className="bg-card border-border">
          <CardHeader>
            <div className="flex items-center gap-2">
              <div className="rounded-lg bg-blue-500/10 p-2 text-blue-400">
                <Send className="h-5 w-5" />
              </div>
              <div>
                <CardTitle className="text-lg">Request a Transfer</CardTitle>
                <CardDescription>Submit funds to another account holder for approval</CardDescription>
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
              <Label htmlFor="recipient">Recipient</Label>
              <Input
                id="recipient"
                inputMode="email"
                autoComplete="off"
                placeholder="Name or name@example.com"
                value={recipient}
                onChange={(e) => setRecipient(e.target.value)}
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

            <Button onClick={handleSubmit} className="w-full sm:w-auto">
              <Send className="mr-2 h-4 w-4" />
              Submit for Approval
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
                <CardTitle className="text-lg">Your Transfer Requests</CardTitle>
                <CardDescription>Transfers you&apos;ve submitted and their approval status</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {history.length === 0 ? (
              <div className="flex flex-col items-center justify-center gap-2 py-10 text-center">
                <Users className="h-8 w-8 text-muted-foreground/50" />
                <p className="text-sm text-muted-foreground">No transfers yet.</p>
                <p className="text-xs text-muted-foreground">
                  Transfers you submit will appear here with their approval status.
                </p>
              </div>
            ) : (
              <ul className="divide-y divide-border">
                {history.map((t) => {
                  const badge = statusBadge[t.status] ?? statusBadge.pending
                  const BadgeIcon = badge.icon
                  return (
                    <li key={t.id} className="flex items-center gap-3 py-3">
                      <div className="rounded-lg bg-blue-500/10 p-2 text-blue-400">
                        {t.status === "approved" ? (
                          <ArrowUpRight className="h-4 w-4" />
                        ) : t.status === "rejected" ? (
                          <XCircle className="h-4 w-4" />
                        ) : (
                          <ArrowDownLeft className="h-4 w-4" />
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-foreground">To {t.beneficiary}</p>
                        <p className="truncate text-xs text-muted-foreground">
                          {t.id} &middot; {formatDate(t.submittedAt)}
                        </p>
                        {t.notes && (
                          <p className="truncate text-xs text-muted-foreground italic">&ldquo;{t.notes}&rdquo;</p>
                        )}
                        {t.status === "rejected" && t.decisionNote && (
                          <p className="truncate text-xs text-red-400">Reason: {t.decisionNote}</p>
                        )}
                      </div>
                      <div className="text-right">
                        <p className="text-sm font-semibold text-foreground">
                          {formatCurrency(t.amount, t.currency)}
                        </p>
                        <Badge
                          variant="outline"
                          className={`mt-0.5 gap-1 text-[10px] ${badge.className}`}
                        >
                          <BadgeIcon className="h-3 w-3" />
                          {badge.label}
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
