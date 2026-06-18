"use client"

import { createContext, useContext, useCallback } from "react"
import type { ActivityLog } from "@/lib/activity-email"
import { getActiveUserId } from "@/lib/user-scope"
import { getUserById } from "@/lib/users"

type LogFn = (activity: ActivityLog) => void

const ActivityContext = createContext<LogFn>(() => {})

export function useActivityLog() {
  return useContext(ActivityContext)
}

export function ActivityTracker({ children }: { children: React.ReactNode }) {
  const log = useCallback<LogFn>((activity) => {
    // Derive the signed-in user's identity so the trader-desk email always
    // attributes the action to the correct client. Callers may still override
    // by passing their own `user` field.
    const current = getUserById(getActiveUserId())
    const user = activity.user ?? `${current.fullName} (${current.company})`
    const payload = {
      ...activity,
      user,
      path: activity.path ?? window.location.pathname,
    }
    // Fire-and-forget; never block the UI on logging. We POST to a Route Handler
    // (not a Server Action) so logging is unaffected by Server Action Origin/CSRF
    // checks and works identically on every domain, including the apex -> www
    // redirect on mcc-btp.app.
    void fetch("/api/log-activity", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      keepalive: true,
    }).catch(() => {
      // Logging must never surface an error to the user.
    })
  }, [])

  // Note: page navigation is intentionally NOT logged/emailed — it is pure
  // noise. Only meaningful business actions (handled via useActivityLog) and
  // security/auth events are sent to the trader desk.

  return <ActivityContext.Provider value={log}>{children}</ActivityContext.Provider>
}
