"use client"

import { useEffect } from "react"
import { AlertTriangle, RefreshCw, LogIn } from "lucide-react"
import { Button } from "@/components/ui/button"

/**
 * App-root error boundary.
 *
 * Critically, this catches errors thrown by NESTED LAYOUTS — including
 * `app/dashboard/layout.tsx` and everything it renders directly (the identity
 * provider, the ~20 data-store providers, the SessionGuard, the header and
 * sidebar). A segment's own `error.tsx` (e.g. `app/dashboard/error.tsx`) is
 * rendered *inside* that segment's layout, so it can only catch errors from the
 * page body it wraps — NOT from the layout itself. Without this file, a throw in
 * any of those layout-level components escaped every boundary and fell through
 * to the bare `app/global-error.tsx` screen, whose `reset()` simply re-rendered
 * the same crashing layout (an unrecoverable loop). This was most likely to
 * happen during the high-churn login → logout → login / account-switch moment,
 * when identity is re-resolved, the data-scope cookie is reconciled, and every
 * store re-hydrates at once.
 *
 * Recovery here is deliberately robust: besides `reset()` we offer a HARD
 * navigation to /login, which forces a clean re-authentication and rebuilds the
 * whole tree from a known-good state instead of replaying the broken one.
 */
export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.log("[v0] app error boundary caught:", error?.message, error?.digest)
  }, [error])

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-6">
      <div className="w-full max-w-md rounded-xl border border-border bg-card p-8 text-center">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-destructive/10">
          <AlertTriangle className="h-6 w-6 text-destructive" />
        </div>
        <h1 className="text-lg font-semibold text-foreground">Something went wrong</h1>
        <p className="mt-2 text-pretty text-sm leading-relaxed text-muted-foreground">
          The application hit an unexpected error. You can try again, or sign in again to
          refresh your session.
        </p>
        <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:justify-center">
          <Button onClick={() => reset()} className="min-h-11 gap-2">
            <RefreshCw className="h-4 w-4" />
            Try again
          </Button>
          <Button
            variant="outline"
            className="min-h-11 gap-2"
            onClick={() => {
              // Hard navigation (not router.push) so the entire React tree,
              // client router cache, and any stale RSC payload are discarded and
              // rebuilt from the server with the current session cookie.
              window.location.href = "/login"
            }}
          >
            <LogIn className="h-4 w-4" />
            Sign in again
          </Button>
        </div>
      </div>
    </div>
  )
}
