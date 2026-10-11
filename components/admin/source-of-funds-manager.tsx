"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { upload } from "@vercel/blob/client"
import { toast } from "sonner"
import {
  CheckCircle2,
  FileDown,
  FileSearch,
  FileText,
  Loader2,
  PauseCircle,
  Plus,
  RotateCcw,
  Undo2,
  Upload,
  X,
} from "lucide-react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Badge } from "@/components/ui/badge"
import { Checkbox } from "@/components/ui/checkbox"
import { MoneyInput } from "@/components/ui/money-input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { ADMIN_PASSCODE } from "@/lib/admin-config"
import { blobFileUrl } from "@/lib/kyc-types"
import { downloadFile } from "@/lib/download-file"
import { usePdfViewer } from "@/lib/pdf-viewer"
import { generateSourceOfFundsPdf } from "@/lib/source-of-funds-pdf"

type SofStatus = "open" | "cleared" | "hold" | "returned"
type DocKind =
  | "mt103"
  | "sender_passport"
  | "sender_address"
  | "sender_company"
  | "existing_contract"
  | "correspondence"
  | "delivery_evidence"
  | "other"

type SofDocument = { id: string; kind: DocKind; name: string; pathname: string; contentType: string; uploadedAt: string }
type Checklist = {
  senderIdentityVerified: boolean
  sanctionsScreened: boolean
  documentsMatchPayment: boolean
  amountFitsPurpose: boolean
  declarationSigned: boolean
}
type Declaration = { purpose: string; sourceOfFunds: string; relationship: string; signedBy: string; signedAt: string | null }

type SofFile = {
  id: string
  userId: string
  holderLabel: string
  amount: number
  currency: string
  valueDate: string | null
  senderName: string
  senderCountry: string
  senderBank: string
  senderAccount: string
  reference: string
  declaration: Declaration
  checklist: Checklist
  documents: SofDocument[]
  status: SofStatus
  decisionNote: string
  decidedAt: string | null
  createdAt: string
}

type Client = { id: string; fullName: string; company: string; email: string }

type Draft = Omit<SofFile, "id" | "status" | "decisionNote" | "decidedAt" | "createdAt" | "amount"> & { amount: string }

const EMPTY_DRAFT: Draft = {
  userId: "",
  holderLabel: "",
  amount: "",
  currency: "EUR",
  valueDate: "",
  senderName: "",
  senderCountry: "",
  senderBank: "",
  senderAccount: "",
  reference: "",
  declaration: { purpose: "", sourceOfFunds: "", relationship: "", signedBy: "", signedAt: "" },
  checklist: {
    senderIdentityVerified: false,
    sanctionsScreened: false,
    documentsMatchPayment: false,
    amountFitsPurpose: false,
    declarationSigned: false,
  },
  documents: [],
}

const DOC_KINDS: { id: DocKind; label: string }[] = [
  { id: "mt103", label: "SWIFT MT103 payment advice" },
  { id: "sender_passport", label: "Sender passport / ID" },
  { id: "sender_address", label: "Sender proof of address" },
  { id: "sender_company", label: "Sender company documents" },
  { id: "existing_contract", label: "Pre-existing contract / invoice" },
  { id: "correspondence", label: "Correspondence (emails, letters)" },
  { id: "delivery_evidence", label: "Evidence of goods / services delivered" },
  { id: "other", label: "Other supporting document" },
]
const docLabel = (k: DocKind) => DOC_KINDS.find((d) => d.id === k)?.label ?? k

const CHECKS: { key: keyof Checklist; label: string }[] = [
  { key: "senderIdentityVerified", label: "Sender identity verified against KYC documents" },
  { key: "sanctionsScreened", label: "Sender screened against sanctions / PEP lists" },
  { key: "documentsMatchPayment", label: "Supporting documents match the payment details" },
  { key: "amountFitsPurpose", label: "Amount is consistent with the stated purpose" },
  { key: "declarationSigned", label: "Source of Funds declaration signed by the sender" },
]

