import { NextResponse } from "next/server"
import type { NextRequest } from "next/server"
import {
  SESSION_COOKIE,
  SESSION_META_COOKIE,
  SESSION_IDLE_MAX_AGE,
  sessionCookieOptions,
  sessionMetaCookieOptions,
  userCookieOptions,
  expiredCookieOptions,
} from "@/lib/auth"
import { USER_COOKIE } from "@/lib/user-scope"
import { signSessionMeta, verifySessionMeta, evaluateSessionMeta } from "@/lib/session-token"

const IDLE_MS = SESSION_IDLE_MAX_AGE * 1000

// Clear every session cookie on a response (used when rejecting access). Cookies
// set with `SameSite=None; Secure` must be cleared with the SAME attributes or
// the browser keeps them — so we overwrite with an expired value using
// `expiredCookieOptions`, not a bare `delete(name)`.
function clearSessionCookies(res: NextResponse) {
  for (const name of [SESSION_COOKIE, SESSION_META_COOKIE, USER_COOKIE]) {
    res.cookies.set(name, "", expiredCookieOptions)
  }
}

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl
  const token = request.cookies.get(SESSION_COOKIE)?.value
  const metaRaw = request.cookies.get(SESSION_META_COOKIE)?.value

  // Authoritative, SERVER-SIDE session check (cannot be bypassed by the client):
  //  1. a session token must be present, AND
  //  2. the HMAC-signed metadata cookie must verify, AND
  //  3. the session must be within its absolute 8h lifetime AND not idle-expired.
  // This runs on the Edge for every /dashboard request and server action, so a
  // stale/restored cookie can no longer grant access after the session should
  // have ended. The static-vs-dynamic user identity is still authoritatively
  // resolved later by the server (which can reach the database).
  const now = Date.now()
  const meta = await verifySessionMeta(metaRaw)
  const validity = evaluateSessionMeta(meta, IDLE_MS, now)
  const isAuthed = !!token && validity === "valid"

  if (pathname.startsWith("/dashboard")) {
    if (!isAuthed) {
      const reason = !token ? "tab-close" : validity === "idle" ? "inactivity" : "expiry"
      const loginUrl = new URL(`/login?expired=${reason}`, request.url)
      const res = NextResponse.redirect(loginUrl)
      clearSessionCookies(res)
      return res
    }

    // Valid session → slide the idle window forward (keep the absolute exp/iat
    // fixed) so active users are never interrupted, while inactivity still ends
    // the session. Re-issue all session cookies with a refreshed maxAge.
    const res = NextResponse.next()
    const slid = await signSessionMeta({ iat: meta!.iat, exp: meta!.exp, seen: now })
    res.cookies.set(SESSION_META_COOKIE, slid, sessionMetaCookieOptions)
    res.cookies.set(SESSION_COOKIE, token!, sessionCookieOptions)
    const userId = request.cookies.get(USER_COOKIE)?.value
    if (userId) res.cookies.set(USER_COOKIE, userId, userCookieOptions)

    // CRITICAL (cross-user isolation): authenticated dashboard responses are
    // per-user and must NEVER be cached or reused. Without this, a shared CDN /
    // browser-back-forward / proxy cache could serve one user's rendered
    // dashboard (or RSC payload) to another — which is exactly the "I logged in
    // and saw a different account" symptom. `private, no-store` forbids any
    // shared or persistent caching of these responses.
    res.headers.set("Cache-Control", "private, no-store, no-cache, must-revalidate, max-age=0")
    res.headers.set("Pragma", "no-cache")
    res.headers.set("Vary", "Cookie")
    return res
  }

  // If already authed, keep users out of the login page.
  if (pathname === "/login" && isAuthed) {
    return NextResponse.redirect(new URL("/dashboard", request.url))
  }

  return NextResponse.next()
}

export const config = {
  matcher: ["/dashboard/:path*", "/login"],
}
