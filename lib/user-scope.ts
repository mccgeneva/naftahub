// ---------------------------------------------------------------------------
// Per-user data isolation.
//
// Every client's data lives in localStorage. To keep users completely separate
// we namespace each storage key by the active user id. The active user is read
// from the client-readable `mcc_user` cookie set at login.
//
// The primary user keeps the legacy (un-suffixed) keys so previously stored
// data is preserved; every other user gets a key suffixed with their id. The
// result is that no user can ever see or touch another user's data.
// ---------------------------------------------------------------------------

import { PRIMARY_USER_ID, UNKNOWN_USER_ID } from "@/lib/users"

// Client-readable cookie that records which user is currently signed in.
export const USER_COOKIE = "mcc_user"

/**
 * The id of the user whose data should be read/written right now.
 *
 * Read strictly from the client-readable `mcc_user` cookie. When the cookie is
 * missing/unreadable (or we're on the server, where there is no per-request
 * cookie here), we return the neutral UNKNOWN sentinel — NOT a real user.
 *
 * This is a deliberate fail-safe: previously this fell back to the primary user
 * (mesa@ipostrad.com), which meant any cookie glitch caused a different client's
 * data and actions to collapse onto that real account — a cross-user leak. The
 * UNKNOWN namespace is empty and isolated, so an unresolved session simply sees
 * nothing rather than someone else's account.
 */
export function getActiveUserId(): string {
  if (typeof document === "undefined") return UNKNOWN_USER_ID
  try {
    const match = document.cookie.match(new RegExp(`(?:^|; )${USER_COOKIE}=([^;]*)`))
    const id = match ? decodeURIComponent(match[1]) : ""
    return id || UNKNOWN_USER_ID
  } catch {
    return UNKNOWN_USER_ID
  }
}

/**
 * Namespaces a base storage key for a specific user id. The primary user keeps
 * the original key; other users get an id-suffixed key so their data is
 * isolated. This is the building block used by both the active-user helper and
 * by cross-user features (e.g. internal P2P transfers that must write into
 * another account's namespace).
 */
export function scopedKeyForUser(baseKey: string, userId: string): string {
  return userId === PRIMARY_USER_ID ? baseKey : `${baseKey}::${userId}`
}

/**
 * Namespaces a base storage key for the active user. The primary user keeps the
 * original key; other users get an id-suffixed key so their data is isolated.
 */
export function scopedKey(baseKey: string): string {
  return scopedKeyForUser(baseKey, getActiveUserId())
}
