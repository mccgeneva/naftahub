"use server"

import { headers } from "next/headers"
import {
  getDynamicUserByEmail,
  getDynamicUserById,
  updateDynamicUserProfile,
  rotateDynamicUserSessionToken,
} from "@/lib/admin-users-db"
import { DEMO_USER_ID } from "@/lib/users"
import {
  createResetToken,
  consumeResetToken,
  findValidResetToken,
  countRecentResetTokens,
} from "@/lib/password-reset-db"
import { sendPasswordResetEmail } from "@/lib/password-reset-email"
import { insertNotification } from "@/lib/notifications-db"
import { logActivity } from "@/app/actions/log-activity"

export type ResetRequestState = { sent?: boolean; locked?: boolean; error?: string }
export type ResetPasswordState = { done?: boolean; error?: string }

const MIN_PASSWORD_LENGTH = 8
const MAX_LINKS_PER_HOUR = 5

async function resolveBaseUrl(): Promise<string> {
  const explicit = process.env.NEXT_PUBLIC_APP_URL || process.env.NEXT_PUBLIC_SITE_URL
  if (explicit) return explicit.replace(/\/$/, "")
  try {
    const h = await headers()
    const host = h.get("x-forwarded-host") || h.get("host")
    if (host) {
      const proto = h.get("x-forwarded-proto") || (host.startsWith("localhost") ? "http" : "https")
      return `${proto}://${host}`
    }
  } catch {
    // fall through
  }
  const prod = process.env.VERCEL_PROJECT_PRODUCTION_URL || process.env.VERCEL_URL
  return prod ? `https://${prod.replace(/\/$/, "")}` : ""
}

/**
 * Send a reset link to the email registered on the account. When the user marks
 * the account as compromised, the account is also LOCKED (sign-in blocked) and
 * every active session is signed out until a new password is set.
 *
 * Always answers with the same neutral confirmation, so the form never reveals
 * whether an email address has an account.
 */
export async function requestPasswordReset(
  _prev: ResetRequestState,
  formData: FormData,
): Promise<ResetRequestState> {
  const email = String(formData.get("email") || "").trim()
  const compromised = formData.get("compromised") === "on"
  if (!email || !/^\S+@\S+\.\S+$/.test(email)) {
    return { error: "Enter the email address registered on your account." }
  }

  try {
    const rec = await getDynamicUserByEmail(email)
    if (!rec || rec.id === DEMO_USER_ID) {
      await logActivity({
        action: "Password reset requested (unknown email)",
        category: "Authentication / Security",
        user: email,
        details: { email, result: "ignored" },
      })
      return { sent: true, locked: compromised }
    }

    const name = rec.profile.fullName || rec.profile.company || rec.email

    if (compromised) {
      await updateDynamicUserProfile(rec.id, {
        profile: { ...rec.profile, passwordResetRequired: true, passwordResetRequiredAt: new Date().toISOString() },
      })
      await rotateDynamicUserSessionToken(rec.id)
    }

    if ((await countRecentResetTokens(rec.id)) >= MAX_LINKS_PER_HOUR) {
      await logActivity({
        action: "Password reset rate-limited",
        category: "Authentication / Security",
        user: name,
        userId: rec.id,
        details: { email: rec.email, result: "limited" },
      })
      return { sent: true, locked: compromised }
    }

    const token = await createResetToken(rec.id, compromised ? "compromised" : "forgot")
    const base = await resolveBaseUrl()
    const link = `${base}/reset-password?token=${token}`
    const emailed = await sendPasswordResetEmail({ to: rec.email, name, link, locked: compromised })

    await logActivity({
      action: compromised ? "Account locked — reported compromised" : "Password reset link sent",
      category: "Authentication / Security",
      user: name,
      userId: rec.id,
      details: { email: rec.email, emailed: emailed ? "yes" : "no", result: compromised ? "locked" : "sent" },
    })

    if (compromised) {
      try {
        await insertNotification({
          userId: rec.id,
          tone: "warning",
          title: "Account locked for security",
          body: "Your account was reported compromised. All sessions were signed out. Set a new password from the link sent to your registered email.",
          href: "/login",
        })
      } catch {
        // best-effort
      }
    }
  } catch (err) {
    console.log("[v0] requestPasswordReset failed:", (err as Error).message)
    return { error: "We couldn't process the request right now. Please try again in a moment." }
  }

  return { sent: true, locked: compromised }
}

/** True when the reset link in the URL is still valid (used to render the page). */
export async function checkResetToken(token: string): Promise<boolean> {
  try {
    return !!(await findValidResetToken(token))
  } catch {
    return false
  }
}

/**
 * Set a new password with a valid emailed token. Unlocks the account, signs out
 * every other session, and burns the token so the link can't be reused.
 */
export async function resetPassword(_prev: ResetPasswordState, formData: FormData): Promise<ResetPasswordState> {
  const token = String(formData.get("token") || "")
  const password = String(formData.get("password") || "")
  const confirm = String(formData.get("confirm") || "")

  if (password.length < MIN_PASSWORD_LENGTH) {
    return { error: `Use at least ${MIN_PASSWORD_LENGTH} characters.` }
  }
  if (!/[A-Za-z]/.test(password) || !/\d/.test(password)) {
    return { error: "Use a mix of letters and numbers." }
  }
  if (password !== confirm) {
    return { error: "The two passwords don't match." }
  }

  try {
    const pre = await findValidResetToken(token)
    if (!pre) return { error: "This reset link is invalid or has expired. Request a new one." }
    const existing = await getDynamicUserById(pre)
    if (existing && existing.password === password) {
      return { error: "Choose a password different from your current one." }
    }

    const userId = await consumeResetToken(token)
    if (!userId) return { error: "This reset link is invalid or has expired. Request a new one." }
    const rec = await getDynamicUserById(userId)
    if (!rec) return { error: "Account not found." }

    await updateDynamicUserProfile(rec.id, {
      password,
      profile: { ...rec.profile, passwordResetRequired: false, passwordResetRequiredAt: undefined },
    })
    await rotateDynamicUserSessionToken(rec.id)

    const name = rec.profile.fullName || rec.profile.company || rec.email
    await logActivity({
      action: "Password changed via reset link",
      category: "Authentication / Security",
      user: name,
      userId: rec.id,
      details: { email: rec.email, result: "changed", wasLocked: rec.profile.passwordResetRequired ? "yes" : "no" },
    })
    try {
      await insertNotification({
        userId: rec.id,
        tone: "info",
        title: "Password changed",
        body: "Your password was changed and all other sessions were signed out. If this wasn't you, contact MCC immediately.",
        href: "/dashboard/profile",
      })
    } catch {
      // best-effort
    }
  } catch (err) {
    console.log("[v0] resetPassword failed:", (err as Error).message)
    return { error: "We couldn't update your password right now. Please try again." }
  }

  return { done: true }
}
