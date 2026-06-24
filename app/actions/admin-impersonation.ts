"use server"

// ---------------------------------------------------------------------------
// Administrator "act as client" (impersonation) for maintenance.
//
// WHY: every account's password and Face ID can be changed by the client
// themselves, so an administrator can be locked out of a client's login while
// still needing to service that account. These actions let any passcode-holding
// admin step into a client's session WITHOUT their credentials, do maintenance,
// then return to their own admin session in one click — all without a password.
//
// HOW (no new auth surface): we overwrite the session cookie with the target's
// per-user token and set a SIGNED impersonation cookie that records the original
// admin (id + token, to restore) and the target id. `resolveCurrentSession`
// (lib/session-user.ts) reads that cookie and resolves the session to the target
// — by id, so suspended/inactive accounts can be serviced too — and flags the
// impersonator so the dashboard shows a "Return to admin" banner.
// ---------------------------------------------------------------------------

import { cookies } from "next/headers"
import { redirect } from "next/navigation"
import {
  SESSION_COOKIE,
  SESSION_META_COOKIE,
  SESSION_MAX_AGE,
  FRESH_LOGIN_COOKIE,
  IMPERSONATION_COOKIE,
  sessionCookieOptions,
  sessionMetaCookieOptions,
  freshLoginCookieOptions,
  userCookieOptions,
  impersonationCookieOptions,
  expiredCookieOptions,
} from "@/lib/auth"
import { USER_COOKIE } from "@/lib/user-scope"
import { signSessionMeta, signImpersonation, verifyImpersonation } from "@/lib/session-token"
import { ADMIN_PASSCODE } from "@/lib/admin-config"
import { resolveCurrentSession } from "@/lib/session-user"
import { getDynamicUserById } from "@/lib/admin-users-db"
import { logActivity } from "@/app/actions/log-activity"

export type ImpersonationResult = { ok: true } | { ok: false; error: string }

/** Issue a fresh signed session-metadata cookie (8h absolute cap from now). */
async function issueFreshMeta(): Promise<void> {
  const cookieStore = await cookies()
  const nowMs = Date.now()
  const metaToken = await signSessionMeta({
    iat: nowMs,
    exp: nowMs + SESSION_MAX_AGE * 1000,
    seen: nowMs,
  })
  cookieStore.set(SESSION_META_COOKIE, metaToken, sessionMetaCookieOptions)
  cookieStore.set(FRESH_LOGIN_COOKIE, "1", freshLoginCookieOptions)
}

/**
 * Begin impersonating a client. Passcode-gated (any admin-passcode holder, per
 * the configured policy). Establishes the target's session and stores a signed
 * marker so the admin session can be restored. Redirects into the dashboard as
 * the client on success; returns an error result otherwise.
 */
export async function startImpersonation(
  passcode: string,
  targetUserId: string,
): Promise<ImpersonationResult> {
  if (String(passcode) !== ADMIN_PASSCODE) {
    return { ok: false, error: "Administrator authorization failed." }
  }

  const cookieStore = await cookies()

  // Refuse to nest: the admin must return to their own session before stepping
  // into another account, otherwise the saved "admin token" would be a client's.
  const existing = await verifyImpersonation(cookieStore.get(IMPERSONATION_COOKIE)?.value)
  if (existing) {
    return { ok: false, error: "You are already signed in as a client. Return to admin first." }
  }

  // The acting administrator's OWN session (not yet impersonating).
  const adminSession = await resolveCurrentSession()
  const adminToken = cookieStore.get(SESSION_COOKIE)?.value
  if (!adminSession || !adminToken) {
    return { ok: false, error: "Your session has expired. Please sign in again." }
  }

  const target = await getDynamicUserById(targetUserId)
  if (!target) {
    return { ok: false, error: "That client account could not be found." }
  }
  if (target.id === adminSession.id) {
    return { ok: false, error: "You are already signed in as this account." }
  }

  const adminName = adminSession.profile.fullName || adminSession.profile.company || adminSession.id
  const targetName = target.profile.fullName || target.profile.company || target.email

  // Swap the session over to the target account.
  cookieStore.set(SESSION_COOKIE, target.sessionToken, sessionCookieOptions)
  cookieStore.set(USER_COOKIE, target.id, userCookieOptions)
  await issueFreshMeta()

  const nowMs = Date.now()
  const impToken = await signImpersonation({
    adminId: adminSession.id,
    adminToken,
    adminName,
    targetId: target.id,
    targetName,
    iat: nowMs,
    exp: nowMs + SESSION_MAX_AGE * 1000,
  })
  cookieStore.set(IMPERSONATION_COOKIE, impToken, impersonationCookieOptions)

  await logActivity({
    action: `Administrator signed in as ${targetName} for maintenance`,
    category: "Administration / Security",
    user: adminName,
    details: {
      summary: `${adminName} started an impersonation session as ${targetName} (${target.email}).`,
      admin: adminSession.id,
      target: `${targetName} — ${target.email}`,
      targetStatus: target.status,
    },
  })

  redirect("/dashboard?fresh=1")
}

/**
 * End impersonation and restore the original administrator session. Requires no
 * passcode — the signed impersonation cookie itself is the proof of who to
 * restore — so it can be a one-click "Return to admin" action.
 */
export async function stopImpersonation(): Promise<void> {
  const cookieStore = await cookies()
  const imp = await verifyImpersonation(cookieStore.get(IMPERSONATION_COOKIE)?.value)

  if (!imp) {
    // Nothing to restore — just clear any stray marker and go to the dashboard.
    cookieStore.set(IMPERSONATION_COOKIE, "", expiredCookieOptions)
    redirect("/dashboard")
  }

  // Restore the administrator's own session and drop the impersonation marker.
  cookieStore.set(SESSION_COOKIE, imp.adminToken, sessionCookieOptions)
  cookieStore.set(USER_COOKIE, imp.adminId, userCookieOptions)
  await issueFreshMeta()
  cookieStore.set(IMPERSONATION_COOKIE, "", expiredCookieOptions)

  await logActivity({
    action: `Administrator ended maintenance session as ${imp.targetName}`,
    category: "Administration / Security",
    user: imp.adminName,
    details: {
      summary: `${imp.adminName} returned to their administrator session from ${imp.targetName}.`,
      admin: imp.adminId,
      target: imp.targetName,
    },
  })

  redirect("/dashboard/admin")
}
