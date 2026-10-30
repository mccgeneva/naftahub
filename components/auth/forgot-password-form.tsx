"use client"

import { useActionState } from "react"
import { useFormStatus } from "react-dom"
import { AlertCircle, Mail, MailCheck, ShieldAlert } from "lucide-react"
import { requestPasswordReset, type ResetRequestState } from "@/app/actions/password-reset"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Checkbox } from "@/components/ui/checkbox"

function SubmitButton() {
  const { pending } = useFormStatus()
  return (
    <Button type="submit" className="h-11 w-full text-base" disabled={pending}>
      {pending ? "Sending…" : "Send reset link"}
    </Button>
  )
}

export function ForgotPasswordForm() {
  const [state, formAction] = useActionState<ResetRequestState, FormData>(requestPasswordReset, {})

  if (state.sent) {
    return (
      <div className="flex flex-col items-center gap-3 text-center" role="status">
        <div className="flex h-11 w-11 items-center justify-center rounded-full bg-primary/10">
          <MailCheck className="h-5 w-5 text-primary" />
        </div>
        <h2 className="text-base font-semibold text-foreground">Check your email</h2>
        <p className="text-sm leading-relaxed text-muted-foreground text-pretty">
          If this address is registered with us, a reset link is on its way. The link works once and expires in 30
          minutes.
        </p>
        {state.locked && (
          <p className="rounded-lg border border-primary/40 bg-primary/10 px-3 py-2.5 text-left text-sm leading-relaxed text-foreground text-pretty">
            For your protection the account is locked and every device has been signed out. Sign-in stays blocked until
            you set a new password from the email.
          </p>
        )}
      </div>
    )
  }

  return (
    <form action={formAction} className="flex flex-col gap-5">
      <div className="flex flex-col gap-2">
        <Label htmlFor="reset-email">Registered email address</Label>
        <div className="relative">
          <Mail className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            id="reset-email"
            name="email"
            type="email"
            inputMode="email"
            autoComplete="username"
            placeholder="you@company.com"
            required
            className="h-11 pl-10 text-base"
          />
        </div>
      </div>

      <label
        htmlFor="compromised"
        className="flex cursor-pointer items-start gap-3 rounded-lg border border-border bg-muted/40 p-3"
      >
        <Checkbox id="compromised" name="compromised" className="mt-0.5" />
        <span className="flex flex-col gap-1">
          <span className="flex items-center gap-1.5 text-sm font-medium text-foreground">
            <ShieldAlert className="h-4 w-4 text-primary" />
            My account may be hacked
          </span>
          <span className="text-xs leading-relaxed text-muted-foreground text-pretty">
            Locks the account and signs out every device right away. Nobody can sign in until a new password is set
            from the emailed link.
          </span>
        </span>
      </label>

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
