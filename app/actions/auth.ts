"use server"

import { cookies } from "next/headers"
import { redirect } from "next/navigation"
import {
  FRESH_LOGIN_COOKIE,
  SESSION_COOKIE,
  SESSION_META_COOKIE,
  SESSION_MAX_AGE,
  sessionCookieOptions,
  sessionMetaCookieOptions,
  freshLoginCookieOptions,
  userCookieOptions,
  expiredCookieOptions,
} from "@/lib/auth"
import { signSessionMeta } from "@/lib/session-token"
import { USER_COOKIE } from "@/lib/user-scope"
import { getDynamicUserByEmail } from "@/lib/admin-users-db"
import { logActivity } from "@/app/actions/log-activity"

export type LoginState = { error?: string }

/**
 * Hard-clear every session cookie. Each cookie is OVERWRITTEN with an empty,
 * already-expired value using the SAME attributes it was set with
 * (`SameSite=None; Secure; Path=/`). A bare `cookies().delete(name)` is NOT
 * sufficient for `SameSite=None; Secure` cookies — the browser won't replace
 * them unless the clearing cookie matches, which previously left `mcc_session`
 * alive after logout so a refresh re-authenticated silently.
 */
async function clearAllSessionCookies() {
  const cookieStore = await cookies()
  // Overwrite each cookie with an empty, already-expired value using the SAME
  // attributes it was set with. Do NOT also call `cookieStore.delete(name)`
  // here: `delete` emits a second, attribute-less `Set-Cookie` for the same
  // name that WINS over this one, and an attribute-less clear cannot remove a
  // `SameSite=None; Secure` cookie — which would leave the session alive and
  // make logout appear to do nothing (the proxy re-authenticates on redirect).
  for (const name of [SESSION_COOKIE, SESSION_META_COOKIE, USER_COOKIE, FRESH_LOGIN_COOKIE]) {
    cookieStore.set(name, "", expiredCookieOptions)
  }
}

// A minimal, auth-only view of a credential match. Every account is a dynamic
// record in Neon (lib/admin-users-db.ts).
interface AuthMatch {
  id: string
  password: string
  sessionToken: string
  fullName: string
  company: string
  /** Accounts can be suspended/inactive, which denies access. */
  active: boolean
}

/**
 * Resolve a login email to a credential record from the database. All accounts
 * (including the three seeded core accounts) live in Postgres, so login depends
 * on the database being reachable.
 */
async function findAuthMatchByEmail(email: string): Promise<AuthMatch | undefined> {
  try {
    const dyn = await getDynamicUserByEmail(email)
    if (dyn) {
      return {
        id: dyn.id,
        password: dyn.password,
        sessionToken: dyn.sessionToken,
        fullName: dyn.profile.fullName || dyn.profile.company || dyn.email,
        company: dyn.profile.company || "",
        active: dyn.status === "active",
      }
    }
  } catch {
    // Database unreachable — no account can be resolved until it recovers.
  }
  return undefined
}

export async function login(_prevState: LoginState, formData: FormData): Promise<LoginState> {
  const email = String(formData.get("email") || "").trim()
  const password = String(formData.get("password") || "")

  const matchedUser = await findAuthMatchByEmail(email)
  const passwordMatches = !!matchedUser && password === matchedUser.password
  const accountActive = !!matchedUser && matchedUser.active

  if (matchedUser && passwordMatches && accountActive) {
    const cookieStore = await cookies()
    // The session cookie carries this user's unique token (the security
    // boundary), and a separate readable cookie records which user it is so the
    // client can show the right identity and isolate the right data.
    cookieStore.set(SESSION_COOKIE, matchedUser.sessionToken, sessionCookieOptions)
    cookieStore.set(USER_COOKIE, matchedUser.id, userCookieOptions)

    // Issue the signed session-metadata cookie. This is the server-enforced
    // record of when the session was created (iat), when it MUST end no matter
    // what (exp = now + 8h absolute), and when it was last seen (seen). The Edge
    // proxy and server resolver verify it on every request, so expiry can no
    // longer be bypassed by client-side tricks or browser cookie-restore.
    const nowMs = Date.now()
    const metaToken = await signSessionMeta({
      iat: nowMs,
      exp: nowMs + SESSION_MAX_AGE * 1000,
      seen: nowMs,
    })
    cookieStore.set(SESSION_META_COOKIE, metaToken, sessionMetaCookieOptions)

    // Short-lived, readable marker proving this navigation is a genuine fresh
    // login. The SessionGuard consumes it to establish the per-tab session so a
    // real login is never mistaken for a reopened tab. Set server-side so it
    // reliably survives the redirect on mobile and inside the preview iframe.
    cookieStore.set(FRESH_LOGIN_COOKIE, "1", freshLoginCookieOptions)

    // Log successful login (never include the password).
    await logActivity({
      action: "Login successful",
      category: "Authentication",
      user: `${matchedUser.fullName} (${matchedUser.company})`,
      details: { email, result: "granted" },
    })

    // The `fresh` param is a bulletproof, environment-independent signal of a
    // genuine login that the SessionGuard reads (URL params survive the redirect
    // even where sandboxed-iframe cookies/storage are blocked). It is removed
    // from the URL immediately after the guard consumes it.
    redirect("/dashboard?fresh=1")
  }

  // A failed attempt must never leave an active session behind. Clear any
  // lingering session/fresh-login cookies so wrong credentials can never appear
  // to "pass" by falling back to a previously authenticated session.
  await clearAllSessionCookies()

  // Log failed attempt for security monitoring (never include the password).
  const reason = !matchedUser
    ? "unauthorized email"
    : !passwordMatches
      ? "incorrect password"
      : "account not active"
  await logActivity({
    action: "Login failed",
    category: "Authentication / Security",
    user: email || "(no email)",
    details: {
      email: email || "(empty)",
      reason,
      result: "denied",
    },
  })

  return {
    error:
      matchedUser && passwordMatches && !accountActive
        ? "This account is not active. Please contact your administrator."
        : "Invalid email or password. Access denied.",
  }
}

export async function logout() {
  await clearAllSessionCookies()
  await logActivity({
    action: "Logout",
    category: "Authentication",
    details: { result: "session ended" },
  })
  redirect("/login")
}

// Reasons used for automatic session termination by the client-side SessionGuard.
export type ExpireReason = "expiry" | "tab-close" | "inactivity"

const EXPIRE_REASON_LABELS: Record<ExpireReason, string> = {
  expiry: "session expired",
  "tab-close": "browser tab or window closed",
  inactivity: "inactive for 5 minutes",
}

// Securely terminates the session from the client (cookie is httpOnly, so only
// the server can delete it). Logs the reason for the audit trail.
export async function expireSession(reason: ExpireReason) {
  await clearAllSessionCookies()
  await logActivity({
    action: "Session terminated automatically",
    category: "Authentication / Security",
    details: {
      result: "session ended",
      reason: EXPIRE_REASON_LABELS[reason] ?? reason,
      trigger: reason,
    },
  })
  redirect(`/login?expired=${reason}`)
}