const STATUS_META: Record<SofStatus, { label: string; className: string }> = {
  open: { label: "Under review", className: "border-border text-muted-foreground" },
  hold: { label: "On hold", className: "border-amber-500/40 text-amber-600" },
  cleared: { label: "Cleared", className: "border-emerald-500/40 text-emerald-600" },
  returned: { label: "Return to sender", className: "border-destructive/40 text-destructive" },
}

const CURRENCIES = ["EUR", "USD", "GBP", "CHF"]

function fmtMoney(n: number, c: string) {
  return `${c} ${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

async function api<T>(payload: Record<string, unknown>): Promise<T & { ok: boolean; error?: string }> {
  const res = await fetch("/api/admin/source-of-funds", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...payload, pin: ADMIN_PASSCODE }),
    cache: "no-store",
  })
  return res.json()
}

export function SourceOfFundsManager() {
  const { show: showPdf } = usePdfViewer()
  const [files, setFiles] = useState<SofFile[]>([])
  const [clients, setClients] = useState<Client[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)

  const [editingId, setEditingId] = useState<string | null>(null)
  const [draft, setDraft] = useState<Draft | null>(null)
  const [saving, setSaving] = useState(false)

  const [uploadKind, setUploadKind] = useState<DocKind>("mt103")
  const [uploading, setUploading] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const kycInputRef = useRef<HTMLInputElement>(null)
  const [readingKyc, setReadingKyc] = useState(false)

  const [decisionNote, setDecisionNote] = useState("")
  const [deciding, setDeciding] = useState<SofStatus | null>(null)

  const load = useCallback(async () => {
    try {
      const res = await api<{ files: SofFile[]; clients: Client[] }>({ op: "list" })
      if (!res.ok) {
        setLoadError(res.error ?? "Could not load files.")
        return
      }
      setFiles(res.files)
      setClients(res.clients)
      setLoadError(null)
    } catch {
      setLoadError("Could not reach the server.")
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const current = useMemo(() => files.find((f) => f.id === editingId) ?? null, [files, editingId])
  const locked = !!current && (current.status === "cleared" || current.status === "returned")
  const openCount = files.filter((f) => f.status === "open" || f.status === "hold").length

  const startNew = () => {
    setEditingId(null)
    setDraft({ ...EMPTY_DRAFT, declaration: { ...EMPTY_DRAFT.declaration }, checklist: { ...EMPTY_DRAFT.checklist } })
    setDecisionNote("")
  }

  const openFile = (f: SofFile) => {
    setEditingId(f.id)
    setDraft({
      userId: f.userId,
      holderLabel: f.holderLabel,
      amount: String(f.amount),
      currency: f.currency,
      valueDate: f.valueDate ?? "",
      senderName: f.senderName,
      senderCountry: f.senderCountry,
      senderBank: f.senderBank,
      senderAccount: f.senderAccount,
      reference: f.reference,
      declaration: { ...f.declaration, signedAt: f.declaration.signedAt ?? "" },
      checklist: { ...f.checklist },
      documents: [...f.documents],
    })
    setDecisionNote(f.decisionNote)
  }

  const closeEditor = () => {
    setDraft(null)
    setEditingId(null)
  }

  const set = <K extends keyof Draft>(key: K, value: Draft[K]) => setDraft((d) => (d ? { ...d, [key]: value } : d))
  const setDecl = (key: keyof Declaration, value: string) =>
    setDraft((d) => (d ? { ...d, declaration: { ...d.declaration, [key]: value } } : d))
  const setCheck = (key: keyof Checklist, value: boolean) =>
    setDraft((d) => (d ? { ...d, checklist: { ...d.checklist, [key]: value } } : d))

  const selectClient = (id: string) => {
    const c = clients.find((x) => x.id === id)
    const label = c ? [c.fullName, c.company].filter(Boolean).join(" · ") || c.email : ""
    setDraft((d) => (d ? { ...d, userId: id, holderLabel: label } : d))
  }

  const readMt103 = async (file: File) => {
    try {
      const fd = new FormData()
      fd.append("file", file)
      const res = await fetch("/api/swift/extract", { method: "POST", body: fd, signal: AbortSignal.timeout(60000) })
      const data = (await res.json()) as {
        ok?: boolean
        data?: { currency?: string; amount?: string; reference?: string; senderBic?: string; applicant?: string }
      }
      if (!data.ok || !data.data) return
      const x = data.data
      setDraft((d) => {
        if (!d) return d
        return {
          ...d,
          amount: d.amount || (x.amount ?? "").replace(/[^0-9.]/g, ""),
          currency: x.currency && x.currency.length === 3 ? x.currency.toUpperCase() : d.currency,
          reference: d.reference || x.reference || "",
          senderBank: d.senderBank || x.senderBic || "",
          senderName: d.senderName || x.applicant || "",
        }
      })
      toast.success("MT103 read — payment details filled in. Check them before saving.")
    } catch {
      toast.message("Couldn't read the MT103 automatically — enter the details by hand.")
    }
  }

  const readSenderKyc = async (file: File) => {
    setReadingKyc(true)
    try {
      const fd = new FormData()
      fd.append("file", file)
      fd.append("passcode", ADMIN_PASSCODE)
      const res = await fetch("/api/admin/source-of-funds/extract-kyc", {
        method: "POST",
        body: fd,
        signal: AbortSignal.timeout(60000),
      })
      const data = (await res.json()) as {
        ok?: boolean
        error?: string
        data?: {
          fullName?: string
          companyName?: string
          country?: string
          bankName?: string
          bic?: string
          iban?: string
        }
      }
      if (!data.ok || !data.data) {
        toast.message(data.error ?? "Couldn't read the document — enter the sender details by hand.")
        return
      }
      const x = data.data
      const name = (x.companyName || x.fullName || "").trim()
      const bank = [x.bankName, x.bic].filter((v) => v && v.trim()).join(" · ")
      const filled: string[] = []
      setDraft((d) => {
        if (!d) return d
        const next = { ...d }
        if (name && !d.senderName) {
          next.senderName = name
          filled.push("name")
        }
        if (x.country && !d.senderCountry) {
          next.senderCountry = x.country.trim()
          filled.push("country")
        }
        if (bank && !d.senderBank) {
          next.senderBank = bank
          filled.push("bank")
        }
        if (x.iban && !d.senderAccount) {
          next.senderAccount = x.iban.trim()
          filled.push("account")
        }
        return next
      })
      toast.success(
        filled.length > 0
          ? `Sender ${filled.join(", ")} filled from the document. Check before saving.`
          : "Document read — the sender fields were already filled in.",
      )
    } catch {
      toast.message("Couldn't read the document — enter the sender details by hand.")
    } finally {
      setReadingKyc(false)
    }
  }

  const uploadKycAndFill = async (list: FileList | null) => {
    const file = list?.[0]
    if (!file || !draft) return
    setUploading(true)
    try {
      const blob = await upload(`source-of-funds/${Date.now()}-${file.name}`, file, {
        access: "public",
        handleUploadUrl: "/api/admin/source-of-funds/blob-upload",
        clientPayload: JSON.stringify({ pin: ADMIN_PASSCODE }),
      })
      const doc: SofDocument = {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        kind: "sender_passport",
        name: file.name,
        pathname: blob.pathname,
        contentType: file.type || "application/octet-stream",
        uploadedAt: new Date().toISOString(),
      }
      setDraft((d) => (d ? { ...d, documents: [...d.documents, doc] } : d))
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Upload failed.")
    } finally {
      setUploading(false)
      if (kycInputRef.current) kycInputRef.current.value = ""
    }
    await readSenderKyc(file)
  }

  const handleFiles = async (list: FileList | null) => {
    if (!list || list.length === 0 || !draft) return
    setUploading(true)
    try {
      const added: SofDocument[] = []
      for (const file of Array.from(list).slice(0, 10)) {
        const blob = await upload(`source-of-funds/${Date.now()}-${file.name}`, file, {
          access: "public",
          handleUploadUrl: "/api/admin/source-of-funds/blob-upload",
          clientPayload: JSON.stringify({ pin: ADMIN_PASSCODE }),
        })
        added.push({
          id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
          kind: uploadKind,
          name: file.name,
          pathname: blob.pathname,
          contentType: file.type || "application/octet-stream",
          uploadedAt: new Date().toISOString(),
        })
        if (uploadKind === "mt103") void readMt103(file)
        if (uploadKind === "sender_passport" || uploadKind === "sender_address" || uploadKind === "sender_company") {
          void readSenderKyc(file)
        }
      }
      setDraft((d) => (d ? { ...d, documents: [...d.documents, ...added] } : d))
      toast.success(`${added.length} document${added.length === 1 ? "" : "s"} uploaded — save the file to keep them.`)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Upload failed.")
    } finally {
      setUploading(false)
      if (fileInputRef.current) fileInputRef.current.value = ""
    }
  }

  const save = async () => {
    if (!draft) return
    setSaving(true)
    try {
      const res = await api<{ file: SofFile }>({
        op: "save",
        id: editingId ?? undefined,
        file: {
          ...draft,
          amount: Number(draft.amount),
          valueDate: draft.valueDate || null,
          declaration: { ...draft.declaration, signedAt: draft.declaration.signedAt || null },
        },
      })
      if (!res.ok) {
        toast.error(res.error ?? "Could not save.")
        return
      }
      toast.success("Source of Funds file saved.")
      setEditingId(res.file.id)
      await load()
    } finally {
      setSaving(false)
    }
  }

  const decide = async (status: SofStatus) => {
    if (!editingId) return
    setDeciding(status)
    try {
      const res = await api<{ file: SofFile }>({ op: "decide", id: editingId, status, note: decisionNote })
      if (!res.ok) {
        toast.error(res.error ?? "Could not record the decision.")
        return
      }
      toast.success(`File marked: ${STATUS_META[status].label}.`)
      await load()
    } finally {
      setDeciding(null)
    }
  }

  const downloadPackage = (f: SofFile) => {
    showPdf(generateSourceOfFundsPdf(f))
  }

  const checklistDone = draft ? CHECKS.every((c) => draft.checklist[c.key]) : false

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader>
          <div className="flex items-start justify-between gap-3">
            <div className="flex min-w-0 flex-col gap-1">
              <CardTitle className="flex items-center gap-2">
                <FileSearch className="h-5 w-5 text-primary" aria-hidden />
                Source of Funds
              </CardTitle>
              <CardDescription className="text-pretty leading-relaxed">
                Build a compliance file for an incoming payment: the MT103, the sender&apos;s KYC, the sender&apos;s signed
                declaration and any real supporting documents, then clear, hold or return it.
              </CardDescription>
            </div>
            {!draft && (
              <Button onClick={startNew} className="min-h-11 shrink-0">
                <Plus className="mr-1 h-4 w-4" aria-hidden />
                New file
              </Button>
            )}
          </div>
        </CardHeader>

        {!draft && (
          <CardContent className="flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium">Files</p>
              <Badge variant="outline">{openCount} to review</Badge>
            </div>
            {loading ? (
              <p className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Loading…
              </p>
            ) : loadError ? (
              <div className="flex flex-col gap-2 rounded-md border border-destructive/40 p-3 text-sm text-destructive">
                {loadError}
                <Button variant="outline" size="sm" className="w-fit" onClick={() => void load()}>
                  Retry
                </Button>
              </div>
            ) : files.length === 0 ? (
              <p className="text-sm text-muted-foreground">No files yet. Tap New file when a payment arrives.</p>
            ) : (
              <ul className="flex flex-col gap-2">
                {files.map((f) => (
                  <li key={f.id}>
                    <button
                      type="button"
                      onClick={() => openFile(f)}
                      className="flex w-full flex-col gap-1 rounded-md border border-border p-3 text-left transition-colors hover:bg-muted/50"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <span className="min-w-0 break-words font-medium">{f.holderLabel || "Client"}</span>
                        <Badge variant="outline" className={`shrink-0 ${STATUS_META[f.status].className}`}>
                          {STATUS_META[f.status].label}
                        </Badge>
                      </div>
                      <span className="font-mono text-sm">{fmtMoney(f.amount, f.currency)}</span>
                      <span className="break-words text-xs text-muted-foreground">
                        From {f.senderName || "unknown sender"} · {f.documents.length} document
                        {f.documents.length === 1 ? "" : "s"} · {new Date(f.createdAt).toLocaleDateString("en-GB")}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        )}
      </Card>

      {draft && (
        <Card>
          <CardHeader>
            <div className="flex items-start justify-between gap-3">
              <div className="flex min-w-0 flex-col gap-1">
                <CardTitle className="break-words text-base">{current ? current.id : "New Source of Funds file"}</CardTitle>
                {current && (
                  <Badge variant="outline" className={`w-fit ${STATUS_META[current.status].className}`}>
                    {STATUS_META[current.status].label}
                  </Badge>
                )}
              </div>
              <Button variant="ghost" size="icon" className="h-11 w-11 shrink-0" onClick={closeEditor} aria-label="Close">
                <X className="h-5 w-5" aria-hidden />
              </Button>
            </div>
          </CardHeader>
          <CardContent className="flex flex-col gap-6">
            {locked && (
              <p className="rounded-md border border-border bg-muted/40 p-3 text-sm text-muted-foreground">
                This file is decided and read-only. Reopen it at the bottom to make changes.
              </p>
            )}

            <fieldset disabled={locked} className="flex flex-col gap-6">
              <div className="flex flex-col gap-3 rounded-md border border-primary/40 bg-primary/5 p-4">
                <div className="flex flex-col gap-1">
                  <h3 className="text-sm font-semibold">Upload sender KYC</h3>
                  <p className="text-sm leading-relaxed text-muted-foreground">
                    Passport, ID card, proof of address, company extract or bank letter (PDF or photo). The details
                    printed on it fill the sender fields below and the document is added to this file.
                  </p>
                </div>
                <input
                  ref={kycInputRef}
                  type="file"
                  accept="application/pdf,image/*"
                  className="hidden"
                  onChange={(e) => uploadKycAndFill(e.target.files)}
                />
                <Button
                  type="button"
                  className="min-h-11 w-full"
                  disabled={uploading || readingKyc}
                  onClick={() => kycInputRef.current?.click()}
                >
                  <Upload className="h-4 w-4" aria-hidden />
                  {uploading || readingKyc ? "Reading document…" : "Upload KYC & fill sender"}
                </Button>
              </div>

              <section className="flex flex-col gap-3">
                <h3 className="text-sm font-semibold">1. Payment received</h3>
                <div className="flex flex-col gap-2">
                  <Label>Receiving client</Label>
                  <Select value={draft.userId} onValueChange={selectClient}>
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Select a client" />
                    </SelectTrigger>
                    <SelectContent>
                      {clients.map((c) => (
                        <SelectItem key={c.id} value={c.id}>
                          {[c.fullName, c.company].filter(Boolean).join(" · ") || c.email}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex gap-3">
                  <div className="flex min-w-0 flex-1 flex-col gap-2">
                    <Label htmlFor="sof-amount">Amount</Label>
                    <MoneyInput id="sof-amount" value={draft.amount} onValueChange={(v) => set("amount", v)} placeholder="0.00" />
                  </div>
                  <div className="flex w-28 flex-col gap-2">
                    <Label>Currency</Label>
                    <Select value={draft.currency} onValueChange={(v) => set("currency", v)}>
                      <SelectTrigger className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {CURRENCIES.map((c) => (
                          <SelectItem key={c} value={c}>
                            {c}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="flex flex-col gap-2">
                  <Label htmlFor="sof-vdate">Value date</Label>
                  <Input
                    id="sof-vdate"
                    type="date"
                    className="text-base"
                    value={draft.valueDate ?? ""}
                    onChange={(e) => set("valueDate", e.target.value)}
                  />
                </div>
                <div className="flex flex-col gap-2">
                  <Label htmlFor="sof-ref">Payment reference</Label>
                  <Input id="sof-ref" className="text-base" value={draft.reference} onChange={(e) => set("reference", e.target.value)} />
                </div>
              </section>

              <section className="flex flex-col gap-3">
                <h3 className="text-sm font-semibold">2. Sender (ordering customer)</h3>
                <Button
                  type="button"
                  variant="outline"
                  className="min-h-11 w-full sm:w-auto"
                  disabled={uploading || readingKyc}
                  onClick={() => kycInputRef.current?.click()}
                >
                  {uploading || readingKyc ? "Reading document…" : "Upload KYC & fill sender"}
                </Button>
                {(
                  [
                    ["senderName", "Name / company"],
                    ["senderCountry", "Country"],
                    ["senderBank", "Ordering bank / BIC"],
                    ["senderAccount", "Account / IBAN"],
                  ] as const
                ).map(([key, label]) => (
                  <div key={key} className="flex flex-col gap-2">
                    <Label htmlFor={`sof-${key}`}>{label}</Label>
                    <Input
                      id={`sof-${key}`}
                      className="text-base"
                      value={draft[key]}
                      onChange={(e) => set(key, e.target.value)}
                    />
                  </div>
                ))}
              </section>

              <section className="flex flex-col gap-3">
                <h3 className="text-sm font-semibold">3. Documents</h3>
                <p className="text-sm leading-relaxed text-muted-foreground">
                  Upload the MT103, the sender&apos;s passport and KYC, and any real contract, invoice or correspondence
                  that existed for this payment. PDF or image, up to 25 MB each.
                </p>
                <div className="flex flex-col gap-2">
                  <Label>Document type</Label>
                  <Select value={uploadKind} onValueChange={(v) => setUploadKind(v as DocKind)}>
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {DOC_KINDS.map((d) => (
                        <SelectItem key={d.id} value={d.id}>
                          {d.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <input
                  ref={fileInputRef}
                  type="file"
                  multiple
                  accept="application/pdf,image/jpeg,image/png,image/webp,image/heic"
                  className="sr-only"
                  onChange={(e) => void handleFiles(e.target.files)}
                />
                <Button
                  type="button"
                  variant="outline"
                  className="min-h-11 w-full"
                  disabled={uploading}
                  onClick={() => fileInputRef.current?.click()}
                >
                  {uploading ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />
                  ) : (
                    <Upload className="mr-2 h-4 w-4" aria-hidden />
                  )}
                  {uploading ? "Uploading…" : "Upload documents"}
                </Button>
                {draft.documents.length > 0 && (
                  <ul className="flex flex-col gap-2">
                    {draft.documents.map((d) => (
                      <li key={d.id} className="flex items-center gap-2 rounded-md border border-border p-2">
                        <FileText className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
                        <button
                          type="button"
                          className="flex min-w-0 flex-1 flex-col text-left"
                          onClick={() => void downloadFile(blobFileUrl(d.pathname, ADMIN_PASSCODE), d.name)}
                        >
                          <span className="break-words text-sm">{d.name}</span>
                          <span className="text-xs text-muted-foreground">{docLabel(d.kind)}</span>
                        </button>
                        {!locked && (
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="h-11 w-11 shrink-0"
                            aria-label={`Remove ${d.name}`}
                            onClick={() => set("documents", draft.documents.filter((x) => x.id !== d.id))}
                          >
                            <X className="h-4 w-4" aria-hidden />
                          </Button>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </section>

              <section className="flex flex-col gap-3">
                <h3 className="text-sm font-semibold">4. Sender&apos;s Source of Funds declaration</h3>
                <p className="text-sm leading-relaxed text-muted-foreground">
                  Record what the sender states in their own signed declaration. Don&apos;t fill this in on their behalf.
                </p>
                <div className="flex flex-col gap-2">
                  <Label htmlFor="sof-purpose">Purpose of the payment</Label>
                  <Textarea
                    id="sof-purpose"
                    rows={3}
                    className="text-base"
                    value={draft.declaration.purpose}
                    onChange={(e) => setDecl("purpose", e.target.value)}
                  />
                </div>
                <div className="flex flex-col gap-2">
                  <Label htmlFor="sof-origin">Where the funds come from</Label>
                  <Textarea
                    id="sof-origin"
                    rows={3}
                    className="text-base"
                    value={draft.declaration.sourceOfFunds}
                    onChange={(e) => setDecl("sourceOfFunds", e.target.value)}
                  />
                </div>
                <div className="flex flex-col gap-2">
                  <Label htmlFor="sof-rel">Relationship to the client</Label>
                  <Input
                    id="sof-rel"
                    className="text-base"
                    value={draft.declaration.relationship}
                    onChange={(e) => setDecl("relationship", e.target.value)}
                  />
                </div>
                <div className="flex gap-3">
                  <div className="flex min-w-0 flex-1 flex-col gap-2">
                    <Label htmlFor="sof-signer">Signed by</Label>
                    <Input
                      id="sof-signer"
                      className="text-base"
                      value={draft.declaration.signedBy}
                      onChange={(e) => setDecl("signedBy", e.target.value)}
                    />
                  </div>
                  <div className="flex w-40 flex-col gap-2">
                    <Label htmlFor="sof-signed">Signed on</Label>
                    <Input
                      id="sof-signed"
                      type="date"
                      className="text-base"
                      value={draft.declaration.signedAt ?? ""}
                      onChange={(e) => setDecl("signedAt", e.target.value)}
                    />
                  </div>
                </div>
              </section>

              <section className="flex flex-col gap-3">
                <h3 className="text-sm font-semibold">5. Compliance checklist</h3>
                {CHECKS.map((c) => (
                  <label key={c.key} className="flex min-h-11 items-start gap-3 text-sm leading-relaxed">
                    <Checkbox
                      checked={draft.checklist[c.key]}
                      onCheckedChange={(v) => setCheck(c.key, v === true)}
                      className="mt-0.5"
                    />
                    <span>{c.label}</span>
                  </label>
                ))}
              </section>
            </fieldset>

            {!locked && (
              <Button onClick={() => void save()} disabled={saving} className="min-h-11 w-full">
                {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />}
                {current ? "Save changes" : "Create file"}
              </Button>
            )}

            {current && (
              <section className="flex flex-col gap-3 border-t border-border pt-5">
                <h3 className="text-sm font-semibold">6. Decision</h3>
                {current.decidedAt && (
                  <p className="text-sm text-muted-foreground">
                    {STATUS_META[current.status].label} on {new Date(current.decidedAt).toLocaleString("en-GB")}
                    {current.decisionNote ? ` — ${current.decisionNote}` : ""}
                  </p>
                )}
                {!locked && (
                  <>
                    <div className="flex flex-col gap-2">
                      <Label htmlFor="sof-note">Reason / note</Label>
                      <Textarea
                        id="sof-note"
                        rows={2}
                        className="text-base"
                        placeholder="Required for hold or return"
                        value={decisionNote}
                        onChange={(e) => setDecisionNote(e.target.value)}
                      />
                    </div>
                    {!checklistDone && (
                      <p className="text-xs text-muted-foreground">
                        Tick every checklist item and save before clearing.
                      </p>
                    )}
                    <div className="flex flex-col gap-2">
                      <Button
                        className="min-h-11"
                        disabled={!!deciding || !checklistDone}
                        onClick={() => void decide("cleared")}
                      >
                        {deciding === "cleared" ? (
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />
                        ) : (
                          <CheckCircle2 className="mr-2 h-4 w-4" aria-hidden />
                        )}
                        Clear payment
                      </Button>
                      {current.status !== "hold" && (
                        <Button
                          variant="outline"
                          className="min-h-11"
                          disabled={!!deciding}
                          onClick={() => void decide("hold")}
                        >
                          <PauseCircle className="mr-2 h-4 w-4" aria-hidden />
                          Put on hold
                        </Button>
                      )}
                      <Button
                        variant="outline"
                        className="min-h-11 border-destructive/40 text-destructive hover:text-destructive"
                        disabled={!!deciding}
                        onClick={() => void decide("returned")}
                      >
                        <Undo2 className="mr-2 h-4 w-4" aria-hidden />
                        Return to sender
                      </Button>
                    </div>
                  </>
                )}
                {locked && (
                  <Button variant="outline" className="min-h-11" disabled={!!deciding} onClick={() => void decide("open")}>
                    <RotateCcw className="mr-2 h-4 w-4" aria-hidden />
                    Reopen file
                  </Button>
                )}
                <Button variant="secondary" className="min-h-11" onClick={() => downloadPackage(current)}>
                  <FileDown className="mr-2 h-4 w-4" aria-hidden />
                  Download compliance package (PDF)
                </Button>
              </section>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  )
}
