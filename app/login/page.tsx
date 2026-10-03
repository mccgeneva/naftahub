import Link from "next/link"
import type { Metadata } from "next"
import { ShieldAlert, ShieldCheck } from "lucide-react"
import { LoginForm } from "@/components/login-form"
import { DownloadAppButton } from "@/components/download-app-button"

export const metadata: Metadata = {
  title: "Sign In | MCC Trading Platform",
  description: "Secure login to the MCC Capital trading platform.",
}

const EXPIRED_MESSAGES: Record<string, string> = {
  expiry: "Your session expired. Please sign in again.",
  "tab-close": "You were signed out because the browser tab was closed.",
  inactivity: "You were signed out after 15 minutes of inactivity.",
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
          <DownloadAppButton />
        </div>

        <div className="mt-6 rounded-lg border border-border bg-muted/40 p-4 text-center">
          <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            Platform operated by
          </p>
          <p className="mt-1 text-sm font-semibold text-foreground">NAFTAHUB PLC</p>
          <p className="text-xs text-muted-foreground">Company number 16421621</p>
          <p className="mt-2 text-xs leading-relaxed text-muted-foreground text-pretty">
            Registered office: 71-75 Shelton Street, Covent Garden, London, United Kingdom, WC2H 9JQ
          </p>
          <p className="mt-3 border-t border-border pt-3 text-xs text-muted-foreground text-pretty">
            Under the umbrella of the Swiss fiduciary holding{" "}
            <span className="font-medium text-foreground">MCC Holding (MCC Capital)</span>
          </p>
        </div>

        <section
          aria-labelledby="licensing-disclaimer-title"
          className="mt-4 rounded-lg border border-border bg-card p-4"
        >
          <div className="flex items-start gap-3">
            <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-primary" aria-hidden="true" />
            <div className="flex min-w-0 flex-col gap-2">
              <h2
                id="licensing-disclaimer-title"
                className="text-sm font-semibold text-foreground text-balance"
              >
                Banking licences &amp; regulation
              </h2>
              <p className="text-xs leading-relaxed text-muted-foreground text-pretty">
                NAFTAhub is a technology platform, not a bank. Regulated banking and payment services
                are provided through white-label partnership agreements with licensed partner banks
                ranked among the world&apos;s top 25 and holding top-tier credit ratings. Under these
                agreements the platform operates under the banking licences of its partners.
              </p>
              <p className="text-xs leading-relaxed text-muted-foreground text-pretty">
                Your funds and transactions are held and processed by these licensed partner banks,
                under the supervision of their banking regulators.
              </p>
            </div>
          </div>
        </section>

        <p className="mt-6 text-center text-xs text-muted-foreground">
          {"\u00A9"} 2024 MCC Holding SA. For qualified investors only.
        </p>
      </div>
    </main>
  )
}
