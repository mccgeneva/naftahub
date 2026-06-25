"use client"

import { useEffect, useRef, useState } from "react"
import { useChat } from "@ai-sdk/react"
import { DefaultChatTransport, type UIMessage } from "ai"
import { Streamdown } from "streamdown"
import { Cpu, ArrowUp, Square, AlertTriangle, Sparkles, User, RotateCcw, Ship, Radar, Loader2 } from "lucide-react"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { NQAI_WELCOME, NQAI_TAGLINE, NQAI_SUGGESTIONS } from "@/lib/nqai"
import { bootstrapNqai, resetNqaiConversation } from "@/app/actions/nqai"

/** Extract the plain-text content from a UIMessage's parts array. */
function messageText(message: UIMessage): string {
  if (!message.parts) return ""
  return message.parts
    .filter((p): p is { type: "text"; text: string } => p.type === "text")
    .map((p) => p.text)
    .join("")
}

/** Human labels for NQAi's live data tools, shown as activity chips. */
const TOOL_LABELS: Record<string, string> = {
  "tool-verifyVessel": "Verifying vessel",
  "tool-searchVessels": "Searching vessel catalogue",
  "tool-listSpotDeals": "Scanning spot-deal board",
  "tool-discoverOilDeals": "Matching vessels & oil deals",
  "tool-vesselDataProviderStatus": "Checking AIS provider",
}

interface ToolActivity {
  key: string
  label: string
  done: boolean
}

/** Collect tool invocations from a message's parts for the activity strip. */
function toolActivity(message: UIMessage): ToolActivity[] {
  if (!message.parts) return []
  const out: ToolActivity[] = []
  message.parts.forEach((p, i) => {
    const type = (p as { type?: string }).type ?? ""
    if (!type.startsWith("tool-")) return
    const label = TOOL_LABELS[type]
    if (!label) return
    const state = (p as { state?: string }).state ?? ""
    out.push({ key: `${type}-${i}`, label, done: state === "output-available" || state === "output-error" })
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
  const scrollRef = useRef<HTMLDivElement>(null)
  const { messages, sendMessage, setMessages, status, error, stop } = useChat({
    transport: new DefaultChatTransport({ api: "/api/nqai" }),
  })

  const busy = status === "submitted" || status === "streaming"
  const hasConversation = messages.length > 0

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
    if (!value || busy) return
    sendMessage({ text: value })
    setInput("")
  }

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    submit(input)
  }

  return (
    <div className="flex h-full min-h-0 flex-col bg-background">
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
        </div>
      </div>

      {/* Conversation */}
      <div
        ref={scrollRef}
        className={cn(
          "min-h-0 flex-1 overflow-y-auto px-4 py-4",
          variant === "page" ? "space-y-5" : "space-y-4",
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
                          a.done
                            ? "border-primary/30 bg-primary/10 text-primary"
                            : "border-warning/30 bg-warning/10 text-warning",
                        )}
                      >
                        {a.done ? (
                          a.label.includes("vessel") || a.label.includes("AIS") ? (
                            <Ship className="h-3 w-3" />
                          ) : (
                            <Radar className="h-3 w-3" />
                          )
                        ) : (
                          <Loader2 className="h-3 w-3 animate-spin" />
                        )}
                        <span>{a.label}</span>
                      </span>
                    ))}
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
                ) : (
                  <span className="inline-flex items-center gap-1 text-muted-foreground">
                    <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-primary [animation-delay:-0.3s]" />
                    <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-primary [animation-delay:-0.15s]" />
                    <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-primary" />
                  </span>
                )}
              </div>
            </div>
          )
        })}

        {error && (
          <div className="flex items-center gap-2 rounded-sm border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">
            <AlertTriangle className="h-4 w-4 shrink-0" />
            <span>
              NQAi could not complete that request. Confirm the Anthropic key is configured, then try again.
            </span>
          </div>
        )}
      </div>

      {/* Composer */}
      <form onSubmit={onSubmit} className="border-t border-border bg-card p-3">
        <div className="flex items-end gap-2 rounded-sm border border-border bg-background px-3 py-2 focus-within:border-primary/50">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault()
                submit(input)
              }
            }}
            rows={1}
            placeholder="Ask NQAi about markets, cargoes, vessels, instruments…"
            className="max-h-32 min-h-[24px] flex-1 resize-none bg-transparent text-sm text-foreground placeholder:text-muted-foreground focus:outline-none"
            aria-label="Message NQAi"
          />
          {busy ? (
            <Button
              type="button"
              size="icon"
              variant="ghost"
              onClick={() => stop()}
              className="h-8 w-8 shrink-0 text-muted-foreground hover:text-foreground"
              aria-label="Stop generating"
            >
              <Square className="h-4 w-4" />
            </Button>
          ) : (
            <Button
              type="submit"
              size="icon"
              disabled={!input.trim()}
              className="h-8 w-8 shrink-0"
              aria-label="Send message"
            >
              <ArrowUp className="h-4 w-4" />
            </Button>
          )}
        </div>
        <p className="mt-1.5 px-1 text-[10px] text-muted-foreground">
          NQAi provides indicative analysis — confirm firm pricing and terms with the desk before execution.
        </p>
      </form>
    </div>
  )
}
