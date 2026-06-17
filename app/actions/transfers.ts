"use server"

import { findTransferRecipientByEmail, type TransferDirectoryEntry } from "@/lib/users"
import { getDynamicUserByEmail } from "@/lib/admin-users-db"

/**
 * Resolve a transfer recipient by registered email across BOTH account stores.
 *
 * The client-side directory in lib/users.ts only knows the static (built-in)
 * accounts. Administrator-created clients live in the Neon `admin_users` table
 * and are invisible to that synchronous lookup — which is why sending to a real,
 * logged-in dynamic user (e.g. jobaida.akter1996@libero.it) showed
 * "No account found for this email yet."
 *
 * This server action checks the static directory first, then falls back to the
 * dynamic user store, so any account that can log in can also receive transfers.
 * Suspended/inactive accounts are treated as not-resolvable so funds can't be
 * routed to a disabled account. Never returns secrets.
 */
export async function resolveTransferRecipient(
  email: string,
): Promise<{ ok: true; recipient: TransferDirectoryEntry | null } | { ok: false; error: string }> {
  try {
    const trimmed = (email ?? "").trim()
    if (!trimmed) return { ok: true, recipient: null }

    // 1) Static built-in accounts.
    const staticMatch = findTransferRecipientByEmail(trimmed)
    if (staticMatch) return { ok: true, recipient: staticMatch }

    // 2) Administrator-created (dynamic) accounts in Neon.
    const dyn = await getDynamicUserByEmail(trimmed)
    if (dyn && dyn.status === "active") {
      const p = dyn.profile
      return {
        ok: true,
        recipient: {
          id: dyn.id,
          email: dyn.email,
          displayName: p.fullName || p.shortName || p.company || dyn.email,
          company: p.company || "",
          initials: p.initials || dyn.email.slice(0, 2).toUpperCase(),
        },
      }
    }

    return { ok: true, recipient: null }
  } catch {
    // Non-fatal: treat as "not found" so the form stays usable.
    return { ok: true, recipient: null }
  }
}
