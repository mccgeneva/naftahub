"use client"

import { useEffect, useRef } from "react"

/**
 * Generic loader for TradingView's free embeddable widgets. Each widget is an
 * external script that renders a sandboxed iframe of real, live market data
 * straight from TradingView — no API key, and it is not subject to the
 * server-side rate limits that affect REST market-data feeds.
 *
 * Pass the widget's script filename (e.g. "embed-widget-ticker-tape.js") and
 * its JSON config. The widget re-initialises whenever the config changes.
 */
export function TradingViewWidget({
  scriptSrc,
  config,
  className,
  height,
}: {
  scriptSrc: string
  config: Record<string, unknown>
  className?: string
  height?: number | string
}) {
  const containerRef = useRef<HTMLDivElement>(null)
  // Serialise config so the effect re-runs only on meaningful changes.
  const configKey = JSON.stringify(config)

  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    // Reset any previous render (e.g. when the symbol/config changes).
    container.innerHTML = ""

    const widgetTarget = document.createElement("div")
    widgetTarget.className = "tradingview-widget-container__widget"
    container.appendChild(widgetTarget)

    const script = document.createElement("script")
    script.src = `https://s3.tradingview.com/external-embedding/${scriptSrc}`
    script.type = "text/javascript"
    script.async = true
    script.innerHTML = configKey
    container.appendChild(script)

    return () => {
      container.innerHTML = ""
    }
    // Keyed on the serialised config only: a fresh `config` object on every
    // parent re-render (e.g. live-quote polling) must not rebuild the widget,
    // or any open search/compare dialog inside it is wiped after a few seconds.
  }, [scriptSrc, configKey])

  return (
    <div
      ref={containerRef}
      className={className}
      style={{ height: height ?? "100%", width: "100%" }}
    />
  )
}
