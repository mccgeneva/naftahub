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
} from "@/lib/auth"
import { signSessionMeta } from "@/lib/session-token"
import { USER_COOKIE } from "@/lib/user-scope"
import { findUserByEmail } from "@/lib/users"
import { getDynamicUserByEmail } from "@/lib/admin-users-db"
import { logActivity } from "@/app/actions/log-activity"

export type LoginState = { error?: string }

// A minimal, auth-only view of a credential match. Works for both the static
// registry (lib/users.ts) and admin-created users persisted in Neon.
interface AuthMatch {
  id: string
  password: string
  sessionToken: string
  fullName: string
  company: string
  /** Dynamic accounts can be suspended/inactive; static users are always active. */
  active: boolean
}

/**
 * Resolve a login email to a credential record. Static users win (fast, always
 * available even without a DB). When no static user matches we fall back to the
 * admin-created users stored in Postgres so that accounts created from the
 * administrator panel can actually log in.
 */
async function findAuthMatchByEmail(email: string): Promise<AuthMatch | undefined> {
  const staticUser = findUserByEmail(email)
  if (staticUser) {
    return {
      id: staticUser.id,
      password: staticUser.password,
      sessionToken: staticUser.sessionToken,
      fullName: staticUser.fullName,
      company: staticUser.company,
      active: true,
    }
  }

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
    // DB unavailable — static users still work; dynamic ones can't resolve yet.
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
  const cookieStore = await cookies()
  cookieStore.delete(SESSION_COOKIE)
  cookieStore.delete(SESSION_META_COOKIE)
  cookieStore.delete(USER_COOKIE)
  cookieStore.delete(FRESH_LOGIN_COOKIE)

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
  const cookieStore = await cookies()
  cookieStore.delete(SESSION_COOKIE)
  cookieStore.delete(SESSION_META_COOKIE)
  cookieStore.delete(USER_COOKIE)
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
  inactivity: "inactive for 3 minutes",
}

// Securely terminates the session from the client (cookie is httpOnly, so only
// the server can delete it). Logs the reason for the audit trail.
export async function expireSession(reason: ExpireReason) {
  const cookieStore = await cookies()
  cookieStore.delete(SESSION_COOKIE)
  cookieStore.delete(SESSION_META_COOKIE)
  cookieStore.delete(USER_COOKIE)
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
