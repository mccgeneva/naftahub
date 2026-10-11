"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { upload } from "@vercel/blob/client"
import {
  Paperclip,
  X,
  FileText,
  Megaphone,
  Inbox,
  ScrollText,
  Send,
  Loader2,
  Users,
  ShieldCheck,
} from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { Badge } from "@/components/ui/badge"
import { Checkbox } from "@/components/ui/checkbox"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { toast } from "sonner"
import { ADMIN_PASSCODE } from "@/lib/admin-config"
import { Messenger } from "@/components/bankeka/messenger"
import { listSelectableClients, type SelectableClient } from "@/app/actions/admin-users"
import {
  adminBroadcast,
  adminListConversations,
  adminGetThread,
  adminReply,
  adminDeleteMessage,
  adminListAudit,
} from "@/app/actions/bankeka"
import {
  BANKEKA_MAX_ATTACHMENTS_PER_MESSAGE,
  BANKEKA_UPLOAD_CONTENT_TYPES,
  BANKEKA_UPLOAD_MAX_BYTES,
  type BankekaAttachment,
  type BankekaAuditEntry,
} from "@/lib/bankeka-shared"

const MAX_BODY = 20000

function formatSize(bytes?: number): string {
  if (!bytes) return ""
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function formatTimestamp(iso: string): string {
  const d = new Date(iso)
  return `${d.toLocaleDateString("en-GB")} ${d.toLocaleTimeString("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
  })}`
}

function BroadcastComposer() {
  const [clients, setClients] = useState<SelectableClient[]>([])
  const [target, setTarget] = useState<"all" | "selected">("all")
  const [selected, setSelected] = useState<Record<string, boolean>>({})
  const [body, setBody] = useState("")
  const [sending, setSending] = useState(false)
  const [attachments, setAttachments] = useState<BankekaAttachment[]>([])
  const [uploading, setUploading] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return
    const room = BANKEKA_MAX_ATTACHMENTS_PER_MESSAGE - attachments.length
    if (room <= 0) {
      toast.error(`You can attach up to ${BANKEKA_MAX_ATTACHMENTS_PER_MESSAGE} files per broadcast.`)
      return
    }
    const all = Array.from(files)
    if (all.length > room) {
      toast.error(`Only ${room} more file${room === 1 ? "" : "s"} can be attached.`)
    }
    setUploading(true)
    try {
      for (const file of all.slice(0, room)) {
        if (file.size > BANKEKA_UPLOAD_MAX_BYTES) {
          toast.error(`"${file.name}" is too large (max 25 MB).`)
          continue
        }
        const safe = file.name.replace(/[^a-zA-Z0-9._-]/g, "_")
        const result = await upload(`bankeka/admin/${Date.now()}-${safe}`, file, {
          access: "public",
          handleUploadUrl: "/api/bankeka/blob-upload",
          clientPayload: JSON.stringify({ passcode: ADMIN_PASSCODE }),
        })
        setAttachments((prev) => [
          ...prev,
          { name: file.name, url: result.url, size: file.size, contentType: file.type || undefined },
        ])
      }
    } catch (err) {
      toast.error((err as Error).message || "The file could not be uploaded.")
    } finally {
      setUploading(false)
      if (fileInputRef.current) fileInputRef.current.value = ""
    }
  }

  useEffect(() => {
    let cancelled = false
    listSelectableClients(ADMIN_PASSCODE)
      .then((list) => {
        if (!cancelled) setClients(list)
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [])

  const selectedIds = useMemo(
    () => Object.entries(selected).filter(([, v]) => v).map(([id]) => id),
    [selected],
  )

  const handleSend = async () => {
    const text = body.trim()
    if (!text && attachments.length === 0) {
      toast.error("Write a message or attach a file.")
      return
    }
    if (uploading) {
      toast.error("Please wait for the attachments to finish uploading.")
      return
    }
    if (target === "selected" && selectedIds.length === 0) {
      toast.error("Select at least one recipient.")
      return
    }
    setSending(true)
    try {
      const res = await adminBroadcast(ADMIN_PASSCODE, target === "all" ? "all" : selectedIds, text, attachments)
      if (res.ok) {
        toast.success("Broadcast published", {
          description: `Delivered to ${res.delivered} active client${res.delivered === 1 ? "" : "s"}.`,
        })
        setBody("")
        setSelected({})
        setAttachments([])
      } else {
        toast.error(res.error)
      }
    } finally {
      setSending(false)
    }
  }

  return (
    <Card className="bg-card border-border">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg font-semibold">
          <Megaphone className="h-5 w-5 text-primary" />
          Publish a broadcast
        </CardTitle>
        <p className="text-sm text-muted-foreground text-pretty">
          Send a Bankeka message from MCC Capital · Administration to one, several, or all active
          clients. Each recipient receives it privately and can reply directly to your inbox.
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant={target === "all" ? "default" : "outline"}
            size="sm"
            onClick={() => setTarget("all")}
          >
            <Users className="mr-2 h-4 w-4" />
            All active clients ({clients.length})
          </Button>
          <Button
            type="button"
            variant={target === "selected" ? "default" : "outline"}
            size="sm"
            onClick={() => setTarget("selected")}
          >
            Selected clients{selectedIds.length > 0 ? ` (${selectedIds.length})` : ""}
          </Button>
        </div>

        {target === "selected" && (
          <div className="max-h-56 overflow-y-auto rounded-lg border border-border bg-card p-1">
            {clients.length === 0 ? (
              <p className="px-2 py-6 text-center text-sm text-muted-foreground">No active clients.</p>
            ) : (
              <ul className="space-y-0.5">
                {clients.map((c) => (
                  <li key={c.id}>
                    <label className="flex cursor-pointer items-center gap-3 rounded-md px-2 py-2 hover:bg-secondary">
                      <Checkbox
                        checked={!!selected[c.id]}
                        onCheckedChange={(v) =>
                          setSelected((prev) => ({ ...prev, [c.id]: v === true }))
                        }
                      />
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-medium text-foreground">
                          {c.fullName || c.company || c.email}
                        </span>
                        <span className="block truncate text-xs text-muted-foreground">
                          {c.company ? `${c.company} · ` : ""}
                          {c.email}
                        </span>
                      </span>
                    </label>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        <div className="space-y-1.5">
          <Textarea
            value={body}
            onChange={(e) => setBody(e.target.value.slice(0, MAX_BODY))}
            placeholder="Write your announcement…"
            rows={16}
            className="min-h-[60dvh] resize-y text-base leading-relaxed md:min-h-[28rem] md:text-sm"
          />
          <p className="text-right text-xs text-muted-foreground">
            {body.length.toLocaleString("en-US")}/{MAX_BODY.toLocaleString("en-US")}
          </p>
        </div>

        <div className="flex flex-col gap-2">
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept={BANKEKA_UPLOAD_CONTENT_TYPES.join(",")}
            className="sr-only"
            onChange={(e) => handleFiles(e.target.files)}
          />
          <Button
            type="button"
            variant="outline"
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading || attachments.length >= BANKEKA_MAX_ATTACHMENTS_PER_MESSAGE}
            className="min-h-11 w-full sm:w-auto"
          >
            {uploading ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Paperclip className="mr-2 h-4 w-4" />
            )}
            {uploading
              ? "Uploading…"
              : `Add attachments (${attachments.length}/${BANKEKA_MAX_ATTACHMENTS_PER_MESSAGE})`}
          </Button>
          <p className="text-xs text-muted-foreground">
            PDF, images, Word, Excel, text or CSV — up to 25 MB each. You can pick several files at once.
          </p>
          {attachments.length > 0 && (
            <ul className="flex flex-col gap-2">
              {attachments.map((a, i) => (
                <li
                  key={a.url}
                  className="flex min-w-0 items-center gap-3 rounded-lg border border-border bg-secondary/40 px-3 py-2"
                >
                  <FileText className="h-4 w-4 shrink-0 text-primary" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm text-foreground">{a.name}</span>
                    <span className="block text-xs text-muted-foreground">{formatSize(a.size)}</span>
                  </span>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-11 w-11 shrink-0"
                    onClick={() => setAttachments((prev) => prev.filter((_, j) => j !== i))}
                    aria-label={`Remove ${a.name}`}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <Button onClick={handleSend} disabled={sending || uploading} className="min-h-11 w-full sm:w-auto">
          {sending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Send className="mr-2 h-4 w-4" />}
          Publish broadcast
        </Button>
      </CardContent>
    </Card>
  )
}

function AuditTrail() {
  const [entries, setEntries] = useState<BankekaAuditEntry[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    adminListAudit(ADMIN_PASSCODE)
      .then((rows) => {
        if (!cancelled) setEntries(rows)
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [])

  return (
    <Card className="bg-card border-border">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg font-semibold">
          <ScrollText className="h-5 w-5 text-primary" />
          Compliance audit trail
        </CardTitle>
        <p className="text-sm text-muted-foreground text-pretty">
          A metadata-only record of messaging activity for compliance. Message contents are never
          logged — only who messaged whom, when, and the length.
        </p>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="flex items-center justify-center py-10">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : entries.length === 0 ? (
          <p className="py-10 text-center text-sm text-muted-foreground">No messaging activity recorded yet.</p>
        ) : (
          <ScrollArea className="max-h-[28rem]">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-xs uppercase tracking-wider text-muted-foreground">
                    <th className="px-2 py-2 font-medium">When</th>
                    <th className="px-2 py-2 font-medium">From</th>
                    <th className="px-2 py-2 font-medium">Action</th>
                    <th className="px-2 py-2 font-medium">To</th>
                    <th className="px-2 py-2 text-right font-medium">Chars</th>
                  </tr>
                </thead>
                <tbody>
                  {entries.map((e) => (
                    <tr key={e.id} className="border-b border-border/60">
                      <td className="whitespace-nowrap px-2 py-2 text-xs text-muted-foreground">
                        {formatTimestamp(e.createdAt)}
                      </td>
                      <td className="px-2 py-2 text-foreground">{e.actorLabel}</td>
                      <td className="px-2 py-2">
                        <Badge variant="secondary" className="text-[10px] capitalize">
                          {e.action}
                        </Badge>
                      </td>
                      <td className="px-2 py-2 text-foreground">{e.recipientLabel}</td>
                      <td className="px-2 py-2 text-right tabular-nums text-muted-foreground">{e.charCount}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </ScrollArea>
        )}
      </CardContent>
    </Card>
  )
}

/**
 * Administrator Bankeka console: broadcast composer, a private inbox of client
 * threads (the admin only ever sees threads they are part of), and a
 * metadata-only compliance audit trail.
 */
export function BankekaBroadcastManager() {
  return (
    <Tabs defaultValue="broadcast" className="space-y-4">
      <TabsList className="grid w-full grid-cols-3 sm:w-auto sm:inline-grid">
        <TabsTrigger value="broadcast" className="gap-1.5">
          <Megaphone className="h-4 w-4" />
          <span className="hidden sm:inline">Broadcast</span>
        </TabsTrigger>
        <TabsTrigger value="inbox" className="gap-1.5">
          <Inbox className="h-4 w-4" />
          <span className="hidden sm:inline">Inbox</span>
        </TabsTrigger>
        <TabsTrigger value="audit" className="gap-1.5">
          <ScrollText className="h-4 w-4" />
          <span className="hidden sm:inline">Audit</span>
        </TabsTrigger>
      </TabsList>

      <TabsContent value="broadcast">
        <BroadcastComposer />
      </TabsContent>

      <TabsContent value="inbox">
        <div className="mb-3 flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-2">
          <ShieldCheck className="h-4 w-4 text-success" />
          <p className="text-xs text-muted-foreground text-pretty">
            You only see threads where MCC Capital · Administration is a participant. Client-to-client
            conversations remain private.
          </p>
        </div>
        <Messenger
          scope="admin"
          fetchConversations={() => adminListConversations(ADMIN_PASSCODE)}
          fetchThread={(id) => adminGetThread(ADMIN_PASSCODE, id)}
          send={(id, body, attachments) => adminReply(ADMIN_PASSCODE, id, body, attachments)}
          deleteMessage={(messageId) => adminDeleteMessage(ADMIN_PASSCODE, messageId)}
          attachmentsEnabled
          uploadPayload={JSON.stringify({ passcode: ADMIN_PASSCODE })}
          emptyHint="Replies from clients to your broadcasts and direct messages appear here."
        />
      </TabsContent>

      <TabsContent value="audit">
        <AuditTrail />
      </TabsContent>
    </Tabs>
  )
}
