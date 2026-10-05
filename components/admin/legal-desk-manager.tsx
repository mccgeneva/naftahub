"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { toast } from "sonner"
import { Gavel, Loader2, Mail, RefreshCw, Send, Eye } from "lucide-react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Badge } from "@/components/ui/badge"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"

type Client = { id: string; label: string; email: string }
type Option = { id: string; label: string; detail: string }
type Message = {
  id: string
  clientLabel: string
  toEmails: string[]
  ccEmails: string[]
  subject: string
  transactionReference: string
  narrative: string
  fromEmail: string
  status: "sent" | "failed"
  error: string | null
  createdAt: string
}

const NONE = "__none"

export function LegalDeskManager({ passcode }: { passcode: string }) {
  const [loading, setLoading] = useState(true)
  const [clients, setClients] = useState<Client[]>([])
  const [messages, setMessages] = useState<Message[]>([])
  const [fromEmail, setFromEmail] = useState("lawfirm@juristreuhand.com")

  const [clientId, setClientId] = useState(NONE)
  const [instruments, setInstruments] = useState<Option[]>([])
  const [transactions, setTransactions] = useState<Option[]>([])
  const [contextLoading, setContextLoading] = useState(false)
  const [instrumentId, setInstrumentId] = useState(NONE)
  const [transactionId, setTransactionId] = useState(NONE)

  const [to, setTo] = useState("")
  const [cc, setCc] = useState("")
  const [recipientName, setRecipientName] = useState("")
  const [subject, setSubject] = useState("")
  const [reference, setReference] = useState("")
  const [related, setRelated] = useState("")
  const [narrative, setNarrative] = useState("")
  const [sending, setSending] = useState(false)
  const [viewing, setViewing] = useState<Message | null>(null)

  const call = useCallback(
    async (payload: Record<string, unknown>) => {
      const res = await fetch("/api/admin/legal-desk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ passcode, ...payload }),
      })
      return (await res.json().catch(() => ({ ok: false, error: "Unexpected response." }))) as Record<string, unknown>
    },
    [passcode],
  )

  const load = useCallback(async () => {
    setLoading(true)
    const data = await call({ op: "list" })
    if (data.ok) {
      setClients((data.clients as Client[]) ?? [])
      setMessages((data.messages as Message[]) ?? [])
      if (typeof data.fromEmail === "string") setFromEmail(data.fromEmail)
      setReference((r) => r || String(data.nextReference ?? ""))
    } else toast.error(String(data.error ?? "Could not load the Legal Desk."))
    setLoading(false)
  }, [call])

  useEffect(() => {
    void load()
  }, [load])

  useEffect(() => {
    setInstrumentId(NONE)
    setTransactionId(NONE)
    setInstruments([])
    setTransactions([])
    if (clientId === NONE) return
    let cancelled = false
    setContextLoading(true)
    call({ op: "context", userId: clientId }).then((data) => {
      if (cancelled) return
      if (data.ok) {
        setInstruments((data.instruments as Option[]) ?? [])
        setTransactions((data.transactions as Option[]) ?? [])
      }
      setContextLoading(false)
    })
    return () => {
      cancelled = true
    }
  }, [clientId, call])

  const client = clients.find((c) => c.id === clientId)
  const instrument = instruments.find((i) => i.id === instrumentId)
  const transaction = transactions.find((t) => t.id === transactionId)

  const preview = useMemo(() => {
    const lines = [
      `:20:${(reference || "AUTO").toUpperCase()}`,
      `:21:${(related || "NONREF").toUpperCase()}`,
      `:79:RE: ${subject || "—"}`.toUpperCase(),
      client ? `CLIENT: ${client.label}`.toUpperCase() : null,
      instrument ? `INSTRUMENT: ${instrument.label}${instrument.detail ? ` (${instrument.detail})` : ""}`.toUpperCase() : null,
      transaction ? `TRANSACTION: ${transaction.label} ${transaction.detail}`.toUpperCase() : null,
      "",
      narrative || "…",
      "-}",
    ]
    return lines.filter((l) => l !== null).join("\n")
  }, [reference, related, subject, client, instrument, transaction, narrative])

  async function send() {
    if (!to.trim()) return toast.error("Add at least one recipient email.")
    if (!subject.trim()) return toast.error("Add a subject.")
    if (!narrative.trim()) return toast.error("Write the message body.")
    setSending(true)
    const data = await call({
      op: "send",
      to,
      cc,
      recipientName,
      subject,
      transactionReference: reference,
      relatedReference: related,
      narrative,
      userId: client?.id ?? "",
      clientLabel: client?.label ?? "",
      instrumentRef: instrument?.id ?? "",
      instrumentLabel: instrument ? `${instrument.label}${instrument.detail ? ` (${instrument.detail})` : ""}` : "",
      transactionRef: transaction?.id ?? "",
      transactionLabel: transaction ? `${transaction.label} ${transaction.detail}` : "",
    })
    setSending(false)
    if (data.ok) {
      toast.success("MT799 sent", { description: `Reference ${String(data.reference)} sent from ${fromEmail}.` })
      setNarrative("")
      setSubject("")
      setRelated("")
      setReference("")
      await load()
    } else {
      toast.error("Not sent", { description: String(data.error ?? "The email could not be sent.") })
      await load()
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Gavel className="size-5 text-primary" aria-hidden="true" />
            Legal Desk
          </CardTitle>
          <CardDescription className="text-pretty">
            Write a legal notice about a client, an instrument or a transaction and send it as an MT799 free-format
            message by email to any third party.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-5">
          <div className="flex items-center gap-2 rounded-md border border-border bg-muted/40 px-3 py-2 text-sm">
            <Mail className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
            <span className="text-muted-foreground">From</span>
            <span className="min-w-0 truncate font-mono font-medium">{fromEmail}</span>
          </div>

          <div className="flex flex-col gap-2">
            <Label>Client (optional)</Label>
            <Select value={clientId} onValueChange={setClientId} disabled={loading}>
              <SelectTrigger className="h-11 text-base">
                <SelectValue placeholder="Choose a client" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE}>No specific client</SelectItem>
                {clients.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {clientId !== NONE && (
            <div className="flex flex-col gap-4">
              <div className="flex flex-col gap-2">
                <Label>Bank instrument (optional)</Label>
                <Select value={instrumentId} onValueChange={setInstrumentId} disabled={contextLoading}>
                  <SelectTrigger className="h-11 text-base">
                    <SelectValue placeholder={contextLoading ? "Loading…" : "Choose an instrument"} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NONE}>None</SelectItem>
                    {instruments.map((i) => (
                      <SelectItem key={i.id} value={i.id}>
                        {i.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {instrument?.detail && <p className="text-xs text-muted-foreground">{instrument.detail}</p>}
                {!contextLoading && instruments.length === 0 && (
                  <p className="text-xs text-muted-foreground">This client holds no bank instruments.</p>
                )}
              </div>
              <div className="flex flex-col gap-2">
                <Label>Transaction (optional)</Label>
                <Select value={transactionId} onValueChange={setTransactionId} disabled={contextLoading}>
                  <SelectTrigger className="h-11 text-base">
                    <SelectValue placeholder={contextLoading ? "Loading…" : "Choose a transaction"} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NONE}>None</SelectItem>
                    {transactions.map((t) => (
                      <SelectItem key={t.id} value={t.id}>
                        {t.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {transaction?.detail && <p className="text-xs text-muted-foreground">{transaction.detail}</p>}
              </div>
            </div>
          )}

          <div className="flex flex-col gap-2">
            <Label htmlFor="ld-to">To</Label>
            <Input
              id="ld-to"
              type="email"
              inputMode="email"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              multiple
              className="h-11 text-base"
              placeholder="legal@bank.com, compliance@firm.com"
              value={to}
              onChange={(e) => setTo(e.target.value)}
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="ld-cc">Cc (optional)</Label>
            <Input
              id="ld-cc"
              type="email"
              inputMode="email"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              multiple
              className="h-11 text-base"
              value={cc}
              onChange={(e) => setCc(e.target.value)}
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="ld-rname">Receiver name / institution</Label>
            <Input
              id="ld-rname"
              className="h-11 text-base"
              placeholder="e.g. HSBC Bank plc, Legal Department"
              value={recipientName}
              onChange={(e) => setRecipientName(e.target.value)}
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="ld-subject">Subject</Label>
            <Input id="ld-subject" className="h-11 text-base" value={subject} onChange={(e) => setSubject(e.target.value)} />
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-2">
              <Label htmlFor="ld-ref">Transaction reference (:20:)</Label>
              <Input
                id="ld-ref"
                maxLength={16}
                autoCapitalize="characters"
                className="h-11 font-mono text-base uppercase"
                value={reference}
                onChange={(e) => setReference(e.target.value)}
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="ld-rel">Related reference (:21:)</Label>
              <Input
                id="ld-rel"
                maxLength={16}
                autoCapitalize="characters"
                placeholder="NONREF"
                className="h-11 font-mono text-base uppercase"
                value={related}
                onChange={(e) => setRelated(e.target.value)}
              />
            </div>
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="ld-body">Message (:79:)</Label>
            <Textarea
              id="ld-body"
              rows={9}
              className="text-base leading-relaxed"
              placeholder="We hereby notify you on behalf of our client…"
              value={narrative}
              onChange={(e) => setNarrative(e.target.value)}
            />
          </div>

          <div className="flex flex-col gap-2">
            <Label>MT799 preview</Label>
            <pre className="max-h-72 overflow-auto whitespace-pre-wrap break-words rounded-md border border-border bg-muted/40 p-3 font-mono text-xs leading-relaxed">
              {preview}
            </pre>
          </div>

          <Button size="lg" className="h-12" onClick={send} disabled={sending || loading}>
            {sending ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : <Send className="size-4" aria-hidden="true" />}
            {sending ? "Sending…" : "Send MT799 by email"}
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-3">
          <div className="flex flex-col gap-1">
            <CardTitle>Sent messages</CardTitle>
            <CardDescription>Every message sent from the Legal Desk, newest first.</CardDescription>
          </div>
          <Button variant="ghost" size="icon" className="size-11 shrink-0" onClick={load} aria-label="Refresh">
            <RefreshCw className={loading ? "size-4 animate-spin" : "size-4"} aria-hidden="true" />
          </Button>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          {messages.length === 0 && !loading && <p className="text-sm text-muted-foreground">No messages sent yet.</p>}
          {messages.map((m) => (
            <button
              key={m.id}
              type="button"
              onClick={() => setViewing(m)}
              className="flex min-h-11 w-full flex-col gap-1 rounded-md border border-border p-3 text-left hover:bg-muted/40"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="min-w-0 truncate font-medium">{m.subject}</span>
                <Badge variant={m.status === "sent" ? "secondary" : "destructive"} className="shrink-0">
                  {m.status === "sent" ? "Sent" : "Failed"}
                </Badge>
              </div>
              <span className="font-mono text-xs text-muted-foreground">{m.transactionReference}</span>
              <span className="break-all text-xs text-muted-foreground">To {m.toEmails.join(", ")}</span>
              {m.clientLabel && <span className="text-xs text-muted-foreground">Client: {m.clientLabel}</span>}
              <span className="flex items-center gap-1 text-xs text-muted-foreground">
                <Eye className="size-3" aria-hidden="true" />
                {new Date(m.createdAt).toLocaleString()}
              </span>
            </button>
          ))}
        </CardContent>
      </Card>

      <Dialog open={!!viewing} onOpenChange={(o) => !o && setViewing(null)}>
        <DialogContent className="flex max-h-[88dvh] max-w-lg flex-col overflow-hidden">
          <DialogHeader className="shrink-0">
            <DialogTitle className="text-balance">{viewing?.subject}</DialogTitle>
            <DialogDescription className="break-all">
              From {viewing?.fromEmail} to {viewing?.toEmails.join(", ")}
              {viewing?.ccEmails.length ? ` · Cc ${viewing.ccEmails.join(", ")}` : ""}
            </DialogDescription>
          </DialogHeader>
          <div className="min-h-0 flex-1 overflow-y-auto">
            {viewing?.status === "failed" && viewing.error && (
              <p className="mb-3 rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
                {viewing.error}
              </p>
            )}
            <pre className="whitespace-pre-wrap break-words rounded-md border border-border bg-muted/40 p-3 font-mono text-xs leading-relaxed">
              {viewing?.narrative}
            </pre>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
