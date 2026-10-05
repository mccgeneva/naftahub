"use client"

import { useCallback, useEffect, useState } from "react"
import { toast } from "sonner"
import { FileText, Loader2, RefreshCw, Send, Stamp, XCircle } from "lucide-react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { downloadFile } from "@/lib/download-file"
import { blobFileUrl } from "@/lib/kyc-types"
import { VERBIAGE_STATUS_LABELS, VERBIAGE_VERDICT_LABELS, type VerbiageAnalysis } from "@/lib/verbiage-types"

type Submission = {
  id: string
  holderLabel: string
  fileName: string
  blobPathname: string | null
  status: string
  analysis: VerbiageAnalysis
  transmittedTo: string | null
  transmissionError: string | null
  issuedInstrumentRef: string | null
  overrideReason?: string | null
  forcedBy?: string | null
  createdAt: string
}

function money(a: VerbiageAnalysis) {
  if (!a.faceValue) return "—"
  const n = Number(a.faceValue)
  return `${a.currency} ${Number.isFinite(n) ? n.toLocaleString("en-US") : a.faceValue}`
}

export function VerbiageDeskManager({ passcode }: { passcode: string }) {
  const [subs, setSubs] = useState<Submission[]>([])
  const [loading, setLoading] = useState(true)
  const [email, setEmail] = useState("")
  const [savedEmail, setSavedEmail] = useState("")
  const [busyId, setBusyId] = useState<string | null>(null)
  const [refs, setRefs] = useState<Record<string, string>>({})
  const [justify, setJustify] = useState<Record<string, string>>({})

  const call = useCallback(
    async (payload: Record<string, unknown>) => {
      const res = await fetch("/api/admin/verbiage", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pin: passcode, ...payload }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok || !json.ok) throw new Error(json.error || "Request failed.")
      return json
    },
    [passcode],
  )

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const json = await call({ op: "list" })
      setSubs(json.submissions)
      setEmail(json.barclaysEmail ?? "")
      setSavedEmail(json.barclaysEmail ?? "")
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not load submissions.")
    } finally {
      setLoading(false)
    }
  }, [call])

  useEffect(() => {
    void load()
  }, [load])

  async function run(id: string, payload: Record<string, unknown>, success: string) {
    setBusyId(id)
    try {
      await call({ id, ...payload })
      toast.success(success)
      await load()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Action failed.")
    } finally {
      setBusyId(null)
    }
  }

  async function saveEmail() {
    try {
      const json = await call({ op: "set-email", email })
      setSavedEmail(json.barclaysEmail)
      toast.success(json.barclaysEmail ? "Barclays address saved — approvals now send automatically" : "Address cleared")
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not save.")
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader>
          <CardTitle>Verbiage Desk — Barclays execution</CardTitle>
          <CardDescription>
            Customers upload, verify and approve instrument verbiage. Approved verbiage is emailed as an MT799 from
            trader@mccgva.ch to the Barclays address below. Without an address, approvals wait here for you.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-2">
          <Label htmlFor="barclays-email">Barclays execution email</Label>
          <div className="flex flex-col gap-2 sm:flex-row">
            <Input
              id="barclays-email"
              type="email"
              inputMode="email"
              autoComplete="off"
              className="text-base"
              placeholder="trade.desk@barclays.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
            <Button onClick={saveEmail} disabled={email.trim() === savedEmail}>
              Save
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            {savedEmail ? `Approvals send automatically to ${savedEmail}.` : "Not set — approvals are queued for manual transmission."}
          </p>
        </CardContent>
      </Card>

      <div className="flex items-center justify-between">
        <h3 className="font-medium">Submissions</h3>
        <Button variant="outline" size="sm" onClick={load} disabled={loading}>
          <RefreshCw className={`mr-2 h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          Refresh
        </Button>
      </div>

      {!loading && subs.length === 0 && <p className="text-sm text-muted-foreground">No verbiage submissions yet.</p>}

      {subs.map((s) => {
        const a = s.analysis
        const busy = busyId === s.id
        return (
          <Card key={s.id}>
            <CardContent className="flex flex-col gap-3 pt-6">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="font-medium">{s.holderLabel}</p>
                  <p className="text-sm text-muted-foreground">
                    {a.instrumentType || "Instrument"} · {money(a)} · {new Date(s.createdAt).toLocaleDateString()}
                  </p>
                </div>
                <Badge variant="secondary">{VERBIAGE_STATUS_LABELS[s.status] ?? s.status}</Badge>
              </div>
              <p className="text-sm leading-relaxed">{a.summary}</p>
              <p className="text-xs text-muted-foreground">
                Score {a.complianceScore}/100 · {VERBIAGE_VERDICT_LABELS[a.verdict]}
                {a.issuingBank ? ` · Issuer ${a.issuingBank}` : ""}
                {s.transmittedTo ? ` · Sent to ${s.transmittedTo}` : ""}
                {s.issuedInstrumentRef ? ` · Issued ref ${s.issuedInstrumentRef}` : ""}
              </p>
              {s.transmissionError && s.status !== "transmitted" && (
                <p className="text-xs text-destructive">Last send failed: {s.transmissionError}</p>
              )}
              <div className="flex flex-wrap gap-2">
                {s.blobPathname && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => downloadFile(blobFileUrl(s.blobPathname as string, passcode), s.fileName)}
                  >
                    <FileText className="mr-2 h-4 w-4" />
                    Original
                  </Button>
                )}
                {(s.status === "awaiting_transmission" || s.status === "transmitted") && (
                  <Button
                    size="sm"
                    disabled={busy}
                    onClick={() => run(s.id, { op: "transmit" }, "Transmitted to Barclays")}
                  >
                    {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Send className="mr-2 h-4 w-4" />}
                    {s.status === "transmitted" ? "Resend to Barclays" : "Send to Barclays"}
                  </Button>
                )}
                {s.status !== "issued" && s.status !== "rejected" && (
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={busy}
                    className="text-destructive"
                    onClick={() => run(s.id, { op: "reject" }, "Submission declined")}
                  >
                    <XCircle className="mr-2 h-4 w-4" />
                    Decline
                  </Button>
                )}
              </div>
              {s.forcedBy && (
                <p className="break-words text-xs text-muted-foreground">Force-approved: {s.forcedBy}</p>
              )}
              {(s.status === "override_requested" || s.status === "analyzed") && (
                <div className="flex flex-col gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3">
                  <p className="text-sm font-medium">
                    {s.status === "override_requested" ? "Customer requests force approval" : "Not yet approved by the customer"}
                  </p>
                  {s.overrideReason && (
                    <p className="break-words text-sm leading-relaxed">Reason: {s.overrideReason}</p>
                  )}
                  <Label htmlFor={`just-${s.id}`} className="text-xs">
                    Your justification (kept in the audit trail)
                  </Label>
                  <Input
                    id={`just-${s.id}`}
                    value={justify[s.id] ?? ""}
                    onChange={(e) => setJustify((p) => ({ ...p, [s.id]: e.target.value }))}
                    placeholder="e.g. Wording confirmed directly with the issuing bank"
                    className="text-base sm:text-sm"
                  />
                  <Button
                    size="sm"
                    className="min-h-11"
                    disabled={busy || (justify[s.id] ?? "").trim().length < 10}
                    onClick={() =>
                      run(s.id, { op: "force-approve", note: justify[s.id] }, "Force-approved and sent to Barclays")
                    }
                  >
                    {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Stamp className="mr-2 h-4 w-4" />}
                    Force approve &amp; transmit to Barclays
                  </Button>
                </div>
              )}
              {s.status === "transmitted" && (
                <div className="flex flex-col gap-2 rounded-lg border border-border p-3 sm:flex-row sm:items-end">
                  <div className="flex flex-1 flex-col gap-1">
                    <Label htmlFor={`ref-${s.id}`} className="text-xs">
                      Issued instrument reference (when Barclays delivers)
                    </Label>
                    <Input
                      id={`ref-${s.id}`}
                      className="text-base"
                      value={refs[s.id] ?? ""}
                      onChange={(e) => setRefs((r) => ({ ...r, [s.id]: e.target.value }))}
                      placeholder="e.g. BG-BARC-2026-0001"
                    />
                  </div>
                  <Button
                    size="sm"
                    variant="secondary"
                    disabled={busy || !(refs[s.id] ?? "").trim()}
                    onClick={() => run(s.id, { op: "issued", instrumentRef: refs[s.id] }, "Marked as issued")}
                  >
                    <Stamp className="mr-2 h-4 w-4" />
                    Mark issued
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        )
      })}
    </div>
  )
}
