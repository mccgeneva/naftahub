"use client"

import { useEffect, useRef } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { expireSession, type ExpireReason } from "@/app/actions/auth"
import { SESSION_MAX_AGE, FRESH_LOGIN_COOKIE } from "@/lib/auth"

// Per-tab marker. sessionStorage is automatically cleared when the tab/window
// is closed, which is what lets us detect a closed-then-reopened tab.
const TAB_FLAG = "mcc_tab_active"
// One-time flag written by the login form so a genuine login can be told apart
// from a reopened tab that still carries a valid cookie.
const HANDOFF = "mcc_login_handoff"
// Absolute timestamp (ms) at which the session must end.
const EXPIRY = "mcc_session_expiry"
// Shared last-activity timestamp (ms) so inactivity is tracked across tabs.
const LAST_ACTIVITY = "mcc_last_activity"

const INACTIVITY_LIMIT = 3 * 60 * 1000 // 3 minutes
const WARNING_BEFORE = 30 * 1000 // warn 30s before inactivity logout
const TICK = 1000

const ACTIVITY_EVENTS = ["mousemove", "mousedown", "keydown", "scroll", "touchstart", "click"]

function readNumber(key: string): number | null {
  try {
    const raw = localStorage.getItem(key)
    if (!raw) return null
    const n = Number(raw)
    return Number.isFinite(n) ? n : null
  } catch {
    return null
  }
}

// Reads a cookie value by name (returns null if absent).
function readCookie(name: string): string | null {
  try {
    const match = document.cookie.match(new RegExp(`(?:^|; )${name}=([^;]*)`))
    return match ? decodeURIComponent(match[1]) : null
  } catch {
    return null
  }
}

// Expires a cookie immediately.
function clearCookie(name: string) {
  try {
    document.cookie = `${name}=; path=/; max-age=0; SameSite=Lax`
  } catch {
    // ignore
  }
}

// True when the app is rendered inside an iframe (e.g. the v0 preview). The
// sandboxed iframe restricts cookies/sessionStorage, which can make tab-close
// detection misfire. We relax only that check here; the published top-level
// deployment keeps the full security behavior.
function isEmbeddedPreview(): boolean {
  try {
    return window.self !== window.top
  } catch {
    // A cross-origin access error means we are inside an iframe.
    return true
  }
}

/**
 * Client-side security guard for authenticated areas. Automatically terminates
 * the session when:
 *  - the session lifetime expires,
 *  - the browser tab/window was closed and later reopened, or
 *  - the user has been inactive for 3 minutes.
 *
 * The auth cookie is httpOnly, so termination calls the `expireSession` server
 * action to actually delete it; this component handles detection and UX.
 */
