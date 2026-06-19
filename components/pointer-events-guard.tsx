"use client"

import { useEffect } from "react"
import { usePathname } from "next/navigation"

/**
 * Radix UI dialogs / dropdowns / selects / popovers lock the page while open by
 * setting `document.body.style.pointerEvents = "none"` (via
 * @radix-ui/react-dismissable-layer) so only the overlay is interactive. The
 * layer restores the body style on close — but there is a well-known race
 * (radix-ui/primitives) where, when several modal layers mount/unmount around a
 * route change, the restore runs against a stale shared counter and the inline
 * `pointer-events: none` is left STUCK on <body>. The page then looks fully
 * loaded but nothing is clickable — including the header logout button.
 *
 * The admin panel mounts dozens of Selects/Dropdowns/Dialogs, so navigating in
 * and back out is the classic trigger. This guard watches <body> and clears the
 * stuck style whenever there is no genuinely-open overlay. It uses three
 * independent triggers so it can never get permanently stuck:
 *   1. a microtask right after every route change,
 *   2. a MutationObserver on <body> (overlay closing / Radix toggling the style),
 *   3. a low-frequency safety-net interval, which guarantees recovery even if a
 *      lingering exit-animation wrapper made the observer skip a single check.
 */
export function PointerEventsGuard() {
  const pathname = usePathname()

  useEffect(() => {
    // A modal overlay that legitimately locks the body is present only when an
    // OPEN (data-state="open") dialog/menu/listbox/popover content is mounted.
    // Requiring "open" means a closed-but-still-animating wrapper can no longer
    // block us from clearing a genuinely stuck body.
    const hasOpenModalOverlay = () =>
      Boolean(
        document.querySelector(
          '[role="dialog"][data-state="open"],' +
            '[role="alertdialog"][data-state="open"],' +
            '[role="menu"][data-state="open"],' +
            '[role="menubar"] [data-state="open"],' +
            '[role="listbox"][data-state="open"],' +
            '[data-radix-popper-content-wrapper] [data-state="open"]',
        ),
      )

    const clearIfStuck = () => {
      if (document.body.style.pointerEvents === "none" && !hasOpenModalOverlay()) {
        document.body.style.pointerEvents = ""
      }
    }

    // Navigation ALWAYS dismisses overlays (you cannot keep a dropdown/dialog
    // open across a route change). So right after a route change we clear the
    // body lock UNCONDITIONALLY — this is the only thing that recovers from an
    // orphaned portal that was left mounted with data-state="open" (which the
    // conditional check above would otherwise treat as a live overlay forever).
    // We repeat across a short window to cover Radix's async unmount + exit
    // animation. A user opening a fresh modal within this window is extremely
    // unlikely (they have to see the new page first), and if they did, the
    // modal's own dismissable-layer effect re-applies the lock afterwards.
    const forceClear = () => {
      if (document.body.style.pointerEvents === "none") {
        document.body.style.pointerEvents = ""
      }
    }
    const forceTimers = [0, 80, 200, 400].map((d) => window.setTimeout(forceClear, d))

    // 1) Right after a route change (covers leaving a page with open dialogs).
    const timeout = window.setTimeout(clearIfStuck, 0)

    // 2) React to DOM/style changes, debounced to a frame so it stays cheap.
    let raf = 0
    const schedule = () => {
      cancelAnimationFrame(raf)
      raf = requestAnimationFrame(clearIfStuck)
    }
    const observer = new MutationObserver(schedule)
    observer.observe(document.body, {
      attributes: true,
      attributeFilter: ["style", "data-state"],
      childList: true,
      subtree: true,
    })

    // 3) Safety net: a single cheap querySelector a few times a second. This is
    // what makes recovery guaranteed — even if the observer's check happened to
    // run while an overlay was mid-exit, the next tick (once it has unmounted)
    // restores interactivity automatically.
    const interval = window.setInterval(clearIfStuck, 400)

    return () => {
      window.clearTimeout(timeout)
      forceTimers.forEach((t) => window.clearTimeout(t))
      window.clearInterval(interval)
      cancelAnimationFrame(raf)
      observer.disconnect()
    }
  }, [pathname])

  return null
}
