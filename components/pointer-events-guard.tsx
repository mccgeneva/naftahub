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
 * and back out is the classic trigger. This guard removes the stuck style using
 * four independent, overlapping safeguards so it can NEVER stay stuck:
 *
 *   1. An unconditional force-clear right after every route change (overlays are
 *      always dismissed by navigation, so a lock surviving a route change is by
 *      definition spurious).
 *   2. A MutationObserver on <body> that clears the lock whenever no real
 *      overlay is open.
 *   3. A low-frequency safety-net interval (same check).
 *   4. THE ESCAPE HATCH: capture-phase pointer/touch/key listeners on the
 *      window. The instant the user interacts and there is no real overlay
 *      rendered, the lock is cleared — so even an unforeseen race can never
 *      leave the user tapping a dead page. This fires before the user could
 *      perceive any freeze.
 *
 * "A real overlay is open" is detected by the presence of a Radix popper
 * content wrapper (dropdown/select/popover/combobox/tooltip all render their
 * content inside one while open) OR a visible modal dialog — NOT by a bare
 * `data-state="open"` attribute, which also appears on resting accordions,
 * collapsibles and tabs and on orphaned-but-closed portals.
 */
export function PointerEventsGuard() {
  const pathname = usePathname()

  useEffect(() => {
    // True only while a genuine floating/modal overlay is actually rendered AND
    // visible. We require visibility (client rects) because an orphaned popper
    // wrapper can be left in the DOM after its content closed — counting that
    // as "live" is exactly what would block recovery and freeze the page.
    const hasLiveOverlay = () => {
      // Popper-based overlays (dropdown menu, select, popover, combobox,
      // tooltip, hover card) mount their content inside this wrapper while open.
      // NOTE: do NOT use offsetParent to test visibility here — Radix poppers
      // are position:fixed, whose offsetParent is null even when fully visible.
      // getClientRects() correctly reports 0 for a display:none orphan and >0
      // for a visible overlay.
      const poppers = document.querySelectorAll("[data-radix-popper-content-wrapper]")
      for (const p of poppers) {
        if (p.getClientRects().length > 0) return true
      }
      // Modal dialogs / alert dialogs that are open and visible.
      const dialog = document.querySelector(
        '[role="dialog"][data-state="open"],[role="alertdialog"][data-state="open"]',
      )
      if (dialog && dialog.getClientRects().length > 0) return true
      return false
    }

    const clear = () => {
      if (document.body.style.pointerEvents === "none" && !hasLiveOverlay()) {
        document.body.style.pointerEvents = ""
      }
    }

    // 1) Unconditional force-clear across a short window after a route change,
    // to cover Radix's async unmount + exit animation. If the user somehow
    // opens a fresh overlay in this window, that overlay re-applies the lock.
    const forceClear = () => {
      if (document.body.style.pointerEvents === "none") {
        document.body.style.pointerEvents = ""
      }
    }
    const forceTimers = [0, 60, 160, 320, 600].map((d) => window.setTimeout(forceClear, d))

    // 2) React to DOM/style changes, debounced to a frame so it stays cheap.
    let raf = 0
    const schedule = () => {
      cancelAnimationFrame(raf)
      raf = requestAnimationFrame(clear)
    }
    const observer = new MutationObserver(schedule)
    observer.observe(document.body, {
      attributes: true,
      attributeFilter: ["style", "data-state"],
      childList: true,
      subtree: true,
    })

    // 3) Safety-net interval.
    const interval = window.setInterval(clear, 350)

    // 4) Escape hatch — recover on the user's very first interaction. Capture
    // phase + window/document so it fires even though <body> is pointer-events:
    // none (the event still reaches the document/window). touchstart covers
    // mobile, where this freeze is most painful.
    //
    // This is TARGET-AWARE and intentionally stronger than `clear()`: if the
    // user interacts OUTSIDE of any real overlay while the body is locked, we
    // clear unconditionally — even if a stale/orphaned popper wrapper is still
    // in the DOM claiming an overlay is "open". That orphan is exactly what
    // makes the page look permanently frozen, and `hasLiveOverlay()` alone can
    // never recover from it. Tapping outside a genuinely-open dropdown would
    // dismiss it anyway, so clearing early here is always safe.
    const onInteract = (e: Event) => {
      if (document.body.style.pointerEvents !== "none") return
      const target = e.target as Element | null
      const insideOverlay = Boolean(
        target?.closest?.(
          '[data-radix-popper-content-wrapper],[role="dialog"][data-state="open"],[role="alertdialog"][data-state="open"]',
        ),
      )
      if (!insideOverlay) {
        document.body.style.pointerEvents = ""
      }
    }
    const opts = { capture: true, passive: true } as const
    window.addEventListener("pointerdown", onInteract, opts)
    window.addEventListener("touchstart", onInteract, opts)
    window.addEventListener("mousedown", onInteract, opts)
    window.addEventListener("keydown", onInteract, true)

    return () => {
      forceTimers.forEach((t) => window.clearTimeout(t))
      window.clearInterval(interval)
      cancelAnimationFrame(raf)
      observer.disconnect()
      window.removeEventListener("pointerdown", onInteract, opts)
      window.removeEventListener("touchstart", onInteract, opts)
      window.removeEventListener("mousedown", onInteract, opts)
      window.removeEventListener("keydown", onInteract, true)
    }
  }, [pathname])

  return null
}
