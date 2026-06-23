"use client"

import type { ReactNode } from "react"
import type { LucideIcon } from "lucide-react"
import { cn } from "@/lib/utils"

/**
 * Shared chrome for every console panel: a compact title bar (icon + label +
 * optional live dot and actions) over a scrollable body. Keeps the whole
 * terminal visually consistent and dense, Bloomberg-style.
 */
export function ConsolePanel({
  icon: Icon,
  title,
  badge,
  live,
  actions,
  children,
  className,
  bodyClassName,
}: {
  icon: LucideIcon
  title: string
  badge?: string
  live?: boolean
  actions?: ReactNode
  children: ReactNode
  className?: string
  bodyClassName?: string
}) {
  return (
    <section className={cn("flex h-full min-h-0 flex-col bg-background", className)}>
      <header className="flex h-9 shrink-0 items-center justify-between gap-2 border-b border-border bg-card px-3">
        <div className="flex min-w-0 items-center gap-2">
          <Icon className="h-3.5 w-3.5 shrink-0 text-primary" />
          <h2 className="truncate text-[11px] font-semibold uppercase tracking-wider text-foreground">{title}</h2>
          {badge && (
            <span className="rounded-sm border border-border bg-secondary px-1.5 py-0.5 text-[9px] font-medium uppercase tracking-wider text-muted-foreground">
              {badge}
            </span>
          )}
          {live && (
            <span className="flex items-center gap-1">
              <span className="h-1.5 w-1.5 rounded-full bg-success animate-pulse" />
              <span className="text-[9px] font-semibold uppercase tracking-wider text-success">Live</span>
            </span>
          )}
        </div>
        {actions && <div className="flex shrink-0 items-center gap-1">{actions}</div>}
      </header>
      <div className={cn("min-h-0 flex-1 overflow-y-auto", bodyClassName)}>{children}</div>
    </section>
  )
}
