// ---------------------------------------------------------------------------
// Tamper-proof, server-enforced session metadata.
//
// SECURITY BACKGROUND
// The session cookie's value is a *static* per-user token (it never changes and
// never expires by itself). On its own, that means anyone holding the cookie is
// authenticated forever — the absolute 8h lifetime, the idle timeout, and the
// "log out on tab close" behaviour used to be enforced ONLY by client-side
// JavaScript (SessionGuard), which is defeated by browser session-restore and
// is disabled inside iframes.
//
// This module fixes that by issuing a SEPARATE, HMAC-signed metadata cookie
// alongside the session cookie. It records when the session was issued (iat),
// when it must absolutely end (exp), and when it was last seen (seen). Because
// it is signed, the client cannot forge or extend it. The Edge proxy and the
// server session resolver both verify it on every request, so an expired or
// idle session is rejected on the SERVER, regardless of what the browser does.
//
// Works in both the Edge runtime (proxy.ts) and the Node runtime (server
// actions / RSC) because it relies only on the Web Crypto API (globalThis.crypto).
// ---------------------------------------------------------------------------

export interface SessionMeta {
  /** Issued-at (ms since epoch). */
  iat: number
  /** Absolute expiry (ms since epoch) — hard cap, never extended. */
  exp: number
  /** Last-seen (ms since epoch) — slides forward on each request for idle tracking. */
  seen: number
}

// Signing secret. Prefer an env-configured secret; fall back to a build-time
// constant so the protection still works without extra setup (the app already
// ships static credentials in source, so this fallback does not lower the bar —
// but setting SESSION_SECRET in the project env is strongly recommended).
const FALLBACK_SECRET = "mcc-naftahub-session-signing-key-v1-please-set-SESSION_SECRET"

function getSecret(): string {
  return process.env.SESSION_SECRET || FALLBACK_SECRET
}

const encoder = new TextEncoder()

function bytesToBase64Url(bytes: Uint8Array): string {
  let bin = ""
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i])
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "")
}

function base64UrlToBytes(value: string): Uint8Array {
  const pad = value.length % 4 === 0 ? "" : "=".repeat(4 - (value.length % 4))
  const b64 = value.replace(/-/g, "+").replace(/_/g, "/") + pad
  const bin = atob(b64)
  const bytes = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
  return bytes
}

async function getKey(): Promise<CryptoKey> {
  return globalThis.crypto.subtle.importKey(
    "raw",
    encoder.encode(getSecret()),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  )
}

/** Create a signed metadata token: `base64url(payload).base64url(hmac)`. */
export async function signSessionMeta(meta: SessionMeta): Promise<string> {
  const payloadBytes = encoder.encode(JSON.stringify(meta))
  const key = await getKey()
  const sig = new Uint8Array(await globalThis.crypto.subtle.sign("HMAC", key, payloadBytes))
  return `${bytesToBase64Url(payloadBytes)}.${bytesToBase64Url(sig)}`
}

/**
 * Verify a signed metadata token and return its payload, or `null` if the
 * signature is invalid/missing/malformed (fails closed). Does NOT check expiry —
 * callers decide how to interpret `exp`/`seen` so they can clear cookies and log
 * the precise reason.
 */
export async function verifySessionMeta(value: string | undefined | null): Promise<SessionMeta | null> {
  if (!value) return null
  const dot = value.indexOf(".")
  if (dot <= 0 || dot === value.length - 1) return null

  try {
    const payloadPart = value.slice(0, dot)
    const sigPart = value.slice(dot + 1)
    const payloadBytes = base64UrlToBytes(payloadPart)
    const sigBytes = base64UrlToBytes(sigPart)
    const key = await getKey()
    const ok = await globalThis.crypto.subtle.verify("HMAC", key, sigBytes, payloadBytes)
    if (!ok) return null

    const meta = JSON.parse(new TextDecoder().decode(payloadBytes)) as SessionMeta
    if (
      typeof meta?.iat !== "number" ||
      typeof meta?.exp !== "number" ||
      typeof meta?.seen !== "number"
    ) {
      return null
    }
    return meta
  } catch {
    return null
  }
}

export type SessionValidity = "valid" | "expired" | "idle" | "invalid"

/**
 * Evaluate a (already signature-verified) metadata payload against the current
 * time. Returns why a session is no longer usable so callers can surface the
 * correct message and audit reason.
 */
export function evaluateSessionMeta(
  meta: SessionMeta | null,
  idleMaxAgeMs: number,
  now: number = Date.now(),
): SessionValidity {
  if (!meta) return "invalid"
  if (now >= meta.exp) return "expired"
  if (now - meta.seen >= idleMaxAgeMs) return "idle"
  return "valid"
}
