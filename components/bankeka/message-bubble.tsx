import { cn } from "@/lib/utils"
import { MessageStatusIcon } from "./message-status"
import type { BankekaMessage, MessageStatus } from "@/lib/bankeka-shared"

function formatTime(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })
}

export function MessageBubble({
  message,
  pending,
}: {
  message: BankekaMessage
  /** When true the message is an unconfirmed local echo (optimistic send). */
  pending?: boolean
}) {
  const outgoing = message.outgoing
  const isBroadcast = message.kind === "broadcast" && !outgoing
  const status: MessageStatus | "sending" = pending ? "sending" : message.status

  return (
    <div className={cn("flex w-full", outgoing ? "justify-end" : "justify-start")}>
      <div
        className={cn(
          "max-w-[80%] rounded-2xl px-3.5 py-2 text-sm leading-relaxed shadow-sm",
          outgoing
            ? "rounded-br-sm bg-primary text-primary-foreground"
            : isBroadcast
              ? "rounded-bl-sm border border-primary/30 bg-primary/10 text-foreground"
              : "rounded-bl-sm bg-secondary text-secondary-foreground",
        )}
      >
        {isBroadcast && (
          <p className="mb-0.5 text-[10px] font-semibold uppercase tracking-wider text-primary">
            Broadcast
          </p>
        )}
        <p className="whitespace-pre-wrap break-words">{message.body}</p>
        <div
          className={cn(
            "mt-1 flex items-center justify-end gap-1",
            outgoing ? "text-primary-foreground/70" : "text-muted-foreground",
          )}
        >
          <span className="text-[10px] tabular-nums">{formatTime(message.createdAt)}</span>
          {outgoing && <MessageStatusIcon status={status} className="text-primary-foreground/80" />}
        </div>
      </div>
    </div>
  )
}
