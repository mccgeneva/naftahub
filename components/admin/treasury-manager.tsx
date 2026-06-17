"use client"

import { useEffect, useState } from "react"
import { Landmark, Plus, Trash2, Save, Building2, Loader2, ShieldCheck, AlertTriangle } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Switch } from "@/components/ui/switch"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { cn } from "@/lib/utils"
import { toast } from "sonner"
import { USERS, getUserById } from "@/lib/users"
import { ADMIN_PASSCODE } from "@/lib/admin-config"
import {
  TREASURY_PROFILES,
  TREASURY_CURRENCY,
  DEBIT_CYCLE_FEE_RATE,
  MAX_LEVERAGE_RATIO,
  leverageMinContribution,
  getProfile,
  emptyTreasuryAccount,
  type TreasuryAccount,
  type TreasuryProfileKey,
  type TreasuryStatus,
  type TreasuryTxnType,
} from "@/lib/treasury-store"
import {
  getTreasuryForUserAdmin,
  saveTreasuryRecordAdmin,
  postTreasuryTxnAdmin,
  deleteTreasuryTxnAdmin,
} from "@/app/actions/treasury"

const fmt0 = (value: number, currency = TREASURY_CURRENCY) =>
  `${currency} ${value.toLocaleString("en-US", { maximumFractionDigits: 0 })}`

const fmtDate = (iso?: string) => {
  if (!iso) return "—"
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString("en-GB")
}

const STATUS_OPTIONS: { value: TreasuryStatus; label: string }[] = [
  { value: "pending", label: "Awaiting Funding" },
  { value: "secured", label: "Security Deposit Secured" },
  { value: "shortfall", label: "Deposit Shortfall" },
  { value: "closed", label: "Facility Closed" },
]

const TXN_OPTIONS: { value: TreasuryTxnType; label: string }[] = [
  { value: "deposit", label: "Security Deposit" },
  { value: "leverage", label: "Leverage Drawdown (MCC HOLDING SA)" },
  { value: "fee", label: "Debit Cycle Fee" },
  { value: "adjustment", label: "Adjustment" },
  { value: "settlement", label: "Settlement / Repayment" },
]

