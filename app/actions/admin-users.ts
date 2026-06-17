"use server"

// ---------------------------------------------------------------------------
// Administrator user management.
//
// Lets an administrator create new client accounts at runtime, generate
// credentials (email + temporary password), reset credentials, edit the
// displayed identity, and activate / suspend / deactivate / delete accounts.
//
// Dynamic users are persisted in Neon (lib/admin-users-db.ts) so they survive
// restarts and can actually log in via app/actions/auth.ts. Every mutating
// action is passcode-gated and written to the activity-log audit trail, exactly
// like the other administrator sections (gateway, treasury, ledger, …).
// ---------------------------------------------------------------------------

import { ADMIN_PASSCODE } from "@/lib/admin-config"
import { findUserByEmail } from "@/lib/users"
import { logActivity } from "@/app/actions/log-activity"
import {
  listDynamicUsers,
  getDynamicUserById,
  getDynamicUserByEmail,
  insertDynamicUser,
  updateDynamicUserProfile,
  setDynamicUserStatus,
  deleteDynamicUser,
  type DynamicUserRecord,
  type UserStatus,
} from "@/lib/admin-users-db"
import type { SerializableUserProfile, SerializableProfileItem } from "@/lib/profile-types"

// A client-safe view of a dynamic user (never includes nothing it shouldn't —
// for the admin console the password IS shown, intentionally, so the admin can
// hand it to the client; this mirrors the demo nature of the platform).
export interface AdminUserView {
  id: string
  email: string
  password: string
  status: UserStatus
  fullName: string
  company: string
  role: string
  createdAt: string
  updatedAt: string
  createdBy: string
}

export type AdminUsersResult =
  | { ok: true; users: AdminUserView[] }
  | { ok: false; error: string }

export type AdminUserMutation =
  | { ok: true; user: AdminUserView; tempPassword?: string }
  | { ok: false; error: string }

function requireAdmin(passcode: string): void {
  if (String(passcode) !== ADMIN_PASSCODE) {
    throw new Error("Administrator authorization failed.")
  }
}

function toView(rec: DynamicUserRecord): AdminUserView {
  return {
    id: rec.id,
    email: rec.email,
    password: rec.password,
    status: rec.status,
    fullName: rec.profile.fullName,
    company: rec.profile.company,
    role: rec.profile.role,
    createdAt: rec.createdAt,
    updatedAt: rec.updatedAt,
    createdBy: rec.createdBy,
  }
}

// --- Credential generators -------------------------------------------------

function slugify(input: string): string {
  return input
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ".")
    .replace(/^\.+|\.+$/g, "")
    .slice(0, 24)
}

/** Generate a unique login email from a name/company, e.g. "louis.thyssen@mccgva.ch". */
export async function generateUsername(seed: string): Promise<string> {
  const base = slugify(seed) || "client"
  const domain = "mccgva.ch"
  let candidate = `${base}@${domain}`
  let n = 1
  // Ensure uniqueness across BOTH static and dynamic users.
  while (findUserByEmail(candidate) || (await getDynamicUserByEmail(candidate))) {
    n += 1
    candidate = `${base}${n}@${domain}`
  }
  return candidate
}

/** Generate a readable temporary password, e.g. "MCC-7F3A-2K9D". */
function generateTempPassword(): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789" // no ambiguous chars
  const block = (len: number) =>
    Array.from({ length: len }, () => alphabet[Math.floor(Math.random() * alphabet.length)]).join("")
  return `MCC-${block(4)}-${block(4)}`
}

/**
 * Map any thrown error to an admin-facing message. Raw database/connection
 * failures (e.g. ECONNREFUSED when DATABASE_URL isn't configured) are replaced
 * with a clear, actionable message instead of a cryptic socket error.
 */
function friendlyError(err: unknown): string {
  const msg = (err as Error)?.message ?? String(err)
  if (/ECONNREFUSED|ENOTFOUND|ETIMEDOUT|database|connect|pool|password authentication/i.test(msg)) {
    return "Could not reach the database. Please confirm the Neon database is connected (DATABASE_URL) and try again."
  }
  return msg
}

function newId(): string {
  // Dynamic ids are prefixed so they never collide with static ("u1"…) ids and
  // are obvious in storage namespaces.
  return `du_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`
}

function newSessionToken(id: string): string {
  return `mcc.session.${id}.${Math.random().toString(36).slice(2, 16)}`
}

// --- Profile assembly ------------------------------------------------------

export interface CreateUserInput {
  passcode: string
  email?: string // optional — auto-generated when omitted
  password?: string // optional — auto-generated when omitted
  fullName: string
  company: string
  role?: string
  accountBadge?: string
  status?: UserStatus
  phone?: string
  nationality?: string
  address?: string
  website?: string
  // Free-form extra identity rows the admin can attach.
  principalExtra?: SerializableProfileItem[]
  companyExtra?: SerializableProfileItem[]
  bankingExtra?: SerializableProfileItem[]
  adminName?: string
}

