"use client"

import { useEffect, useState } from "react"
import {
  Crown,
  Loader2,
  ShieldCheck,
  Check,
  X,
  Landmark,
  Clock,
  RefreshCw,
} from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { cn } from "@/lib/utils"
import { toast } from "sonner"
import { ADMIN_PASSCODE } from "@/lib/admin-config"
import {
  MEMBERSHIP_STATUS_LABEL,
  MEMBERSHIP_TIER_LABEL,
  AVANTGARDE_REQUIRED_DEPOSIT,
  AVANTGARDE_LEVERAGE_CONTRIBUTION,
  type DepositBasis,
  type MembershipStatus,
} from "@/lib/membership"
import {
  getAllMembershipRequestsAdmin,
  approveMembershipUpgradeAdmin,
  rejectMembershipUpgradeAdmin,
  validateMembershipDepositAdmin,
  type AdminMembershipView,
} from "@/app/actions/membership"

const fmtEur = (value: number) => `EUR ${value.toLocaleString("en-US", { maximumFractionDigits: 0 })}`

const fmtDate = (iso?: string) => {
  if (!iso) return "—"
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleString("en-GB")
}

const STATUS_TONE: Record<MembershipStatus, string> = {
  none: "border-border bg-secondary/40 text-muted-foreground",
  pending: "border-amber-500/30 bg-amber-500/10 text-amber-500",
  approved: "border-blue-500/30 bg-blue-500/10 text-blue-500",
  active: "border-green-500/30 bg-green-500/10 text-green-500",
  rejected: "border-red-500/30 bg-red-500/10 text-red-500",
}

