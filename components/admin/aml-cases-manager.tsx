"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { upload } from "@vercel/blob/client"
import { toast } from "sonner"
import {
  ArrowLeft,
  CheckCircle2,
  FileText,
  Loader2,
  Plus,
  Scale,
  Search,
  Sparkles,
  Trash2,
  Upload,
} from "lucide-react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { blobFileUrl } from "@/lib/kyc-types"
import { downloadFile } from "@/lib/download-file"
import type {
  AmlCase,
  AmlCaseStatus,
  AmlDocument,
  AmlMeasure,
  AmlMeasureCategory,
  AmlMeasureStatus,
  AmlRiskLevel,
  AmlSource,
} from "@/lib/aml-cases-db"

type Client = { id: string; label: string; email: string }

const SOURCE_LABEL: Record<AmlSource, string> = {
  auditor: "External auditor",
  compliance_office: "Compliance office",
  regulator: "Regulator",
  bank_partner: "Partner bank",
  other: "Other",
}
const RISK_LABEL: Record<AmlRiskLevel, string> = { low: "Low", medium: "Medium", high: "High", critical: "Critical" }
const RISK_CLASS: Record<AmlRiskLevel, string> = {
  low: "bg-muted text-muted-foreground",
  medium: "bg-primary/15 text-primary",
  high: "bg-destructive/15 text-destructive",
  critical: "bg-destructive text-destructive-foreground",
}
const STATUS_LABEL: Record<AmlCaseStatus, string> = {
  open: "Open",
  under_review: "Under review",
  actions_in_progress: "Actions in progress",
  reported: "Reported to authority",
  closed: "Closed",
}
const CATEGORY_LABEL: Record<AmlMeasureCategory, string> = {
  enhanced_due_diligence: "Enhanced due diligence",
  request_documents: "Request documents",
  restrict_outgoing: "Restrict outgoing payments",
  freeze_account: "Freeze account",
  monitor_transactions: "Monitor transactions",
  file_sar: "File suspicious activity report",
  close_account: "Close account",
  other: "Other",
}
const MEASURE_STATUS_LABEL: Record<AmlMeasureStatus, string> = {
  planned: "Planned",
  in_progress: "In progress",
  done: "Done",
  cancelled: "Cancelled",
}

type Draft = {
  id?: string
  userId: string
  subject: string
  source: AmlSource
  authorName: string
  letterReference: string
  letterDate: string
  riskLevel: AmlRiskLevel
  status: AmlCaseStatus
  summary: string
  findings: string
  documents: AmlDocument[]
  measures: Array<Partial<AmlMeasure> & { key: string }>
}

let keySeq = 0
const nextKey = () => `m${Date.now()}-${keySeq++}`

function emptyDraft(): Draft {
  return {
    userId: "",
    subject: "",
    source: "auditor",
    authorName: "",
    letterReference: "",
    letterDate: "",
    riskLevel: "medium",
    status: "open",
    summary: "",
    findings: "",
    documents: [],
    measures: [],
  }
}

function draftFromCase(c: AmlCase): Draft {
  return {
    id: c.id,
    userId: c.userId,
    subject: c.subject,
    source: c.source,
    authorName: c.authorName,
    letterReference: c.letterReference,
    letterDate: c.letterDate ?? "",
    riskLevel: c.riskLevel,
    status: c.status,
    summary: c.summary,
    findings: c.findings,
    documents: c.documents,
    measures: c.measures.map((m) => ({ ...m, key: m.id })),
  }
}

function fmtDate(iso: string | null | undefined) {
  if (!iso) return "—"
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })
}

