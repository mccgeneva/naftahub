"use server"

import type { TransferDirectoryEntry } from "@/lib/users"
import { getDynamicUserByEmail, listDynamicUsers } from "@/lib/admin-users-db"

function toDirectoryEntry(dyn: {
  id: string
  email: string
  profile: { fullName?: string; shortName?: string; company?: string; initials?: string }
}): TransferDirectoryEntry {
  const p = dyn.profile
  return {
    id: dyn.id,
    email: dyn.email,
    displayName: p.fullName || p.shortName || p.company || dyn.email,
    company: p.company || "",
    initials: p.initials || dyn.email.slice(0, 2).toUpperCase(),
  }
}

/**
 * Resolve a transfer recipient by registered email. Every account lives in the
 * Neon `admin_users` table, so any account that can log in can also receive
 * transfers. Suspended/inactive accounts are treated as not-resolvable so funds
 * can't be routed to a disabled account. Never returns secrets.
 */
export async function resolveTransferRecipient(
  email: string,
): Promise<{ ok: true; recipient: TransferDirectoryEntry | null } | { ok: false; error: string }> {
  try {
    const trimmed = (email ?? "").trim()
    if (!trimmed) return { ok: true, recipient: null }

    const dyn = await getDynamicUserByEmail(trimmed)
    if (dyn && dyn.status === "active") {
      return { ok: true, recipient: toDirectoryEntry(dyn) }
    }

    return { ok: true, recipient: null }
  } catch {
    // Non-fatal: treat as "not found" so the form stays usable.
    return { ok: true, recipient: null }
  }
}

/**
 * The platform transfer directory: a secrets-free list of every *active*
 * account that can send/receive internal transfers. Used by the Send Money page
 * to render the quick-pick "Platform accounts" list. Returns an empty list if
 * the database is unreachable.
 */
export async function listTransferDirectory(): Promise<TransferDirectoryEntry[]> {
  try {
    return (await listDynamicUsers())
      .filter((u) => u.status === "active")
      .map(toDirectoryEntry)
  } catch {
    return []
  }
}
