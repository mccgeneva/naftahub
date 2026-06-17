"use client"

import { useMemo, useState } from "react"
import { Globe, Check, X, Clock, Landmark, ArrowDownToLine } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  useGateway,
  ACCOUNT_TYPES,
  PARTNER_BANKS,
  partnerBankByKey,
  banksForCurrency,
  suggestedBankFor,
  reconciledTotal,
  pendingFundingTotal,
  type GatewayAccount,
  type AccountCoordinates,
} from "@/lib/gateway-store"
import { generateIban, formatIban, countrySupportsIban } from "@/lib/iban"
import { useLedger } from "@/lib/ledger-store"
import { useActivityLog } from "@/components/activity-tracker"
import { BankInventoryManager } from "@/components/admin/bank-inventory-manager"
import {
  allocateBankSlotAdmin,
  getBankAvailabilityForCurrency,
  type BankAvailability,
} from "@/app/actions/bank-inventory"
import { ADMIN_PASSCODE } from "@/lib/admin-config"
import { toast } from "sonner"

const formatCurrency = (value: number, currency: string) =>
  `${currency} ${value.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`

const formatTimestamp = (iso?: string) => {
  if (!iso) return "—"
  const d = new Date(iso)
  return `${d.toLocaleDateString("en-GB")} ${d.toLocaleTimeString("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
  })}`
}

function genReference() {
  return `MCC${Math.random().toString(36).slice(2, 8).toUpperCase()}`
}

function genAccountNumber() {
  return Math.floor(10_000_000 + Math.random() * 89_999_999).toString()
}

// Build assigned bank coordinates for an approved account. IBAN jurisdictions
// get a validated IBAN; everything else gets domestic-style coordinates.
function buildCoordinates(bankKey: string): AccountCoordinates {
  const bank = partnerBankByKey(bankKey)!
  const scheme = countrySupportsIban(bank.countryCode) ? "iban" : "domestic"
  const base: AccountCoordinates = {
    partnerBankKey: bank.key,
    partnerBankName: bank.name,
    scheme,
    bic: bank.bic,
    reference: genReference(),
  }
  if (scheme === "iban") {
    base.iban = generateIban(bank.countryCode, bank.bic.slice(0, 4))
  } else {
    base.accountNumber = genAccountNumber()
    base.routingNumber =
      bank.countryCode === "US"
        ? Math.floor(100_000_000 + Math.random() * 899_999_999).toString()
        : Math.floor(100_000 + Math.random() * 899_999).toString()
  }
  return base
}

