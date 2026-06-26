"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { useChat } from "@ai-sdk/react"
import { DefaultChatTransport, type UIMessage } from "ai"
import { Streamdown } from "streamdown"
import {
  Cpu,
  ArrowUp,
  Square,
  AlertTriangle,
  Sparkles,
  User,
  RotateCcw,
  Ship,
  Radar,
  Loader2,
  BookOpen,
  Maximize2,
  Minimize2,
  Send,
  Paperclip,
  FileText,
  FileSpreadsheet,
  ImageIcon,
  Download,
  X,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { NQAI_WELCOME, NQAI_TAGLINE, NQAI_SUGGESTIONS } from "@/lib/nqai"
import { bootstrapNqai, resetNqaiConversation } from "@/app/actions/nqai"
import { usePdfViewer } from "@/lib/pdf-viewer"
import { useCurrentUser } from "@/lib/use-current-user"
import { generateNqaiDocumentPdf } from "@/lib/nqai-document-pdf"

/** Client-accepted upload types and the limit, mirrored by the upload route. */
const ACCEPTED_UPLOAD = ".pdf,.png,.jpg,.jpeg,.webp,.gif,.txt,.csv,application/pdf,image/png,image/jpeg,image/webp,image/gif,text/plain,text/csv"
const MAX_UPLOAD_BYTES = 20 * 1024 * 1024

interface PendingAttachment {
  id: string
  name: string
  size: number
  mediaType: string
  status: "uploading" | "ready" | "error"
  url?: string
  error?: string
}

/** A file attached to a (user) message, reconstructed from its parts. */
interface MessageFile {
  url: string
  name: string
  mediaType: string
}

/** Pick an icon for an attachment based on its media type. */
function fileIcon(mediaType: string) {
  if (mediaType.startsWith("image/")) return ImageIcon
  if (mediaType === "application/pdf") return FileText
  if (mediaType.includes("csv")) return FileSpreadsheet
  return FileText
}

/**
 * Produce an accurate, human message for a chat error. The previous text always
 * blamed the Anthropic key, which was misleading — most failures are transient
 * stream faults or timeouts on heavy document analysis, which simply need a retry.
 */
function describeNqaiError(error: Error | undefined): string {
  const raw = (error?.message || "").toLowerCase()
  if (raw.includes("api key") || raw.includes("not configured") || raw.includes("offline")) {
    return "NQAi is offline — the Anthropic key is not configured. Add ANTHROPIC_API_KEY, then try again."
  }
  if (raw.includes("could not read") || raw.includes("attachment")) {
    return "NQAi could not read an attachment in this conversation. Try removing it or starting a new chat."
  }
  return "NQAi hit a transient fault (the request may have taken too long, e.g. a large document). Please try again."
}

function formatBytes(bytes: number): string {
  if (!bytes) return ""
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

/** Extract file attachments from a message's parts. */
function messageFiles(message: UIMessage): MessageFile[] {
  if (!message.parts) return []
  const out: MessageFile[] = []
  message.parts.forEach((p) => {
    const part = p as { type?: string; url?: string; mediaType?: string; filename?: string }
    if (part.type === "file" && part.url) {
      out.push({
        url: part.url,
        name: part.filename || "attachment",
        mediaType: part.mediaType || "application/octet-stream",
      })
    }
  })
  return out
}

/** A document NQAi authored via the createDocument tool, ready to download. */
interface DocArtifact {
  key: string
  title: string
  markdown: string
}

/** Extract finished createDocument artifacts from an assistant message. */
function documentArtifacts(message: UIMessage): DocArtifact[] {
  if (!message.parts) return []
  const out: DocArtifact[] = []
  message.parts.forEach((p, i) => {
    const part = p as { type?: string; state?: string; output?: { ok?: boolean; title?: string; markdown?: string } }
    if (part.type !== "tool-createDocument") return
    const o = part.output
    if (part.state === "output-available" && o?.ok && o.markdown) {
      out.push({ key: `doc-${i}`, title: o.title || "NQAi Document", markdown: o.markdown })
    }
  })
  return out
}

/** Extract the plain-text content from a UIMessage's parts array. */
function messageText(message: UIMessage): string {
  if (!message.parts) return ""
  return message.parts
    .filter((p): p is { type: "text"; text: string } => p.type === "text")
    .map((p) => p.text)
    .join("")
}

/** Human labels for NQAi's live data tools, shown as activity chips. */
// Present-tense labels shown while a tool is still running.
const TOOL_LABELS: Record<string, string> = {
  "tool-verifyVessel": "Verifying vessel",
  "tool-searchVessels": "Searching vessel catalogue",
  "tool-listSpotDeals": "Scanning spot-deal board",
  "tool-discoverOilDeals": "Matching vessels & oil deals",
  "tool-vesselDataProviderStatus": "Checking AIS provider",
  "tool-searchResearch": "Searching global research",
  "tool-lookupInstitution": "Looking up institution",
  "tool-exploreConcept": "Mapping research field",
  "tool-sendEmail": "Sending email",
  "tool-sendSms": "Sending SMS",
  "tool-createDocument": "Drafting document",
}

// Past-tense labels shown once a tool has finished successfully, so a completed
// chip never looks like it is perpetually "Sending…".
const TOOL_DONE_LABELS: Record<string, string> = {
  "tool-verifyVessel": "Vessel verified",
  "tool-searchVessels": "Catalogue searched",
  "tool-listSpotDeals": "Spot-deal board scanned",
  "tool-discoverOilDeals": "Vessels & deals matched",
  "tool-vesselDataProviderStatus": "AIS provider checked",
  "tool-searchResearch": "Research retrieved",
  "tool-lookupInstitution": "Institution found",
  "tool-exploreConcept": "Field mapped",
  "tool-sendEmail": "Email sent",
  "tool-sendSms": "SMS sent",
  "tool-createDocument": "Document ready",
}

// Labels shown when a tool finished but reported a failure (e.g. email not
// configured, invalid recipient, provider error).
const TOOL_FAIL_LABELS: Record<string, string> = {
  "tool-sendEmail": "Email failed",
  "tool-sendSms": "SMS failed",
}

/** Tool keys that belong to the knowledge/research layer (book icon). */
const KNOWLEDGE_TOOLS = new Set(["tool-searchResearch", "tool-lookupInstitution", "tool-exploreConcept"])

/** Tool keys that send an outbound message (send icon). */
const MESSAGING_TOOLS = new Set(["tool-sendEmail", "tool-sendSms"])

/** Tool keys that author a document (file icon). */
const DOCUMENT_TOOLS = new Set(["tool-createDocument"])

interface ToolActivity {
  key: string
  label: string
  done: boolean
  failed: boolean
  kind: "vessel" | "knowledge" | "messaging" | "document"
}

/** Collect tool invocations from a message's parts for the activity strip. */
function toolActivity(message: UIMessage): ToolActivity[] {
  if (!message.parts) return []
  const out: ToolActivity[] = []
  message.parts.forEach((p, i) => {
    const type = (p as { type?: string }).type ?? ""
    if (!type.startsWith("tool-")) return
    if (!(type in TOOL_LABELS)) return
    const state = (p as { state?: string }).state ?? ""
    const done = state === "output-available" || state === "output-error"
    // A tool can finish "successfully" (output-available) yet still report a
    // logical failure via `{ ok: false }` in its output (e.g. email not
    // configured). Treat both as a failed chip so the user sees it plainly.
    const output = (p as { output?: { ok?: boolean } }).output
    const failed = done && (state === "output-error" || output?.ok === false)
    const label = failed
      ? TOOL_FAIL_LABELS[type] ?? `${TOOL_LABELS[type]} — failed`
      : done
        ? TOOL_DONE_LABELS[type] ?? TOOL_LABELS[type]
        : TOOL_LABELS[type]
    out.push({
      key: `${type}-${i}`,
      label,
      done,
      failed,
      kind: KNOWLEDGE_TOOLS.has(type)
        ? "knowledge"
        : MESSAGING_TOOLS.has(type)
          ? "messaging"
          : DOCUMENT_TOOLS.has(type)
            ? "document"
            : "vessel",
    })
  })
  return out
}

function NqaiAvatar({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "flex h-8 w-8 shrink-0 items-center justify-center rounded-sm border border-primary/40 bg-primary/10 text-primary",
        className,
      )}
      aria-hidden="true"
    >
      <Cpu className="h-4 w-4" />
    </span>
  )
}

