"use client"

import { useCallback, useEffect, useState, type ComponentType } from "react"
import { RefreshCw, ArrowUpRight, AlertTriangle } from "lucide-react"
import { Card, CardContent, CardHeader } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

interface LiveEmbedPanelProps {
  title: string
  /** Shown before the first load completes. */
  description?: string
  /** Base URL of the external tool to embed. */
  src: string
  icon: ComponentType<{ className?: string }>
  /** Auto-refresh cadence in ms. Defaults to 60s. */
  refreshMs?: number
  /** Embedded viewport height in px. */
  height?: number
}

/**
 * Embeds an external NQAi tool as a live, auto-refreshing iframe panel.
 *
 * Each reload remounts the iframe with a cache-busting `_=<timestamp>` param so
 * the embedded app always pulls fresh data rather than a cached view. A header
 * shows a pulsing LIVE badge, an "updated Xs ago" label and a countdown to the
 * next refresh, plus manual refresh and open-in-new-tab controls. Auto-refresh
 * pauses while the browser tab is hidden so we never hammer the source in the
 * background.
 */
export function LiveEmbedPanel({
  title,
  description,
  src,
  icon: Icon,
  refreshMs = 60000,
  height = 460,
}: LiveEmbedPanelProps) {
  const [token, setToken] = useState(() => Date.now())
  const [loading, setLoading] = useState(true)
  const [blocked, setBlocked] = useState(false)
  const [lastLoaded, setLastLoaded] = useState<Date | null>(null)
  const [secondsAgo, setSecondsAgo] = useState(0)
  const [countdown, setCountdown] = useState(Math.round(refreshMs / 1000))

  // Cache-busted URL so every reload fetches a fresh render.
  const framedSrc = `${src}${src.includes("?") ? "&" : "?"}_=${token}`

  const reload = useCallback(() => {
    setLoading(true)
    setBlocked(false)
    setToken(Date.now())
    setCountdown(Math.round(refreshMs / 1000))
  }, [refreshMs])

  // Auto-refresh on the interval, paused while the tab is hidden.
  useEffect(() => {
    const id = setInterval(() => {
      if (typeof document === "undefined" || document.visibilityState === "visible") {
        reload()
      }
    }, refreshMs)
    return () => clearInterval(id)
  }, [reload, refreshMs])

  // Tick the relative "updated Xs ago" label and the next-refresh countdown.
  useEffect(() => {
    const id = setInterval(() => {
      if (lastLoaded) setSecondsAgo(Math.round((Date.now() - lastLoaded.getTime()) / 1000))
      setCountdown((c) => (c > 0 ? c - 1 : 0))
    }, 1000)
    return () => clearInterval(id)
  }, [lastLoaded])

  // If the iframe never loads (e.g. the source refuses to be framed), surface a
  // graceful fallback after a short grace period instead of an endless spinner.
  useEffect(() => {
    if (!loading) return
    const id = setTimeout(() => {
      setLoading((stillLoading) => {
        if (stillLoading) setBlocked(true)
        return stillLoading
      })
    }, 12000)
    return () => clearTimeout(id)
  }, [loading, token])

  const handleLoad = () => {
    setLoading(false)
    setBlocked(false)
    setLastLoaded(new Date())
    setSecondsAgo(0)
  }

  const statusLabel = loading
    ? "Syncing live data…"
    : lastLoaded
      ? `Updated ${secondsAgo <= 1 ? "just now" : `${secondsAgo}s ago`} · refresh in ${countdown}s`
      : (description ?? "Live feed")

  return (
    <Card className="bg-card border-border overflow-hidden">
      <CardHeader className="flex flex-row items-start justify-between gap-2 pb-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <Icon className="h-4 w-4 shrink-0 text-primary" />
            <h3 className="truncate font-semibold text-foreground">{title}</h3>
            <span className="inline-flex items-center gap-1 rounded-full border border-green-500/30 bg-green-500/10 px-1.5 py-0.5 text-[10px] font-medium text-green-500">
              <span className="relative flex h-1.5 w-1.5">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-green-500/70" />
                <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-green-500" />
              </span>
              LIVE
            </span>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">{statusLabel}</p>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            onClick={reload}
            disabled={loading}
            aria-label={`Refresh ${title}`}
          >
            <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} />
          </Button>
          <Button variant="ghost" size="icon" asChild aria-label={`Open ${title} in a new tab`}>
            <a href={framedSrc} target="_blank" rel="noopener noreferrer">
              <ArrowUpRight className="h-4 w-4" />
            </a>
          </Button>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        <div className="relative w-full border-t border-border" style={{ height }}>
          {loading && !blocked && (
            <div className="absolute inset-0 z-10 flex items-center justify-center bg-background/60 backdrop-blur-sm">
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <RefreshCw className="h-4 w-4 animate-spin text-primary" />
                Loading live data…
              </div>
            </div>
          )}
          {blocked && (
            <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 bg-background/90 p-6 text-center">
              <AlertTriangle className="h-6 w-6 text-muted-foreground" />
              <p className="text-sm text-foreground">This tool can&apos;t be embedded here.</p>
              <Button asChild size="sm">
                <a href={framedSrc} target="_blank" rel="noopener noreferrer">
                  Open {title}
                  <ArrowUpRight className="ml-1.5 h-4 w-4" />
                </a>
              </Button>
            </div>
          )}
          <iframe
            key={token}
            src={framedSrc}
            title={title}
            onLoad={handleLoad}
            className="h-full w-full bg-background"
            loading="lazy"
            referrerPolicy="no-referrer"
            sandbox="allow-scripts allow-same-origin allow-popups allow-forms"
          />
        </div>
      </CardContent>
    </Card>
  )
}