function initialsFrom(fullName: string, company: string): string {
  const src = (fullName || company || "Client").trim()
  const parts = src.split(/\s+/).filter(Boolean)
  if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
  return src.slice(0, 2).toUpperCase()
}

function buildProfile(input: CreateUserInput, id: string, email: string, password: string): SerializableUserProfile {
  const fullName = input.fullName.trim()
  const company = input.company.trim()
  const role = (input.role || "Authorised Signatory").trim()
  const firstName = fullName.split(/\s+/)[0] || company || "Client"

  const principal: SerializableProfileItem[] = [
    { label: "Represented By", value: fullName || company },
    { label: "Occupation", value: role },
  ]
  if (input.nationality) principal.push({ label: "Nationality", value: input.nationality })
  if (input.address) principal.push({ label: "Residential Address", value: input.address })
  if (input.phone) principal.push({ label: "Mobile", value: input.phone })
  principal.push({ label: "E-mail", value: email })
  if (input.principalExtra?.length) principal.push(...input.principalExtra)

  const companyInfo: SerializableProfileItem[] = [{ label: "Business Name", value: company }]
  if (input.website) companyInfo.push({ label: "Website", value: input.website })
  companyInfo.push({ label: "Contact E-mail", value: email })
  if (input.companyExtra?.length) companyInfo.push(...input.companyExtra)

  const banking: SerializableProfileItem[] = []
  if (input.bankingExtra?.length) banking.push(...input.bankingExtra)

  return {
    id,
    email,
    password,
    sessionToken: newSessionToken(id),
    firstName,
    shortName: fullName || company,
    fullName: fullName || company,
    initials: initialsFrom(fullName, company),
    company,
    role,
    headerTag: `${company.toUpperCase().slice(0, 18)} · CLIENT`,
    accountBadge: input.accountBadge || "Client Account",
    accountEmail: email,
    supportEmail: email,
    cardHolderPerson: (fullName || company).toUpperCase(),
    cardHolderCompany: company.toUpperCase(),
    principal,
    companyInfo,
    banking,
  }
}

// --- Actions ---------------------------------------------------------------

export async function listUsers(passcode: string): Promise<AdminUsersResult> {
  try {
    requireAdmin(passcode)
    const users = (await listDynamicUsers()).map(toView)
    return { ok: true, users }
  } catch (err) {
    return { ok: false, error: friendlyError(err) }
  }
}

export async function createUser(input: CreateUserInput): Promise<AdminUserMutation> {
  try {
    requireAdmin(input.passcode)
    if (!input.fullName?.trim() && !input.company?.trim()) {
      return { ok: false, error: "A full name or company is required." }
    }

    const email = (input.email?.trim() || (await generateUsername(input.fullName || input.company))).toLowerCase()
    if (findUserByEmail(email) || (await getDynamicUserByEmail(email))) {
      return { ok: false, error: `The email ${email} is already in use.` }
    }
    const tempPassword = input.password?.trim() || generateTempPassword()
    const id = newId()
    const profile = buildProfile(input, id, email, tempPassword)
    const status = input.status ?? "active"

    const rec = await insertDynamicUser({
      email,
      password: tempPassword,
      status,
      profile,
      createdBy: input.adminName || "Administrator",
    })

    await logActivity({
      action: "Administrator created a client account",
      category: "Administration / User Management",
      user: input.adminName || "Administrator",
      details: {
        account: profile.fullName,
        company: profile.company,
        email,
        status,
        result: "created",
      },
    })

    return { ok: true, user: toView(rec), tempPassword }
  } catch (err) {
    return { ok: false, error: friendlyError(err) }
  }
}

export async function resetUserPassword(
  passcode: string,
  id: string,
  newPassword?: string,
  adminName?: string,
): Promise<AdminUserMutation> {
  try {
    requireAdmin(passcode)
    const existing = await getDynamicUserById(id)
    if (!existing) return { ok: false, error: "User not found." }
    const tempPassword = newPassword?.trim() || generateTempPassword()
    const rec = await updateDynamicUserProfile(id, { password: tempPassword })
    if (!rec) return { ok: false, error: "Unable to update credentials." }

    await logActivity({
      action: "Administrator reset client credentials",
      category: "Administration / User Management",
      user: adminName || "Administrator",
      details: { account: rec.profile.fullName, email: rec.email, result: "password reset" },
    })

    return { ok: true, user: toView(rec), tempPassword }
  } catch (err) {
    return { ok: false, error: friendlyError(err) }
  }
}

export async function updateUserStatus(
  passcode: string,
  id: string,
  status: UserStatus,
  adminName?: string,
): Promise<AdminUserMutation> {
  try {
    requireAdmin(passcode)
    const rec = await setDynamicUserStatus(id, status)
    if (!rec) return { ok: false, error: "User not found." }

    await logActivity({
      action: `Administrator set client account to ${status}`,
      category: "Administration / User Management",
      user: adminName || "Administrator",
      details: { account: rec.profile.fullName, email: rec.email, status, result: "status changed" },
    })

    return { ok: true, user: toView(rec) }
  } catch (err) {
    return { ok: false, error: friendlyError(err) }
  }
}

