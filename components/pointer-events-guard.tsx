"use client"

import { useEffect } from "react"
import { usePathname } from "next/navigation"

/**
 * Radix UI dialogs/sheets set `document.body { pointer-events: none }` while open
 * so that only the dialog is interactive. They restore it on close — but there is a
 * well-known race condition (radix-ui/primitives) where, if the dialog unmounts or
 * closes at the same time the route changes (e.g. navigating away / "exiting" a page
 * that has open or recently-closed dialogs), the inline `pointer-events: none` is left
 * stuck on <body>. The page then looks fully loaded but nothing is clickable.
 *
 * The admin panel mounts dozens of dialogs, which is why it was the trigger. This guard
 * watches <body> and clears the stuck style whenever there is no genuinely-open overlay,
 * so the UI can never get permanently stuck.
 */
export function PointerEventsGuard() {
  const pathname = usePathname()

  useEffect(() => {
    const isOverlayActuallyOpen = () =>
      Boolean(
        document.querySelector(
          '[data-state="open"][role="dialog"],' +
            '[data-state="open"][role="alertdialog"],' +
            '[data-radix-popper-content-wrapper],' +
            "[data-radix-popover-content]," +
            "[data-radix-dropdown-menu-content]",
        ),
      )

    const clearIfStuck = () => {
      if (document.body.style.pointerEvents === "none" && !isOverlayActuallyOpen()) {
        document.body.style.pointerEvents = ""
      }
    }

    // Run shortly after every route change (covers exiting a page that had open dialogs).
    const timeout = window.setTimeout(clearIfStuck, 100)

    // Also react to DOM changes: a dialog closing/unmounting, or Radix toggling the
    // body style. Debounced so it stays cheap even on a busy page.
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

    return () => {
      window.clearTimeout(timeout)
      cancelAnimationFrame(raf)
      observer.disconnect()
    }
  }, [pathname])

  return null
}
