import Link from "next/link"
import type { Metadata } from "next"
import { AlertCircle } from "lucide-react"
import { AuthPageShell } from "@/components/auth/auth-page-shell"
import { ResetPasswordForm } from "@/components/auth/reset-password-form"
import { checkResetToken } from "@/app/actions/password-reset"
import { Button } from "@/components/ui/button"

export const metadata: Metadata = {
  title: "Set a new password | MCC Trading Platform",
  description: "Choose a new password for your MCC Capital account.",
}

export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>
}) {
  const { token = "" } = await searchParams
  const valid = await checkResetToken(token)

  return (
    <AuthPageShell
      title="Set a new password"
      description="Choose a new password. Every other device will be signed out."
    >
      {valid ? (
        <ResetPasswordForm token={token} />
      ) : (
        <div className="flex flex-col items-center gap-3 text-center" role="alert">
          <div className="flex h-11 w-11 items-center justify-center rounded-full bg-destructive/10">
            <AlertCircle className="h-5 w-5 text-destructive" />
          </div>
          <h2 className="text-base font-semibold text-foreground">Link invalid or expired</h2>
          <p className="text-sm leading-relaxed text-muted-foreground text-pretty">
            Reset links work once and expire after 30 minutes. Request a new one to continue.
          </p>
          <Button asChild className="h-11 w-full text-base">
            <Link href="/forgot-password">Request a new link</Link>
          </Button>
        </div>
      )}
    </AuthPageShell>
  )
}
