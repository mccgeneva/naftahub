import type { Metadata } from "next"
import { AuthPageShell } from "@/components/auth/auth-page-shell"
import { ForgotPasswordForm } from "@/components/auth/forgot-password-form"

export const metadata: Metadata = {
  title: "Reset password | MCC Trading Platform",
  description: "Reset a lost or compromised MCC Capital password.",
}

export default function ForgotPasswordPage() {
  return (
    <AuthPageShell
      title="Reset your password"
      description="We'll email a reset link to the address registered on your profile."
    >
      <ForgotPasswordForm />
    </AuthPageShell>
  )
}
