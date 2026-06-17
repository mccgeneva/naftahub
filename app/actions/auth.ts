"use server"

import { cookies } from "next/headers"
import { redirect } from "next/navigation"
import {
  FRESH_LOGIN_COOKIE,
  SESSION_COOKIE,
  sessionCookieOptions,
  freshLoginCookieOptions,
  userCookieOptions,
} from "@/lib/auth"
import { USER_COOKIE } from "@/lib/user-scope"
import { findUserByEmail } from "@/lib/users"
import { logActivity } from "@/app/actions/log-activity"

export type LoginState = { error?: string }

export async function login(_prevState: LoginState, formData: FormData): Promise<LoginState> {
  const email = String(formData.get("email") || "").trim()
  const password = String(formData.get("password") || "")

  const matchedUser = findUserByEmail(email)
  const passwordMatches = !!matchedUser && password === matchedUser.password

  if (matchedUser && passwordMatches) {
    const cookieStore = await cookies()
    // The session cookie carries this user's unique token (the security
    // boundary), and a separate readable cookie records which user it is so the
    // client can show the right identity and isolate the right data.
    cookieStore.set(SESSION_COOKIE, matchedUser.sessionToken, sessionCookieOptions)
    cookieStore.set(USER_COOKIE, matchedUser.id, userCookieOptions)

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
  cookieStore.delete(USER_COOKIE)
  cookieStore.delete(FRESH_LOGIN_COOKIE)

  // Log failed attempt for security monitoring (never include the password).
  await logActivity({
    action: "Login failed",
    category: "Authentication / Security",
    user: email || "(no email)",
    details: {
      email: email || "(empty)",
      reason: !matchedUser ? "unauthorized email" : "incorrect password",
      result: "denied",
    },
  })

  return { error: "Invalid email or password. Access denied." }
}

export async function logout() {
  const cookieStore = await cookies()
  cookieStore.delete(SESSION_COOKIE)
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
