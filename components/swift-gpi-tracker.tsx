"use client"

import { Check, Loader2, X, Building2, Copy, Globe } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { toast } from "sonner"
import { buildGpiTracking, type GpiPaymentInput, type GpiStageState } from "@/lib/swift-gpi"

function StageDot({ state }: { state: GpiStageState }) {
  return (
    <span
      className={cn(
        "flex h-7 w-7 shrink-0 items-center justify-center rounded-full border-2",
        state === "done" && "border-green-500 bg-green-500/15 text-green-500",
        state === "current" && "border-blue-500 bg-blue-500/15 text-blue-500",
        state === "failed" && "border-red-500 bg-red-500/15 text-red-500",
        state === "pending" && "border-border bg-muted text-muted-foreground",
      )}
    >
      {state === "done" && <Check className="h-3.5 w-3.5" />}
      {state === "current" && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
      {state === "failed" && <X className="h-3.5 w-3.5" />}
      {state === "pending" && <Building2 className="h-3 w-3" />}
    </span>
  )
}

const statusBadgeClass: Record<string, string> = {
  ACSC: "bg-green-500/10 text-green-500 border-green-500/20",
  ACSP: "bg-blue-500/10 text-blue-500 border-blue-500/20",
  PDNG: "bg-yellow-500/10 text-yellow-500 border-yellow-500/20",
  RJCT: "bg-red-500/10 text-red-500 border-red-500/20",
}

function formatStamp(iso?: string) {
  if (!iso) return ""
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ""
  return d.toLocaleString("en-GB", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  })
}

export function SwiftGpiTracker({ payment }: { payment: GpiPaymentInput }) {
  const tracking = buildGpiTracking(payment)

  const copyUetr = () => {
    navigator.clipboard?.writeText(tracking.uetr)
    toast.success("UETR copied", {
      description: "The Unique End-to-End Transaction Reference was copied to your clipboard.",
    })
  }

  return (
    <div className="space-y-4">
      {/* gpi header */}
      <div className="flex flex-col gap-3 rounded-lg border border-border bg-secondary/30 p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Globe className="h-4 w-4 text-primary" />
            <span className="text-sm font-semibold text-foreground">SWIFT gpi Tracker</span>
          </div>
          <Badge
            variant="outline"
            className={cn("text-[10px] font-medium", statusBadgeClass[tracking.statusCode])}
          >
            {tracking.statusCode} · {tracking.statusLabel}
          </Badge>
        </div>
        <div>
          <p className="text-xs text-muted-foreground">UETR (Unique End-to-End Transaction Reference)</p>
          <div className="mt-1 flex items-center gap-2">
            <code className="break-all font-mono text-xs text-foreground">{tracking.uetr}</code>
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6 shrink-0"
              onClick={copyUetr}
              aria-label="Copy UETR"
            >
              <Copy className="h-3 w-3" />
            </Button>
          </div>
        </div>
        {tracking.valueDate && (
          <div>
            <p className="text-xs text-muted-foreground">Value Date (funds credited)</p>
            <p className="mt-0.5 text-sm font-medium text-foreground">{tracking.valueDate}</p>
          </div>
        )}
      </div>

      {/* Timeline */}
      <ol className="relative space-y-0">
        {tracking.stages.map((stage, i) => {
          const isLast = i === tracking.stages.length - 1
          return (
            <li key={stage.key} className="relative flex gap-3 pb-5 last:pb-0">
              {!isLast && (
                <span
                  className={cn(
                    "absolute left-[13px] top-7 h-[calc(100%-1.75rem)] w-px",
                    stage.state === "done" ? "bg-green-500/40" : "bg-border",
                  )}
                  aria-hidden="true"
                />
              )}
              <StageDot state={stage.state} />
              <div className="flex-1 pt-0.5">
                <div className="flex flex-wrap items-center justify-between gap-x-3">
                  <p className="text-sm font-medium text-foreground">{stage.title}</p>
                  {stage.timestamp && (
                    <span className="text-xs text-muted-foreground">{formatStamp(stage.timestamp)}</span>
                  )}
                </div>
                <p className="text-xs text-foreground/80">
                  {stage.institution}
                  {stage.bic && stage.bic !== "BENEFICIARY" ? ` · ${stage.bic}` : ""}
                  {stage.location && stage.location !== "—" ? ` · ${stage.location}` : ""}
                </p>
                <p className="mt-0.5 text-xs text-muted-foreground text-pretty">{stage.description}</p>
              </div>
            </li>
          )
        })}
      </ol>

      <p className="text-[11px] text-muted-foreground text-pretty">
        Payment executed via SWIFT gpi (Global Payments Innovation) with full end-to-end tracking
        capability.
      </p>
    </div>
  )
}