export interface EditUserInput {
  passcode: string
  id: string
  email?: string
  fullName?: string
  company?: string
  role?: string
  accountBadge?: string
  adminName?: string
}

export async function editUser(input: EditUserInput): Promise<AdminUserMutation> {
  try {
    requireAdmin(input.passcode)
    const existing = await getDynamicUserById(input.id)
    if (!existing) return { ok: false, error: "User not found." }

    const profile = { ...existing.profile }
    if (input.fullName?.trim()) {
      profile.fullName = input.fullName.trim()
      profile.shortName = input.fullName.trim()
      profile.firstName = input.fullName.trim().split(/\s+/)[0] || profile.firstName
      profile.initials = initialsFrom(input.fullName, profile.company)
      profile.cardHolderPerson = input.fullName.trim().toUpperCase()
    }
    if (input.company?.trim()) {
      profile.company = input.company.trim()
      profile.cardHolderCompany = input.company.trim().toUpperCase()
      profile.headerTag = `${input.company.trim().toUpperCase().slice(0, 18)} · CLIENT`
    }
    if (input.role?.trim()) profile.role = input.role.trim()
    if (input.accountBadge?.trim()) profile.accountBadge = input.accountBadge.trim()

    let email = existing.email
    if (input.email?.trim() && input.email.trim().toLowerCase() !== existing.email.toLowerCase()) {
      email = input.email.trim().toLowerCase()
      if (findUserByEmail(email) || (await getDynamicUserByEmail(email))) {
        return { ok: false, error: `The email ${email} is already in use.` }
      }
      profile.email = email
      profile.accountEmail = email
      profile.supportEmail = email
    }

    const rec = await updateDynamicUserProfile(input.id, { email, profile })
    if (!rec) return { ok: false, error: "Unable to update the account." }

    await logActivity({
      action: "Administrator edited a client account",
      category: "Administration / User Management",
      user: input.adminName || "Administrator",
      details: { account: rec.profile.fullName, company: rec.profile.company, email: rec.email, result: "updated" },
    })

    return { ok: true, user: toView(rec) }
  } catch (err) {
    return { ok: false, error: friendlyError(err) }
  }
}

export async function removeUser(passcode: string, id: string, adminName?: string): Promise<AdminUsersResult> {
  try {
    requireAdmin(passcode)
    const existing = await getDynamicUserById(id)
    if (!existing) return { ok: false, error: "User not found." }
    await deleteDynamicUser(id)

    await logActivity({
      action: "Administrator deleted a client account",
      category: "Administration / User Management",
      user: adminName || "Administrator",
      details: { account: existing.profile.fullName, email: existing.email, result: "deleted" },
    })

    const users = (await listDynamicUsers()).map(toView)
    return { ok: true, users }
  } catch (err) {
    return { ok: false, error: friendlyError(err) }
  }
}

// --- Self-service (no passcode) -------------------------------------------

/**
 * Returns the *current* signed-in user's serialized profile when they are a
 * dynamic (admin-created) account, so the client can hydrate and display the
 * correct identity. Returns null for static users (the client already has their
 * profile in lib/users.ts) or when there is no valid dynamic session.
 *
 * This is intentionally NOT passcode-gated: it only ever returns the caller's
 * OWN profile, resolved from their httpOnly session cookie.
 */
export async function getMyProfile(): Promise<SerializableUserProfile | null> {
  try {
    const { resolveCurrentSession } = await import("@/lib/session-user")
    const session = await resolveCurrentSession()
    if (!session || session.kind !== "dynamic") return null
    const rec = await getDynamicUserById(session.id)
    return rec?.profile ?? null
  } catch {
    return null
  }
}

// --- Shared client picker --------------------------------------------------

export interface SelectableClient {
  id: string
  fullName: string
  company: string
  email: string
  kind: "static" | "dynamic"
}

/**
 * Returns every account an administrator can act on (manage balances,
 * beneficiaries, etc.): the static registry users plus all *active* dynamic
 * (admin-created) users. Passcode-gated. Used by admin pickers so dynamic users
 * are first-class throughout the control panel — not just in User Management.
 */
export async function listSelectableClients(passcode: string): Promise<SelectableClient[]> {
  const { USERS } = await import("@/lib/users")
  const staticClients: SelectableClient[] = USERS.map((u) => ({
    id: u.id,
    fullName: u.fullName,
    company: u.company,
    email: u.email,
    kind: "static" as const,
  }))

  try {
    requireAdmin(passcode)
    const dynamic = (await listDynamicUsers())
      .filter((u) => u.status === "active")
      .map((u) => ({
        id: u.id,
        fullName: u.profile.fullName,
        company: u.profile.company,
        email: u.email,
        kind: "dynamic" as const,
      }))
    return [...staticClients, ...dynamic]
  } catch {
    // DB unavailable or unauthorized — still return the static registry so the
    // existing accounts remain manageable.
    return staticClients
  }
}
