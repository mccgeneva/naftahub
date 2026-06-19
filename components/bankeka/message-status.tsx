import { Check, CheckCheck, Clock } from "lucide-react"
import { cn } from "@/lib/utils"
import type { MessageStatus } from "@/lib/bankeka-shared"

/**
 * BlackBerry-Messenger style delivery indicator.
 *  - sending  → clock
 *  - sent     → single check
 *  - delivered→ double check (muted)
 *  - read     → double check (success / highlighted)
 */
export function MessageStatusIcon({
  status,
  className,
}: {
  status: MessageStatus | "sending"
  className?: string
}) {
  const base = cn("h-3.5 w-3.5 shrink-0", className)

  if (status === "sending") return <Clock className={cn(base, "opacity-70")} aria-label="Sending" />
  if (status === "sent") return <Check className={base} aria-label="Sent" />
  if (status === "delivered") return <CheckCheck className={base} aria-label="Delivered" />
  return <CheckCheck className={cn(base, "text-success")} aria-label="Read" />
}

export function statusLabel(status: MessageStatus | "sending"): string {
  switch (status) {
    case "sending":
      return "Sending"
    case "sent":
      return "Sent"
    case "delivered":
      return "Delivered"
    case "read":
      return "Read"
  }
}
