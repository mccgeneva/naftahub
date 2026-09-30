"use server"

import type { TransferDirectoryEntry } from "@/lib/users"
import { getDynamicUserByEmail, listDynamicUsers } from "@/lib/admin-users-db"
import { extractCurrencyBankingCoordinates, currenciesWithBankingRows } from "@/lib/banking-coordinates"

export type BeneficiaryIbanLookup =
  | { status: "internal"; recipient: TransferDirectoryEntry; currency: string; bankName: string | null }
  | { status: "external" }
  | { status: "ambiguous" }

/**
 * Decide whether a beneficiary IBAN belongs to a platform customer (any of
 * their master-account IBANs, primary or per-currency) or is an external bank
 * account. Exactly one owning active customer → "internal"; none → "external";
 * several distinct owners → "ambiguous" (never guess who to credit).
 */
export async function resolveBeneficiaryIban(raw: string): Promise<BeneficiaryIbanLookup> {
  const iban = (raw ?? "").replace(/[\s-]/g, "").toUpperCase()
  if (iban.length < 15) return { status: "external" }
  try {
    const users = (await listDynamicUsers()).filter((u) => u.status === "active")
    const hits: { user: (typeof users)[number]; currency: string; bankName: string | null }[] = []
    for (const u of users) {
      const rows = u.profile?.banking
      if (!rows || rows.length === 0) continue
      for (const cur of ["EUR", ...currenciesWithBankingRows(rows)]) {
        const c = extractCurrencyBankingCoordinates(rows, cur)
        const own = (c.iban ?? "").replace(/[\s-]/g, "").toUpperCase()
        if (own && own === iban) hits.push({ user: u, currency: cur, bankName: c.bankName ?? null })
      }
    }
    const owners = Array.from(new Set(hits.map((h) => h.user.id)))
    if (owners.length === 0) return { status: "external" }
    if (owners.length > 1) return { status: "ambiguous" }
    const hit = hits[0]
    return { status: "internal", recipient: toDirectoryEntry(hit.user), currency: hit.currency, bankName: hit.bankName }
  } catch {
    return { status: "external" }
  }
}

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
  * Type-ahead recipient search: matches active accounts by name, company or
  * email once at least 2 characters are typed. Returns up to 8 matches, best
  * (prefix) matches first. Empty list on any error.
  */
  export async function searchTransferRecipients(query: string): Promise<TransferDirectoryEntry[]> {
  const q = (query ?? "").trim().toLowerCase()
  if (q.length < 2) return []
  try {
  const entries = (await listDynamicUsers())
  .filter((u) => u.status === "active")
  .map(toDirectoryEntry)
  const scored = entries
  .map((e) => {
  const fields = [e.displayName, e.company ?? "", e.email].map((f) => f.toLowerCase())
  const words = fields.flatMap((f) => f.split(/[\s@.·-]+/))
  let score = 0
  if (fields.some((f) => f.startsWith(q))) score = 3
  else if (words.some((w) => w.startsWith(q))) score = 2
  else if (fields.some((f) => f.includes(q))) score = 1
  return { e, score }
  })
  .filter((s) => s.score > 0)
  .sort((a, b) => b.score - a.score || a.e.displayName.localeCompare(b.e.displayName))
  return scored.slice(0, 8).map((s) => s.e)
  } catch {
  return []
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
