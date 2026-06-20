"use client"

import { useEffect, useMemo, useState } from "react"
import {
  Users,
  Network,
  Loader2,
  ShieldCheck,
  Check,
  X,
  Building2,
  Link2,
  ArrowUpRight,
} from "lucide-react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
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
import { cn } from "@/lib/utils"
import { toast } from "sonner"
import {
  getMyNetwork,
  getMyHierarchyInfo,
  type NetworkMember,
  type MyHierarchyInfo,
} from "@/app/actions/admin-users"
import { getMyMasterApprovalQueue, masterDecideApproval } from "@/app/actions/approvals"
import type { ApprovalRequest } from "@/lib/approvals-db"
import { KIND_LABELS } from "@/lib/approval-kinds"
import { relationshipLabel, relationshipCode } from "@/lib/account-hierarchy"

const RELATIONSHIP_STYLE: Record<string, string> = {
  S: "border-primary/30 bg-primary/10 text-primary",
  C: "border-amber-500/30 bg-amber-500/10 text-amber-400",
}

const STATUS_STYLE: Record<string, string> = {
  active: "bg-green-500/10 text-green-400 border-green-500/30",
  suspended: "bg-amber-500/10 text-amber-400 border-amber-500/30",
  inactive: "bg-red-500/10 text-red-400 border-red-500/30",
}

function fmtAmount(req: ApprovalRequest): string {
  if (req.amount == null) return "—"
  return `${req.currency ? `${req.currency} ` : ""}${req.amount.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`
}

function fmtDate(iso: string): string {
  try {
    return new Date(iso).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" })
  } catch {
    return iso
  }
}

