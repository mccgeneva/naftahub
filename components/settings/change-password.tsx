"use client"

import { useState } from "react"
import { Eye, EyeOff, KeyRound, Loader2, Lock } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { changeMyPassword } from "@/app/actions/auth"
import { useCurrentUser } from "@/lib/use-current-user"
import { DEMO_USER_ID } from "@/lib/users"
import { useActivityLog } from "@/components/activity-tracker"

export function ChangePassword() {
  const user = useCurrentUser()
  const logActivity = useActivityLog()
  const isDemo = user.id === DEMO_USER_ID

  const [current, setCurrent] = useState("")
  const [next, setNext] = useState("")
  const [confirm, setConfirm] = useState("")
  const [show, setShow] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState(false)

  // The demonstration account is immutable so the public demo login keeps
  // working — show a clear, non-actionable notice instead of the form.
  if (isDemo) {
    return (
      <div className="rounded-lg border border-border bg-muted/40 p-4">
        <div className="flex items-start gap-3">
          <Lock className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
          <div className="space-y-1">
            <Label>Password</Label>
            <p className="text-xs text-muted-foreground">
              This is a demonstration account, so its password is fixed and cannot be changed.
            </p>
          </div>
        </div>
      </div>
    )
  }

  const reset = () => {
    setCurrent("")
    setNext("")
    setConfirm("")
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setDone(false)

    if (next !== confirm) {
      setError("Your new password and confirmation do not match.")
      return
    }
    if (next.length < 8) {
      setError("Your new password must be at least 8 characters long.")
      return
    }

    setSubmitting(true)
    const res = await changeMyPassword(current, next)
    setSubmitting(false)

    if (!res.ok) {
      setError(res.error)
      return
    }

    setDone(true)
    reset()
    logActivity({
      action: "Changed account password",
      category: "Settings / Security",
      details: { summary: "Client updated their own login password from Settings." },
    })
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="flex items-start gap-3">
        <KeyRound className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
        <div className="space-y-1">
          <Label>Password</Label>
          <p className="text-xs text-muted-foreground">
            Change the password you use to sign in. You&apos;ll need your current password to confirm.
          </p>
        </div>
      </div>

      <div className="space-y-3">
        <div className="space-y-1.5">
          <Label htmlFor="current-password" className="text-xs">
            Current password
          </Label>
          <Input
            id="current-password"
            type={show ? "text" : "password"}
            autoComplete="current-password"
            value={current}
            onChange={(e) => setCurrent(e.target.value)}
            required
            className="text-base"
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="new-password" className="text-xs">
            New password
          </Label>
          <div className="relative">
            <Input
              id="new-password"
              type={show ? "text" : "password"}
              autoComplete="new-password"
              value={next}
              onChange={(e) => setNext(e.target.value)}
              required
              minLength={8}
              className="pr-10 text-base"
            />
            <button
              type="button"
              onClick={() => setShow((s) => !s)}
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-muted-foreground hover:text-foreground"
              aria-label={show ? "Hide passwords" : "Show passwords"}
            >
              {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
          <p className="text-xs text-muted-foreground">At least 8 characters.</p>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="confirm-password" className="text-xs">
            Confirm new password
          </Label>
          <Input
            id="confirm-password"
            type={show ? "text" : "password"}
            autoComplete="new-password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            required
            minLength={8}
            className="text-base"
          />
        </div>
      </div>

      {error && (
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
      )}
      {done && (
        <p className="text-sm text-emerald-500" role="status">
          Your password has been updated. Use it the next time you sign in.
        </p>
      )}

      <Button type="submit" disabled={submitting || !current || !next || !confirm}>
        {submitting ? (
          <>
            <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Updating…
          </>
        ) : (
          "Update password"
        )}
      </Button>
    </form>
  )
}
