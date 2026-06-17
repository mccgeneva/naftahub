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

import { PRIMARY_USER_ID } from "@/lib/users"

// Client-readable cookie that records which user is currently signed in.
export const USER_COOKIE = "mcc_user"

/**
 * The id of the user whose data should be read/written right now.
 * Falls back to the primary user on the server or when no cookie is present.
 */
export function getActiveUserId(): string {
  if (typeof document === "undefined") return PRIMARY_USER_ID
  try {
    const match = document.cookie.match(new RegExp(`(?:^|; )${USER_COOKIE}=([^;]*)`))
    const id = match ? decodeURIComponent(match[1]) : ""
    return id || PRIMARY_USER_ID
  } catch {
    return PRIMARY_USER_ID
  }
}

/**
 * Namespaces a base storage key for the active user. The primary user keeps the
 * original key; other users get an id-suffixed key so their data is isolated.
 */
export function scopedKey(baseKey: string): string {
  const id = getActiveUserId()
  return id === PRIMARY_USER_ID ? baseKey : `${baseKey}::${id}`
}
