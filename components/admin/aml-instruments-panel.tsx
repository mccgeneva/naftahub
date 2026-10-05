"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { toast } from "sonner"
import { Flag, FlagOff, Landmark, Loader2, Search, ShieldAlert, ShieldCheck, Trash2 } from "lucide-react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Badge } from "@/components/ui/badge"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"

type Engagement = {
  approvalId: string
  kind: string
  label: string
  title: string
  status: string
  amount: number
  currency: string
}

type Row = {
  approvalId: string
  userId: string
  holderLabel: string
  instrument: Record<string, unknown>
  flag: { flaggedAt: string; reason: string } | null
  engagements: Engagement[]
  ppiActive: { id: string; lloydsReference: string; coverAmount: number; currency: string } | null
}

type Filter = "all" | "flagged" | "pledged"

function money(amount: number, currency: string) {
  return `${currency} ${amount.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

export function AmlInstrumentsPanel({ passcode }: { passcode: string }) {
  const [rows, setRows] = useState<Row[]>([])
  const [loading, setLoading] = useState(true)
  const [query, setQuery] = useState("")
  const [filter, setFilter] = useState<Filter>("all")
  const [action, setAction] = useState<{ row: Row; mode: "flag" | "revoke" } | null>(null)
  const [reason, setReason] = useState("")
  const [busy, setBusy] = useState(false)

  const call = useCallback(
    async (payload: Record<string, unknown>) => {
      const res = await fetch("/api/admin/aml", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ passcode, ...payload }),
      })
      return (await res.json().catch(() => ({ ok: false, error: "Request failed." }))) as Record<string, unknown>
    },
    [passcode],
  )

  const load = useCallback(async () => {
    setLoading(true)
    const data = await call({ op: "instruments" })
    if (data.ok) setRows(data.instruments as Row[])
    else toast.error(String(data.error ?? "Could not load instruments."))
    setLoading(false)
  }, [call])

  useEffect(() => {
    void load()
  }, [load])

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase()
    return rows.filter((r) => {
      if (filter === "flagged" && !r.flag) return false
      if (filter === "pledged" && r.engagements.length === 0) return false
      if (!q) return true
      const i = r.instrument
      return [r.holderLabel, i.id, i.typeFull, i.type, i.issuer, i.isin]
        .map((v) => String(v ?? "").toLowerCase())
        .some((v) => v.includes(q))
    })
  }, [rows, query, filter])

  const flaggedCount = rows.filter((r) => r.flag).length

  async function unflag(row: Row) {
    const data = await call({ op: "unflag-instrument", approvalId: row.approvalId })
    if (data.ok) {
      toast.success("Flag cleared")
      void load()
    } else toast.error(String(data.error))
  }

  async function submitAction() {
    if (!action) return
    if (!reason.trim()) {
      toast.error("Please give a reason.")
      return
    }
    setBusy(true)
    const data = await call({
      op: action.mode === "flag" ? "flag-instrument" : "revoke-instrument",
      approvalId: action.row.approvalId,
      reason,
    })
    setBusy(false)
    if (!data.ok) {
      toast.error(String(data.error ?? "Action failed."))
      return
    }
    if (action.mode === "flag") {
      toast.success("Instrument flagged as irregular")
    } else {
      const outcome = data.outcome as { mode: string; replacementInstrumentId?: string }
      toast.success(
        outcome.mode === "ppi_replacement"
          ? `Revoked and replaced by Lloyds Bank BG ${outcome.replacementInstrumentId ?? ""}. No debit applied.`
          : "Revoked. Every facility it secured was collapsed into the master account.",
      )
    }
    setAction(null)
    setReason("")
    void load()
  }

  const target = action?.row
  const targetDebitTotal = target?.engagements.reduce((s, e) => s + (e.amount || 0), 0) ?? 0

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start gap-3">
          <Landmark className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
          <div className="min-w-0 flex-1">
            <CardTitle className="text-base">Bank instrument audit</CardTitle>
            <CardDescription className="leading-relaxed">
              Every bank instrument held by customers. Flag irregular instruments and force-revoke them.
              {flaggedCount > 0 && ` ${flaggedCount} flagged.`}
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="h-11 pl-9 text-base"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search customer, instrument, issuer or ISIN"
          />
        </div>
        <div className="flex gap-2">
          {(["all", "flagged", "pledged"] as Filter[]).map((f) => (
            <Button
              key={f}
              size="sm"
              variant={filter === f ? "default" : "outline"}
              className="h-10 flex-1 capitalize"
              onClick={() => setFilter(f)}
            >
              {f === "pledged" ? "In use" : f}
            </Button>
          ))}
        </div>

        {loading ? (
          <div className="flex items-center justify-center gap-2 py-8 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading instruments…
          </div>
        ) : visible.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">No instruments match.</p>
        ) : (
          <ul className="flex flex-col gap-3">
            {visible.map((r) => {
              const i = r.instrument
              const currency = String(i.currency ?? "EUR")
              return (
                <li
                  key={r.approvalId}
                  className={`flex flex-col gap-3 rounded-lg border p-3 ${r.flag ? "border-destructive/50 bg-destructive/5" : "border-border"}`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{String(i.typeFull ?? i.type ?? "Instrument")}</p>
                      <p className="break-all font-mono text-xs text-muted-foreground">{String(i.id)}</p>
                    </div>
                    <p className="shrink-0 font-mono text-sm tabular-nums">{money(Number(i.faceValue) || 0, currency)}</p>
                  </div>
                  <div className="flex flex-col gap-0.5 text-xs text-muted-foreground">
                    <span className="font-medium text-foreground">{r.holderLabel}</span>
                    <span>
                      {String(i.issuer ?? "—")}
                      {i.isin ? ` · ISIN ${String(i.isin)}` : ""}
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {r.flag && (
                      <Badge variant="destructive" className="gap-1">
                        <Flag className="h-3 w-3" /> Irregular
                      </Badge>
                    )}
                    {r.ppiActive ? (
                      <Badge variant="secondary" className="gap-1">
                        <ShieldCheck className="h-3 w-3" /> PPI active
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="gap-1">
                        <ShieldAlert className="h-3 w-3" /> No PPI
                      </Badge>
                    )}
                    <Badge variant="outline">
                      {r.engagements.length === 0 ? "Not pledged" : `Pledged to ${r.engagements.length}`}
                    </Badge>
                  </div>
                  {r.flag && <p className="text-pretty text-xs leading-relaxed text-destructive">{r.flag.reason}</p>}
                  {r.engagements.length > 0 && (
                    <ul className="flex flex-col gap-1 rounded-md bg-muted/50 p-2 text-xs">
                      {r.engagements.map((e) => (
                        <li key={e.approvalId} className="flex justify-between gap-2">
                          <span className="min-w-0 truncate">{e.label}</span>
                          <span className="shrink-0 font-mono tabular-nums">{money(e.amount, e.currency)}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                  <div className="flex gap-2">
                    {r.flag ? (
                      <Button variant="outline" className="h-11 flex-1" onClick={() => unflag(r)}>
                        <FlagOff className="mr-2 h-4 w-4" /> Clear flag
                      </Button>
                    ) : (
                      <Button variant="outline" className="h-11 flex-1" onClick={() => setAction({ row: r, mode: "flag" })}>
                        <Flag className="mr-2 h-4 w-4" /> Flag irregular
                      </Button>
                    )}
                    <Button
                      variant="destructive"
                      className="h-11 flex-1"
                      onClick={() => {
                        setReason(r.flag?.reason ?? "")
                        setAction({ row: r, mode: "revoke" })
                      }}
                    >
                      <Trash2 className="mr-2 h-4 w-4" /> Revoke
                    </Button>
                  </div>
                </li>
              )
            })}
          </ul>
        )}
      </CardContent>

      <Dialog
        open={!!action}
        onOpenChange={(open) => {
          if (!open && !busy) {
            setAction(null)
            setReason("")
          }
        }}
      >
        <DialogContent className="flex max-h-[88dvh] max-w-lg flex-col overflow-hidden">
          <DialogHeader className="shrink-0">
            <DialogTitle>{action?.mode === "flag" ? "Flag instrument as irregular" : "Force-revoke instrument"}</DialogTitle>
            <DialogDescription className="text-pretty">
              {target ? `${String(target.instrument.typeFull ?? target.instrument.type)} · ${target.holderLabel}` : ""}
            </DialogDescription>
          </DialogHeader>
          <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto pr-1">
            {action?.mode === "revoke" && target && (
              target.ppiActive ? (
                <div className="rounded-md border border-primary/40 bg-primary/5 p-3 text-sm leading-relaxed">
                  <p className="font-medium">PPI policy active — the customer is covered</p>
                  <p className="text-muted-foreground">
                    The instrument is deleted and replaced by a fresh-cut Lloyds Bank plc, London Bank Guarantee of{" "}
                    {money(Number(target.instrument.faceValue) || 0, String(target.instrument.currency ?? "EUR"))} with the
                    same specifications.{" "}
                    {target.engagements.length > 0
                      ? `All ${target.engagements.length} facilities it backs are re-linked to the new BG. `
                      : ""}
                    The master account is not debited.
                  </p>
                </div>
              ) : (
                <div className="rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm leading-relaxed">
                  <p className="font-medium text-destructive">No PPI cover — every facility collapses</p>
                  <p className="text-muted-foreground">
                    The instrument is deleted.{" "}
                    {target.engagements.length > 0
                      ? `All ${target.engagements.length} facilities it secures (leverage, loans, monetization, yields, investments) are terminated, and the outstanding principal and interest (about ${money(targetDebitTotal, target.engagements[0].currency)}) are debited to the master account, even into deep debit.`
                      : "It isn't pledged anywhere, so nothing else is debited."}
                  </p>
                </div>
              )
            )}
            <Textarea
              className="min-h-28 text-base"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder={action?.mode === "flag" ? "What is irregular about this instrument?" : "Reason for revocation"}
            />
          </div>
          <DialogFooter className="shrink-0 gap-2 border-t border-border pt-4">
            <Button variant="outline" className="h-11" disabled={busy} onClick={() => setAction(null)}>
              Cancel
            </Button>
            <Button
              variant={action?.mode === "revoke" ? "destructive" : "default"}
              className="h-11"
              disabled={busy}
              onClick={submitAction}
            >
              {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {action?.mode === "flag" ? "Flag instrument" : target?.ppiActive ? "Revoke & replace with BG" : "Revoke & collapse"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  )
}
