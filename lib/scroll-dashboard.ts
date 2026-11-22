/**
 * The dashboard content scrolls inside the pinch-zoom viewport, not the
 * window, so `window.scrollTo` has no effect there. This resets the real
 * scroll container (and the window, for pages outside the dashboard shell).
 */
export function scrollDashboardToTop() {
  if (typeof document === "undefined") return
  const scroller =
    document.querySelector("[data-zoom-viewport]") ?? document.querySelector("main")
  if (scroller instanceof HTMLElement) scroller.scrollTo({ top: 0, behavior: "auto" })
  window.scrollTo({ top: 0, behavior: "auto" })
}
