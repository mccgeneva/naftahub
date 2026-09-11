"use client"

import { useEffect, useState } from "react"
import { toast } from "sonner"
import { Infinity as InfinityIcon, ShieldCheck } from "lucide-react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Switch } from "@/components/ui/switch"
import { getPersistentSession, setPersistentSession } from "@/app/actions/auth"

/**
 * "Stay signed in" (persistent session) toggle. When enabled, the account's
 * session is issued with a long-lived, server-signed lifetime that never idle-
 * expires or hits the usual absolute cap, so the user is not logged out on tab
 * close or inactivity. The preference is stored on the account and applied to
 * every future login as well; the switch also re-issues the CURRENT session so
 * the change takes effect immediately.
 */
export function PersistentSessionCard() {
  const [enabled, setEnabled] = useState(false)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    let cancelled = false
    getPersistentSession()
      .then((value) => {
        if (!cancelled) setEnabled(value)
      })
      .catch(() => {
        // Keep the safe default (off) on a transient failure.
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [])

  async function handleToggle(next: boolean) {
    if (saving) return
    setSaving(true)
    // Optimistic — reflect the intended state right away.
    setEnabled(next)
    try {
      const res = await setPersistentSession(next)
      if (!res.ok) {
        setEnabled(!next)
        toast.error(res.error || "Couldn't update this setting. Please try again.")
        return
      }
      setEnabled(res.persistent)
      toast.success(
        res.persistent
          ? "Stay signed in is on — you won't be logged out automatically."
          : "Stay signed in is off — your session will time out normally.",
      )
    } catch {
      setEnabled(!next)
      toast.error("Couldn't update this setting. Please try again.")
    } finally {
      setSaving(false)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <InfinityIcon className="h-4 w-4" /> Stay signed in
        </CardTitle>
        <CardDescription>Keep this account logged in — no automatic logout</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="flex items-start justify-between gap-4 rounded-lg border border-border bg-secondary/30 p-4">
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-foreground">Persistent session</p>
            <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
              When on, you stay signed in on this device — you won&apos;t be logged out after 15 minutes of
              inactivity, when you close the tab, or after the usual session limit. Turn it off on shared or public
              devices.
            </p>
            {enabled && !loading && (
              <p className="mt-2 flex items-center gap-1.5 text-xs font-medium text-primary">
                <ShieldCheck className="h-3.5 w-3.5" /> This session will not expire automatically.
              </p>
            )}
          </div>
          <Switch
            checked={enabled}
            onCheckedChange={handleToggle}
            disabled={loading || saving}
            aria-label="Stay signed in"
            className="mt-0.5 shrink-0"
          />
        </div>
      </CardContent>
    </Card>
  )
}