export function AdminGatewaySection() {
  const { accounts, approveAccount, rejectAccount, recordReconciledFunding } = useGateway()
  const { addReceipt } = useLedger()
  const log = useActivityLog()

  // Approve dialog state
  const [approveTarget, setApproveTarget] = useState<GatewayAccount | null>(null)
  const [bankKey, setBankKey] = useState<string>("")
  const [approving, setApproving] = useState(false)
  // Live availability for the approve dialog's currency, keyed by bank key.
  const [approveAvailability, setApproveAvailability] = useState<Map<string, BankAvailability>>(
    new Map(),
  )
  const [loadingAvailability, setLoadingAvailability] = useState(false)

  // Reject dialog state
  const [rejectTarget, setRejectTarget] = useState<GatewayAccount | null>(null)
  const [rejectReason, setRejectReason] = useState("")

  // Funding dialog state
  const [fundTarget, setFundTarget] = useState<GatewayAccount | null>(null)
  const [fundAmount, setFundAmount] = useState("")
  const [fundPayer, setFundPayer] = useState("")
  const [fundRef, setFundRef] = useState("")

  const pending = useMemo(() => accounts.filter((a) => a.status === "pending"), [accounts])
  const active = useMemo(() => accounts.filter((a) => a.status === "active"), [accounts])
  const decided = useMemo(
    () => accounts.filter((a) => a.status === "rejected" || a.status === "closed"),
    [accounts],
  )

  // Load live per-bank availability for a currency so the approve dialog can
  // reflect which correspondent pools still have free account slots.
  const refreshApproveAvailability = async (currency: string) => {
    setLoadingAvailability(true)
    try {
      const rows = await getBankAvailabilityForCurrency(currency)
      const map = new Map<string, BankAvailability>()
      for (const row of rows) map.set(row.bankKey, row)
      setApproveAvailability(map)
    } catch {
      setApproveAvailability(new Map())
    } finally {
      setLoadingAvailability(false)
    }
  }

  const openApprove = (account: GatewayAccount) => {
    setApproveTarget(account)
    // Default to the client's preferred bank if it supports the currency,
    // otherwise the suggested correspondent for that currency.
    const preferred = partnerBankByKey(account.preferredBankKey)
    const usable = preferred?.currencies.includes(account.currency)
      ? preferred.key
      : suggestedBankFor(account.currency).key
    setBankKey(usable)
    void refreshApproveAvailability(account.currency)
  }

  const confirmApprove = async () => {
    if (!approveTarget || !bankKey) return
    // Reserve one account slot from the chosen bank's currency pool BEFORE we
    // issue any coordinates. This is the authoritative availability gate: a
    // disabled or exhausted pool returns an error and nothing is issued.
    setApproving(true)
    const allocation = await allocateBankSlotAdmin(ADMIN_PASSCODE, bankKey, approveTarget.currency)
    if (!allocation.ok) {
      setApproving(false)
      toast.error(allocation.error)
      // Refresh availability so the picker reflects the now-exhausted pool.
      void refreshApproveAvailability(approveTarget.currency)
      return
    }
    const coordinates = buildCoordinates(bankKey)
    const updated = approveAccount(approveTarget.id, coordinates)
    setApproving(false)
    if (updated) {
      toast.success(`Account ${approveTarget.id} approved`, {
        description: `${partnerBankByKey(bankKey)?.name} coordinates assigned · ${allocation.remaining} ${approveTarget.currency} slot${allocation.remaining === 1 ? "" : "s"} left.`,
      })
      log({
        action: `Approved gateway account ${approveTarget.id}`,
        category: "Payment Gateway",
        details: {
          account: approveTarget.id,
          type: ACCOUNT_TYPES[approveTarget.type].label,
          currency: approveTarget.currency,
          bank: partnerBankByKey(bankKey)?.name ?? bankKey,
          reference: coordinates.reference,
        },
      })
    }
    setApproveTarget(null)
    setBankKey("")
  }

  const confirmReject = () => {
    if (!rejectTarget) return
    rejectAccount(rejectTarget.id, rejectReason.trim() || undefined)
    toast.success(`Account ${rejectTarget.id} rejected`)
    log({
      action: `Rejected gateway account ${rejectTarget.id}`,
      category: "Payment Gateway",
      details: { account: rejectTarget.id, reason: rejectReason.trim() || "—" },
    })
    setRejectTarget(null)
    setRejectReason("")
  }

  const openFund = (account: GatewayAccount) => {
    setFundTarget(account)
    setFundAmount("")
    setFundPayer("")
    setFundRef(account.coordinates?.reference ?? "")
  }

  const confirmFund = () => {
    if (!fundTarget) return
    const amount = Number.parseFloat(fundAmount)
    if (!Number.isFinite(amount) || amount <= 0) {
      toast.error("Enter a valid funding amount")
      return
    }
    const payer = fundPayer.trim() || "Inbound payer"
    const bank = partnerBankByKey(fundTarget.coordinates?.partnerBankKey)
    // Post the Master Account credit first, then record + reconcile in one step.
    const receipt = addReceipt({
      id: genReference(),
      amount,
      currency: fundTarget.currency,
      status: "completed",
      date: new Date().toISOString(),
      counterparty: payer,
      bank: bank?.name,
      account: fundTarget.coordinates?.iban ?? fundTarget.coordinates?.accountNumber,
      reference: fundRef.trim() || fundTarget.coordinates?.reference,
      category: "Gateway Funding",
    })
    recordReconciledFunding(
      fundTarget.id,
      { amount, currency: fundTarget.currency, reference: fundRef.trim() || receipt.id, payer },
      receipt.id,
    )
    toast.success("Funds reconciled to Master Account", {
      description: `${formatCurrency(amount, fundTarget.currency)} credited from ${payer}.`,
    })
    log({
      action: `Reconciled gateway funding on ${fundTarget.id}`,
      category: "Payment Gateway",
      details: {
        account: fundTarget.id,
        amount: `${fundTarget.currency} ${amount}`,
        payer,
        receipt: receipt.id,
      },
    })
    setFundTarget(null)
  }

  const eligibleBanks = approveTarget
    ? (() => {
        const supporting = banksForCurrency(approveTarget.currency)
        return supporting.length ? supporting : PARTNER_BANKS
      })()
    : []

  // The selected bank's currency pool is exhausted/disabled — block approval.
  const selectedBankExhausted = (() => {
    if (!bankKey) return false
    const avail = approveAvailability.get(bankKey)
    return !!avail && (!avail.enabled || avail.remaining <= 0)
  })()

  return (
    <>
      {/* Partner Bank Availability & Capacity */}
      <BankInventoryManager />

      {/* Pending Account Requests */}
      <Card className="bg-card border-border">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg font-semibold">
            <Globe className="h-5 w-5 text-primary" />
            Pending Gateway Account Requests
            {pending.length > 0 && (
              <Badge className="bg-primary/20 text-primary">{pending.length}</Badge>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {pending.length === 0 ? (
            <p className="text-sm text-muted-foreground">No pending gateway account requests.</p>
          ) : (
            pending.map((a) => (
              <div key={a.id} className="rounded-lg border border-border bg-secondary/30 p-4">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                  <div className="space-y-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-semibold text-foreground">{a.accountHolder}</span>
                      {a.company && (
                        <span className="text-sm text-muted-foreground">· {a.company}</span>
                      )}
                      <Badge variant="secondary" className="bg-amber-500/15 text-amber-600 dark:text-amber-400">
                        <Clock className="mr-1 h-3 w-3" /> Pending
                      </Badge>
                    </div>
                    <div className="grid gap-x-6 gap-y-1 text-sm text-muted-foreground sm:grid-cols-2">
                      <span>Request: <span className="text-foreground">{a.id}</span></span>
                      <span>Type: <span className="text-foreground">{ACCOUNT_TYPES[a.type].label}</span></span>
                      <span>Currency: <span className="text-foreground">{a.currency}</span></span>
                      <span>Preferred bank: <span className="text-foreground">{partnerBankByKey(a.preferredBankKey)?.name ?? "—"}</span></span>
                      <span className="sm:col-span-2">Purpose: <span className="text-foreground">{a.purpose}</span></span>
                      <span className="sm:col-span-2">Submitted: <span className="text-foreground">{formatTimestamp(a.submittedAt)}</span></span>
                    </div>
                  </div>
                  <div className="flex shrink-0 gap-2">
                    <Button size="sm" onClick={() => openApprove(a)}>
                      <Check className="mr-1 h-4 w-4" /> Approve
                    </Button>
                    <Button size="sm" variant="destructive" onClick={() => setRejectTarget(a)}>
                      <X className="mr-1 h-4 w-4" /> Reject
                    </Button>
                  </div>
                </div>
              </div>
            ))
          )}
        </CardContent>
      </Card>

      {/* Funding Reconciliation */}
      <Card className="bg-card border-border">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg font-semibold">
            <ArrowDownToLine className="h-5 w-5 text-primary" />
            Gateway Funding &amp; Reconciliation
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {active.length === 0 ? (
            <p className="text-sm text-muted-foreground">No active gateway accounts yet.</p>
          ) : (
            active.map((a) => {
              const bank = partnerBankByKey(a.coordinates?.partnerBankKey)
              return (
                <div key={a.id} className="rounded-lg border border-border bg-secondary/30 p-4">
                  <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                    <div className="space-y-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-semibold text-foreground">{a.accountHolder}</span>
                        <Badge variant="secondary" className="bg-emerald-500/15 text-emerald-600 dark:text-emerald-400">
                          <Landmark className="mr-1 h-3 w-3" /> Active
                        </Badge>
                      </div>
                      <div className="grid gap-x-6 gap-y-1 text-sm text-muted-foreground sm:grid-cols-2">
                        <span>Account: <span className="text-foreground">{a.id}</span></span>
                        <span>Type: <span className="text-foreground">{ACCOUNT_TYPES[a.type].label}</span></span>
                        <span>Bank: <span className="text-foreground">{bank?.name ?? "—"}</span></span>
                        <span>Currency: <span className="text-foreground">{a.currency}</span></span>
                        {a.coordinates?.iban && (
                          <span className="sm:col-span-2">IBAN: <span className="font-mono text-foreground">{formatIban(a.coordinates.iban)}</span></span>
                        )}
                        {a.coordinates?.accountNumber && (
                          <span>Account no: <span className="font-mono text-foreground">{a.coordinates.accountNumber}</span></span>
                        )}
                        <span>Reference: <span className="font-mono text-foreground">{a.coordinates?.reference}</span></span>
                      </div>
                      <div className="flex flex-wrap gap-4 pt-1 text-sm">
                        <span className="text-muted-foreground">
                          Reconciled: <span className="font-semibold text-emerald-600 dark:text-emerald-400">{formatCurrency(reconciledTotal(a), a.currency)}</span>
                        </span>
                        {pendingFundingTotal(a) > 0 && (
                          <span className="text-muted-foreground">
                            Pending: <span className="font-semibold text-foreground">{formatCurrency(pendingFundingTotal(a), a.currency)}</span>
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="shrink-0">
                      <Button size="sm" onClick={() => openFund(a)}>
                        <ArrowDownToLine className="mr-1 h-4 w-4" /> Record funding
                      </Button>
                    </div>
                  </div>
                  {a.funding.length > 0 && (
                    <div className="mt-3 space-y-1 border-t border-border pt-3 text-sm">
                      {a.funding.map((f) => (
                        <div key={f.id} className="flex items-center justify-between gap-2">
                          <span className="text-muted-foreground">
                            {formatTimestamp(f.recordedAt)} · {f.payer}
                          </span>
                          <span className="flex items-center gap-2">
                            <span className="font-semibold text-foreground">{formatCurrency(f.amount, f.currency)}</span>
                            <Badge variant="secondary" className="bg-emerald-500/15 text-emerald-600 dark:text-emerald-400">
                              Reconciled
                            </Badge>
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )
            })
          )}
        </CardContent>
      </Card>

      {/* Decision History */}
      {decided.length > 0 && (
        <Card className="bg-card border-border">
          <CardHeader>
            <CardTitle className="text-lg font-semibold">Gateway Decision History</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {decided.map((a) => (
              <div key={a.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border bg-secondary/20 p-3 text-sm">
                <span className="text-foreground">
                  {a.id} · {a.accountHolder} · {ACCOUNT_TYPES[a.type].label} ({a.currency})
                </span>
                <span className="flex items-center gap-2 text-muted-foreground">
                  {a.rejectionReason && <span>Reason: {a.rejectionReason}</span>}
                  <Badge variant="secondary" className="bg-rose-500/15 text-rose-600 dark:text-rose-400">
                    {a.status === "rejected" ? "Rejected" : "Closed"}
                  </Badge>
                  <span>{formatTimestamp(a.decidedAt ?? a.closedAt)}</span>
                </span>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Approve dialog */}
      <Dialog open={!!approveTarget} onOpenChange={(open) => !open && setApproveTarget(null)}>
        <DialogContent>
          {approveTarget && (
            <>
              <DialogHeader>
                <DialogTitle>Approve Gateway Account</DialogTitle>
                <DialogDescription>
                  Assign a partner bank for {approveTarget.accountHolder}&apos;s{" "}
                  {ACCOUNT_TYPES[approveTarget.type].label} in {approveTarget.currency}. Coordinates
                  (IBAN/BIC or domestic + a unique reference) are generated automatically.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-2 py-2">
                <Label>Partner bank</Label>
                <Select value={bankKey} onValueChange={setBankKey}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select a partner bank" />
                  </SelectTrigger>
                  <SelectContent>
                    {eligibleBanks.map((b) => {
                      const avail = approveAvailability.get(b.key)
                      const exhausted = !!avail && (!avail.enabled || avail.remaining <= 0)
                      return (
                        <SelectItem key={b.key} value={b.key} disabled={exhausted}>
                          {b.name} — {b.country} ({b.bic})
                          {avail
                            ? !avail.enabled
                              ? " · pool disabled"
                              : ` · ${avail.remaining} slot${avail.remaining === 1 ? "" : "s"} left`
                            : ""}
                        </SelectItem>
                      )
                    })}
                  </SelectContent>
                </Select>
                {loadingAvailability && (
                  <p className="text-xs text-muted-foreground">Checking pool availability…</p>
                )}
                {bankKey && (
                  <p className="text-xs text-muted-foreground">
                    {countrySupportsIban(partnerBankByKey(bankKey)?.countryCode)
                      ? "A validated IBAN will be issued in the client's name."
                      : "Domestic account coordinates (account + routing) will be issued."}
                  </p>
                )}
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setApproveTarget(null)}>
                  Cancel
                </Button>
                <Button
                  onClick={confirmApprove}
                  disabled={!bankKey || approving || selectedBankExhausted}
                >
                  {approving ? "Approving…" : "Approve & assign"}
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* Reject dialog */}
      <Dialog open={!!rejectTarget} onOpenChange={(open) => !open && setRejectTarget(null)}>
        <DialogContent>
          {rejectTarget && (
            <>
              <DialogHeader>
                <DialogTitle>Reject Gateway Account</DialogTitle>
                <DialogDescription>
                  Reject {rejectTarget.accountHolder}&apos;s request {rejectTarget.id}. The client
                  will see the reason below.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-2 py-2">
                <Label htmlFor="gw-reject-reason">Reason (optional)</Label>
                <Textarea
                  id="gw-reject-reason"
                  value={rejectReason}
                  onChange={(e) => setRejectReason(e.target.value)}
                  placeholder="e.g. Additional KYC documentation required."
                />
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setRejectTarget(null)}>
                  Cancel
                </Button>
                <Button variant="destructive" onClick={confirmReject}>
                  Reject request
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* Funding dialog */}
      <Dialog open={!!fundTarget} onOpenChange={(open) => !open && setFundTarget(null)}>
        <DialogContent>
          {fundTarget && (
            <>
              <DialogHeader>
                <DialogTitle>Record Incoming Funding</DialogTitle>
                <DialogDescription>
                  Record funds received at {partnerBankByKey(fundTarget.coordinates?.partnerBankKey)?.name} for{" "}
                  {fundTarget.id}. Reconciling credits the client&apos;s Master Account.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-3 py-2">
                <div className="space-y-2">
                  <Label htmlFor="gw-fund-amount">Amount ({fundTarget.currency})</Label>
                  <Input
                    id="gw-fund-amount"
                    type="number"
                    min="0"
                    step="0.01"
                    value={fundAmount}
                    onChange={(e) => setFundAmount(e.target.value)}
                    placeholder="0.00"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="gw-fund-payer">Remitter / payer</Label>
                  <Input
                    id="gw-fund-payer"
                    value={fundPayer}
                    onChange={(e) => setFundPayer(e.target.value)}
                    placeholder="Sending party name"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="gw-fund-ref">Payment reference</Label>
                  <Input
                    id="gw-fund-ref"
                    value={fundRef}
                    onChange={(e) => setFundRef(e.target.value)}
                    placeholder={fundTarget.coordinates?.reference}
                  />
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setFundTarget(null)}>
                  Cancel
                </Button>
                <Button onClick={confirmFund}>Reconcile to Master Account</Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </>
  )
}
