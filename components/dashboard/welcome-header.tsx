"use client"

import { useCurrentUser } from "@/lib/use-current-user"

/**
 * Terminal command bar at the top of the dashboard. Reads the signed-in user so
 * the name and company always match whoever is logged in.
 */
export function WelcomeHeader() {
  const user = useCurrentUser()
  return (
    <div className="flex flex-col gap-3 rounded-sm border border-border bg-card sm:flex-row sm:items-center sm:justify-between">
      <div className="flex items-center gap-3 px-4 py-3">
        <span className="flex h-8 w-1 shrink-0 rounded-full bg-primary" aria-hidden="true" />
        <div>
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-semibold uppercase tracking-widest text-primary">
              Terminal
            </span>
            <span className="text-border">/</span>
            <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
              Overview
            </span>
          </div>
          <h1 className="mt-0.5 text-lg font-bold text-foreground">
            {user.firstName}
            <span className="text-muted-foreground"> · {user.company}</span>
          </h1>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-border px-4 py-2 font-mono text-[11px] tabular-nums text-muted-foreground sm:border-l sm:border-t-0">
        <span className="flex items-center gap-1.5">
          <span className="h-1.5 w-1.5 rounded-full bg-success animate-pulse" />
          <span className="uppercase tracking-wider text-success">Operational</span>
        </span>
        <span>SYNC OK</span>
        <span className="hidden sm:inline">LATENCY 12ms</span>
      </div>
    </div>
  )
}
