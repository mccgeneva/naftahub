// Client accounts can only ever be one of two membership tiers. Anything else
// (legacy "Client Account", a blank value, "Institutional", etc.) is normalised
// so a client never sees an account type the platform does not offer.
//
// This lives in a plain module (not a "use server" file) so it can be a regular
// synchronous helper shared by both server actions and client components.

export const ACCOUNT_TIERS = ["PRO Account", "Avant-garde Account"] as const

export type AccountTier = (typeof ACCOUNT_TIERS)[number]

export function normalizeAccountBadge(badge: string | undefined | null): AccountTier {
  const v = (badge ?? "").trim().toLowerCase()
  if (v.includes("avant") || v.includes("institutional")) return "Avant-garde Account"
  return "PRO Account"
}