export default function NetworkPage() {
  const [loading, setLoading] = useState(true)
  const [info, setInfo] = useState<MyHierarchyInfo | null>(null)
  const [members, setMembers] = useState<NetworkMember[]>([])
  const [queue, setQueue] = useState<ApprovalRequest[]>([])
  const [acting, setActing] = useState<string | null>(null)

  // Reject-with-reason dialog state.
  const [rejectTarget, setRejectTarget] = useState<ApprovalRequest | null>(null)
  const [rejectReason, setRejectReason] = useState("")

  const load = () => {
    setLoading(true)
    Promise.all([getMyHierarchyInfo(), getMyNetwork(), getMyMasterApprovalQueue({ pendingOnly: true })])
      .then(([h, m, q]) => {
        setInfo(h)
        setMembers(m)
        setQueue(q)
      })
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const subs = useMemo(() => members.filter((m) => m.relationship === "sub"), [members])
  const children = useMemo(() => members.filter((m) => m.relationship === "child"), [members])

  const handleApprove = async (req: ApprovalRequest) => {
    setActing(req.id)
    const res = await masterDecideApproval(req.id, "approved")
    setActing(null)
    if (!res.ok) {
      toast.error(res.error)
      return
    }
    setQueue((prev) => prev.filter((r) => r.id !== req.id))
    toast.success("Payment approved", {
      description: `${req.initiatedByName ?? "Sub-account"}'s ${KIND_LABELS[req.kind].toLowerCase()} was approved and executed.`,
    })
  }

  const handleReject = async () => {
    const req = rejectTarget
    if (!req) return
    if (!rejectReason.trim()) {
      toast.error("A reason is required to reject a request.")
      return
    }
    setActing(req.id)
    const res = await masterDecideApproval(req.id, "rejected", rejectReason.trim())
    setActing(null)
    if (!res.ok) {
      toast.error(res.error)
      return
    }
    setQueue((prev) => prev.filter((r) => r.id !== req.id))
    setRejectTarget(null)
    setRejectReason("")
    toast.success("Payment declined", {
      description: `${req.initiatedByName ?? "Sub-account"}'s request was declined.`,
    })
  }

  if (loading) {
    return (
      <div className="flex items-center gap-2 py-16 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading your network…
      </div>
    )
  }

  // A non-Master account that is itself linked to a Master sees its parent.
  const isLinkedAccount = info && info.relationship !== "master"

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <Network className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-foreground">My Network</h1>
            <p className="text-sm text-muted-foreground">
              Linked accounts and the approvals they route to you.
            </p>
          </div>
        </div>
      </div>

      {/* Parent (for sub/child accounts) */}
      {isLinkedAccount && info && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <Link2 className="h-4 w-4 text-primary" /> Your Master account
            </CardTitle>
            <CardDescription>
              This account is a {relationshipLabel(info.relationship)} linked to the Master below.
              {info.relationship === "sub"
                ? " It shares the Master's balance and bank instruments. Outgoing payments require both administrator and Master approval."
                : " It is independent and linked for referral attribution only."}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-3 rounded-lg border border-border bg-card p-4">
              <Building2 className="h-5 w-5 text-muted-foreground" />
              <div className="min-w-0">
                <p className="truncate font-medium text-foreground">{info.masterName ?? "—"}</p>
                <p className="truncate text-xs text-muted-foreground">{info.masterEmail ?? ""}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Pending sub-account payment approvals (Master only) */}
      {info?.relationship === "master" && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <ShieldCheck className="h-4 w-4 text-primary" /> Payments awaiting your approval
              {queue.length > 0 && (
                <Badge className="ml-1 bg-primary text-primary-foreground">{queue.length}</Badge>
              )}
            </CardTitle>
            <CardDescription>
              Outgoing payments from your sub-accounts execute against your shared balance only after
              both the administrator and you approve them.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {queue.length === 0 ? (
              <div className="rounded-lg border border-dashed border-border bg-secondary/30 p-6 text-center">
                <p className="text-sm text-muted-foreground">No payments are waiting for your approval.</p>
              </div>
            ) : (
              <div className="space-y-2">
                {queue.map((req) => {
                  const busy = acting === req.id
                  const awaitingMaster = req.status === "awaiting_master"
                  return (
                    <div
                      key={req.id}
                      className="flex flex-col gap-3 rounded-lg border border-border bg-card p-4 sm:flex-row sm:items-center sm:justify-between"
                    >
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="truncate font-medium text-foreground">{req.title}</p>
                          <Badge variant="outline" className="text-[10px]">
                            {KIND_LABELS[req.kind]}
                          </Badge>
                          {!awaitingMaster && (
                            <Badge variant="outline" className="border-amber-500/30 text-[10px] text-amber-400">
                              Pending admin too
                            </Badge>
                          )}
                        </div>
                        <p className="truncate text-sm text-muted-foreground">
                          {req.initiatedByName ?? "Sub-account"} · {fmtAmount(req)}
                        </p>
                        {req.summary && (
                          <p className="truncate text-xs text-muted-foreground">{req.summary}</p>
                        )}
                        <p className="text-xs text-muted-foreground">Requested {fmtDate(req.createdAt)}</p>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <Button
                          size="sm"
                          onClick={() => handleApprove(req)}
                          disabled={busy}
                          className="bg-green-600 text-white hover:bg-green-500"
                        >
                          {busy ? (
                            <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <Check className="mr-1.5 h-3.5 w-3.5" />
                          )}
                          Approve
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            setRejectTarget(req)
                            setRejectReason("")
                          }}
                          disabled={busy}
                          className="text-red-500 hover:text-red-400"
                        >
                          <X className="mr-1.5 h-3.5 w-3.5" /> Decline
                        </Button>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Linked accounts */}
      {info?.relationship === "master" && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <Users className="h-4 w-4 text-primary" /> Linked accounts
              <Badge variant="outline" className="ml-1">
                {members.length}
              </Badge>
            </CardTitle>
            <CardDescription>
              Sub-accounts (S) share your balance and instruments. Child-accounts (C) are independent
              and linked for referral attribution.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {members.length === 0 ? (
              <div className="rounded-lg border border-dashed border-border bg-secondary/30 p-6 text-center">
                <p className="text-sm text-muted-foreground">
                  No accounts are linked under you yet. An administrator can link sub or child accounts to
                  your account.
                </p>
              </div>
            ) : (
              <>
                {subs.length > 0 && (
                  <div className="space-y-2">
                    <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                      Sub-accounts · shared balance
                    </p>
                    {subs.map((m) => (
                      <MemberRow key={m.id} member={m} />
                    ))}
                  </div>
                )}
                {children.length > 0 && (
                  <div className="space-y-2">
                    <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                      Child-accounts · referral
                    </p>
                    {children.map((m) => (
                      <MemberRow key={m.id} member={m} />
                    ))}
                  </div>
                )}
              </>
            )}
          </CardContent>
        </Card>
      )}

      {/* Reject dialog */}
      <Dialog open={!!rejectTarget} onOpenChange={(o) => !o && setRejectTarget(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Decline this payment</DialogTitle>
            <DialogDescription>
              Provide a reason. The sub-account will see this when their request is declined.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2 py-2">
            <Label htmlFor="reject-reason">Reason</Label>
            <Textarea
              id="reject-reason"
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              placeholder="e.g. Beneficiary not recognised; please re-confirm."
              rows={3}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRejectTarget(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleReject}
              disabled={acting === rejectTarget?.id}
            >
              {acting === rejectTarget?.id && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Decline payment
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

function MemberRow({ member }: { member: NetworkMember }) {
  const code = relationshipCode(member.relationship)
  return (
    <div className="flex flex-col gap-3 rounded-lg border border-border bg-card p-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <p className="truncate font-medium text-foreground">{member.fullName}</p>
          <Badge variant="outline" className={cn("text-[10px]", RELATIONSHIP_STYLE[code])}>
            {code} · {relationshipLabel(member.relationship)}
          </Badge>
          <Badge variant="outline" className={cn("text-[10px]", STATUS_STYLE[member.status])}>
            {member.status}
          </Badge>
        </div>
        <p className="truncate text-sm text-muted-foreground">{member.company}</p>
        <p className="truncate text-xs text-muted-foreground">
          {member.email} · {member.accountBadge}
        </p>
      </div>
      {member.relationship === "sub" && (
        <span className="flex items-center gap-1 text-xs text-primary">
          <ArrowUpRight className="h-3.5 w-3.5" /> Shares your balance
        </span>
      )}
    </div>
  )
}
