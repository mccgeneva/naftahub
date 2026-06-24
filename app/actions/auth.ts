"use server"

import { cookies } from "next/headers"
import { redirect } from "next/navigation"
import {
  FRESH_LOGIN_COOKIE,
  SESSION_COOKIE,
  SESSION_META_COOKIE,
  SESSION_MAX_AGE,
  IMPERSONATION_COOKIE,
  sessionCookieOptions,
  sessionMetaCookieOptions,
  freshLoginCookieOptions,
  userCookieOptions,
  expiredCookieOptions,
} from "@/lib/auth"
import { signSessionMeta } from "@/lib/session-token"
import { USER_COOKIE } from "@/lib/user-scope"
import { getDynamicUserByEmail, getDynamicUserById } from "@/lib/admin-users-db"
import { logActivity } from "@/app/actions/log-activity"
import {
  signChallenge,
  verifyChallenge,
  decryptDescriptors,
  matchesEnrolled,
  isValidDescriptor,
} from "@/lib/biometric"
import {
  getFaceState,
  getEncryptedDescriptor,
  registerFailure,
  resetFailCount,
} from "@/lib/biometric-db"

export type LoginState = {
  error?: string
  /** Set when the password step passed but a face scan is now required. */
  faceRequired?: boolean
  /** Short-lived signed token proving the password step passed (no password inside). */
  challenge?: string
  /** Display name for the face-scan UI. */
  name?: string
  /**
   * Set by `completeFaceLogin` after a successful match. The session cookies
   * are already established server-side; the client performs the navigation.
   * We do NOT `redirect()` inside that action because it is invoked imperatively
   * from the face-capture handler, where a thrown `NEXT_REDIRECT` would be
   * swallowed by the surrounding try/catch and surfaced as a false "something
   * went wrong" error — even though login actually succeeded.
   */
  success?: boolean
  /** Where the client should navigate to after a successful face login. */
  redirectTo?: string
}

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
  // IMPERSONATION_COOKIE is included so logging out (or any forced session clear)
  // never leaves a stale "act as client" cookie behind that would resurrect an
  // impersonated identity on the next visit.
  for (const name of [
    SESSION_COOKIE,
    SESSION_META_COOKIE,
    USER_COOKIE,
    FRESH_LOGIN_COOKIE,
    IMPERSONATION_COOKIE,
  ]) {
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

/** Path the client lands on immediately after a genuine login. */
const POST_LOGIN_PATH = "/dashboard?fresh=1"

/**
 * Establish the authenticated session cookies for a user. Shared by the
 * password-only path and the face-verified path so both produce an identical,
 * fully-valid session. Does NOT redirect — callers decide how to navigate.
 */
async function establishSession(matchedUser: AuthMatch, email: string): Promise<void> {
  const cookieStore = await cookies()
  // The session cookie carries this user's unique token (the security
  // boundary), and a separate readable cookie records which user it is so the
  // client can show the right identity and isolate the right data.
  cookieStore.set(SESSION_COOKIE, matchedUser.sessionToken, sessionCookieOptions)
  cookieStore.set(USER_COOKIE, matchedUser.id, userCookieOptions)

  // Issue the signed session-metadata cookie (server-enforced absolute expiry).
  const nowMs = Date.now()
  const metaToken = await signSessionMeta({
    iat: nowMs,
    exp: nowMs + SESSION_MAX_AGE * 1000,
    seen: nowMs,
  })
  cookieStore.set(SESSION_META_COOKIE, metaToken, sessionMetaCookieOptions)
  cookieStore.set(FRESH_LOGIN_COOKIE, "1", freshLoginCookieOptions)
  // A genuine login is always a clean, non-impersonated session — clear any
  // lingering impersonation marker so the new session resolves to this account.
  cookieStore.set(IMPERSONATION_COOKIE, "", expiredCookieOptions)

  await logActivity({
    action: "Login successful",
    category: "Authentication",
    user: `${matchedUser.fullName} (${matchedUser.company})`,
    details: { email, result: "granted" },
  })
}

/**
 * Establish the session and `redirect()`. Safe ONLY for callers invoked through
 * a form action / `useActionState` (e.g. the password-only path), where a
 * thrown `NEXT_REDIRECT` is handled by the framework rather than caught by app
 * code. NOTE: this never returns.
 */
async function establishSessionAndRedirect(matchedUser: AuthMatch, email: string): Promise<never> {
  await establishSession(matchedUser, email)
  redirect(POST_LOGIN_PATH)
}

async function logFailedLogin(email: string, reason: string): Promise<void> {
  await logActivity({
    action: "Login failed",
    category: "Authentication / Security",
    user: email || "(no email)",
    details: { email: email || "(empty)", reason, result: "denied" },
  })
}

export async function login(_prevState: LoginState, formData: FormData): Promise<LoginState> {
  const email = String(formData.get("email") || "").trim()
  const password = String(formData.get("password") || "")

  const matchedUser = await findAuthMatchByEmail(email)
  const passwordMatches = !!matchedUser && password === matchedUser.password
  const accountActive = !!matchedUser && matchedUser.active

  if (matchedUser && passwordMatches && accountActive) {
    // Password step passed. If this user has enrolled Face ID, DO NOT establish
    // a session yet — require a successful, strict face match as a second
    // factor. We hand the browser a short-lived signed challenge (no password
    // inside) that `completeFaceLogin` will verify alongside the live scan.
    const face = await getFaceState(matchedUser.id)
    if (face.enrolled) {
      if (face.locked) {
        await logFailedLogin(email, "biometric locked")
        await clearAllSessionCookies()
        return {
          error:
            "Face ID is locked after too many failed attempts. Please contact your administrator to reset it.",
        }
      }
      return {
        faceRequired: true,
        challenge: signChallenge(matchedUser.id),
        name: matchedUser.fullName,
      }
    }

    // No biometric enrolled → password-only login (unchanged behavior).
    await establishSessionAndRedirect(matchedUser, email)
  }

  // A failed attempt must never leave an active session behind.
  await clearAllSessionCookies()

  const reason = !matchedUser
    ? "unauthorized email"
    : !passwordMatches
      ? "incorrect password"
      : "account not active"
  await logFailedLogin(email, reason)

  return {
    error:
      matchedUser && passwordMatches && !accountActive
        ? "This account is not active. Please contact your administrator."
        : "Invalid email or password. Access denied.",
  }
}

/**
 * Second login factor: verify a live face scan against the user's enrolled,
 * encrypted descriptor under a STRICT match threshold. Only callable with a
 * valid, unexpired challenge issued by the password step — so the password
 * gate cannot be skipped. On success, establishes the session; on failure,
 * increments the lockout counter and (after the limit) locks biometric login.
 */
export async function completeFaceLogin(
  challenge: string,
  descriptor: number[],
): Promise<LoginState> {
  const uid = verifyChallenge(challenge)
  if (!uid) {
    return { error: "Your sign-in attempt expired. Please enter your password again." }
  }
  if (!isValidDescriptor(descriptor)) {
    return { faceRequired: true, challenge, error: "No face detected. Center your face and try again." }
  }

  const rec = await getDynamicUserById(uid)
  if (!rec || rec.status !== "active") {
    await clearAllSessionCookies()
    return { error: "Invalid email or password. Access denied." }
  }

  const face = await getFaceState(uid)
  if (!face.enrolled) {
    // Enrollment was cleared (e.g. admin reset) mid-flow → fall back to password.
    return { error: "Face ID is no longer set up for this account. Please sign in with your password." }
  }
  if (face.locked) {
    return { error: "Face ID is locked. Please contact your administrator to reset it." }
  }

  const enrolled = decryptDescriptors(await getEncryptedDescriptor(uid))
  const { ok, distance } = matchesEnrolled(descriptor, enrolled)

  if (!ok) {
    const { failCount, locked } = await registerFailure(uid)
    await logActivity({
      action: locked ? "Face ID locked after failed attempts" : "Face ID verification failed",
      category: "Authentication / Security",
      user: `${rec.profile.fullName || rec.email}`,
      details: { email: rec.email, distance: distance.toFixed(3), failCount, result: locked ? "locked" : "denied" },
    })
    if (locked) {
      return { error: "Face ID locked after too many failed attempts. Please contact your administrator to reset it." }
    }
    const remaining = Math.max(0, 5 - failCount)
    return {
      faceRequired: true,
      challenge,
      error: `Face not recognized. Please try again${remaining ? ` (${remaining} attempt${remaining === 1 ? "" : "s"} left)` : ""}.`,
    }
  }

  // Match. Clear the fail counter and start the session. We do NOT redirect
  // here (see LoginState.success): the cookies are set server-side and the
  // client navigates, so a thrown NEXT_REDIRECT can't be mistaken for a scan
  // failure.
  await resetFailCount(uid)
  await establishSession(
    {
      id: rec.id,
      password: rec.password,
      sessionToken: rec.sessionToken,
      fullName: rec.profile.fullName || rec.profile.company || rec.email,
      company: rec.profile.company || "",
      active: true,
    },
    rec.email,
  )
  return { success: true, redirectTo: POST_LOGIN_PATH }
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