export function MembershipManager() {
  const [requests, setRequests] = useState<AdminMembershipView[]>([])
  const [loading, setLoading] = useState(true)
  const [busyId, setBusyId] = useState<string | null>(null)
  // Per-request chosen deposit basis at validation time (default: full cash).
  const [basisById, setBasisById] = useState<Record<string, DepositBasis>>({})

  const load = async () => {
    setLoading(true)
    const res = await getAllMembershipRequestsAdmin(ADMIN_PASSCODE)
    setLoading(false)
    if (!res.ok) {
      toast.error(res.error)
      return
    }
    setRequests(res.requests)
  }

  useEffect(() => {
    void load()
  }, [])

  const applyResult = (
    res: Awaited<ReturnType<typeof approveMembershipUpgradeAdmin>>,
    successMsg: string,
  ) => {
    if (!res.ok) {
      toast.error(res.error)
      return
    }
    setRequests(res.requests)
    toast.success(successMsg)
  }

  const handleApprove = async (r: AdminMembershipView) => {
    setBusyId(r.userId)
    const res = await approveMembershipUpgradeAdmin(ADMIN_PASSCODE, r.userId)
    setBusyId(null)
    applyResult(res, `Approved ${r.fullName}'s ${MEMBERSHIP_TIER_LABEL[r.tier]} upgrade. Treasury can now validate the deposit.`)
  }

  const handleReject = async (r: AdminMembershipView) => {
    setBusyId(r.userId)
    const res = await rejectMembershipUpgradeAdmin(ADMIN_PASSCODE, r.userId)
    setBusyId(null)
    applyResult(res, `Declined ${r.fullName}'s ${MEMBERSHIP_TIER_LABEL[r.tier]} upgrade.`)
  }

  const handleValidate = async (r: AdminMembershipView) => {
    const basis = basisById[r.userId] ?? "cash"
    setBusyId(r.userId)
    const res = await validateMembershipDepositAdmin(ADMIN_PASSCODE, r.userId, basis)
    setBusyId(null)
    applyResult(
      res,
      `Validated ${r.fullName}'s ${fmtEur(AVANTGARDE_REQUIRED_DEPOSIT)} deposit. Avant-Garde is now active.`,
    )
  }

  const pending = requests.filter((r) => r.status === "pending")
  const approved = requests.filter((r) => r.status === "approved")
  const decided = requests.filter((r) => r.status === "active" || r.status === "rejected")

  return (
    <Card className="bg-card border-border">
      <CardHeader>
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10">
              <Crown className="h-5 w-5 text-primary" />
            </div>
            <div>
              <CardTitle className="text-lg font-semibold">Membership Approvals</CardTitle>
              <p className="text-sm text-muted-foreground text-pretty">
                Approve client upgrade requests, then have Treasury validate the{" "}
                {fmtEur(AVANTGARDE_REQUIRED_DEPOSIT)} Avant-Garde security deposit. Activation
                immediately reflects the new membership for the client.
              </p>
            </div>
          </div>
          <Button
            variant="outline"
            size="sm"
            className="shrink-0"
            onClick={load}
            disabled={loading}
            aria-label="Refresh membership requests"
          >
            <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} />
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        {loading && requests.length === 0 ? (
          <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading requests…
          </p>
        ) : requests.length === 0 ? (
          <p className="text-sm text-muted-foreground">No membership upgrade requests yet.</p>
        ) : (
          <>
            {/* Step 1 — pending approval */}
            <Section
              icon={<Clock className="h-4 w-4 text-amber-500" />}
              title="Awaiting approval"
              count={pending.length}
            >
              {pending.map((r) => (
                <RequestRow key={r.userId} r={r}>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      size="sm"
                      onClick={() => handleApprove(r)}
                      disabled={busyId === r.userId}
                    >
                      {busyId === r.userId ? (
                        <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Check className="mr-1.5 h-3.5 w-3.5" />
                      )}
                      Approve
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleReject(r)}
                      disabled={busyId === r.userId}
                    >
                      <X className="mr-1.5 h-3.5 w-3.5" />
                      Decline
                    </Button>
                  </div>
                </RequestRow>
              ))}
            </Section>

            {/* Step 2 — approved, awaiting Treasury deposit validation */}
            <Section
              icon={<Landmark className="h-4 w-4 text-blue-500" />}
              title="Approved — validate security deposit"
              count={approved.length}
            >
              {approved.map((r) => {
                const basis = basisById[r.userId] ?? "cash"
                return (
                  <RequestRow key={r.userId} r={r}>
                    <div className="w-full space-y-3">
                      <div className="rounded-lg border border-primary/20 bg-primary/5 p-3">
                        <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                          Security deposit basis
                        </p>
                        <div className="mt-2 flex flex-col gap-2 sm:flex-row sm:items-center">
                          <Select
                            value={basis}
                            onValueChange={(v) =>
                              setBasisById((prev) => ({ ...prev, [r.userId]: v as DepositBasis }))
                            }
                          >
                            <SelectTrigger className="w-full sm:w-[420px]">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="cash">
                                Full cash — {fmtEur(AVANTGARDE_REQUIRED_DEPOSIT)} deposit
                              </SelectItem>
                              <SelectItem value="leverage">
                                1:10 leverage — {fmtEur(AVANTGARDE_LEVERAGE_CONTRIBUTION)} cash, rest financed by MCC HOLDING SA
                              </SelectItem>
                            </SelectContent>
                          </Select>
                          <Button
                            className="shrink-0"
                            onClick={() => handleValidate(r)}
                            disabled={busyId === r.userId}
                          >
                            {busyId === r.userId ? (
                              <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                            ) : (
                              <ShieldCheck className="mr-1.5 h-4 w-4" />
                            )}
                            Validate deposit &amp; activate
                          </Button>
                        </div>
                        <p className="mt-2 text-[11px] text-muted-foreground">
                          Validating secures the {fmtEur(AVANTGARDE_REQUIRED_DEPOSIT)} deposit in Treasury and
                          activates Avant-Garde immediately.
                        </p>
                      </div>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 text-[11px] text-muted-foreground hover:text-red-400"
                        onClick={() => handleReject(r)}
                        disabled={busyId === r.userId}
                      >
                        <X className="mr-1 h-3 w-3" /> Decline instead
                      </Button>
                    </div>
                  </RequestRow>
                )
              })}
            </Section>

            {/* History — active + declined */}
            <Section
              icon={<ShieldCheck className="h-4 w-4 text-green-500" />}
              title="Decided"
              count={decided.length}
            >
              {decided.map((r) => (
                <RequestRow key={r.userId} r={r}>
                  <p className="text-xs text-muted-foreground">
                    {r.status === "active"
                      ? `Activated ${fmtDate(r.validatedAt)}${
                          r.depositBasis
                            ? ` · ${r.depositBasis === "leverage" ? "1:10 leverage" : "full cash"} deposit`
                            : ""
                        }`
                      : `Declined${r.note ? ` · ${r.note}` : ""}`}
                  </p>
                </RequestRow>
              ))}
            </Section>
          </>
        )}
      </CardContent>
    </Card>
  )
}

function Section({
  icon,
  title,
  count,
  children,
}: {
  icon: React.ReactNode
  title: string
  count: number
  children: React.ReactNode
}) {
  if (count === 0) return null
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        {icon}
        <p className="text-sm font-medium text-foreground">{title}</p>
        <Badge variant="outline" className="text-[10px]">
          {count}
        </Badge>
      </div>
      <div className="space-y-3">{children}</div>
    </div>
  )
}

function RequestRow({ r, children }: { r: AdminMembershipView; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <p className="truncate text-sm font-semibold text-foreground">{r.fullName}</p>
            <Badge variant="outline" className={cn("text-[10px]", STATUS_TONE[r.status])}>
              {MEMBERSHIP_STATUS_LABEL[r.status]}
            </Badge>
          </div>
          <p className="truncate text-xs text-muted-foreground">
            {r.company} · {r.email}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            Requested {MEMBERSHIP_TIER_LABEL[r.tier]} · {fmtDate(r.requestedAt)}
          </p>
        </div>
        <div className="shrink-0">{children}</div>
      </div>
    </div>
  )
}
