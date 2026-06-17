"use server"

import { Resend } from "resend"
import { headers } from "next/headers"

// PRODUCTION — mccgva.ch domain is verified in Resend, so logs send to the trader desk.
// The recipient and sender can be overridden via env vars without a code change.
// NOTE: the FROM domain MUST be a domain verified in the Resend account that owns
// RESEND_API_KEY, otherwise Resend rejects the send with a 403.
const TRADER_EMAIL = process.env.ACTIVITY_LOG_TO_EMAIL || "Trader@mccgva.ch"
const FROM_EMAIL =
  process.env.ACTIVITY_LOG_FROM_EMAIL ||
  "MCC Capital Activity Log <alerts@mccgva.ch>"

export type ActivityLog = {
  action: string
  category: string
  details?: Record<string, string | number | boolean | null | undefined>
  path?: string
  user?: string
}

// --- Email throttling ---------------------------------------------------
// We only email the trader desk for meaningful, important events:
//   • Login / Logout and any security event
//   • System errors / failures / declines
//   • Successful bank operations (payments, beneficiaries, instruments, FX, etc.)
//   • Other critical business requests
// Pure navigation and read-only/UI noise (viewing, exporting, copying, toggling
// settings, refreshing, draft saving) are intentionally NOT emailed.

// Security / failure / error events ALWAYS notify, regardless of anything else.
const ALWAYS_EMAIL_PATTERNS: RegExp[] = [
  /security/i,
  /\bdeclined\b/i,
  /\bfailed\b/i,
  /\berror\b/i,
  /\bunauthor/i, // unauthorized / unauthorised
  /\bblocked\b/i,
  /\bsession terminated\b/i,
]

// We use a default-ALLOW model: every operation or transaction a user performs
// is emailed to the trader desk so they always know exactly what each client is
// doing. Only pure, read-only UI noise — viewing a record, copying a value,
// downloading/exporting a file already on screen, refreshing a list, opening a
// panel, toggling a local setting, saving a draft, or setting a rate alert — is
// filtered out. Anything that creates, submits, executes, changes, approves, or
// otherwise *acts* on data is always reported.
const NOISE_ACTION_PATTERNS: RegExp[] = [
  /^Viewed\b/i, // opened a detail view (read-only)
  /^Downloaded\b/i, // saved an on-screen document/receipt/certificate locally
  /^Exported\b/i, // exported a list already visible to CSV
  /^Copied\b/i, // copied a value to the clipboard
  /^Refreshed\b/i, // refreshed a queue/list
  /^Opened\b/i, // opened a settings/management panel
  /^Tracked\b/i, // opened SWIFT gpi tracking for a payment
  /^Saved\b.*\bdraft\b/i, // saved a draft (not yet submitted)
  /^Set a rate alert\b/i, // local FX rate alert
  /^(Enabled|Disabled) setting:/i, // toggled a local preference
  /^(Hid|Revealed) card details\b/i, // showed/hid card numbers on screen
]

// Decides whether an activity is important enough to email.
function shouldEmail(activity: ActivityLog): boolean {
  const action = activity.action ?? ""
  const category = activity.category ?? ""

  // Security, auth-failure, error and decline events always notify — even if
  // the wording would otherwise look like noise.
  if (ALWAYS_EMAIL_PATTERNS.some((re) => re.test(action) || re.test(category))) {
    return true
  }

  // Default-allow: email every operation/transaction except recognised
  // read-only UI noise. This guarantees the trader desk sees exactly what each
  // user is doing instead of silently dropping unrecognised action wording.
  return !NOISE_ACTION_PATTERNS.some((re) => re.test(action))
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;")
}

function buildRows(details?: ActivityLog["details"]) {
  if (!details) return ""
  return Object.entries(details)
    .filter(([, v]) => v !== undefined && v !== null && v !== "")
    .map(
      ([key, value]) => `
        <tr>
          <td style="padding:8px 12px;border:1px solid #e5e7eb;background:#f9fafb;font-weight:600;color:#374151;font-size:13px;text-transform:capitalize;">${escapeHtml(
            key.replace(/([A-Z])/g, " $1").trim(),
          )}</td>
          <td style="padding:8px 12px;border:1px solid #e5e7eb;color:#111827;font-size:13px;">${escapeHtml(
            String(value),
          )}</td>
        </tr>`,
    )
    .join("")
}

async function resolveClientIp() {
  try {
    const h = await headers()
    // x-forwarded-for can be a comma-separated list; the first entry is the client.
    const forwarded = h.get("x-forwarded-for")
    if (forwarded) {
      const first = forwarded.split(",")[0]?.trim()
      if (first) return first
    }
    return (
      h.get("x-real-ip") ||
      h.get("x-vercel-forwarded-for") ||
      "Unknown"
    )
  } catch {
    return "Unknown"
  }
}

