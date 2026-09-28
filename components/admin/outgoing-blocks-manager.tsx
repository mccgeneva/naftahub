"use client"

import { useEffect, useMemo, useState } from "react"
import { Ban, Save, Loader2, RotateCcw, User, ArrowUpRight, TrendingUp } from "lucide-react"
import { toast } from "sonner"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Switch } from "@/components/ui/switch"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import {
  formatOutgoingBlockUntil,
  outgoingBlockActive,
  type OutgoingBlockConfig,
} from "@/lib/outgoing-blocks-eval"

type SelectableClient = { id: string; fullName: string; company: string; email: string; kind: "dynamic" }

/** Convert an ISO instant to the value a <input type="datetime-local"> expects (local time, no seconds). */
function isoToLocalInput(iso: string | null): string {
  if (!iso) return ""
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ""
  const pad = (n: number) => String(n).padStart(2, "0")
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

export function OutgoingBlocksManager({ passcode }: { passcode: string }) {
  const [clients, setClients] = useState<SelectableClient[]>([])
  const [target, setTarget] = useState<string>("")

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [clearing, setClearing] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [current, setCurrent] = useState<OutgoingBlockConfig | null>(null)

  const [blockPayments, setBlockPayments] = useState(false)
  const [blockTrades, setBlockTrades] = useState(false)
  const [reason, setReason] = useState("")
  const [until, setUntil] = useState("") // datetime-local value; "" = indefinite

  const targetClient = useMemo(() => clients.find((c) => c.id === target), [clients, target])
  const targetName = useMemo(() => {
    if (!targetClient) return "this user"
    return targetClient.company?.trim() || targetClient.fullName?.trim() || targetClient.email
  }, [targetClient])

  const applyBlock = (b: OutgoingBlockConfig | null) => {
    setCurrent(b)
    setBlockPayments(!!b?.blockPayments)
    setBlockTrades(!!b?.blockTrades)
    setReason(b?.reason ?? "")
    setUntil(isoToLocalInput(b?.until ?? null))
  }

  // Load the client roster + the chosen target's block via the non-proxied API
  // route (a Server Action would be 401'd by the session proxy on a stale cookie
  // and leave the picker empty).
  useEffect(() => {
    let active = true
    setLoading(true)
    setLoadError(null)
    ;(async () => {
      try {
        const resp = await fetch("/api/admin/outgoing-blocks", {
          method: "POST",
          credentials: "include",
          cache: "no-store",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ op: "load", pin: passcode, targetId: target }),
        })
        const data = await resp.json()
        if (!active) return
        if (data.ok) {
          if (Array.isArray(data.clients) && data.clients.length) setClients(data.clients)
          applyBlock((data.block as OutgoingBlockConfig | null) ?? null)
        } else if (data.reason === "unauthorized") {
          setLoadError("Administrator session not recognized. Re-open the panel with your passcode.")
          if (Array.isArray(data.clients)) setClients(data.clients)
        } else {
          setLoadError(data.error || "Could not load outgoing blocks.")
        }
      } catch {
        if (active) setLoadError("Could not reach the server. Please try again.")
      } finally {
        if (active) setLoading(false)
      }
    })()
    return () => {
      active = false
    }
  }, [passcode, target])

  const save = async () => {
    if (!target) {
      toast.error("Select a user first")
      return
    }
    if ((blockPayments || blockTrades) && !reason.trim()) {
      toast.error("Add an explanation", {
        description: "The reason is shown to the user each time an outgoing request is auto-rejected.",
      })
      return
    }
    setSaving(true)
    let res: { ok: true; block: OutgoingBlockConfig | null } | { ok: false; error?: string }
    try {
      const resp = await fetch("/api/admin/outgoing-blocks", {
        method: "POST",
        credentials: "include",
        cache: "no-store",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          op: "save",
          pin: passcode,
          targetId: target,
          targetName,
          blockPayments,
          blockTrades,
          reason: reason.trim(),
          until: until ? new Date(until).toISOString() : null,
        }),
      })
      res = await resp.json()
    } catch {
      res = { ok: false, error: "Could not reach the server. Please try again." }
    }
    setSaving(false)
    if (!res.ok) {
      toast.error("Couldn't save the block", { description: res.error })
      return
    }
    applyBlock(res.block)
    const anyOn = blockPayments || blockTrades
    toast.success(anyOn ? "Outgoing block applied" : "Outgoing block lifted", {
      description: anyOn
        ? `${targetName} will be auto-rejected on the selected outgoing activity.`
        : `${targetName} has no outgoing restrictions.`,
    })
  }

  const clearBlock = async () => {
    if (!target) return
    setClearing(true)
    let res: { ok: true } | { ok: false; error?: string }
    try {
      const resp = await fetch("/api/admin/outgoing-blocks", {
        method: "POST",
        credentials: "include",
        cache: "no-store",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ op: "clear", pin: passcode, targetId: target, targetName }),
      })
      res = await resp.json()
    } catch {
      res = { ok: false, error: "Could not reach the server. Please try again." }
    }
    setClearing(false)
    if (!res.ok) {
      toast.error("Couldn't remove the block", { description: res.error })
      return
    }
    applyBlock(null)
    toast.success("Outgoing block removed", { description: `${targetName} can transact and trade normally.` })
  }

  const liveActive = outgoingBlockActive(current)
  const expired = !!current?.until && !liveActive && (current.blockPayments || current.blockTrades)

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Ban className="h-5 w-5 text-primary" />
            Outgoing Blocks
          </CardTitle>
          <CardDescription>
            Suspend a selected user&apos;s <span className="font-medium">outgoing</span> activity for a period of time.
            Choose the scope, set an optional expiry, and write the explanation the user will see each time a request is
            auto-rejected. Incoming funds and instruments are never affected — the account can always receive.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Target selector */}
          <div className="space-y-1.5">
            <Label>Apply block to</Label>
            <Select value={target} onValueChange={setTarget}>
              <SelectTrigger>
                <SelectValue placeholder="Select a user…" />
              </SelectTrigger>
              <SelectContent>
                {clients.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    <span className="flex items-center gap-2">
                      <User className="h-3.5 w-3.5" />
                      {c.company?.trim() || c.fullName?.trim() || c.email}
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {loadError && <p className="text-[11px] text-destructive">{loadError}</p>}
          </div>

          {loading ? (
            <div className="flex items-center gap-2 py-8 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading current block…
            </div>
          ) : !target ? (
            <p className="py-6 text-sm text-muted-foreground">Select a user to view or set an outgoing block.</p>
          ) : (
            <>
              {/* Current status */}
              {current && (current.blockPayments || current.blockTrades) && (
                <div
                  className={`rounded-lg border p-3 text-xs ${
                    liveActive
                      ? "border-destructive/40 bg-destructive/10 text-destructive"
                      : "border-border bg-muted/40 text-muted-foreground"
                  }`}
                >
                  {liveActive ? (
                    <>
                      <span className="font-semibold">Active block.</span>{" "}
                      {[current.blockPayments ? "Payments & transfers" : null, current.blockTrades ? "Trading & financing" : null]
                        .filter(Boolean)
                        .join(" + ")}{" "}
                      suspended
                      {current.until ? ` until ${formatOutgoingBlockUntil(current.until)}` : " (indefinite)"}.
                    </>
                  ) : expired ? (
                    <>
                      <span className="font-semibold">Expired.</span> The previous block lapsed on{" "}
                      {formatOutgoingBlockUntil(current.until)} and is no longer enforced.
                    </>
                  ) : null}
                </div>
              )}

              {/* Scope toggles */}
              <div className="space-y-3 rounded-lg border border-border p-4">
                <div className="flex items-center justify-between gap-3">
                  <Label className="flex items-center gap-2 text-sm font-medium">
                    <ArrowUpRight className="h-4 w-4 text-muted-foreground" />
                    Block outgoing payments &amp; transfers
                  </Label>
                  <Switch checked={blockPayments} onCheckedChange={setBlockPayments} />
                </div>
                <p className="text-[11px] text-muted-foreground">
                  External payments (MT103), instant transfers and sub-account transfers are auto-rejected.
                </p>
                <div className="flex items-center justify-between gap-3 border-t border-border pt-3">
                  <Label className="flex items-center gap-2 text-sm font-medium">
                    <TrendingUp className="h-4 w-4 text-muted-foreground" />
                    Block trading &amp; financing
                  </Label>
                  <Switch checked={blockTrades} onCheckedChange={setBlockTrades} />
                </div>
                <p className="text-[11px] text-muted-foreground">
                  Leverage, monetization, PPP/yield, trading-fund, commodity, project funding, treasury financing and
                  internal loans are auto-rejected.
                </p>
              </div>

              {/* Expiry */}
              <div className="space-y-1.5">
                <Label htmlFor="ob-until">Block until (optional)</Label>
                <Input
                  id="ob-until"
                  type="datetime-local"
                  value={until}
                  onChange={(e) => setUntil(e.target.value)}
                  className="text-base"
                />
                <p className="text-[11px] text-muted-foreground">
                  Leave empty for an indefinite block. After this moment the block lifts automatically.
                </p>
              </div>

              {/* Reason */}
              <div className="space-y-1.5">
                <Label htmlFor="ob-reason">Explanation shown to the user</Label>
                <Textarea
                  id="ob-reason"
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder="e.g. Outgoing activity is temporarily suspended pending a compliance review of recent returned payments."
                  className="max-h-48 min-h-24 text-base"
                />
                <p className="text-[11px] text-muted-foreground">
                  Required when a scope is on. This exact text is returned to the user on every auto-rejection.
                </p>
              </div>

              <div className="flex flex-col gap-2 sm:flex-row">
                <Button onClick={save} disabled={saving || clearing} className="w-full gap-2">
                  {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                  {blockPayments || blockTrades ? `Apply block to ${targetName}` : "Save (no restrictions)"}
                </Button>
                {current && (current.blockPayments || current.blockTrades) && (
                  <Button
                    onClick={clearBlock}
                    disabled={saving || clearing}
                    variant="outline"
                    className="w-full gap-2 sm:w-auto"
                  >
                    {clearing ? <Loader2 className="h-4 w-4 animate-spin" /> : <RotateCcw className="h-4 w-4" />}
                    Remove block
                  </Button>
                )}
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
