"use client"

import { useEffect } from "react"
import { AlertTriangle, RefreshCw } from "lucide-react"
import { Button } from "@/components/ui/button"

/**
 * Error boundary for the entire /dashboard subtree. If a data provider, store,
 * or page throws while rendering, this shows a recoverable error card on the
 * themed background instead of letting the crash bubble to Next.js's blank
 * white fallback page.
 */
export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.log("[v0] dashboard error boundary caught:", error?.message, error?.digest)
  }, [error])

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-6">
      <div className="w-full max-w-md rounded-xl border border-border bg-card p-8 text-center">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-destructive/10">
          <AlertTriangle className="h-6 w-6 text-destructive" />
        </div>
        <h1 className="text-lg font-semibold text-foreground">Something went wrong</h1>
        <p className="mt-2 text-pretty text-sm leading-relaxed text-muted-foreground">
          We couldn&apos;t load this section of your dashboard. This is usually temporary — please
          try again.
        </p>
        <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:justify-center">
          <Button onClick={() => reset()} className="min-h-11 gap-2">
            <RefreshCw className="h-4 w-4" />
            Try again
          </Button>
          <Button
            variant="outline"
            className="min-h-11"
            onClick={() => {
              window.location.href = "/dashboard"
            }}
          >
            Back to overview
          </Button>
        </div>
      </div>
    </div>
  )
}
