// Credentials and per-user session tokens now live in the multi-user registry
// (lib/users.ts). This module only owns the cookie configuration shared by all
// users.

// Name of the httpOnly session cookie set after a successful login. Its value
// is the signed-in user's per-user session token.
export const SESSION_COOKIE = "mcc_session"

// Short-lived, client-readable cookie set by the login action to mark a genuine
// fresh login. Consumed once by the SessionGuard, then cleared.
export const FRESH_LOGIN_COOKIE = "mcc_fresh"

// Session lifetime in seconds (8 hours).
export const SESSION_MAX_AGE = 60 * 60 * 8

// Cookie attributes. The v0 preview renders the app inside a cross-origin
// iframe, where browsers only store/send cookies marked `SameSite=None; Secure`.
// `SameSite=Lax` cookies are dropped in that third-party context, which made the
// session vanish right after login (blank page / redirect bounce) in preview
// even though it worked once published at the top level. `Secure` is valid here
// because the preview and production are both HTTPS, and browsers treat
// `http://localhost` as a secure context, so local development keeps working.
//
// SECURITY: we deliberately OMIT `maxAge`/`expires` so this is a *session
// cookie*. The browser discards it when the window/browser is fully closed,
// which forces a fresh login on the next visit instead of silently restoring
// the previous user's session. The 8-hour absolute session lifetime is still
// enforced client-side by the SessionGuard via its EXPIRY timestamp.
export const sessionCookieOptions = {
  httpOnly: true,
  secure: true,
  sameSite: "none",
  path: "/",
} as const

// Same cross-iframe-safe attributes for the short-lived, client-readable
// fresh-login marker.
export const freshLoginCookieOptions = {
  httpOnly: false,
  secure: true,
  sameSite: "none",
  path: "/",
  maxAge: 60,
} as const

// Client-readable cookie holding the signed-in user's id. The client uses it to
// (a) display the right identity and (b) namespace that user's data. It is NOT
// a security boundary — access is gated by the httpOnly session token in the
// proxy; this cookie only selects which tenant's identity/data to show.
//
// Also a session cookie (no `maxAge`) so it is cleared on browser close in lock
// step with the session cookie above — it must never outlive the session and
// point a fresh visitor at the previous user's identity/data.
export const userCookieOptions = {
  httpOnly: false,
  secure: true,
  sameSite: "none",
  path: "/",
} as const
