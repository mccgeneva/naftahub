"use server"

import { headers } from "next/headers"
import { after } from "next/server"
import { deliverActivityEmail, type ActivityLog } from "@/lib/activity-email"

async function resolveClientIp() {
  try {
    const h = await headers()
    // x-forwarded-for can be a comma-separated list; the first entry is the client.
    const forwarded = h.get("x-forwarded-for")
    if (forwarded) {
      const first = forwarded.split(",")[0]?.trim()
      if (first) return first
    }
    return h.get("x-real-ip") || h.get("x-vercel-forwarded-for") || "Unknown"
  } catch {
    return "Unknown"
  }
}

/**
 * Server-side activity logging (login, logout, session, treasury, etc.).
 *
 * Client components do NOT use this Server Action — they POST to
 * /api/log-activity (a Route Handler) which is immune to Server Action
 * Origin/CSRF checks and therefore works on every domain. This action remains
 * for server-to-server callers where origin is irrelevant.
 *
 * Email delivery is deferred with `after()` so it never blocks redirects.
 */
export async function logActivity(activity: ActivityLog) {
  try {
    // Resolve request-scoped data NOW; the deferred work must not touch headers().
    const ipAddress = await resolveClientIp()
    after(async () => {
      await deliverActivityEmail(activity, ipAddress)
    })
    return { ok: true, scheduled: true }
  } catch (err) {
    console.log("[v0] logActivity exception:", err)
    return { ok: false, error: "exception" }
  }
}
