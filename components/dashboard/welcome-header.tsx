"use client"

import { useCurrentUser } from "@/lib/use-current-user"

/**
 * Greeting at the top of the dashboard. Reads the signed-in user so the name
 * and company always match whoever is logged in.
 */
export function WelcomeHeader() {
  const user = useCurrentUser()
  return (
    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Welcome back, {user.firstName}</h1>
        <p className="text-sm text-muted-foreground">
          {user.company} — here&apos;s your trading platform overview
        </p>
      </div>
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <div className="h-2 w-2 rounded-full bg-green-500 animate-pulse" />
        <span>All systems operational</span>
        <span className="text-border">|</span>
        <span>Last sync: Just now</span>
      </div>
    </div>
  )
}