export async function logActivity(activity: ActivityLog) {
  try {
    // Throttle spam: only email meaningful, important events.
    if (!shouldEmail(activity)) {
      return { ok: true, skipped: true }
    }

    const apiKey = process.env.RESEND_API_KEY
    if (!apiKey) {
      console.log("[v0] logActivity skipped: RESEND_API_KEY not set")
      return { ok: false, error: "missing_api_key" }
    }

    const resend = new Resend(apiKey)
    const timestamp = new Date().toLocaleString("en-GB", {
      dateStyle: "full",
      timeStyle: "long",
      timeZone: "Europe/Zurich",
    })

    const ipAddress = await resolveClientIp()
    const user = activity.user || "Jesus Santos Alvarez Fernandez (IPOSTRAD Securities SL)"
    const detailRows = buildRows(activity.details)

    const html = `
      <div style="font-family:Arial,Helvetica,sans-serif;max-width:640px;margin:0 auto;background:#ffffff;">
        <div style="background:#0f172a;padding:20px 24px;border-radius:8px 8px 0 0;">
          <h1 style="margin:0;color:#ffffff;font-size:18px;">MCC Capital — Platform Activity Log</h1>
          <p style="margin:4px 0 0;color:#94a3b8;font-size:12px;">Automated operation report</p>
        </div>
        <div style="border:1px solid #e5e7eb;border-top:none;padding:24px;border-radius:0 0 8px 8px;">
          <table style="width:100%;border-collapse:collapse;margin-bottom:16px;">
            <tr>
              <td style="padding:8px 12px;border:1px solid #e5e7eb;background:#f9fafb;font-weight:600;color:#374151;font-size:13px;width:35%;">Action</td>
              <td style="padding:8px 12px;border:1px solid #e5e7eb;color:#111827;font-size:13px;font-weight:600;">${escapeHtml(
                activity.action,
              )}</td>
            </tr>
            <tr>
              <td style="padding:8px 12px;border:1px solid #e5e7eb;background:#f9fafb;font-weight:600;color:#374151;font-size:13px;">Category</td>
              <td style="padding:8px 12px;border:1px solid #e5e7eb;color:#111827;font-size:13px;">${escapeHtml(
                activity.category,
              )}</td>
            </tr>
            <tr>
              <td style="padding:8px 12px;border:1px solid #e5e7eb;background:#f9fafb;font-weight:600;color:#374151;font-size:13px;">User</td>
              <td style="padding:8px 12px;border:1px solid #e5e7eb;color:#111827;font-size:13px;">${escapeHtml(
                user,
              )}</td>
            </tr>
            <tr>
              <td style="padding:8px 12px;border:1px solid #e5e7eb;background:#f9fafb;font-weight:600;color:#374151;font-size:13px;">IP Address</td>
              <td style="padding:8px 12px;border:1px solid #e5e7eb;color:#111827;font-size:13px;font-family:monospace;">${escapeHtml(
                ipAddress,
              )}</td>
            </tr>
            ${
              activity.path
                ? `<tr>
              <td style="padding:8px 12px;border:1px solid #e5e7eb;background:#f9fafb;font-weight:600;color:#374151;font-size:13px;">Location</td>
              <td style="padding:8px 12px;border:1px solid #e5e7eb;color:#111827;font-size:13px;">${escapeHtml(
                activity.path,
              )}</td>
            </tr>`
                : ""
            }
            <tr>
              <td style="padding:8px 12px;border:1px solid #e5e7eb;background:#f9fafb;font-weight:600;color:#374151;font-size:13px;">Timestamp</td>
              <td style="padding:8px 12px;border:1px solid #e5e7eb;color:#111827;font-size:13px;">${escapeHtml(
                timestamp,
              )} (Zurich)</td>
            </tr>
          </table>
          ${
            detailRows
              ? `<h2 style="font-size:14px;color:#374151;margin:0 0 8px;">Operation Details</h2>
          <table style="width:100%;border-collapse:collapse;">${detailRows}</table>`
              : ""
          }
        </div>
      </div>`

    const { data, error } = await resend.emails.send({
      from: FROM_EMAIL,
      to: TRADER_EMAIL,
      subject: `[MCC Activity] ${activity.action}`,
      html,
    })

    if (error) {
      // Surface the real Resend error (e.g. unverified domain → 403) so it can be diagnosed.
      console.log(
        "[v0] logActivity send error:",
        JSON.stringify(error),
        "| from:",
        FROM_EMAIL,
        "| to:",
        TRADER_EMAIL,
      )
      return { ok: false, error: "send_failed", detail: error }
    }

    console.log("[v0] logActivity email sent:", data?.id ?? "(no id)", "->", TRADER_EMAIL)
    return { ok: true, id: data?.id }
  } catch (err) {
    console.log("[v0] logActivity exception:", err)
    return { ok: false, error: "exception" }
  }
}
