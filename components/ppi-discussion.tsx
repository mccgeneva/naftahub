"use client"

import { useState, type KeyboardEvent } from "react"
import { Loader2, MessagesSquare, Send } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { cn } from "@/lib/utils"
import type { PpiMessage } from "@/lib/ppi-insurance"

type Props = {
  messages: PpiMessage[]
  /** Which side is viewing — their own messages align right. */
  viewer: "treasury" | "client"
  onSend: (text: string) => Promise<boolean>
  disabled?: boolean
  placeholder?: string
}

export function PpiDiscussion({ messages, viewer, onSend, disabled, placeholder }: Props) {
  const [text, setText] = useState("")
  const [sending, setSending] = useState(false)

  const send = async () => {
    const value = text.trim()
    if (!value || sending) return
    setSending(true)
    try {
      if (await onSend(value)) setText("")
    } finally {
      setSending(false)
    }
  }

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key !== "Enter" || e.shiftKey) return
    if (e.nativeEvent.isComposing || e.keyCode === 229) return
    e.preventDefault()
    void send()
  }

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-border p-3">
      <div className="flex items-center gap-2 text-sm font-medium">
        <MessagesSquare className="h-4 w-4 text-primary" aria-hidden />
        Discussion — treasury &amp; customer
      </div>

      {messages.length === 0 ? (
        <p className="text-sm leading-relaxed text-muted-foreground">No messages yet.</p>
      ) : (
        <ul className="flex max-h-72 flex-col gap-2 overflow-y-auto" aria-live="polite">
          {messages.map((m) => {
            const mine = m.author === viewer
            return (
              <li key={m.id} className={cn("flex flex-col gap-1", mine ? "items-end" : "items-start")}>
                <div
                  className={cn(
                    "max-w-[85%] whitespace-pre-wrap break-words rounded-lg px-3 py-2 text-sm leading-relaxed",
                    mine ? "bg-primary text-primary-foreground" : "bg-muted text-foreground",
                  )}
                >
                  {m.text}
                </div>
                <span className="text-xs text-muted-foreground">
                  {m.author === "treasury" ? "Treasury" : m.authorName} ·{" "}
                  {new Date(m.at).toLocaleString("en-GB", { dateStyle: "short", timeStyle: "short" })}
                </span>
              </li>
            )
          })}
        </ul>
      )}

      {!disabled && (
        <div className="flex items-end gap-2">
          <label htmlFor={`ppi-msg-${viewer}`} className="sr-only">
            Message
          </label>
          <Textarea
            id={`ppi-msg-${viewer}`}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={onKeyDown}
            rows={2}
            placeholder={placeholder ?? "Write a message…"}
            className="min-h-11 flex-1 text-base"
          />
          <Button
            onClick={send}
            disabled={sending || !text.trim()}
            className="h-11 w-11 shrink-0 p-0"
            aria-label="Send message"
          >
            {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          </Button>
        </div>
      )}
    </div>
  )
}
