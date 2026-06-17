"use client"

import { useMemo, useState } from "react"
import {
  Send,
  ArrowUpRight,
  ArrowDownLeft,
  Wallet,
  Mail,
  CheckCircle2,
  Search,
  Download,
  Zap,
  Users,
} from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Textarea } from "@/components/ui/textarea"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { cn } from "@/lib/utils"
import { useLedger, creditUserLedger } from "@/lib/ledger-store"
import { useActivityLog } from "@/components/activity-tracker"
import { getActiveUserId } from "@/lib/user-scope"
import {
  getUserById,
  getTransferDirectory,
  findTransferRecipientByEmail,
  type TransferDirectoryEntry,
} from "@/lib/users"
import { exportToCsv } from "@/lib/export-utils"
import { toast } from "sonner"

const CURRENCIES = ["EUR", "USD", "GBP", "CHF", "JPY", "AUD", "CAD", "SGD"]
const TRANSFER_CATEGORY = "Internal Transfer"

const formatCurrency = (value: number, currency: string) =>
  `${currency} ${value.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`

export default function TransfersPage() {
  const { entries, balanceFor, addDebit, currencies, hydrated } = useLedger()
  const logActivity = useActivityLog()

  // Resolve the signed-in account so we can label the credit on the recipient
  // side and exclude ourselves from the recipient directory.
  const activeUserId = getActiveUserId()
  const self = getUserById(activeUserId)
  const directory = useMemo<TransferDirectoryEntry[]>(
    () => getTransferDirectory().filter((d) => d.id !== activeUserId),
    [activeUserId],
  )

  const [recipientEmail, setRecipientEmail] = useState("")
  const [amount, setAmount] = useState("")
  const [currency, setCurrency] = useState("EUR")
  const [reference, setReference] = useState("")
  const [note, setNote] = useState("")
  const [formError, setFormError] = useState<string | null>(null)
  const [search, setSearch] = useState("")

  // Live recipient resolution from the registered-email directory.
  const resolvedRecipient = useMemo(
    () => (recipientEmail.trim() ? findTransferRecipientByEmail(recipientEmail) : undefined),
    [recipientEmail],
  )
  const recipientIsSelf = resolvedRecipient?.id === activeUserId

  const availableBalance = balanceFor(currency)

  // Internal transfer history is derived from the ledger: sent transfers are
  // debits tagged with our category, received ones are credits with the same
  // category. Both sides are written at transfer time.
  const transferHistory = useMemo(() => {
    return entries
      .filter((e) => e.category === TRANSFER_CATEGORY)
      .map((e) => ({
        id: e.id,
        direction: e.direction,
        amount: e.amount,
        currency: e.currency,
        counterparty: e.counterparty,
        account: e.account || "",
        reference: e.reference || "",
        comment: e.comment || "",
        date: e.date,
      }))
  }, [entries])

  const filteredHistory = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return transferHistory
    return transferHistory.filter(
      (t) =>
        t.counterparty.toLowerCase().includes(q) ||
        t.account.toLowerCase().includes(q) ||
        t.reference.toLowerCase().includes(q) ||
        t.id.toLowerCase().includes(q),
    )
  }, [transferHistory, search])

  const sentTotal = transferHistory
    .filter((t) => t.direction === "debit")
    .reduce((sum, t) => sum + t.amount, 0)
  const receivedTotal = transferHistory
    .filter((t) => t.direction === "credit")
    .reduce((sum, t) => sum + t.amount, 0)

  const resetForm = () => {
    setRecipientEmail("")
    setAmount("")
    setCurrency("EUR")
    setReference("")
    setNote("")
    setFormError(null)
  }

  const handleSend = () => {
    setFormError(null)
    const amountValue = Number.parseFloat(amount)
    const email = recipientEmail.trim().toLowerCase()

    if (!email) {
      setFormError("Please enter the recipient's registered email address.")
      return
    }
    const recipient = findTransferRecipientByEmail(email)
    if (!recipient) {
      setFormError("No platform account is registered to that email address.")
      return
    }
    if (recipient.id === activeUserId) {
      setFormError("You cannot send an internal transfer to your own account.")
      return
    }
    if (!amount || Number.isNaN(amountValue) || amountValue <= 0) {
      setFormError("Please enter a valid amount greater than 0.")
      return
    }
    if (amountValue > availableBalance) {
      setFormError(
        `Insufficient funds. This transfer needs ${formatCurrency(amountValue, currency)} but only ${formatCurrency(availableBalance, currency)} is available.`,
      )
      return
    }

    const ref = reference.trim() || `ITR-${new Date().getTime().toString().slice(-8)}`
    const nowIso = new Date().toISOString()
    const senderLabel = `${self.fullName || self.company} (${self.email})`
    const recipientLabel = `${recipient.displayName} (${recipient.email})`

    // 1) Credit the recipient's ledger directly (instant, no external banking).
    const credited = creditUserLedger(recipient.id, {
      id: ref,
      amount: amountValue,
      currency,
      status: "completed",
      date: nowIso,
      counterparty: senderLabel,
      account: self.email,
      bank: "MCC Capital — Internal Transfer",
      reference: ref,
      comment: note.trim() || `Internal transfer received from ${senderLabel}.`,
      category: TRANSFER_CATEGORY,
    })

    if (!credited) {
      setFormError("The transfer could not be completed. Please try again.")
      return
    }

    // 2) Debit our own live ledger so the balance updates immediately.
    addDebit({
      id: ref,
      amount: amountValue,
      currency,
      status: "completed",
      date: nowIso,
      counterparty: recipientLabel,
      account: recipient.email,
      bank: "MCC Capital — Internal Transfer",
      reference: ref,
      comment: note.trim() || `Internal transfer sent to ${recipientLabel}.`,
      category: TRANSFER_CATEGORY,
    })

    toast.success("Transfer sent instantly", {
      description: `${formatCurrency(amountValue, currency)} delivered to ${recipient.displayName} (${recipient.email}).`,
    })

    logActivity({
      action: `Sent an internal transfer of ${formatCurrency(amountValue, currency)} to ${recipient.email}`,
      category: "Payments",
      details: {
        summary: `Client sent an instant internal P2P transfer of ${formatCurrency(amountValue, currency)} to ${recipient.displayName} (${recipient.email}). Funds were debited from this account and credited to the recipient in real time. Reference: ${ref}.`,
        referenceId: ref,
        recipientEmail: recipient.email,
        recipientName: recipient.displayName,
        amount: formatCurrency(amountValue, currency),
        currency,
        note: note.trim() || "(none)",
        settlement: "Instant / Internal",
      },
    })

    resetForm()
  }

  const handleExport = () => {
    const count = exportToCsv(
      "internal-transfers",
      filteredHistory.map((t) => ({
        ...t,
        direction: t.direction === "credit" ? "Received" : "Sent",
        amount: formatCurrency(t.amount, t.currency),
      })),
      [
        { key: "id", label: "Reference" },
        { key: "direction", label: "Direction" },
        { key: "amount", label: "Amount" },
        { key: "counterparty", label: "Counterparty" },
        { key: "account", label: "Counterparty Email" },
        { key: "comment", label: "Note" },
        { key: "date", label: "Date" },
      ],
    )
    toast.success("Transfers exported", {
      description: `${count} internal transfer${count === 1 ? "" : "s"} exported to CSV.`,
    })
  }

  const stats = [
    {
      title: "Available Balance",
      value: formatCurrency(availableBalance, currency),
      hint: `${currency} account`,
      icon: Wallet,
      color: "text-primary",
    },
    {
      title: "Total Sent",
      value: formatCurrency(sentTotal, currency),
      hint: `${transferHistory.filter((t) => t.direction === "debit").length} transfers`,
      icon: ArrowUpRight,
      color: "text-red-400",
    },
    {
      title: "Total Received",
      value: formatCurrency(receivedTotal, currency),
      hint: `${transferHistory.filter((t) => t.direction === "credit").length} transfers`,
      icon: ArrowDownLeft,
      color: "text-green-400",
    },
  ]

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold text-foreground">Internal Transfers</h1>
            <Badge className="bg-primary/20 text-primary">P2P</Badge>
          </div>
          <p className="text-sm text-muted-foreground">
            Send funds instantly to any MCC Capital account using their registered email — no
            external banking, settled in real time.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={handleExport}>
          <Download className="mr-2 h-4 w-4" />
          Export
        </Button>
      </div>

      {/* Stats */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {stats.map((stat) => (
          <Card key={stat.title} className="bg-card border-border">
            <CardContent className="flex items-center justify-between p-5">
              <div>
                <p className="text-xs text-muted-foreground">{stat.title}</p>
                <p className="mt-1 text-xl font-bold text-foreground">{stat.value}</p>
                <p className="mt-0.5 text-[11px] text-muted-foreground">{stat.hint}</p>
              </div>
              <div className={cn("rounded-lg bg-secondary/50 p-3", stat.color)}>
                <stat.icon className="h-5 w-5" />
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-5">
        {/* Transfer form */}
        <Card className="bg-card border-border lg:col-span-2">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg font-semibold">
              <Send className="h-5 w-5 text-primary" />
              New Internal Transfer
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="recipient">Recipient email</Label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  id="recipient"
                  type="email"
                  inputMode="email"
                  autoComplete="off"
                  placeholder="recipient@mccgva.ch"
                  value={recipientEmail}
                  onChange={(e) => setRecipientEmail(e.target.value)}
                  className="pl-9"
                />
              </div>
              {/* Live recipient resolution */}
              {recipientEmail.trim() && resolvedRecipient && !recipientIsSelf && (
                <div className="flex items-center gap-2 rounded-lg border border-green-500/20 bg-green-500/10 p-2.5">
                  <Avatar className="h-8 w-8">
                    <AvatarFallback className="bg-primary/20 text-xs text-primary">
                      {resolvedRecipient.initials}
                    </AvatarFallback>
                  </Avatar>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-foreground">
                      {resolvedRecipient.displayName}
                    </p>
                    <p className="truncate text-xs text-muted-foreground">
                      {resolvedRecipient.company}
                    </p>
                  </div>
                  <CheckCircle2 className="h-4 w-4 shrink-0 text-green-500" />
                </div>
              )}
              {recipientEmail.trim() && recipientIsSelf && (
                <p className="text-xs text-red-400">You cannot transfer to your own account.</p>
              )}
              {recipientEmail.trim() && !resolvedRecipient && (
                <p className="text-xs text-muted-foreground">
                  No account found for this email yet.
                </p>
              )}
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div className="col-span-2 space-y-2">
                <Label htmlFor="amount">Amount</Label>
                <Input
                  id="amount"
                  type="number"
                  min="0"
                  step="0.01"
                  inputMode="decimal"
                  placeholder="0.00"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="currency">Currency</Label>
                <Select value={currency} onValueChange={setCurrency}>
                  <SelectTrigger id="currency">
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
            <p className="text-xs text-muted-foreground">
              Available: <span className="font-medium text-foreground">{formatCurrency(availableBalance, currency)}</span>
            </p>

            <div className="space-y-2">
              <Label htmlFor="reference">Reference (optional)</Label>
              <Input
                id="reference"
                placeholder="e.g. Invoice 2026-014"
                value={reference}
                onChange={(e) => setReference(e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="note">Note (optional)</Label>
              <Textarea
                id="note"
                rows={2}
                placeholder="Add a message for the recipient"
                value={note}
                onChange={(e) => setNote(e.target.value)}
              />
            </div>

            {formError && (
              <p className="rounded-lg border border-red-500/20 bg-red-500/10 p-2.5 text-xs text-red-400">
                {formError}
              </p>
            )}

            <Button
              className="w-full"
              onClick={handleSend}
              disabled={!resolvedRecipient || recipientIsSelf}
            >
              <Zap className="mr-2 h-4 w-4" />
              Send Instantly
            </Button>

            {/* Quick directory of other accounts */}
            {directory.length > 0 && (
              <div className="space-y-2 border-t border-border pt-3">
                <p className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                  <Users className="h-3.5 w-3.5" />
                  Platform accounts
                </p>
                <div className="space-y-1">
                  {directory.map((d) => (
                    <button
                      key={d.id}
                      type="button"
                      onClick={() => setRecipientEmail(d.email)}
                      className="flex w-full items-center gap-2 rounded-lg p-2 text-left transition-colors hover:bg-secondary/60"
                    >
                      <Avatar className="h-7 w-7">
                        <AvatarFallback className="bg-secondary text-[10px] text-foreground">
                          {d.initials}
                        </AvatarFallback>
                      </Avatar>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-xs font-medium text-foreground">
                          {d.displayName}
                        </p>
                        <p className="truncate text-[11px] text-muted-foreground">{d.email}</p>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* History */}
        <Card className="bg-card border-border lg:col-span-3">
          <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <CardTitle className="text-lg font-semibold">Transfer History</CardTitle>
            <div className="relative w-full sm:w-64">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Search transfers"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9"
              />
            </div>
          </CardHeader>
          <CardContent>
            {!hydrated ? (
              <p className="py-10 text-center text-sm text-muted-foreground">Loading…</p>
            ) : filteredHistory.length === 0 ? (
              <div className="flex flex-col items-center justify-center gap-2 py-12 text-center">
                <Send className="h-8 w-8 text-muted-foreground" />
                <p className="text-sm text-muted-foreground">
                  No internal transfers yet. Send funds to another account to get started.
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                {filteredHistory.map((t) => {
                  const isReceived = t.direction === "credit"
                  return (
                    <div
                      key={`${t.id}-${t.direction}-${t.date}`}
                      className="flex items-center gap-3 rounded-lg border border-border p-3"
                    >
                      <div
                        className={cn(
                          "flex h-9 w-9 shrink-0 items-center justify-center rounded-full",
                          isReceived
                            ? "bg-green-500/10 text-green-500"
                            : "bg-red-500/10 text-red-400",
                        )}
                      >
                        {isReceived ? (
                          <ArrowDownLeft className="h-4 w-4" />
                        ) : (
                          <ArrowUpRight className="h-4 w-4" />
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-foreground">
                          {isReceived ? "From" : "To"} {t.counterparty}
                        </p>
                        <p className="truncate text-xs text-muted-foreground">
                          {t.reference || t.id} · {new Date(t.date).toLocaleString("en-GB", {
                            day: "2-digit",
                            month: "short",
                            year: "numeric",
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </p>
                        {t.comment && (
                          <p className="truncate text-[11px] text-muted-foreground/80">
                            {t.comment}
                          </p>
                        )}
                      </div>
                      <div className="shrink-0 text-right">
                        <p
                          className={cn(
                            "text-sm font-semibold",
                            isReceived ? "text-green-500" : "text-foreground",
                          )}
                        >
                          {isReceived ? "+" : "−"}
                          {formatCurrency(t.amount, t.currency)}
                        </p>
                        <Badge
                          variant="outline"
                          className="mt-1 border-green-500/20 bg-green-500/10 text-[10px] text-green-500"
                        >
                          <CheckCircle2 className="mr-1 h-3 w-3" />
                          Settled
                        </Badge>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
