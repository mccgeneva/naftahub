"use client"

import { useRef, useState } from "react"
import useSWR from "swr"
import { upload } from "@vercel/blob/client"
import { toast } from "sonner"
import { CheckCircle2, FileSearch, Loader2, RefreshCw, Send, ShieldAlert, Upload, Wand2, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  VERBIAGE_FIELDS,
  fieldsFromAnalysis,
  missingFieldKeys,
  type VerbiageFieldValues,
} from "@/lib/verbiage-fields"
import { Badge } from "@/components/ui/badge"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import {
  VERBIAGE_STATUS_LABELS,
  VERBIAGE_VERDICT_LABELS,
  type VerbiageAnalysis,
} from "@/lib/verbiage-types"

type Submission = {
  id: string
  fileName: string
  status: string
  analysis: VerbiageAnalysis
  transmittedAt: string | null
  issuedInstrumentRef: string | null
  adminNote: string | null
  correctedText?: string | null
  revision?: number
  overrideReason?: string | null
  createdAt: string
}

const placeholdersIn = (t: string) => Array.from(new Set(t.match(/\[[A-Z0-9][A-Z0-9 /&.,'()-]{1,60}\]/g) ?? []))

const fetcher = async (url: string) => {
  const res = await fetch(url, { cache: "no-store" })
  const json = await res.json().catch(() => ({}))
  return (json.submissions ?? []) as Submission[]
}

function money(a: VerbiageAnalysis) {
  if (!a.faceValue) return "—"
  const n = Number(a.faceValue)
  return `${a.currency} ${Number.isFinite(n) ? n.toLocaleString("en-US") : a.faceValue}`
}

function verdictClass(v: VerbiageAnalysis["verdict"]) {
  if (v === "ready") return "bg-emerald-500/15 text-emerald-600 border-emerald-500/30"
  if (v === "needs_revision") return "bg-amber-500/15 text-amber-600 border-amber-500/30"
  return "bg-destructive/15 text-destructive border-destructive/30"
}

function Report({ a }: { a: VerbiageAnalysis }) {
  const rows: [string, string][] = [
    ["Instrument", [a.instrumentType, a.swiftMessageType && `(${a.swiftMessageType})`].filter(Boolean).join(" ") || "—"],
    ["Issuing bank", [a.issuingBank, a.issuingBankBic].filter(Boolean).join(" · ") || "—"],
    ["Applicant", a.applicant || "—"],
    ["Beneficiary", [a.beneficiary, a.beneficiaryBank].filter(Boolean).join(" · ") || "—"],
    ["Face value", money(a)],
    ["Tenor / expiry", [a.tenor, a.expiryDate].filter(Boolean).join(" · ") || "—"],
    ["Governing rules", a.governingRules || "—"],
    ["Payment terms", a.paymentTerms || "—"],
  ]
  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-3 rounded-lg border border-border p-3">
        <div className="min-w-0">
          <p className="text-xs text-muted-foreground">Readiness score</p>
          <p className="text-2xl font-semibold tabular-nums">{a.complianceScore}/100</p>
        </div>
        <Badge variant="outline" className={verdictClass(a.verdict)}>
          {VERBIAGE_VERDICT_LABELS[a.verdict]}
        </Badge>
      </div>
      <p className="text-sm leading-relaxed text-pretty">{a.summary}</p>
      <dl className="flex flex-col divide-y divide-border rounded-lg border border-border">
        {rows.map(([k, v]) => (
          <div key={k} className="flex flex-col gap-0.5 px-3 py-2 sm:flex-row sm:justify-between sm:gap-4">
            <dt className="text-xs text-muted-foreground">{k}</dt>
            <dd className="text-sm break-words sm:text-right">{v}</dd>
          </div>
        ))}
      </dl>
      {a.keyClauses.length > 0 && (
        <section className="flex flex-col gap-1">
          <h4 className="text-sm font-medium">Operative clauses</h4>
          <ol className="list-decimal pl-5 text-sm leading-relaxed text-muted-foreground">
            {a.keyClauses.map((c, i) => (
              <li key={i}>{c}</li>
            ))}
          </ol>
        </section>
      )}
      {a.missingElements.length > 0 && (
        <section className="flex flex-col gap-1">
          <h4 className="text-sm font-medium text-amber-600">Missing elements</h4>
          <ul className="list-disc pl-5 text-sm leading-relaxed">
            {a.missingElements.map((c, i) => (
              <li key={i}>{c}</li>
            ))}
          </ul>
        </section>
      )}
      {a.risks.length > 0 && (
        <section className="flex flex-col gap-1">
          <h4 className="text-sm font-medium text-destructive">Risks &amp; problem wording</h4>
          <ul className="list-disc pl-5 text-sm leading-relaxed">
            {a.risks.map((c, i) => (
              <li key={i}>{c}</li>
            ))}
          </ul>
        </section>
      )}
    </div>
  )
}

export function VerbiageReviewDialog() {
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState<"idle" | "uploading" | "analysing" | "approving" | "fixing" | "rechecking">(
    "idle",
  )
  const [current, setCurrentState] = useState<Submission | null>(null)
  const [draft, setDraft] = useState("")
  const [overrideReason, setOverrideReason] = useState("")
  const [fieldValues, setFieldValues] = useState<VerbiageFieldValues>(() =>
    Object.fromEntries(VERBIAGE_FIELDS.map((f) => [f.key, ""])) as VerbiageFieldValues,
  )
  const [showMissing, setShowMissing] = useState(false)
  const setCurrent = (s: Submission | null) => {
    setCurrentState(s)
    setDraft(s?.correctedText ?? "")
    if (s) setFieldValues(fieldsFromAnalysis(s.analysis))
    setShowMissing(false)
  }
  const fileRef = useRef<HTMLInputElement>(null)
  const { data: history = [], mutate } = useSWR(open ? "/api/instruments/verbiage" : null, fetcher)

  async function handleFile(file: File) {
    setCurrent(null)
    let blobPathname: string | null = null
    try {
      setBusy("uploading")
      const blob = await upload(`verbiage/${Date.now()}-${file.name}`, file, {
        access: "public",
        handleUploadUrl: "/api/instruments/verbiage/blob-upload",
        abortSignal: AbortSignal.timeout(60000),
      })
      blobPathname = blob.pathname
    } catch {
      // Original copy is optional; analysis can still proceed.
    }
    try {
      setBusy("analysing")
      const fd = new FormData()
      fd.append("file", file)
      if (blobPathname) fd.append("blobPathname", blobPathname)
      const res = await fetch("/api/instruments/verbiage", {
        method: "POST",
        body: fd,
        signal: AbortSignal.timeout(95000),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok || !json.ok) throw new Error(json.error || "Analysis failed.")
      setCurrent(json.submission)
      mutate()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Analysis failed.")
    } finally {
      setBusy("idle")
      if (fileRef.current) fileRef.current.value = ""
    }
  }

  async function decide(op: "approve" | "withdraw") {
    if (!current) return
    setBusy("approving")
    try {
      const res = await fetch("/api/instruments/verbiage", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: current.id, op }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok || !json.ok) throw new Error(json.error || "Action failed.")
      setCurrent(json.submission)
      mutate()
      if (op === "approve") {
        toast.success(
          json.transmitted ? "Approved and sent to Barclays for execution" : "Approved — queued for Barclays",
          {
            description: json.transmitted
              ? "You'll be notified when the instrument is issued."
              : "The administrator will transmit it to Barclays shortly.",
          },
        )
      } else {
        toast.success("Submission withdrawn")
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Action failed.")
    } finally {
      setBusy("idle")
    }
  }

  async function override(op: "request-override" | "cancel-override") {
    if (!current) return
    setBusy("approving")
    try {
      const res = await fetch("/api/instruments/verbiage", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: current.id, op, text: op === "request-override" ? overrideReason : undefined }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok || !json.ok) throw new Error(json.error || "Action failed.")
      setCurrent(json.submission)
      mutate()
      setOverrideReason("")
      toast.success(op === "request-override" ? "Force approval requested" : "Request cancelled", {
        description:
          op === "request-override"
            ? "The administrator will review it. If approved, it's sent to Barclays and you'll be notified."
            : undefined,
      })
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Action failed.")
    } finally {
      setBusy("idle")
    }
  }

  async function revise(op: "autofix" | "recheck") {
    if (!current) return
    setBusy(op === "autofix" ? "fixing" : "rechecking")
    try {
      const res = await fetch("/api/instruments/verbiage", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: current.id, op, text: op === "recheck" ? draft : undefined }),
        signal: AbortSignal.timeout(175000),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok || !json.ok) throw new Error(json.error || "Action failed.")
      setCurrent(json.submission)
      mutate()
      const left: string[] = json.placeholders ?? []
      const verdict = json.submission?.analysis?.verdict as VerbiageAnalysis["verdict"] | undefined
      toast.success(op === "autofix" ? "Corrected wording drafted" : "Wording re-checked", {
        description: left.length
          ? `Fill in ${left.length} missing detail${left.length > 1 ? "s" : ""} below, then tap Re-check.`
          : verdict
            ? `New verdict: ${VERBIAGE_VERDICT_LABELS[verdict]}.`
            : undefined,
      })
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Action failed.")
    } finally {
      setBusy("idle")
    }
  }

  async function completeFields() {
    if (!current) return
    const missing = missingFieldKeys(fieldValues)
    if (missing.length) {
      setShowMissing(true)
      toast.error(`Fill in ${missing.length} missing detail${missing.length > 1 ? "s" : ""} first.`)
      return
    }
    setBusy("fixing")
    try {
      const res = await fetch("/api/instruments/verbiage", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: current.id, op: "complete", fields: fieldValues }),
        signal: AbortSignal.timeout(170000),
      })
      const json = await res.json().catch(() => ({}))
      if (json.submission) {
        setCurrentState(json.submission)
        setDraft(json.submission.correctedText ?? "")
        mutate()
      }
      if (!res.ok || !json.ok) throw new Error(json.error || "Could not apply the details.")
      const verdict = json.submission?.analysis?.verdict as VerbiageAnalysis["verdict"] | undefined
      toast.success("Document completed and re-checked", {
        description: verdict ? `New verdict: ${VERBIAGE_VERDICT_LABELS[verdict]}.` : undefined,
      })
    } catch (err) {
      const timedOut = err instanceof DOMException && (err.name === "TimeoutError" || err.name === "AbortError")
      toast.error(timedOut ? "The check took too long. Please try again." : err instanceof Error ? err.message : "Failed.")
    } finally {
      setBusy("idle")
    }
  }

  const working = busy !== "idle"
  const editing = current?.status === "analyzed"
  const pendingPlaceholders = placeholdersIn(draft)
  const draftChanged = !!current && draft.trim() !== (current.correctedText ?? "").trim()
  const approveBlocked =
    !current ||
    current.analysis.verdict === "not_issuable" ||
    (!!current.correctedText && (pendingPlaceholders.length > 0 || draftChanged))

  return (
    <>
      <Button size="sm" onClick={() => setOpen(true)}>
        <FileSearch className="mr-2 h-4 w-4" />
        Verify verbiage
      </Button>
      <Dialog open={open} onOpenChange={(v) => !working && setOpen(v)}>
        <DialogContent className="flex max-h-[88dvh] max-w-lg flex-col overflow-hidden">
          <DialogHeader className="shrink-0">
            <DialogTitle>Verify &amp; authorize verbiage</DialogTitle>
            <DialogDescription>
              Upload the draft wording of a bank instrument. We check it, show you a report, and once you approve it
              it&apos;s sent to Barclays Bank PLC for execution.
            </DialogDescription>
          </DialogHeader>

          <div className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto pr-1">
            <input
              ref={fileRef}
              type="file"
              accept="application/pdf,image/png,image/jpeg,image/webp"
              className="sr-only"
              aria-label="Verbiage document"
              onChange={(e) => {
                const f = e.target.files?.[0]
                if (f) void handleFile(f)
              }}
            />
            {!current && (
              <button
                type="button"
                disabled={working}
                onClick={() => fileRef.current?.click()}
                className="flex min-h-36 flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed border-border p-6 text-center transition-colors hover:bg-muted/50 disabled:opacity-70"
              >
                {working ? (
                  <>
                    <Loader2 className="h-6 w-6 animate-spin text-primary" />
                    <span className="text-sm font-medium">
                      {busy === "uploading" ? "Uploading…" : "Analysing the verbiage…"}
                    </span>
                    <span className="text-xs text-muted-foreground">This can take up to a minute.</span>
                  </>
                ) : (
                  <>
                    <Upload className="h-6 w-6 text-primary" />
                    <span className="text-sm font-medium">Upload verbiage PDF</span>
                    <span className="text-xs text-muted-foreground">PDF or image, up to 15 MB</span>
                  </>
                )}
              </button>
            )}

            {current && (
              <div className="flex flex-col gap-3">
                <div className="flex items-center justify-between gap-2">
                  <p className="min-w-0 truncate text-sm font-medium">{current.fileName}</p>
                  <Badge variant="secondary">{VERBIAGE_STATUS_LABELS[current.status] ?? current.status}</Badge>
                </div>
                <Report a={current.analysis} />
                {editing && current.analysis.verdict !== "ready" && (
                  <section className="flex flex-col gap-3 rounded-lg border border-primary/30 bg-primary/5 p-3">
                    <div className="flex flex-col gap-1">
                      <h4 className="text-sm font-medium">Complete the missing details</h4>
                      <p className="text-sm leading-relaxed text-muted-foreground">
                        We prefilled what we found. Fill in each empty field, then tap Apply — we build the
                        bank-standard wording from your details and check it again.
                      </p>
                      {missingFieldKeys(fieldValues).length > 0 && (
                        <p className="text-sm font-medium text-amber-600">
                          {missingFieldKeys(fieldValues).length} field
                          {missingFieldKeys(fieldValues).length > 1 ? "s" : ""} still missing
                        </p>
                      )}
                    </div>
                    <div className="flex flex-col gap-3">
                      {VERBIAGE_FIELDS.map((f) => {
                        const empty = !fieldValues[f.key].trim()
                        const id = `vf-${f.key}`
                        return (
                          <div key={f.key} className="flex flex-col gap-1.5">
                            <Label htmlFor={id} className="flex items-center justify-between gap-2 text-sm">
                              <span>{f.label}</span>
                              {empty && (
                                <span className="text-xs font-medium text-amber-600">Missing</span>
                              )}
                            </Label>
                            <Input
                              id={id}
                              value={fieldValues[f.key]}
                              placeholder={f.placeholder}
                              inputMode={f.inputMode ?? "text"}
                              disabled={working}
                              aria-invalid={showMissing && empty}
                              onChange={(e) => setFieldValues((prev) => ({ ...prev, [f.key]: e.target.value }))}
                              className={`min-h-11 text-base ${showMissing && empty ? "border-amber-500" : ""}`}
                              autoComplete="off"
                              autoCorrect="off"
                              spellCheck={false}
                              data-1p-ignore
                              data-lpignore="true"
                            />
                          </div>
                        )
                      })}
                    </div>
                    <Button className="min-h-11 w-full" disabled={working} onClick={completeFields}>
                      {busy === "fixing" ? (
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      ) : (
                        <Wand2 className="mr-2 h-4 w-4" />
                      )}
                      <span>{busy === "fixing" ? "Applying & checking…" : "Apply details & re-check"}</span>
                    </Button>
                  </section>
                )}
                {false && (
                  <div className="flex flex-col gap-3 rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm">
                    <div className="flex gap-2">
                      <ShieldAlert className="h-4 w-4 shrink-0 text-destructive" />
                      <span className="leading-relaxed">
                        {current.analysis.verdict === "not_issuable"
                          ? "This wording can't be issued as it stands."
                          : "This wording needs revision before a bank will issue it."}{" "}
                        Auto-fix rewrites it to bank standard and checks it again. Anything we can&apos;t know, like
                        the issuing bank, is left as a [PLACEHOLDER] for you to fill in.
                      </span>
                    </div>
                    <Button className="min-h-11 w-full" disabled={working} onClick={() => revise("autofix")}>
                      {busy === "fixing" ? (
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      ) : (
                        <Wand2 className="mr-2 h-4 w-4" />
                      )}
                      {busy === "fixing" ? "Correcting and re-checking…" : "Auto-fix wording"}
                    </Button>
                  </div>
                )}

                {current.correctedText && (
                  <section className="flex flex-col gap-2">
                    <div className="flex items-center justify-between gap-2">
                      <h4 className="text-sm font-medium">Corrected wording</h4>
                      {current.revision ? (
                        <Badge variant="outline" className="shrink-0">
                          Revision {current.revision}
                        </Badge>
                      ) : null}
                    </div>
                    {editing && pendingPlaceholders.length > 0 && (
                      <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-sm leading-relaxed">
                        <p className="font-medium text-amber-600">
                          Replace {pendingPlaceholders.length} placeholder
                          {pendingPlaceholders.length > 1 ? "s" : ""} with the real details:
                        </p>
                        <p className="mt-1 break-words font-mono text-xs">{pendingPlaceholders.join("  ")}</p>
                      </div>
                    )}
                    <Textarea
                      value={draft}
                      onChange={(e) => setDraft(e.target.value)}
                      readOnly={!editing || working}
                      rows={12}
                      className="min-h-64 font-mono text-base leading-relaxed sm:text-sm"
                      aria-label="Corrected verbiage wording"
                      autoCorrect="off"
                      autoCapitalize="off"
                      spellCheck={false}
                    />
                    {editing && (
                      <div className="flex flex-col gap-2 sm:flex-row">
                        <Button
                          variant="outline"
                          className="min-h-11 flex-1"
                          disabled={working || draft.trim().length < 40}
                          onClick={() => revise("recheck")}
                        >
                          {busy === "rechecking" ? (
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          ) : (
                            <RefreshCw className="mr-2 h-4 w-4" />
                          )}
                          Re-check wording
                        </Button>

                      </div>
                    )}
                    {editing && draftChanged && (
                      <p className="text-xs text-muted-foreground">
                        You edited the wording. Tap Re-check before approving.
                      </p>
                    )}
                  </section>
                )}

                {editing && approveBlocked && (
                  <section className="flex flex-col gap-2 rounded-lg border border-border p-3">
                    <h4 className="text-sm font-medium">Ask the administrator to force-approve</h4>
                    <p className="text-sm leading-relaxed text-muted-foreground">
                      If you believe this wording should go to Barclays as it is, explain why. The administrator
                      reviews the report and decides. Nothing is sent until they approve it.
                    </p>
                    <Textarea
                      value={overrideReason}
                      onChange={(e) => setOverrideReason(e.target.value)}
                      rows={3}
                      maxLength={1500}
                      placeholder="e.g. The issuing bank has pre-approved this wording; details agreed by phone."
                      className="text-base sm:text-sm"
                      aria-label="Reason for force approval"
                    />
                    <Button
                      variant="secondary"
                      className="min-h-11 w-full"
                      disabled={working || overrideReason.trim().length < 10}
                      onClick={() => override("request-override")}
                    >
                      <ShieldAlert className="mr-2 h-4 w-4" />
                      Request force approval
                    </Button>
                  </section>
                )}

                {current.status === "override_requested" && (
                  <div className="flex flex-col gap-3 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-sm">
                    <p className="leading-relaxed">
                      <span className="font-medium">Awaiting the administrator.</span> If they approve it, it&apos;s
                      sent to Barclays automatically and you&apos;ll be notified.
                    </p>
                    {current.overrideReason && (
                      <p className="break-words text-muted-foreground">Your reason: {current.overrideReason}</p>
                    )}
                    <Button
                      variant="outline"
                      className="min-h-11 w-full"
                      disabled={working}
                      onClick={() => override("cancel-override")}
                    >
                      Cancel request
                    </Button>
                  </div>
                )}
              </div>
            )}

            {!current && history.length > 0 && (
              <section className="flex flex-col gap-2">
                <h4 className="text-sm font-medium">My submissions</h4>
                <ul className="flex flex-col divide-y divide-border rounded-lg border border-border">
                  {history.map((s) => (
                    <li key={s.id}>
                      <button
                        type="button"
                        onClick={() => setCurrent(s)}
                        className="flex min-h-11 w-full items-center justify-between gap-3 px-3 py-2 text-left hover:bg-muted/50"
                      >
                        <span className="min-w-0">
                          <span className="block truncate text-sm">
                            {s.analysis.instrumentType || "Instrument"} · {money(s.analysis)}
                          </span>
                          <span className="block text-xs text-muted-foreground">
                            {new Date(s.createdAt).toLocaleDateString()}
                            {s.issuedInstrumentRef ? ` · Ref ${s.issuedInstrumentRef}` : ""}
                          </span>
                        </span>
                        <Badge variant="outline" className="shrink-0">
                          {VERBIAGE_STATUS_LABELS[s.status] ?? s.status}
                        </Badge>
                      </button>
                    </li>
                  ))}
                </ul>
              </section>
            )}
          </div>

          <DialogFooter className="shrink-0 gap-2 border-t border-border pt-4 sm:gap-2">
            {current?.status === "analyzed" ? (
              <>
                <Button variant="outline" disabled={working} onClick={() => decide("withdraw")}>
                  <X className="mr-2 h-4 w-4" />
                  Discard
                </Button>
                <Button disabled={working || approveBlocked} onClick={() => decide("approve")}>
                  {busy === "approving" ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <Send className="mr-2 h-4 w-4" />
                  )}
                  Approve &amp; send to Barclays
                </Button>
              </>
            ) : current ? (
              <>
                <Button variant="outline" onClick={() => setCurrent(null)}>
                  Back
                </Button>
                {current.status === "transmitted" || current.status === "issued" ? (
                  <Button disabled variant="secondary">
                    <CheckCircle2 className="mr-2 h-4 w-4" />
                    {current.status === "issued" ? "Issued" : "Sent to Barclays"}
                  </Button>
                ) : null}
              </>
            ) : (
              <Button variant="outline" disabled={working} onClick={() => setOpen(false)}>
                Close
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
