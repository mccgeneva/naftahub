"use client"

import Link from "next/link"
import { useActionState, useState } from "react"
import { useFormStatus } from "react-dom"
import { AlertCircle, CheckCircle2, Eye, EyeOff, Lock } from "lucide-react"
import { resetPassword, type ResetPasswordState } from "@/app/actions/password-reset"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

function SubmitButton() {
  const { pending } = useFormStatus()
  return (
    <Button type="submit" className="h-11 w-full text-base" disabled={pending}>
      {pending ? "Saving…" : "Set new password"}
    </Button>
  )
}

const inputSafety = {
  autoCorrect: "off",
  autoCapitalize: "off",
  spellCheck: false,
  "data-1p-ignore": true,
  "data-lpignore": "true",
} as const

export function ResetPasswordForm({ token }: { token: string }) {
  const [state, formAction] = useActionState<ResetPasswordState, FormData>(resetPassword, {})
  const [show, setShow] = useState(false)

  if (state.done) {
    return (
      <div className="flex flex-col items-center gap-3 text-center" role="status">
        <div className="flex h-11 w-11 items-center justify-center rounded-full bg-primary/10">
          <CheckCircle2 className="h-5 w-5 text-primary" />
        </div>
        <h2 className="text-base font-semibold text-foreground">Password changed</h2>
        <p className="text-sm leading-relaxed text-muted-foreground text-pretty">
          Your account is unlocked and every other device has been signed out. Sign in with your new password.
        </p>
        <Button asChild className="h-11 w-full text-base">
          <Link href="/login">Go to sign in</Link>
        </Button>
      </div>
    )
  }

  return (
    <form action={formAction} className="flex flex-col gap-5">
      <input type="hidden" name="token" value={token} />

      <div className="flex flex-col gap-2">
        <Label htmlFor="new-password">New password</Label>
        <div className="relative">
          <Lock className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            id="new-password"
            name="password"
            type={show ? "text" : "password"}
            autoComplete="new-password"
            minLength={8}
            required
            className="h-11 pl-10 pr-12 text-base"
            {...inputSafety}
          />
          <button
            type="button"
            onClick={() => setShow((s) => !s)}
            className="absolute right-0 top-0 flex h-11 w-11 items-center justify-center text-muted-foreground"
            aria-label={show ? "Hide password" : "Show password"}
          >
            {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </button>
        </div>
        <p className="text-xs text-muted-foreground">At least 8 characters, with letters and numbers.</p>
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="confirm-password">Confirm new password</Label>
        <div className="relative">
          <Lock className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            id="confirm-password"
            name="confirm"
            type={show ? "text" : "password"}
            autoComplete="new-password"
            minLength={8}
            required
            className="h-11 pl-10 text-base"
            {...inputSafety}
          />
        </div>
      </div>

      {state.error && (
        <div
          role="alert"
          className="flex items-center gap-2 rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2.5 text-sm text-destructive"
        >
          <AlertCircle className="h-4 w-4 shrink-0" />
          <span>{state.error}</span>
        </div>
      )}

      <SubmitButton />
    </form>
  )
}
