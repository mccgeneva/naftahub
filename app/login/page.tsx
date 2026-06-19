import Link from "next/link"
import type { Metadata } from "next"
import { ShieldAlert } from "lucide-react"
import { LoginForm } from "@/components/login-form"

export const metadata: Metadata = {
  title: "Sign In | MCC Trading Platform",
  description: "Secure login to the MCC Capital trading platform.",
}

const EXPIRED_MESSAGES: Record<string, string> = {
  expiry: "Your session expired. Please sign in again.",
  "tab-close": "You were signed out because the browser tab was closed.",
  inactivity: "You were signed out after 5 minutes of inactivity.",
}

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ expired?: string }>
}) {
  const { expired } = await searchParams
  const expiredMessage = expired ? EXPIRED_MESSAGES[expired] : undefined

  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-4 py-12">
      <div className="w-full max-w-md">
        <div className="mb-8 flex flex-col items-center text-center">
          <Link href="/" className="mb-6 flex items-center gap-2">
            <img
              src="/images/mcc-logo.png"
              alt="MCC Capital logo"
              className="h-12 w-12 rounded-full object-cover"
            />
            <div className="flex flex-col items-start">
              <span className="text-lg font-semibold text-foreground">MCC Capital</span>
              <span className="text-[10px] text-muted-foreground">Swiss Banking</span>
            </div>
          </Link>
          <h1 className="text-2xl font-bold text-foreground text-balance">Sign in to your account</h1>
          <p className="mt-2 text-sm text-muted-foreground text-pretty">
            Enter your credentials to access the trading platform.
          </p>
        </div>

        {expiredMessage && (
          <div
            role="alert"
            className="mb-4 flex items-center gap-2 rounded-lg border border-primary/40 bg-primary/10 px-3 py-2.5 text-sm text-foreground"
          >
            <ShieldAlert className="h-4 w-4 shrink-0 text-primary" />
            <span>{expiredMessage}</span>
          </div>
        )}

        <div className="rounded-xl border border-border bg-card p-6 shadow-sm sm:p-8">
          <LoginForm />
        </div>

        <p className="mt-6 text-center text-xs text-muted-foreground">
          {"\u00A9"} 2024 MCC Holding SA. For qualified investors only.
        </p>
      </div>
    </main>
  )
}
