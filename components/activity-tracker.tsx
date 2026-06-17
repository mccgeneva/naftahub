"use client"

import { createContext, useContext, useCallback } from "react"
import { logActivity, type ActivityLog } from "@/app/actions/log-activity"
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
    // Fire-and-forget; never block the UI on logging.
    void logActivity({ ...activity, user, path: activity.path ?? window.location.pathname })
  }, [])

  // Note: page navigation is intentionally NOT logged/emailed — it is pure
  // noise. Only meaningful business actions (handled via useActivityLog) and
  // security/auth events are sent to the trader desk.

  return <ActivityContext.Provider value={log}>{children}</ActivityContext.Provider>
}
