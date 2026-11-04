"use client"

import { useEffect, useState } from "react"
import { AlertTriangle, Loader2, RefreshCw } from "lucide-react"
import { Button } from "@/components/ui/button"

/**
 * Error boundary for the entire /dashboard subtree. If a data provider, store,
 * or page throws while rendering, this shows a recoverable error card on the
 * themed background instead of letting the crash bubble to Next.js's blank
 * white fallback page.
 */

// After a new deploy, an app instance still running the previous build asks
// for page files that no longer exist. `reset()` retries the same stale file,
// so the only cure is a full reload that fetches the new build.
const STALE_BUILD_RE =
  /ChunkLoadError|Loading (CSS )?chunk|Failed to fetch dynamically imported module|Importing a module script failed|error loading dynamically imported module|Failed to load chunk|Server Action .* was not found|Failed to find Server Action/i

const RELOAD_KEY = "nqai:stale-build-reload"

function isStaleBuildError(error: Error | undefined): boolean {
  if (!error) return false
  return STALE_BUILD_RE.test(`${error.name ?? ""} ${error.message ?? ""}`)
}

function hardReload() {
  const url = new URL(window.location.href)
  url.searchParams.set("_r", String(Date.now()))
  window.location.replace(url.toString())
}

export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  const stale = isStaleBuildError(error)
  const [reloading, setReloading] = useState(false)

  useEffect(() => {
    console.error("Dashboard error boundary caught:", error?.name, error?.message, error?.digest)
    if (!stale) return
    // Reload once automatically; if it fails again within a minute, stop and
    // let the user decide so we never loop.
    const last = Number(sessionStorage.getItem(RELOAD_KEY) || 0)
    if (Date.now() - last > 60_000) {
      sessionStorage.setItem(RELOAD_KEY, String(Date.now()))
      setReloading(true)
      hardReload()
    }
  }, [error, stale])

  if (reloading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background p-6">
        <div className="flex flex-col items-center gap-3 text-center">
          <Loader2 className="h-6 w-6 animate-spin text-primary" aria-hidden="true" />
          <p className="text-sm text-muted-foreground">Updating to the latest version…</p>
        </div>
      </div>
    )
  }

  const detail = [error?.message, error?.digest ? `ref ${error.digest}` : ""].filter(Boolean).join(" · ")

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-6">
      <div className="w-full max-w-md rounded-xl border border-border bg-card p-8 text-center">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-destructive/10">
          <AlertTriangle className="h-6 w-6 text-destructive" />
        </div>
        <h1 className="text-lg font-semibold text-foreground">Something went wrong</h1>
        <p className="mt-2 text-pretty text-sm leading-relaxed text-muted-foreground">
          {stale
            ? "A new version of the app is available. Reload to continue."
            : "We couldn't load this section of your dashboard. This is usually temporary — please try again."}
        </p>
        {detail && (
          <p className="mt-3 break-words rounded-md bg-muted px-3 py-2 text-left font-mono text-xs leading-relaxed text-muted-foreground">
            {detail}
          </p>
        )}
        <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:justify-center">
          <Button
            onClick={() => {
              if (stale) {
                setReloading(true)
                hardReload()
              } else {
                reset()
              }
            }}
            className="min-h-11 gap-2"
          >
            <RefreshCw className="h-4 w-4" />
            {stale ? "Reload app" : "Try again"}
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
