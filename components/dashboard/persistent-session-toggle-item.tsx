"use client"

import { useEffect, useState, useTransition } from "react"
import { LockKeyhole, Loader2 } from "lucide-react"
import { Switch } from "@/components/ui/switch"
import { getPersistentSession, setPersistentSession } from "@/app/actions/auth"
import { toast } from "sonner"

/**
 * Compact "Stay signed in" toggle designed to sit inside the header account
 * dropdown, right next to Log out — the most intuitive, always-reachable spot
 * for a session preference. Mirrors the fuller card on the profile page.
 */
export function PersistentSessionToggleItem() {
  const [enabled, setEnabled] = useState<boolean | null>(null)
  const [pending, startTransition] = useTransition()

  useEffect(() => {
    let active = true
    getPersistentSession()
      .then((v) => {
        if (active) setEnabled(v)
      })
      .catch(() => {
        if (active) setEnabled(false)
      })
    return () => {
      active = false
    }
  }, [])

  const onToggle = (next: boolean) => {
    const prev = enabled
    setEnabled(next)
    startTransition(async () => {
      const res = await setPersistentSession(next)
      if (!res.ok) {
        setEnabled(prev ?? false)
        toast.error(res.error ?? "Could not update this setting.")
        return
      }
      setEnabled(res.persistent)
      toast.success(res.persistent ? "You'll stay signed in on this device." : "Standard session restored.")
    })
  }

  // Keep the dropdown open when interacting with the row.
  return (
    <div
      className="flex items-center gap-2.5 px-2 py-2"
      onClick={(e) => e.stopPropagation()}
      onKeyDown={(e) => e.stopPropagation()}
    >
      <LockKeyhole className="h-4 w-4 shrink-0 text-muted-foreground" />
      <div className="flex min-w-0 flex-1 flex-col">
        <span className="text-sm font-medium leading-tight">Stay signed in</span>
        <span className="text-[10px] leading-tight text-muted-foreground">Skip auto-logout on this device</span>
      </div>
      {enabled === null ? (
        <Loader2 className="h-4 w-4 shrink-0 animate-spin text-muted-foreground" />
      ) : (
        <Switch
          checked={enabled}
          onCheckedChange={onToggle}
          disabled={pending}
          aria-label="Stay signed in on this device"
        />
      )}
    </div>
  )
}
