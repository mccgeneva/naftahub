"use client"

import { createContext, useContext, useCallback } from "react"
import type { ActivityLog } from "@/lib/activity-email"
import { useCurrentUser } from "@/lib/use-current-user"
import { UNKNOWN_USER_ID } from "@/lib/users"

type LogFn = (activity: ActivityLog) => void

const ActivityContext = createContext<LogFn>(() => {})

export function useActivityLog() {
  return useContext(ActivityContext)
}

export function ActivityTracker({ children }: { children: React.ReactNode }) {
  // Resolve the signed-in user from the authoritative identity (which resolves
  // dynamic, admin-created users from the httpOnly session) — NOT from the racy
  // client cookie. This guarantees an action is always attributed to the user
  // who actually performed it, never to a different (e.g. primary) account.
  const current = useCurrentUser()

  const log = useCallback<LogFn>(
    (activity) => {
      // Prefer an explicit user override; otherwise use the resolved identity.
      // If identity hasn't resolved yet, send a neutral label rather than
      // risk attributing the action to the wrong real account.
      const resolvedUser =
        current.id !== UNKNOWN_USER_ID ? `${current.fullName} (${current.company})` : "Unresolved session"
      const user = activity.user ?? resolvedUser
      const payload = {
        ...activity,
        user,
        path: activity.path ?? window.location.pathname,
      }
      // Fire-and-forget; never block the UI on logging. We POST to a Route
      // Handler (not a Server Action) so logging is unaffected by Server Action
      // Origin/CSRF checks and works identically on every domain, including the
      // apex -> www redirect on mcc-btp.app.
      void fetch("/api/log-activity", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        keepalive: true,
      }).catch(() => {
        // Logging must never surface an error to the user.
      })
    },
    [current],
  )

  // Note: page navigation is intentionally NOT logged/emailed — it is pure
  // noise. Only meaningful business actions (handled via useActivityLog) and
  // security/auth events are sent to the trader desk.

  return <ActivityContext.Provider value={log}>{children}</ActivityContext.Provider>
}
