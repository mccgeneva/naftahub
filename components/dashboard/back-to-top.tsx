"use client"

import { useEffect, useState } from "react"
import { usePathname } from "next/navigation"
import { ArrowUp, ArrowDown } from "lucide-react"
import { cn } from "@/lib/utils"

/**
 * Floating scroll controls for long, data-heavy dashboard pages: a "jump to
 * bottom" (down) and a "back to top" (up) button, stacked bottom-right. Each
 * appears only when there is room to scroll in that direction, tracking the
 * dashboard's scrollable region.
 */
export function BackToTop() {
  const [canScrollUp, setCanScrollUp] = useState(false)
  const [canScrollDown, setCanScrollDown] = useState(false)
  const [scroller, setScroller] = useState<HTMLElement | null>(null)
  const pathname = usePathname()

  // The NQAi chat page has its own dedicated scroll controls (page up/down +
  // jump-to-composer) and a bottom-right send button, so the global control is
  // redundant there and would collide with the composer. Hide it on that route.
  const hidden = pathname?.startsWith("/dashboard/nqai") ?? false

  // The dashboard layout renders content inside the pinch-zoom viewport
  // (the actual scroll container), falling back to <main> if it isn't present.
  useEffect(() => {
    const el =
      document.querySelector("[data-zoom-viewport]") ?? document.querySelector("main")
    setScroller(el instanceof HTMLElement ? el : null)
  }, [])

  useEffect(() => {
    if (!scroller) return
    const onScroll = () => {
      setCanScrollUp(scroller.scrollTop > 320)
      // There is more content below when the remaining distance to the bottom
      // is more than a small threshold.
      const remaining = scroller.scrollHeight - scroller.clientHeight - scroller.scrollTop
      setCanScrollDown(remaining > 320)
    }
    onScroll()
    scroller.addEventListener("scroll", onScroll, { passive: true })
    // Content height changes (data loads, accordions) also affect visibility.
    const observer = new ResizeObserver(onScroll)
    observer.observe(scroller)
    return () => {
      scroller.removeEventListener("scroll", onScroll)
      observer.disconnect()
    }
  }, [scroller])

  const scrollToTop = () => {
    scroller?.scrollTo({ top: 0, behavior: "smooth" })
  }

  const scrollToBottom = () => {
    scroller?.scrollTo({ top: scroller.scrollHeight, behavior: "smooth" })
  }

  if (hidden) return null

  return (
    <div className="fixed bottom-6 right-6 z-50 flex flex-col items-center gap-3">
      <button
        type="button"
        onClick={scrollToBottom}
        aria-label="Jump to bottom"
        className={cn(
          // h-12/w-12 keeps a >=44px touch target.
          "flex h-12 w-12 items-center justify-center rounded-full",
          "border border-border bg-primary text-primary-foreground shadow-lg",
          "transition-all duration-300 hover:opacity-90",
          canScrollDown ? "translate-y-0 opacity-100" : "pointer-events-none translate-y-4 opacity-0"
        )}
      >
        <ArrowDown className="h-5 w-5" />
      </button>
      <button
        type="button"
        onClick={scrollToTop}
        aria-label="Back to top"
        className={cn(
          "flex h-12 w-12 items-center justify-center rounded-full",
          "border border-border bg-primary text-primary-foreground shadow-lg",
          "transition-all duration-300 hover:opacity-90",
          canScrollUp ? "translate-y-0 opacity-100" : "pointer-events-none translate-y-4 opacity-0"
        )}
      >
        <ArrowUp className="h-5 w-5" />
      </button>
    </div>
  )
}
