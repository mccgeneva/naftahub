"use server"

import { resolveCurrentSession } from "@/lib/session-user"
import {
  encryptDescriptors,
  isValidDescriptor,
  DESCRIPTOR_LENGTH,
} from "@/lib/biometric"
import {
  getFaceState,
  saveEncryptedDescriptor,
  clearEnrollment,
  type FaceState,
} from "@/lib/biometric-db"
import { getDynamicUserById } from "@/lib/admin-users-db"
import { logActivity } from "@/app/actions/log-activity"

export type { FaceState }

/** Current user's own enrollment status (for the security/profile UI). */
export async function getMyFaceState(): Promise<FaceState> {
  const session = await resolveCurrentSession()
  if (!session) return { enrolled: false, locked: false, failCount: 0, enrolledAt: null }
  return getFaceState(session.id)
}

/**
 * Enroll (or re-enroll) the signed-in user's face from one or more captured
 * descriptors. Requires an active session — a user can only enroll themselves.
 */
export async function enrollMyFace(
  descriptors: number[][],
): Promise<{ ok: boolean; error?: string }> {
  const session = await resolveCurrentSession()
  if (!session) return { ok: false, error: "You must be signed in to enroll." }

  if (!Array.isArray(descriptors) || descriptors.length === 0) {
    return { ok: false, error: "No face samples were captured. Please try again." }
  }
  if (!descriptors.every(isValidDescriptor)) {
    return { ok: false, error: `Invalid face data (expected ${DESCRIPTOR_LENGTH}-point descriptors).` }
  }

  const blob = encryptDescriptors(descriptors)
  await saveEncryptedDescriptor(session.id, blob)

  await logActivity({
    action: "Face ID enrolled",
    category: "Authentication / Security",
    user: session.profile.fullName || session.email,
    details: { samples: descriptors.length, result: "biometric login enabled" },
  })
  return { ok: true }
}

/** The signed-in user disables their own Face ID (they remain logged in). */
export async function disableMyFace(): Promise<{ ok: boolean; error?: string }> {
  const session = await resolveCurrentSession()
  if (!session) return { ok: false, error: "You must be signed in." }
  await clearEnrollment(session.id)
  await logActivity({
    action: "Face ID disabled",
    category: "Authentication / Security",
    user: session.profile.fullName || session.email,
    details: { result: "biometric login removed" },
  })
  return { ok: true }
}

/**
 * Administrator resets a user's biometric enrollment — the recovery path when a
 * client is locked out of face login. Clears the descriptor and lock state so
 * the user can sign in with their password and re-enroll. Admin-only.
 */
export async function adminResetUserFace(userId: string): Promise<{ ok: boolean; error?: string }> {
  const session = await resolveCurrentSession()
  if (!session) return { ok: false, error: "Not authenticated." }
  if (session.profile.accountType !== "admin") {
    return { ok: false, error: "Only administrators can reset biometric login." }
  }
  const target = await getDynamicUserById(userId)
  if (!target) return { ok: false, error: "User not found." }

  await clearEnrollment(userId)
  await logActivity({
    action: "Face ID reset (admin)",
    category: "Authentication / Security",
    user: session.profile.fullName || session.email,
    details: {
      targetUser: `${target.profile.fullName || target.email} (${target.email})`,
      result: "biometric enrollment cleared — user may re-enroll",
    },
  })
  return { ok: true }
}