export function AmlCasesManager({ passcode }: { passcode: string }) {
  const [clients, setClients] = useState<Client[]>([])
  const [cases, setCases] = useState<AmlCase[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState("")
  const [statusFilter, setStatusFilter] = useState<"active" | "all" | "closed">("active")
  const [draft, setDraft] = useState<Draft | null>(null)
  const [note, setNote] = useState("")
  const [saving, setSaving] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [analyzing, setAnalyzing] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  const call = useCallback(
    async (payload: Record<string, unknown>) => {
      const res = await fetch("/api/admin/aml", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ passcode, ...payload }),
      })
      const data = await res.json().catch(() => ({ ok: false, error: "Unexpected response." }))
      if (!data.ok) throw new Error(data.error || "Request failed.")
      return data
    },
    [passcode],
  )

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const data = await call({ op: "list" })
      setClients(data.clients)
      setCases(data.cases)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not load AML cases.")
    } finally {
      setLoading(false)
    }
  }, [call])

  useEffect(() => {
    void load()
  }, [load])

  const visible = useMemo(() => {
    const q = filter.trim().toLowerCase()
    return cases.filter((c) => {
      if (statusFilter === "active" && c.status === "closed") return false
      if (statusFilter === "closed" && c.status !== "closed") return false
      if (!q) return true
      return [c.holderLabel, c.subject, c.letterReference, c.id].some((v) => v.toLowerCase().includes(q))
    })
  }, [cases, filter, statusFilter])

  const openCount = cases.filter((c) => c.status !== "closed").length

  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setDraft((d) => (d ? { ...d, [k]: v } : d))

  async function analyze(pathname: string) {
    setAnalyzing(true)
    try {
      const { extraction } = await call({ op: "analyze", pathname })
      setDraft((d) => {
        if (!d) return d
        const proposed = (extraction.measures ?? []) as Array<{ category: AmlMeasureCategory; text: string; dueDate: string }>
        return {
          ...d,
          subject: d.subject || extraction.subject,
          source: extraction.source ?? d.source,
          authorName: d.authorName || extraction.authorName,
          letterReference: d.letterReference || extraction.letterReference,
          letterDate: d.letterDate || extraction.letterDate,
          riskLevel: extraction.riskLevel ?? d.riskLevel,
          summary: d.summary || extraction.summary,
          findings: d.findings || extraction.findings,
          measures: [
            ...d.measures,
            ...proposed
              .filter((m) => m.text && !d.measures.some((x) => x.text === m.text))
              .map((m) => ({
                key: nextKey(),
                category: m.category,
                text: m.text,
                dueDate: m.dueDate || null,
                status: "planned" as AmlMeasureStatus,
                assignee: "",
              })),
          ],
        }
      })
      toast.success("Letter analysed — review the proposed findings and measures.")
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not analyse the letter. Fill the case in manually.")
    } finally {
      setAnalyzing(false)
    }
  }

  async function handleFile(file: File) {
    setUploading(true)
    try {
      const safe = file.name.replace(/[^\w.\-]+/g, "_").slice(-80)
      const blob = await upload(`aml/${draft?.userId || "unassigned"}/${Date.now()}-${safe}`, file, {
        access: "public",
        handleUploadUrl: "/api/admin/aml/blob-upload",
        clientPayload: JSON.stringify({ passcode }),
        abortSignal: AbortSignal.timeout(90000),
      })
      const doc: AmlDocument = {
        pathname: blob.pathname,
        name: file.name,
        contentType: file.type || "application/octet-stream",
        sizeBytes: file.size,
        uploadedAt: new Date().toISOString(),
        uploadedBy: "Administrator",
      }
      setDraft((d) => (d ? { ...d, documents: [...d.documents, doc] } : d))
      toast.success(`${file.name} uploaded`)
      if (file.type === "application/pdf" || file.type.startsWith("image/")) void analyze(blob.pathname)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Upload failed.")
    } finally {
      setUploading(false)
      if (fileRef.current) fileRef.current.value = ""
    }
  }

  async function save() {
    if (!draft) return
    if (!draft.userId) {
      toast.error("Choose the customer this letter concerns.")
      return
    }
    setSaving(true)
    try {
      const { case: saved } = await call({
        op: "save",
        note,
        case: { ...draft, measures: draft.measures.map(({ key: _key, ...m }) => m) },
      })
      setCases((prev) => [saved, ...prev.filter((c) => c.id !== saved.id)])
      setDraft(draftFromCase(saved))
      setNote("")
      toast.success("AML case saved")
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not save the case.")
    } finally {
      setSaving(false)
    }
  }

  async function remove() {
    if (!draft?.id) return
    if (!window.confirm("Delete this AML case and its record? This cannot be undone.")) return
    try {
      await call({ op: "delete", id: draft.id })
      setCases((prev) => prev.filter((c) => c.id !== draft.id))
      setDraft(null)
      toast.success("Case deleted")
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not delete the case.")
    }
  }

  const updateMeasure = (key: string, patch: Partial<AmlMeasure>) =>
    setDraft((d) => (d ? { ...d, measures: d.measures.map((m) => (m.key === key ? { ...m, ...patch } : m)) } : d))

  // ---------------------------------------------------------------- editor --
  if (draft) {
    const current = draft.id ? cases.find((c) => c.id === draft.id) : undefined
    const done = draft.measures.filter((m) => m.status === "done").length
    return (
      <div className="flex flex-col gap-4">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" className="h-11" onClick={() => setDraft(null)}>
            <ArrowLeft className="mr-1 h-4 w-4" /> Cases
          </Button>
          <span className="truncate text-sm text-muted-foreground">{draft.id ?? "New AML case"}</span>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Customer & letter</CardTitle>
            <CardDescription>
              Internal compliance record. Nothing here is shown or notified to the customer.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <Label>Customer</Label>
              <Select value={draft.userId} onValueChange={(v) => set("userId", v)} disabled={!!draft.id}>
                <SelectTrigger className="h-11 text-base">
                  <SelectValue placeholder="Choose the customer" />
                </SelectTrigger>
                <SelectContent>
                  {clients.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex flex-col gap-2">
              <Label>Letters from auditors / compliance office</Label>
              {draft.documents.length > 0 && (
                <ul className="flex flex-col gap-2">
                  {draft.documents.map((d) => (
                    <li key={d.pathname} className="flex items-center gap-2 rounded-md border border-border p-2">
                      <FileText className="h-5 w-5 shrink-0 text-muted-foreground" />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">{d.name}</p>
                        <p className="text-xs text-muted-foreground">{fmtDate(d.uploadedAt)}</p>
                      </div>
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-10"
                        onClick={() => downloadFile(blobFileUrl(d.pathname, passcode), d.name)}
                      >
                        Open
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-10 w-10"
                        aria-label="Analyse this letter"
                        disabled={analyzing}
                        onClick={() => analyze(d.pathname)}
                      >
                        <Sparkles className="h-4 w-4" />
                      </Button>
                    </li>
                  ))}
                </ul>
              )}
              <input
                ref={fileRef}
                type="file"
                accept=".pdf,.png,.jpg,.jpeg,.webp,.doc,.docx,application/pdf,image/*"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0]
                  if (f) void handleFile(f)
                }}
              />
              <Button
                variant="outline"
                className="h-11"
                disabled={uploading || analyzing}
                onClick={() => fileRef.current?.click()}
              >
                {uploading ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : analyzing ? (
                  <Sparkles className="mr-2 h-4 w-4 animate-pulse" />
                ) : (
                  <Upload className="mr-2 h-4 w-4" />
                )}
                {uploading ? "Uploading…" : analyzing ? "Reading the letter…" : "Upload letter (PDF, image, Word)"}
              </Button>
              <p className="text-xs leading-relaxed text-muted-foreground">
                PDFs and images are read automatically to propose the findings and measures. Always review before saving.
              </p>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="flex flex-col gap-2 sm:col-span-2">
                <Label htmlFor="aml-subject">Case title</Label>
                <Input
                  id="aml-subject"
                  className="h-11 text-base"
                  value={draft.subject}
                  onChange={(e) => set("subject", e.target.value)}
                  placeholder="e.g. Unexplained source of funds"
                />
              </div>
              <div className="flex flex-col gap-2">
                <Label>Issued by</Label>
                <Select value={draft.source} onValueChange={(v) => set("source", v as AmlSource)}>
                  <SelectTrigger className="h-11 text-base">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {(Object.keys(SOURCE_LABEL) as AmlSource[]).map((s) => (
                      <SelectItem key={s} value={s}>
                        {SOURCE_LABEL[s]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="aml-author">Firm / signatory</Label>
                <Input
                  id="aml-author"
                  className="h-11 text-base"
                  value={draft.authorName}
                  onChange={(e) => set("authorName", e.target.value)}
                />
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="aml-ref">Letter reference</Label>
                <Input
                  id="aml-ref"
                  className="h-11 text-base"
                  value={draft.letterReference}
                  onChange={(e) => set("letterReference", e.target.value)}
                />
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="aml-date">Letter date</Label>
                <Input
                  id="aml-date"
                  type="date"
                  className="h-11 text-base"
                  value={draft.letterDate}
                  onChange={(e) => set("letterDate", e.target.value)}
                />
              </div>
              <div className="flex flex-col gap-2">
                <Label>Risk level</Label>
                <Select value={draft.riskLevel} onValueChange={(v) => set("riskLevel", v as AmlRiskLevel)}>
                  <SelectTrigger className="h-11 text-base">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {(Object.keys(RISK_LABEL) as AmlRiskLevel[]).map((r) => (
                      <SelectItem key={r} value={r}>
                        {RISK_LABEL[r]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex flex-col gap-2">
                <Label>Case status</Label>
                <Select value={draft.status} onValueChange={(v) => set("status", v as AmlCaseStatus)}>
                  <SelectTrigger className="h-11 text-base">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {(Object.keys(STATUS_LABEL) as AmlCaseStatus[]).map((s) => (
                      <SelectItem key={s} value={s}>
                        {STATUS_LABEL[s]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="flex flex-col gap-2">
              <Label htmlFor="aml-summary">Summary of the letter</Label>
              <Textarea
                id="aml-summary"
                rows={3}
                className="text-base"
                value={draft.summary}
                onChange={(e) => set("summary", e.target.value)}
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="aml-findings">Findings / concerns raised</Label>
              <Textarea
                id="aml-findings"
                rows={5}
                className="text-base"
                value={draft.findings}
                onChange={(e) => set("findings", e.target.value)}
                placeholder="- One concern per line"
              />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Actions & measures on this account</CardTitle>
            <CardDescription>
              {draft.measures.length === 0
                ? "Add each action to be undertaken, who owns it and the deadline."
                : `${done} of ${draft.measures.length} completed`}
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            {draft.measures.map((m) => (
              <div
                key={m.key}
                className={`flex flex-col gap-3 rounded-lg border p-3 ${m.status === "done" ? "border-border opacity-70" : "border-border"}`}
              >
                <div className="flex items-start gap-2">
                  <Select
                    value={m.category ?? "other"}
                    onValueChange={(v) => updateMeasure(m.key, { category: v as AmlMeasureCategory })}
                  >
                    <SelectTrigger className="h-11 flex-1 text-base">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {(Object.keys(CATEGORY_LABEL) as AmlMeasureCategory[]).map((c) => (
                        <SelectItem key={c} value={c}>
                          {CATEGORY_LABEL[c]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-11 w-11 shrink-0"
                    aria-label="Remove measure"
                    onClick={() => set("measures", draft.measures.filter((x) => x.key !== m.key))}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
                <Textarea
                  rows={2}
                  className="text-base"
                  value={m.text ?? ""}
                  onChange={(e) => updateMeasure(m.key, { text: e.target.value })}
                  placeholder="Describe the action to undertake"
                />
                <div className="grid grid-cols-2 gap-2">
                  <Input
                    className="h-11 text-base"
                    value={m.assignee ?? ""}
                    onChange={(e) => updateMeasure(m.key, { assignee: e.target.value })}
                    placeholder="Owner"
                    aria-label="Owner"
                  />
                  <Input
                    type="date"
                    className="h-11 text-base"
                    value={m.dueDate ?? ""}
                    onChange={(e) => updateMeasure(m.key, { dueDate: e.target.value || null })}
                    aria-label="Deadline"
                  />
                </div>
                <div className="flex flex-wrap gap-2">
                  {(Object.keys(MEASURE_STATUS_LABEL) as AmlMeasureStatus[]).map((s) => (
                    <Button
                      key={s}
                      size="sm"
                      variant={m.status === s ? "default" : "outline"}
                      className="h-10"
                      onClick={() => updateMeasure(m.key, { status: s })}
                    >
                      {s === "done" && <CheckCircle2 className="mr-1 h-4 w-4" />}
                      {MEASURE_STATUS_LABEL[s]}
                    </Button>
                  ))}
                </div>
              </div>
            ))}
            <Button
              variant="outline"
              className="h-11"
              onClick={() =>
                set("measures", [
                  ...draft.measures,
                  { key: nextKey(), category: "other", text: "", status: "planned", assignee: "", dueDate: null },
                ])
              }
            >
              <Plus className="mr-2 h-4 w-4" /> Add measure
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Case log</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            {current && current.timeline.length > 0 ? (
              <ol className="flex flex-col gap-2">
                {[...current.timeline].reverse().map((t, i) => (
                  <li key={`${t.at}-${i}`} className="border-l-2 border-border pl-3">
                    <p className="text-sm leading-relaxed">{t.text}</p>
                    <p className="text-xs text-muted-foreground">
                      {fmtDate(t.at)} · {t.by}
                    </p>
                  </li>
                ))}
              </ol>
            ) : (
              <p className="text-sm text-muted-foreground">The log starts when the case is saved.</p>
            )}
            <Textarea
              rows={2}
              className="text-base"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Add a note to the log (saved with the case)"
            />
          </CardContent>
        </Card>

        <div className="flex flex-col gap-2 sm:flex-row">
          <Button className="h-12 flex-1" disabled={saving || uploading} onClick={save}>
            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {draft.id ? "Save case" : "Open case"}
          </Button>
          {draft.id && (
            <Button variant="outline" className="h-12 text-destructive" onClick={remove}>
              <Trash2 className="mr-2 h-4 w-4" /> Delete
            </Button>
          )}
        </div>
      </div>
    )
  }

  // ------------------------------------------------------------------ list --
  return (
    <Card>
      <CardHeader>
        <div className="flex items-start gap-3">
          <Scale className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
          <div className="min-w-0 flex-1">
            <CardTitle className="text-base">AML Compliance</CardTitle>
            <CardDescription className="leading-relaxed">
              Upload letters from the auditors and compliance office about a customer, and record the actions and
              measures to undertake on that account. {openCount > 0 && `${openCount} open case${openCount === 1 ? "" : "s"}.`}
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <Button className="h-11" onClick={() => setDraft(emptyDraft())}>
          <Plus className="mr-2 h-4 w-4" /> New AML case
        </Button>
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="h-11 pl-9 text-base"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="Search customer, title or reference"
          />
        </div>
        <div className="flex gap-2">
          {(["active", "closed", "all"] as const).map((f) => (
            <Button
              key={f}
              size="sm"
              variant={statusFilter === f ? "default" : "outline"}
              className="h-10 flex-1"
              onClick={() => setStatusFilter(f)}
            >
              {f === "active" ? "Open" : f === "closed" ? "Closed" : "All"}
            </Button>
          ))}
        </div>

        {loading ? (
          <div className="flex justify-center py-8">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : visible.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">No AML cases here.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {visible.map((c) => {
              const done = c.measures.filter((m) => m.status === "done").length
              return (
                <li key={c.id}>
                  <button
                    type="button"
                    onClick={() => {
                      setDraft(draftFromCase(c))
                      setNote("")
                    }}
                    className="flex w-full flex-col gap-2 rounded-lg border border-border p-3 text-left transition-colors hover:bg-muted/50"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <p className="min-w-0 flex-1 font-medium leading-snug">{c.holderLabel}</p>
                      <Badge className={RISK_CLASS[c.riskLevel]}>{RISK_LABEL[c.riskLevel]}</Badge>
                    </div>
                    <p className="text-sm leading-relaxed text-muted-foreground">{c.subject}</p>
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                      <span>{STATUS_LABEL[c.status]}</span>
                      <span>{SOURCE_LABEL[c.source]}</span>
                      <span>
                        {done}/{c.measures.length} measures done
                      </span>
                      <span>
                        {c.documents.length} letter{c.documents.length === 1 ? "" : "s"}
                      </span>
                      <span>Updated {fmtDate(c.updatedAt)}</span>
                    </div>
                  </button>
                </li>
              )
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  )
}
