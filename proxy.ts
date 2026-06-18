import { NextResponse } from "next/server"
import type { NextRequest } from "next/server"
import {
  SESSION_COOKIE,
  SESSION_META_COOKIE,
  SESSION_IDLE_MAX_AGE,
  sessionCookieOptions,
  sessionMetaCookieOptions,
  userCookieOptions,
} from "@/lib/auth"
import { USER_COOKIE } from "@/lib/user-scope"
import { signSessionMeta, verifySessionMeta, evaluateSessionMeta } from "@/lib/session-token"

const IDLE_MS = SESSION_IDLE_MAX_AGE * 1000

// Clear every session cookie on a response (used when rejecting access).
function clearSessionCookies(res: NextResponse) {
  res.cookies.delete(SESSION_COOKIE)
  res.cookies.delete(SESSION_META_COOKIE)
  res.cookies.delete(USER_COOKIE)
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
