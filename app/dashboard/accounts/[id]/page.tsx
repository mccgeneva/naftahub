"use client"

import { useMemo, useState } from "react"
import Link from "next/link"
import { useParams, useRouter } from "next/navigation"
import { toast } from "sonner"
import {
  ArrowLeft,
  Building2,
  Check,
  Copy,
  Edit2,
  Shield,
  ArrowUpRight,
  Download,
  Mail,
  FileText,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { useActivityLog } from "@/components/activity-tracker"
import { exportToCsv } from "@/lib/export-utils"
import {
  useBankAccounts,
  formatCurrency,
  getRatingColor,
  getStatusColor,
  getFlagEmoji,
} from "@/lib/bank-accounts"

export default function AccountDetailPage() {
  const params = useParams<{ id: string }>()
  const router = useRouter()
  const logActivity = useActivityLog()
  const bankAccounts = useBankAccounts()
  const [copiedField, setCopiedField] = useState<string | null>(null)

  const id = decodeURIComponent(params.id)
  const account = useMemo(() => bankAccounts.find((a) => a.id === id), [bankAccounts, id])

  const copyToClipboard = (text: string, field: string) => {
    navigator.clipboard.writeText(text)
    setCopiedField(field)
    setTimeout(() => setCopiedField(null), 2000)
  }

  if (!account) {
    return (
      <div className="mx-auto max-w-3xl">
        <Button variant="ghost" size="sm" asChild className="mb-4">
          <Link href="/dashboard/accounts">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to Accounts
          </Link>
        </Button>
        <Card className="bg-card border-border">
          <CardContent className="flex flex-col items-center justify-center py-16 text-center">
            <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-secondary">
              <Building2 className="h-5 w-5 text-muted-foreground" />
            </div>
            <p className="text-sm font-medium text-foreground">Account not found</p>
            <p className="mt-1 text-xs text-muted-foreground">
              We couldn&apos;t find an account with reference <code className="text-foreground">{id}</code>.
            </p>
          </CardContent>
        </Card>
      </div>
    )
  }

  const handleSendPayment = () => {
    logActivity({
      action: `Started a payment from ${account.accountName ?? account.bankName}`,
      category: "Payments",
      details: {
        summary: `Client initiated a payment from "${account.accountName ?? account.bankName}".`,
        account: account.accountName ?? account.bankName ?? "—",
      },
    })
    router.push("/dashboard/payments")
  }

  const handleContactViaMcc = () => {
    const accountLabel = account.accountName ?? account.bankName ?? "my account"
    const subject = encodeURIComponent(`Account enquiry: ${accountLabel}`)
    const body = encodeURIComponent(
      `Hello MCC Client Services,\n\nI would like to make an enquiry regarding my account "${accountLabel}".\n\n[Please describe your request here]\n\nKind regards,`,
    )
    logActivity({
      action: `Contacted MCC about ${accountLabel}`,
      category: "Bank Accounts",
      details: {
        summary: `Client request routed to MCC admin (admin@mccgva.ch) regarding "${accountLabel}". Direct partner-bank contact is disabled.`,
        routedTo: "admin@mccgva.ch",
        account: accountLabel,
      },
    })
    window.location.href = `mailto:admin@mccgva.ch?subject=${subject}&body=${body}`
    toast.success("Request routed to MCC", {
      description: "Your enquiry is handled by MCC and sent to admin@mccgva.ch.",
    })
  }

  const handleEditAccount = () => {
    logActivity({
      action: `Requested edits to ${account.accountName ?? account.bankName}`,
      category: "Bank Accounts",
      details: {
        summary: `Client requested changes to the account "${account.accountName ?? account.bankName}".`,
        account: account.accountName ?? account.bankName ?? "—",
        requestedAt: new Date().toLocaleString("en-GB"),
      },
    })
    toast.info("Edit request submitted", {
      description: "Account changes require verification by your relationship manager.",
    })
  }

  const handleExportAccount = () => {
    exportToCsv(`account-${account.accountNumber ?? "details"}`, [account])
    logActivity({
      action: `Exported account details for ${account.bankName ?? account.accountName ?? "account"}`,
      category: "Bank Accounts",
      details: {
        summary: `Client exported the full account details for "${account.accountName ?? account.bankName}" to a CSV file.`,
        account: account.accountName ?? account.bankName ?? "—",
        currency: account.currency,
      },
    })
  }

  const handleViewStatement = () => {
    const scope = account.id === "ACC-001" ? "master" : `cur:${account.currency}`
    router.push(`/dashboard/statements?account=${encodeURIComponent(scope)}`)
  }

  return (
    <div className="mx-auto max-w-3xl">
      <Button variant="ghost" size="sm" onClick={() => router.back()} className="mb-4">
        <ArrowLeft className="mr-2 h-4 w-4" />
        Back
      </Button>

      <Card className="bg-card border-border">
        <CardContent className="p-6">
          {/* Header */}
          <div className="flex items-center gap-4">
            <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-secondary text-lg font-bold text-amber-400">
              {account.bankLogo}
            </div>
            <div>
              <h1 className="text-xl font-bold text-foreground">{account.bankName}</h1>
              <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
                <span>
                  {getFlagEmoji(account.countryCode)} {account.country}
                </span>
                <Badge variant="outline" className={getRatingColor(account.rating)}>
                  {account.rating}
                </Badge>
                <Badge variant="outline" className={getStatusColor(account.status)}>
                  {account.status}
                </Badge>
              </div>
            </div>
          </div>

          <Tabs defaultValue="details" className="mt-6">
            <TabsList className="bg-secondary/50">
              <TabsTrigger value="details">Account Details</TabsTrigger>
              <TabsTrigger value="banking">Banking Info</TabsTrigger>
              <TabsTrigger value="limits">Limits & Volume</TabsTrigger>
              <TabsTrigger value="contact">Contact</TabsTrigger>
            </TabsList>

            <TabsContent value="details" className="mt-4 space-y-4">
              <Card className="bg-secondary/40 border-border">
                <CardContent className="p-4 space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <p className="text-xs text-muted-foreground">Account Name</p>
                      <p className="text-sm font-medium text-foreground">{account.accountName}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Account Type</p>
                      <p className="text-sm font-medium text-foreground">{account.accountType}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Account Number</p>
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-mono text-foreground">{account.accountNumber}</p>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-5 w-5"
                          onClick={() => copyToClipboard(account.accountNumber, "acc-num")}
                        >
                          {copiedField === "acc-num" ? (
                            <Check className="h-3 w-3 text-emerald-400" />
                          ) : (
                            <Copy className="h-3 w-3" />
                          )}
                        </Button>
                      </div>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Currency</p>
                      <p className="text-sm font-medium text-foreground">{account.currency}</p>
                    </div>
                  </div>

                  {(() => {
                    const isRegistered = !account.id.startsWith("ACC-")
                    const total = isRegistered ? (account.trackedBalance ?? 0) : account.balance
                    const available = isRegistered ? (account.trackedAvailable ?? 0) : account.availableBalance
                    const reserved = isRegistered ? (account.trackedReserved ?? 0) : account.reservedBalance
                    return (
                      <div className="border-t border-border pt-4">
                        <div className="grid grid-cols-3 gap-3">
                          <div className="min-w-0 text-center p-3 rounded-lg bg-secondary">
                            <p className="text-xs text-muted-foreground mb-1">
                              {isRegistered ? "Received Here" : "Total Balance"}
                            </p>
                            <p className="text-sm sm:text-base lg:text-lg font-bold text-foreground leading-tight break-words tabular-nums">
                              {formatCurrency(total, account.currency)}
                            </p>
                          </div>
                          <div className="min-w-0 text-center p-3 rounded-lg bg-secondary">
                            <p className="text-xs text-muted-foreground mb-1">Available</p>
                            <p className="text-sm sm:text-base lg:text-lg font-bold text-emerald-400 leading-tight break-words tabular-nums">
                              {formatCurrency(available, account.currency)}
                            </p>
                          </div>
                          <div className="min-w-0 text-center p-3 rounded-lg bg-secondary">
                            <p className="text-xs text-muted-foreground mb-1">Reserved</p>
                            <p className="text-sm sm:text-base lg:text-lg font-bold text-amber-400 leading-tight break-words tabular-nums">
                              {formatCurrency(reserved, account.currency)}
                            </p>
                          </div>
                        </div>
                        {isRegistered && (
                          <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
                            This is a registered external account. The figures above track funds received at this
                            specific bank. The same funds also settle into your{" "}
                            <span className="font-medium text-foreground">{account.currency} Settlement Account</span>,
                            so they are reflected in your master balance and transaction history.
                          </p>
                        )}
                      </div>
                    )
                  })()}

                  <div className="border-t border-border pt-4">
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <p className="text-xs text-muted-foreground">Opened</p>
                        <p className="text-sm text-foreground">
                          {new Date(account.openDate).toLocaleDateString("en-US", {
                            year: "numeric",
                            month: "long",
                            day: "numeric",
                          })}
                        </p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground">Last Activity</p>
                        <p className="text-sm text-foreground">
                          {new Date(account.lastActivity).toLocaleString()}
                        </p>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="banking" className="mt-4 space-y-4">
              <Card className="bg-secondary/40 border-border">
                <CardContent className="p-4 space-y-4">
                  <div>
                    <p className="text-xs text-muted-foreground mb-1">IBAN</p>
                    <div className="flex items-center gap-2 p-3 rounded-lg bg-secondary font-mono">
                      <span className="text-foreground break-all">{account.iban}</span>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6 ml-auto shrink-0"
                        onClick={() => copyToClipboard(account.iban, "detail-iban")}
                      >
                        {copiedField === "detail-iban" ? (
                          <Check className="h-4 w-4 text-emerald-400" />
                        ) : (
                          <Copy className="h-4 w-4" />
                        )}
                      </Button>
                    </div>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground mb-1">SWIFT/BIC</p>
                    <div className="flex items-center gap-2 p-3 rounded-lg bg-secondary font-mono">
                      <span className="text-foreground">{account.swift}</span>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6 ml-auto"
                        onClick={() => copyToClipboard(account.swift, "detail-swift")}
                      >
                        {copiedField === "detail-swift" ? (
                          <Check className="h-4 w-4 text-emerald-400" />
                        ) : (
                          <Copy className="h-4 w-4" />
                        )}
                      </Button>
                    </div>
                  </div>
                  {account.sortCode && (
                    <div>
                      <p className="text-xs text-muted-foreground mb-1">Sort Code</p>
                      <div className="flex items-center gap-2 p-3 rounded-lg bg-secondary font-mono">
                        <span className="text-foreground">{account.sortCode}</span>
                      </div>
                    </div>
                  )}
                  {account.routingNumber && (
                    <div>
                      <p className="text-xs text-muted-foreground mb-1">Routing Number (ABA)</p>
                      <div className="flex items-center gap-2 p-3 rounded-lg bg-secondary font-mono">
                        <span className="text-foreground">{account.routingNumber}</span>
                      </div>
                    </div>
                  )}
                  {account.bsb && (
                    <div>
                      <p className="text-xs text-muted-foreground mb-1">BSB</p>
                      <div className="flex items-center gap-2 p-3 rounded-lg bg-secondary font-mono">
                        <span className="text-foreground">{account.bsb}</span>
                      </div>
                    </div>
                  )}
                  {account.branchCode && (
                    <div>
                      <p className="text-xs text-muted-foreground mb-1">Branch Code</p>
                      <div className="flex items-center gap-2 p-3 rounded-lg bg-secondary font-mono">
                        <span className="text-foreground">{account.branchCode}</span>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="limits" className="mt-4 space-y-4">
              <Card className="bg-secondary/40 border-border">
                <CardContent className="p-4 space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="p-4 rounded-lg bg-secondary">
                      <p className="text-xs text-muted-foreground mb-1">Daily Limit</p>
                      <p className="text-xl font-bold text-foreground">
                        {formatCurrency(account.dailyLimit, account.currency)}
                      </p>
                    </div>
                    <div className="p-4 rounded-lg bg-secondary">
                      <p className="text-xs text-muted-foreground mb-1">Monthly Volume</p>
                      <p className="text-xl font-bold text-foreground">
                        {formatCurrency(account.monthlyVolume, account.currency)}
                      </p>
                    </div>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground mb-1">Relationship Tier</p>
                    <Badge className="bg-amber-500/20 text-amber-400 border-amber-500/30">
                      {account.relationship}
                    </Badge>
                  </div>
                  {account.escrowDetails && (
                    <div className="p-4 rounded-lg bg-amber-500/10 border border-amber-500/20">
                      <p className="text-xs text-amber-400 font-medium mb-1">Escrow Notice</p>
                      <p className="text-sm text-amber-300">{account.escrowDetails}</p>
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="contact" className="mt-4 space-y-4">
              <Card className="bg-secondary/40 border-border">
                <CardContent className="p-4 space-y-4">
                  <div className="flex items-start gap-3 p-4 rounded-lg bg-amber-500/10 border border-amber-500/20">
                    <Shield className="h-4 w-4 mt-0.5 shrink-0 text-amber-400" />
                    <div className="space-y-1">
                      <p className="text-sm font-medium text-amber-300">Communication handled by MCC</p>
                      <p className="text-xs text-amber-300/80 leading-relaxed">
                        For your security and compliance, clients do not contact partner banks directly. All
                        requests relating to this account are managed by your MCC relationship team and routed
                        through <span className="font-medium">admin@mccgva.ch</span>.
                      </p>
                    </div>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground mb-1">Managed by</p>
                    <p className="text-sm font-medium text-foreground">MCC Client Services</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground mb-1">Branch Address</p>
                    <p className="text-sm text-foreground">{account.branchAddress}</p>
                  </div>
                  <Button
                    className="w-full bg-amber-500 hover:bg-amber-600 text-zinc-900 gap-2"
                    onClick={handleContactViaMcc}
                  >
                    <Mail className="h-4 w-4" />
                    Contact MCC about this account
                  </Button>
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>

          {/* Actions */}
          <div className="mt-6 flex flex-wrap justify-end gap-2">
            <Button variant="outline" className="gap-2" onClick={handleViewStatement}>
              <FileText className="h-4 w-4" />
              View Statement
            </Button>
            <Button variant="outline" className="gap-2" onClick={handleExportAccount}>
              <Download className="h-4 w-4" />
              Export Details
            </Button>
            <Button variant="outline" className="gap-2" onClick={handleSendPayment}>
              <ArrowUpRight className="h-4 w-4" />
              Send Payment
            </Button>
            <Button className="bg-amber-500 hover:bg-amber-600 text-zinc-900 gap-2" onClick={handleEditAccount}>
              <Edit2 className="h-4 w-4" />
              Edit Account
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