export function SessionGuard() {
  const router = useRouter()
  const endedRef = useRef(false)
  const warnedRef = useRef(false)

  useEffect(() => {
    const now = Date.now()

    function endSession(reason: ExpireReason) {
      if (endedRef.current) return
      endedRef.current = true
      try {
        localStorage.removeItem(EXPIRY)
        localStorage.removeItem(LAST_ACTIVITY)
        localStorage.removeItem(HANDOFF)
        sessionStorage.removeItem(TAB_FLAG)
      } catch {
        // ignore storage errors
      }

      const messages: Record<ExpireReason, string> = {
        expiry: "Your session has expired. Please sign in again.",
        "tab-close": "Session ended because the tab was closed. Please sign in again.",
        inactivity: "Signed out due to 3 minutes of inactivity. Please sign in again.",
      }
      toast.dismiss("inactivity-warning")
      toast.error(messages[reason], { id: "session-ended" })

      // Delete the httpOnly cookie server-side and redirect to /login.
      void expireSession(reason)
    }

    // --- Establish or validate this tab's session ---
    let hasTab = false
    try {
      hasTab = sessionStorage.getItem(TAB_FLAG) === "1"
    } catch {
      hasTab = false
    }

    if (!hasTab) {
      // A genuine fresh login is proven, in order of reliability, by:
      //  1. the `?fresh=1` URL param the login redirect adds (works everywhere,
      //     including sandboxed iframes and mobile Safari where cookies/storage
      //     may be partitioned or blocked),
      //  2. the server-set fresh-login cookie, or
      //  3. the localStorage handoff flag.
      let freshParam = false
      try {
        freshParam = new URLSearchParams(window.location.search).get("fresh") === "1"
      } catch {
        freshParam = false
      }
      const freshCookie = readCookie(FRESH_LOGIN_COOKIE) === "1"
      let handoff = false
      try {
        handoff = localStorage.getItem(HANDOFF) === "1"
      } catch {
        handoff = false
      }

      if (freshParam || freshCookie || handoff || isEmbeddedPreview()) {
        // Genuine fresh login in this tab (or running inside the preview iframe,
        // where tab-close detection is unreliable): establish session markers
        // instead of terminating.
        clearCookie(FRESH_LOGIN_COOKIE)
        if (freshParam) {
          // Strip the one-time param so a later reopen of this URL can't be
          // mistaken for a fresh login.
          router.replace("/dashboard")
        }
        try {
          localStorage.removeItem(HANDOFF)
          sessionStorage.setItem(TAB_FLAG, "1")
          if (readNumber(EXPIRY) == null) {
            localStorage.setItem(EXPIRY, String(now + SESSION_MAX_AGE * 1000))
          }
          localStorage.setItem(LAST_ACTIVITY, String(now))
        } catch {
          // ignore storage errors
        }
      } else {
        // No tab session and no fresh-login signal => the tab was closed and
        // reopened (or opened directly) with a lingering cookie. Terminate.
        endSession("tab-close")
        return
      }
    } else {
      // Existing tab session (page reload or in-app navigation). Make sure the
      // tracking markers exist without resetting them.
      if (readNumber(EXPIRY) == null) {
        try {
          localStorage.setItem(EXPIRY, String(now + SESSION_MAX_AGE * 1000))
        } catch {
          // ignore
        }
      }
      if (readNumber(LAST_ACTIVITY) == null) {
        try {
          localStorage.setItem(LAST_ACTIVITY, String(now))
        } catch {
          // ignore
        }
      }
    }

    // --- Activity tracking (shared across tabs via localStorage) ---
    function markActivity() {
      if (endedRef.current) return
      warnedRef.current = false
      try {
        localStorage.setItem(LAST_ACTIVITY, String(Date.now()))
      } catch {
        // ignore
      }
      toast.dismiss("inactivity-warning")
    }

    ACTIVITY_EVENTS.forEach((evt) =>
      window.addEventListener(evt, markActivity, { passive: true }),
    )

    // --- Periodic checks for expiry and inactivity ---
    const interval = window.setInterval(() => {
      if (endedRef.current) return
      const t = Date.now()

      const expiry = readNumber(EXPIRY)
      if (expiry != null && t >= expiry) {
        endSession("expiry")
        return
      }

      const last = readNumber(LAST_ACTIVITY) ?? t
      const idle = t - last

      if (idle >= INACTIVITY_LIMIT) {
        endSession("inactivity")
        return
      }

      if (idle >= INACTIVITY_LIMIT - WARNING_BEFORE && !warnedRef.current) {
        warnedRef.current = true
        toast.warning("You're about to be signed out", {
          id: "inactivity-warning",
          description: "For your security, you'll be logged out shortly due to inactivity.",
          duration: WARNING_BEFORE,
          action: { label: "Stay signed in", onClick: () => markActivity() },
        })
      }
    }, TICK)

    // --- Cross-tab sync: react when another tab ends the session ---
    function onStorage(e: StorageEvent) {
      if (endedRef.current) return
      if (e.key === EXPIRY && e.newValue == null) {
        endedRef.current = true
        toast.dismiss("inactivity-warning")
        router.replace("/login?expired=tab-close")
      }
    }
    window.addEventListener("storage", onStorage)

    return () => {
      window.clearInterval(interval)
      ACTIVITY_EVENTS.forEach((evt) => window.removeEventListener(evt, markActivity))
      window.removeEventListener("storage", onStorage)
    }
  }, [router])

  return null
}