export function NqaiChat({ variant = "page" }: { variant?: "page" | "panel" }) {
  const [input, setInput] = useState("")
  const [greeting, setGreeting] = useState("")
  const [bootstrapped, setBootstrapped] = useState(false)
  const [resetting, setResetting] = useState(false)
  const [fullscreen, setFullscreen] = useState(false)
  const [attachments, setAttachments] = useState<PendingAttachment[]>([])
  const [dragOver, setDragOver] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const { messages, sendMessage, setMessages, status, error, stop, regenerate, clearError } = useChat({
    transport: new DefaultChatTransport({ api: "/api/nqai" }),
  })
  const pdf = usePdfViewer()
  const user = useCurrentUser()
  const clientName = [user?.fullName, user?.company].filter(Boolean).join(" — ") || undefined

  const busy = status === "submitted" || status === "streaming"
  const hasConversation = messages.length > 0
  const uploadingFiles = attachments.some((a) => a.status === "uploading")
  const readyFiles = attachments.filter((a) => a.status === "ready" && a.url)
  const canSend = !busy && !uploadingFiles && (input.trim().length > 0 || readyFiles.length > 0)

  // Download an NQAi-authored document as a branded PDF via the shared viewer.
  const downloadDocument = useCallback(
    (artifact: DocArtifact) => {
      try {
        const generated = generateNqaiDocumentPdf({
          title: artifact.title,
          markdown: artifact.markdown,
          clientName,
        })
        pdf.show(generated)
      } catch (err) {
        console.log("[v0] NQAi document PDF failed:", err instanceof Error ? err.message : String(err))
      }
    },
    [pdf, clientName],
  )

  // Upload one file to Blob via the NQAi upload route, tracking its progress.
  const uploadAttachment = useCallback(async (id: string, file: File) => {
    try {
      const form = new FormData()
      form.append("file", file)
      const res = await fetch("/api/nqai/upload", { method: "POST", body: form })
      const data = (await res.json().catch(() => ({}))) as {
        url?: string
        mediaType?: string
        error?: string
      }
      if (!res.ok || !data.url) {
        setAttachments((prev) =>
          prev.map((a) => (a.id === id ? { ...a, status: "error", error: data.error || "Upload failed" } : a)),
        )
        return
      }
      setAttachments((prev) =>
        prev.map((a) =>
          a.id === id ? { ...a, status: "ready", url: data.url, mediaType: data.mediaType || a.mediaType } : a,
        ),
      )
    } catch {
      setAttachments((prev) =>
        prev.map((a) => (a.id === id ? { ...a, status: "error", error: "Upload failed" } : a)),
      )
    }
  }, [])

  // Validate and queue files for upload (from the picker or drag & drop).
  const addFiles = useCallback(
    (files: FileList | File[]) => {
      const list = Array.from(files)
      list.forEach((file) => {
        const id = `${Date.now()}-${Math.random().toString(36).slice(2)}`
        if (file.size > MAX_UPLOAD_BYTES) {
          setAttachments((prev) => [
            ...prev,
            { id, name: file.name, size: file.size, mediaType: file.type, status: "error", error: "Over 20 MB" },
          ])
          return
        }
        setAttachments((prev) => [
          ...prev,
          { id, name: file.name, size: file.size, mediaType: file.type || "application/octet-stream", status: "uploading" },
        ])
        void uploadAttachment(id, file)
      })
    },
    [uploadAttachment],
  )

  const removeAttachment = useCallback((id: string) => {
    setAttachments((prev) => prev.filter((a) => a.id !== id))
  }, [])

  // Auto-grow the composer: reset to a single row, then expand to fit content
  // up to a comfortable max (after which it scrolls internally).
  const resizeTextarea = useCallback(() => {
    const el = textareaRef.current
    if (!el) return
    el.style.height = "auto"
    const max = 220
    el.style.height = `${Math.min(el.scrollHeight, max)}px`
    el.style.overflowY = el.scrollHeight > max ? "auto" : "hidden"
  }, [])

  // Re-fit whenever the value changes (typing, paste, or reset after sending).
  useEffect(() => {
    resizeTextarea()
  }, [input, resizeTextarea])

  // Allow Esc to exit full-screen.
  useEffect(() => {
    if (!fullscreen) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setFullscreen(false)
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [fullscreen])

  // On mount, reload this user's prior conversation (session continuity) and
  // fetch their personalized greeting. Runs once.
  useEffect(() => {
    let active = true
    bootstrapNqai()
      .then((data) => {
        if (!active) return
        if (data.messages?.length) setMessages(data.messages)
        if (data.greeting) setGreeting(data.greeting)
      })
      .catch(() => {})
      .finally(() => {
        if (active) setBootstrapped(true)
      })
    return () => {
      active = false
    }
  }, [setMessages])

  // Auto-scroll to the newest content as it streams in.
  useEffect(() => {
    const el = scrollRef.current
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: "smooth" })
  }, [messages, busy])

  const startNewConversation = async () => {
    if (busy || resetting) return
    setResetting(true)
    try {
      await resetNqaiConversation()
      setMessages([])
      setInput("")
    } finally {
      setResetting(false)
    }
  }

  const submit = (text: string) => {
    const value = text.trim()
    const files = attachments.filter((a) => a.status === "ready" && a.url)
    // Need either text or at least one uploaded file; never send while a file
    // is still uploading.
    if ((!value && files.length === 0) || busy || uploadingFiles) return
    const fileParts = files.map((a) => ({
      type: "file" as const,
      url: a.url as string,
      mediaType: a.mediaType,
      filename: a.name,
    }))
    sendMessage({
      role: "user",
      parts: [...fileParts, ...(value ? [{ type: "text" as const, text: value }] : [])],
    })
    setInput("")
    setAttachments([])
  }

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    submit(input)
  }

  return (
    <div
      className={cn(
        "flex h-full min-h-0 flex-col bg-background",
        fullscreen && "fixed inset-0 z-50 h-[100dvh]",
      )}
    >
      {/* Header */}
      <div className="flex items-center justify-between gap-3 border-b border-border bg-card px-4 py-3">
        <div className="flex items-center gap-3">
          <NqaiAvatar />
          <div className="leading-tight">
            <div className="flex items-center gap-2">
              <span className="font-semibold tracking-tight text-foreground">NQAi</span>
              <span className="rounded-sm border border-primary/30 bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wider text-primary">
                Super Intelligence
              </span>
            </div>
            <p className="text-[11px] text-muted-foreground">{NQAI_TAGLINE}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {hasConversation && (
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={startNewConversation}
              disabled={busy || resetting}
              className="h-7 gap-1.5 px-2 text-[11px] text-muted-foreground hover:text-foreground"
              aria-label="Start a new conversation"
            >
              <RotateCcw className={cn("h-3.5 w-3.5", resetting && "animate-spin")} />
              <span className="hidden sm:inline">New</span>
            </Button>
          )}
          <div className="flex items-center gap-1.5">
            <span
              className={cn(
                "h-2 w-2 rounded-full",
                error ? "bg-destructive" : busy ? "bg-warning animate-pulse" : "bg-success animate-pulse",
              )}
            />
            <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              {error ? "Fault" : busy ? "Reasoning" : "Online"}
            </span>
          </div>
          <Button
            type="button"
            size="icon"
            variant="ghost"
            onClick={() => setFullscreen((v) => !v)}
            className="h-7 w-7 shrink-0 text-muted-foreground hover:text-foreground"
            aria-label={fullscreen ? "Exit full screen" : "Enter full screen"}
            title={fullscreen ? "Exit full screen (Esc)" : "Full screen"}
          >
            {fullscreen ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
          </Button>
        </div>
      </div>

      {/* Conversation */}
      <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
        <div
          className={cn(
            "mx-auto w-full",
            variant === "page" ? "max-w-3xl space-y-5" : "space-y-4",
          )}
        >
        {/* Canonical welcome message — always shown on load */}
        <div className="flex gap-3">
          <NqaiAvatar />
          <div className="min-w-0 flex-1">
            <div className="rounded-sm border border-primary/20 bg-card p-4">
              <p className="mb-2 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-primary">
                <Sparkles className="h-3.5 w-3.5" />
                NQAi · Neural Quantum Artificial Intelligence
              </p>
              <p className="text-pretty text-sm leading-relaxed text-foreground/90">{NQAI_WELCOME}</p>
              <p className="mt-3 border-t border-border pt-2 text-[11px] text-muted-foreground">
                Running on RISC-V · Research cloud, UC Berkeley · Proprietary architecture
              </p>
            </div>

            {/* Personalized briefing — generated server-side from the signed-in
                client's own private account context. */}
            {greeting && (
              <div className="mt-3 flex gap-2 rounded-sm border border-primary/20 bg-primary/5 p-3 text-sm leading-relaxed text-foreground/90">
                <Sparkles className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />
                <p className="text-pretty">{greeting}</p>
              </div>
            )}

            {/* Suggested prompts (hidden once a conversation starts, and held
                back until bootstrap finishes so returning users don't see a
                flash of chips before their history loads) */}
            {bootstrapped && !hasConversation && (
              <div className="mt-3 grid gap-2 sm:grid-cols-2">
                {NQAI_SUGGESTIONS.map((s) => (
                  <button
                    key={s.label}
                    type="button"
                    onClick={() => submit(s.prompt)}
                    className="flex items-center gap-2 rounded-sm border border-border bg-secondary/40 px-3 py-2 text-left text-xs text-foreground transition-colors hover:border-primary/40 hover:bg-secondary"
                  >
                    <Sparkles className="h-3.5 w-3.5 shrink-0 text-primary" />
                    <span className="truncate">{s.label}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Chat turns */}
        {messages.map((message) => {
          const text = messageText(message)
          const isUser = message.role === "user"
          const activity = isUser ? [] : toolActivity(message)
          const files = isUser ? messageFiles(message) : []
          const docs = isUser ? [] : documentArtifacts(message)
          return (
            <div key={message.id} className={cn("flex gap-3", isUser && "flex-row-reverse")}>
              {isUser ? (
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-sm border border-border bg-secondary text-muted-foreground">
                  <User className="h-4 w-4" />
                </span>
              ) : (
                <NqaiAvatar />
              )}
              <div
                className={cn(
                  "min-w-0 max-w-[85%] rounded-sm border px-3.5 py-2.5 text-sm leading-relaxed",
                  isUser
                    ? "border-primary/30 bg-primary/10 text-foreground"
                    : "border-border bg-card text-foreground/90",
                )}
              >
                {activity.length > 0 && (
                  <div className="mb-2 flex flex-wrap gap-1.5">
                    {activity.map((a) => (
                      <span
                        key={a.key}
                        className={cn(
                          "inline-flex items-center gap-1 rounded-sm border px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wider",
                          a.failed
                            ? "border-destructive/40 bg-destructive/10 text-destructive"
                            : a.done
                              ? "border-primary/30 bg-primary/10 text-primary"
                              : "border-warning/30 bg-warning/10 text-warning",
                        )}
                      >
                        {!a.done ? (
                          <Loader2 className="h-3 w-3 animate-spin" />
                        ) : a.failed ? (
                          <AlertTriangle className="h-3 w-3" />
                        ) : a.kind === "knowledge" ? (
                          <BookOpen className="h-3 w-3" />
                        ) : a.kind === "messaging" ? (
                          <Send className="h-3 w-3" />
                        ) : a.kind === "document" ? (
                          <FileText className="h-3 w-3" />
                        ) : a.label.includes("vessel") || a.label.includes("AIS") ? (
                          <Ship className="h-3 w-3" />
                        ) : (
                          <Radar className="h-3 w-3" />
                        )}
                        <span>{a.label}</span>
                      </span>
                    ))}
                  </div>
                )}
                {/* Attachments the client uploaded with this message */}
                {files.length > 0 && (
                  <div className="mb-2 flex flex-wrap gap-1.5">
                    {files.map((f, idx) => {
                      const Icon = fileIcon(f.mediaType)
                      return (
                        <a
                          key={`${f.url}-${idx}`}
                          href={f.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex max-w-[200px] items-center gap-1.5 rounded-sm border border-border bg-background/60 px-2 py-1 text-xs text-foreground transition-colors hover:border-primary/40"
                          title={f.name}
                        >
                          <Icon className="h-3.5 w-3.5 shrink-0 text-primary" />
                          <span className="truncate">{f.name}</span>
                        </a>
                      )
                    })}
                  </div>
                )}
                {text ? (
                  isUser ? (
                    <p className="whitespace-pre-wrap text-pretty">{text}</p>
                  ) : (
                    <Streamdown
                      className={cn(
                        "max-w-none text-sm leading-relaxed",
                        "[&_p]:my-1.5 [&_p:first-child]:mt-0 [&_p:last-child]:mb-0",
                        "[&_ul]:my-1.5 [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:my-1.5 [&_ol]:list-decimal [&_ol]:pl-5 [&_li]:my-0.5",
                        "[&_strong]:font-semibold [&_strong]:text-foreground",
                        "[&_h1]:mb-1.5 [&_h1]:mt-2 [&_h1]:text-base [&_h1]:font-semibold [&_h2]:mb-1.5 [&_h2]:mt-2 [&_h2]:text-sm [&_h2]:font-semibold [&_h3]:mb-1 [&_h3]:mt-2 [&_h3]:text-sm [&_h3]:font-semibold",
                        "[&_a]:text-primary [&_a]:underline [&_a]:underline-offset-2",
                        "[&_code]:rounded-sm [&_code]:bg-secondary [&_code]:px-1 [&_code]:py-0.5 [&_code]:font-mono [&_code]:text-[0.85em]",
                        "[&_pre]:my-2 [&_pre]:overflow-x-auto [&_pre]:rounded-sm [&_pre]:border [&_pre]:border-border [&_pre]:bg-secondary/60 [&_pre]:p-2.5",
                        "[&_table]:my-2 [&_table]:w-full [&_table]:border-collapse [&_table]:text-xs",
                        "[&_th]:border [&_th]:border-border [&_th]:bg-secondary/60 [&_th]:px-2 [&_th]:py-1 [&_th]:text-left [&_th]:font-semibold",
                        "[&_td]:border [&_td]:border-border [&_td]:px-2 [&_td]:py-1 [&_td]:tabular-nums",
                        "[&_blockquote]:border-l-2 [&_blockquote]:border-primary/40 [&_blockquote]:pl-3 [&_blockquote]:text-muted-foreground",
                        "[&_hr]:my-3 [&_hr]:border-border",
                      )}
                    >
                      {text}
                    </Streamdown>
                  )
                ) : files.length === 0 && docs.length === 0 ? (
                  <span className="inline-flex items-center gap-1 text-muted-foreground">
                    <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-primary [animation-delay:-0.3s]" />
                    <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-primary [animation-delay:-0.15s]" />
                    <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-primary" />
                  </span>
                ) : null}

                {/* Downloadable documents NQAi authored in this turn */}
                {docs.length > 0 && (
                  <div className={cn("flex flex-col gap-2", text ? "mt-3" : "mt-0")}>
                    {docs.map((doc) => (
                      <div
                        key={doc.key}
                        className="flex items-center gap-3 rounded-sm border border-primary/30 bg-primary/5 p-3"
                      >
                        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-sm border border-primary/30 bg-background text-primary">
                          <FileText className="h-4 w-4" />
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium text-foreground">{doc.title}</p>
                          <p className="text-[11px] text-muted-foreground">PDF document · prepared by NQAi</p>
                        </div>
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          onClick={() => downloadDocument(doc)}
                          className="shrink-0 gap-1.5 border-primary/40 text-primary hover:bg-primary/10"
                        >
                          <Download className="h-3.5 w-3.5" />
                          Download
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )
        })}

        {error && (
          <div className="flex items-center gap-2 rounded-sm border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">
            <AlertTriangle className="h-4 w-4 shrink-0" />
            <span className="flex-1">{describeNqaiError(error)}</span>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => {
                clearError()
                void regenerate()
              }}
              className="h-7 shrink-0 gap-1.5 border-destructive/40 text-destructive hover:bg-destructive/10"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              Retry
            </Button>
          </div>
        )}
        </div>
      </div>

      {/* Composer */}
      <form onSubmit={onSubmit} className="border-t border-border bg-card p-3">
        <div className="mx-auto w-full max-w-3xl">
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept={ACCEPTED_UPLOAD}
            className="hidden"
            onChange={(e) => {
              if (e.target.files?.length) addFiles(e.target.files)
              e.target.value = ""
            }}
          />
          {/* Pending attachment chips */}
          {attachments.length > 0 && (
            <div className="mb-2 flex flex-wrap gap-1.5">
              {attachments.map((a) => {
                const Icon = fileIcon(a.mediaType)
                return (
                  <span
                    key={a.id}
                    className={cn(
                      "inline-flex max-w-[220px] items-center gap-1.5 rounded-sm border px-2 py-1 text-xs",
                      a.status === "error"
                        ? "border-destructive/40 bg-destructive/10 text-destructive"
                        : "border-border bg-background text-foreground",
                    )}
                    title={a.error ? `${a.name} — ${a.error}` : a.name}
                  >
                    {a.status === "uploading" ? (
                      <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-primary" />
                    ) : a.status === "error" ? (
                      <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                    ) : (
                      <Icon className="h-3.5 w-3.5 shrink-0 text-primary" />
                    )}
                    <span className="truncate">{a.name}</span>
                    {a.status === "ready" && a.size > 0 && (
                      <span className="shrink-0 text-[10px] text-muted-foreground">{formatBytes(a.size)}</span>
                    )}
                    <button
                      type="button"
                      onClick={() => removeAttachment(a.id)}
                      className="shrink-0 rounded-sm text-muted-foreground transition-colors hover:text-foreground"
                      aria-label={`Remove ${a.name}`}
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </span>
                )
              })}
            </div>
          )}
          <div
            onDragOver={(e) => {
              e.preventDefault()
              setDragOver(true)
            }}
            onDragLeave={(e) => {
              e.preventDefault()
              setDragOver(false)
            }}
            onDrop={(e) => {
              e.preventDefault()
              setDragOver(false)
              if (e.dataTransfer.files?.length) addFiles(e.dataTransfer.files)
            }}
            className={cn(
              "flex items-end gap-2 rounded-md border border-border bg-background px-3 py-2 transition-colors focus-within:border-primary/50",
              dragOver && "border-primary bg-primary/5",
            )}
          >
            <Button
              type="button"
              size="icon"
              variant="ghost"
              onClick={() => fileInputRef.current?.click()}
              disabled={busy}
              className="h-8 w-8 shrink-0 self-end text-muted-foreground hover:text-foreground"
              aria-label="Attach document"
              title="Attach a document for NQAi to analyze"
            >
              <Paperclip className="h-4 w-4" />
            </Button>
            <textarea
              ref={textareaRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault()
                  submit(input)
                }
              }}
              onPaste={(e) => {
                const pasted = Array.from(e.clipboardData.files)
                if (pasted.length > 0) {
                  e.preventDefault()
                  addFiles(pasted)
                }
              }}
              rows={1}
              placeholder="Ask NQAi, or attach a document to analyze…  (Shift + Enter for a new line)"
              className="min-h-[24px] flex-1 resize-none bg-transparent text-sm leading-relaxed text-foreground placeholder:text-muted-foreground focus:outline-none"
              aria-label="Message NQAi"
            />
            {busy ? (
              <Button
                type="button"
                size="icon"
                variant="ghost"
                onClick={() => stop()}
                className="h-8 w-8 shrink-0 self-end text-muted-foreground hover:text-foreground"
                aria-label="Stop generating"
              >
                <Square className="h-4 w-4" />
              </Button>
            ) : (
              <Button
                type="submit"
                size="icon"
                disabled={!canSend}
                className="h-8 w-8 shrink-0 self-end"
                aria-label="Send message"
              >
                <ArrowUp className="h-4 w-4" />
              </Button>
            )}
          </div>
          <p className="mt-1.5 px-1 text-[10px] text-muted-foreground">
            {uploadingFiles
              ? "Uploading attachment…"
              : "Attach PDFs, images, or text/CSV for analysis. NQAi can also prepare downloadable PDF documents."}
          </p>
        </div>
      </form>
    </div>
  )
}