export function TreasuryManager() {
  const [targetUserId, setTargetUserId] = useState(USERS[0]?.id ?? "u1")
  const [stored, setStored] = useState<TreasuryAccount>(() => emptyTreasuryAccount())
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [posting, setPosting] = useState(false)

  const targetUser = getUserById(targetUserId)

  // --- Record editor state -------------------------------------------------
  const [profile, setProfile] = useState<TreasuryProfileKey>("pro")
  const [requiredDeposit, setRequiredDeposit] = useState("500000")
  const [contribution, setContribution] = useState("0")
  const [leverageEnabled, setLeverageEnabled] = useState(false)
  const [transactionExposure, setTransactionExposure] = useState("0")
  const [status, setStatus] = useState<TreasuryStatus>("pending")
  const [note, setNote] = useState("")

  // Load the selected client's record from the server (passcode-verified).
  useEffect(() => {
    let active = true
    setLoading(true)
    getTreasuryForUserAdmin(ADMIN_PASSCODE, targetUserId)
      .then((res) => {
        if (!active) return
        if (!res.ok) {
          toast.error(res.error)
          return
        }
        const acc = res.account
        setStored(acc)
        setProfile(acc.profile)
        setRequiredDeposit(String(acc.requiredDeposit || getProfile(acc.profile).requiredDeposit))
        setContribution(String(acc.customerContribution))
        setLeverageEnabled(acc.leverageEnabled)
        setTransactionExposure(String(acc.transactionExposure))
        setStatus(acc.status === "none" ? "pending" : acc.status)
        setNote(acc.note ?? "")
      })
      .finally(() => active && setLoading(false))
    return () => {
      active = false
    }
  }, [targetUserId])

  const numRequired = Number(requiredDeposit) || 0
  const numContribution = Number(contribution) || 0
  const numExposure = Number(transactionExposure) || 0
  const financed = leverageEnabled ? Math.max(0, numRequired - numContribution) : 0
  const ratio = leverageEnabled && numContribution > 0 ? numRequired / numContribution : 1
  const secured = numContribution + financed
  const shortfall = Math.max(0, numRequired - secured)
  const annualFee = leverageEnabled ? (financed + numExposure) * DEBIT_CYCLE_FEE_RATE : 0

  // Approved leverage is capped at 1:10 — contribution must be ≥ 10% of the deposit.
  const minContribution = leverageMinContribution(numRequired)
  const leverageBreached = leverageEnabled && numContribution < minContribution

  const applyMinLeverage = () => setContribution(String(minContribution))

  const onProfileChange = (key: TreasuryProfileKey) => {
    setProfile(key)
    setRequiredDeposit(String(getProfile(key).requiredDeposit))
  }

  const handleSaveRecord = async () => {
    if (numRequired <= 0) {
      toast.error("Enter a valid required security deposit.")
      return
    }
    if (leverageBreached) {
      toast.error(
        `Leverage is capped at 1:${MAX_LEVERAGE_RATIO}. Contribution must be at least ${fmt0(minContribution)} (10%).`,
      )
      return
    }
    setSaving(true)
    const res = await saveTreasuryRecordAdmin(ADMIN_PASSCODE, targetUserId, {
      profile,
      requiredDeposit: numRequired,
      customerContribution: numContribution,
      leverageEnabled,
      transactionExposure: numExposure,
      status,
      note: note.trim() || undefined,
    })
    setSaving(false)
    if (!res.ok) {
      toast.error(res.error)
      return
    }
    setStored(res.account)
    toast.success("Treasury record updated", {
      description: `${getProfile(profile).label} · ${targetUser.fullName}. Treasury received ${fmt0(secured)}.`,
    })
  }

  // --- Transaction posting -------------------------------------------------
  const [txnType, setTxnType] = useState<TreasuryTxnType>("deposit")
  const [txnLabel, setTxnLabel] = useState("")
  const [txnAmount, setTxnAmount] = useState("")
  const [txnNote, setTxnNote] = useState("")

  const handlePostTxn = async () => {
    const amount = Number(txnAmount)
    if (!Number.isFinite(amount) || amount <= 0) {
      toast.error("Enter a valid transaction amount.")
      return
    }
    setPosting(true)
    const res = await postTreasuryTxnAdmin(ADMIN_PASSCODE, targetUserId, {
      type: txnType,
      label: txnLabel.trim() || TXN_OPTIONS.find((t) => t.value === txnType)!.label,
      amount,
      note: txnNote.trim() || undefined,
    })
    setPosting(false)
    if (!res.ok) {
      toast.error(res.error)
      return
    }
    setStored(res.account)
    toast.success("Treasury transaction posted", {
      description: `${fmt0(amount)} · ${targetUser.fullName}.`,
    })
    setTxnLabel("")
    setTxnAmount("")
    setTxnNote("")
  }

  const handleDeleteTxn = async (txnId: string) => {
    const res = await deleteTreasuryTxnAdmin(ADMIN_PASSCODE, targetUserId, txnId)
    if (!res.ok) {
      toast.error(res.error)
      return
    }
    setStored(res.account)
    toast.success("Transaction removed", {
      description: `Treasury transaction ${txnId} was removed from ${targetUser.fullName}'s record.`,
    })
  }

  return (
    <Card className="bg-card border-border">
      <CardHeader>
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10">
            <Landmark className="h-5 w-5 text-primary" />
          </div>
          <div>
            <CardTitle className="text-lg font-semibold">Treasury Services Management</CardTitle>
            <p className="text-sm text-muted-foreground text-pretty">
              Create and manage security deposits, leverage facilities and debit exposures for any client
              account. Records are stored securely and sync to the client&apos;s Treasury Services on any device.
            </p>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Target account */}
        <div className="space-y-2">
          <Label>Client account</Label>
          <Select value={targetUserId} onValueChange={setTargetUserId}>
            <SelectTrigger className="w-full">
              <SelectValue placeholder="Select a client" />
            </SelectTrigger>
            <SelectContent>
              {USERS.map((u) => (
                <SelectItem key={u.id} value={u.id}>
                  {u.fullName} — {u.company} ({u.email})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {loading && (
            <p className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
              <Loader2 className="h-3 w-3 animate-spin" /> Loading record…
            </p>
          )}
        </div>

        {/* Profile + required deposit */}
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-2">
            <Label>Account profile</Label>
            <Select value={profile} onValueChange={(v) => onProfileChange(v as TreasuryProfileKey)}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {TREASURY_PROFILES.map((p) => (
                  <SelectItem key={p.key} value={p.key}>
                    {p.label} — {fmt0(p.requiredDeposit)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="tm-required">Required security deposit (EUR)</Label>
            <Input
              id="tm-required"
              type="number"
              min="0"
              step="1000"
              value={requiredDeposit}
              onChange={(e) => setRequiredDeposit(e.target.value)}
            />
          </div>
        </div>

        {/* Contribution */}
        <div className="space-y-2">
          <Label htmlFor="tm-contribution">Customer contribution (EUR)</Label>
          <Input
            id="tm-contribution"
            type="number"
            min="0"
            step="1000"
            value={contribution}
            onChange={(e) => setContribution(e.target.value)}
          />
        </div>

        {/* Leverage facility */}
        <div className="rounded-lg border border-border bg-secondary/30 p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-foreground">Leverage facility — approved 1:{MAX_LEVERAGE_RATIO}</p>
              <p className="text-[11px] text-muted-foreground">
                Finance up to 90% of the deposit via MCC HOLDING SA at a 1:{MAX_LEVERAGE_RATIO} ratio, then apply the
                1.8% debit cycle fee. The client must contribute at least 10% of the required deposit.
              </p>
            </div>
            <Switch checked={leverageEnabled} onCheckedChange={setLeverageEnabled} aria-label="Toggle leverage facility" />
          </div>

          {leverageEnabled && (
            <div className="mt-4 space-y-4">
              <div className="flex flex-wrap items-center gap-2 rounded-lg border border-primary/20 bg-primary/5 p-3">
                <ShieldCheck className="h-4 w-4 shrink-0 text-primary" />
                <p className="text-[11px] text-muted-foreground">
                  Approved 1:{MAX_LEVERAGE_RATIO} structure — minimum client contribution{" "}
                  <span className="font-semibold text-foreground">{fmt0(minContribution)}</span> covers the{" "}
                  <span className="font-semibold text-foreground">{fmt0(numRequired)}</span> deposit.
                </p>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="ml-auto h-7 text-[11px]"
                  onClick={applyMinLeverage}
                >
                  Apply 1:{MAX_LEVERAGE_RATIO} (10%)
                </Button>
              </div>

              {leverageBreached && (
                <p className="flex items-start gap-1.5 text-[11px] text-orange-400">
                  <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                  Contribution {fmt0(numContribution)} is below the {fmt0(minContribution)} minimum for a 1:
                  {MAX_LEVERAGE_RATIO} facility. Increase the contribution or lower the required deposit.
                </p>
              )}

              <div className="space-y-2">
                <Label htmlFor="tm-exposure">Transaction exposure (EUR)</Label>
                <Input
                  id="tm-exposure"
                  type="number"
                  min="0"
                  step="1000"
                  value={transactionExposure}
                  onChange={(e) => setTransactionExposure(e.target.value)}
                />
                <p className="text-[11px] text-muted-foreground">
                  Additional financial transaction exposure tied to the leverage facility (the cycle fee
                  applies to the leveraged amount plus this exposure).
                </p>
              </div>

              <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                <Derived
                  label="Applied Leverage"
                  value={`1:${ratio % 1 === 0 ? ratio : ratio.toFixed(1)}`}
                  tone={leverageBreached ? "negative" : "default"}
                />
                <Derived label="Financed (MCC HOLDING SA)" value={fmt0(financed)} tone="negative" />
                <Derived label="Treasury Received" value={fmt0(secured)} tone="positive" />
                <Derived label="Annual Cycle Fee" value={`${fmt0(annualFee)}/yr`} tone="negative" />
              </div>
            </div>
          )}
        </div>

        {/* Status + note */}
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-2">
            <Label>Deposit status</Label>
            <Select value={status} onValueChange={(v) => setStatus(v as TreasuryStatus)}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {STATUS_OPTIONS.map((s) => (
                  <SelectItem key={s.value} value={s.value}>
                    {s.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="tm-note">Internal note (optional)</Label>
            <Input id="tm-note" value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Approved by MCC CAPITAL desk" />
          </div>
        </div>

        {/* Summary + save */}
        <div className="rounded-lg border border-border bg-secondary/40 p-3 text-xs text-muted-foreground">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
            <span>Required: <span className="font-semibold text-foreground">{fmt0(numRequired)}</span></span>
            <span>Secured: <span className="font-semibold text-green-500">{fmt0(secured)}</span></span>
            <span>Shortfall: <span className={cn("font-semibold", shortfall > 0 ? "text-orange-400" : "text-foreground")}>{fmt0(shortfall)}</span></span>
            {stored.establishedAt && <span>Established: <span className="text-foreground">{fmtDate(stored.establishedAt)}</span></span>}
          </div>
        </div>

        <Button onClick={handleSaveRecord} disabled={saving || loading} className="w-full sm:w-auto">
          {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
          Save treasury record
        </Button>

        {/* Post a transaction */}
        <div className="space-y-3 border-t border-border pt-5">
          <div className="flex items-center gap-2">
            <Building2 className="h-4 w-4 text-primary" />
            <p className="text-sm font-medium text-foreground">Post a treasury transaction</p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Type</Label>
              <Select value={txnType} onValueChange={(v) => setTxnType(v as TreasuryTxnType)}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TXN_OPTIONS.map((t) => (
                    <SelectItem key={t.value} value={t.value}>
                      {t.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="tm-txn-amount">Amount (EUR)</Label>
              <Input
                id="tm-txn-amount"
                type="number"
                min="0"
                step="0.01"
                inputMode="decimal"
                placeholder="0.00"
                value={txnAmount}
                onChange={(e) => setTxnAmount(e.target.value)}
              />
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="tm-txn-label">Label (optional)</Label>
              <Input id="tm-txn-label" placeholder="Defaults to the type" value={txnLabel} onChange={(e) => setTxnLabel(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="tm-txn-note">Note (optional)</Label>
              <Input id="tm-txn-note" placeholder="e.g. Wire ref MCC-2026-0142" value={txnNote} onChange={(e) => setTxnNote(e.target.value)} />
            </div>
          </div>
          <Button onClick={handlePostTxn} disabled={posting || loading} variant="secondary" className="w-full sm:w-auto">
            {posting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Plus className="mr-2 h-4 w-4" />}
            Post transaction
          </Button>
        </div>

        {/* Recent transactions */}
        <div className="space-y-2 border-t border-border pt-5">
          <p className="text-sm font-medium text-foreground">
            Recent treasury transactions — {targetUser.fullName}
          </p>
          {stored.transactions.length === 0 ? (
            <p className="text-sm text-muted-foreground">No treasury transactions on record.</p>
          ) : (
            <div className="space-y-2">
              {stored.transactions.slice(0, 8).map((t) => (
                <div
                  key={t.id}
                  className="flex items-center justify-between gap-3 rounded-lg border border-border bg-card p-3"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-foreground">{t.label}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      {t.id} · {fmtDate(t.date)}
                      {t.note ? ` · ${t.note}` : ""}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className="whitespace-nowrap text-sm font-semibold">
                      {fmt0(t.amount, t.currency)}
                    </Badge>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-muted-foreground hover:text-red-400"
                      onClick={() => handleDeleteTxn(t.id)}
                      aria-label={`Remove treasury transaction ${t.id}`}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  )
}

function Derived({
  label,
  value,
  tone = "default",
}: {
  label: string
  value: string
  tone?: "default" | "positive" | "negative"
}) {
  return (
    <div className="rounded-lg border border-border bg-card p-3">
      <p className="text-[11px] text-muted-foreground">{label}</p>
      <p
        className={cn(
          "mt-1 text-sm font-semibold",
          tone === "positive" && "text-green-500",
          tone === "negative" && "text-orange-400",
          tone === "default" && "text-foreground",
        )}
      >
        {value}
      </p>
    </div>
  )
}
