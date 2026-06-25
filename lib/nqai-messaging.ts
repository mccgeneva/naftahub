import "server-only"

import { Resend } from "resend"

// =============================================================================
// NQAi outbound messaging — lets NQAi autonomously send email (Resend) and SMS
// (Twilio REST) on the client's behalf when asked. All sends are server-side,
// validated, time-bounded, and never throw (failures are returned as a
// structured result so the model can report them honestly).
// =============================================================================

// Email FROM must be a domain verified in the Resend account that owns
// RESEND_API_KEY (mccgva.ch is verified), otherwise Resend rejects with 403.
const NQAI_FROM_EMAIL = process.env.NQAI_FROM_EMAIL || "NQAi — MCC Capital <nqai@mccgva.ch>"

// Hard cap on each upstream network call so a hanging provider can't keep the
// request alive indefinitely.
const SEND_TIMEOUT_MS = 9000

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
// E.164: optional +, leading non-zero country digit, up to 15 digits total.
const E164_RE = /^\+?[1-9]\d{6,14}$/

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;")
}

/** Normalise a phone number to E.164 (digits only, single leading +). */
function normalisePhone(raw: string): string | null {
  const trimmed = (raw || "").trim()
  // Keep a leading +, strip spaces, dashes, parentheses and dots.
  const cleaned = trimmed.replace(/[\s().-]/g, "")
  const candidate = cleaned.startsWith("+") ? cleaned : cleaned.startsWith("00") ? `+${cleaned.slice(2)}` : cleaned
  if (!E164_RE.test(candidate)) return null
  return candidate.startsWith("+") ? candidate : `+${candidate}`
}

function withTimeout<T>(promise: Promise<T>, fallback: T): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((resolve) => setTimeout(() => resolve(fallback), SEND_TIMEOUT_MS)),
  ])
}

export interface SendResult {
  ok: boolean
  id?: string
  to?: string
  error?: string
}

interface EmailArgs {
  to: string
  subject: string
  body: string
  /** Display name of the signed-in client, for the email footer/audit. */
  senderName?: string
}

/**
 * Sends a single email via Resend. Renders the plain-text body into a clean,
 * branded HTML wrapper. Returns a structured result; never throws.
 */
export async function sendOutboundEmail({ to, subject, body, senderName }: EmailArgs): Promise<SendResult> {
  try {
    const recipient = (to || "").trim()
    if (!EMAIL_RE.test(recipient)) {
      return { ok: false, error: `"${to}" is not a valid email address.` }
    }
    const subj = (subject || "").trim()
    if (!subj) return { ok: false, error: "A subject line is required." }
    const text = (body || "").trim()
    if (!text) return { ok: false, error: "The email body is empty." }

    const apiKey = process.env.RESEND_API_KEY
    if (!apiKey) {
      return { ok: false, error: "Email is not configured (RESEND_API_KEY is missing)." }
    }

    const resend = new Resend(apiKey)
    const safeBody = escapeHtml(text).replace(/\n/g, "<br/>")
    const senderLine = senderName
      ? `<p style="margin:0 0 16px;color:#475569;font-size:13px;">Sent on behalf of ${escapeHtml(senderName)}.</p>`
      : ""
    const html = `
      <div style="font-family:Arial,Helvetica,sans-serif;max-width:640px;margin:0 auto;background:#ffffff;">
        <div style="background:#0f172a;padding:18px 24px;border-radius:8px 8px 0 0;">
          <h1 style="margin:0;color:#ffffff;font-size:16px;">MCC Capital</h1>
          <p style="margin:3px 0 0;color:#94a3b8;font-size:11px;">Message dispatched by NQAi</p>
        </div>
        <div style="border:1px solid #e5e7eb;border-top:none;padding:24px;border-radius:0 0 8px 8px;color:#111827;font-size:14px;line-height:1.6;">
          ${senderLine}
          <div>${safeBody}</div>
        </div>
      </div>`

    const { data, error } = await withTimeout(
      resend.emails.send({ from: NQAI_FROM_EMAIL, to: recipient, subject: subj, html, text }),
      { data: null, error: { message: `timeout after ${SEND_TIMEOUT_MS}ms` } } as {
        data: { id: string } | null
        error: { message: string } | null
      },
    )

    if (error) {
      console.log("[v0] NQAi sendOutboundEmail error:", JSON.stringify(error), "-> to:", recipient)
      return { ok: false, to: recipient, error: error.message || "send_failed" }
    }
    console.log("[v0] NQAi email sent:", data?.id ?? "(no id)", "->", recipient)
    return { ok: true, id: data?.id, to: recipient }
  } catch (err) {
    console.log("[v0] NQAi sendOutboundEmail exception:", err)
    return { ok: false, error: "An unexpected error occurred while sending the email." }
  }
}

interface SmsArgs {
  to: string
  body: string
}

/**
 * Sends an SMS via the Twilio REST API (no SDK dependency). Requires
 * TWILIO_ACCOUNT_SID + TWILIO_AUTH_TOKEN and either TWILIO_MESSAGING_SERVICE_SID
 * or TWILIO_FROM_NUMBER. Returns a structured result; never throws.
 */
export async function sendOutboundSms({ to, body }: SmsArgs): Promise<SendResult> {
  try {
    const recipient = normalisePhone(to)
    if (!recipient) {
      return { ok: false, error: `"${to}" is not a valid phone number. Use international format, e.g. +41791234567.` }
    }
    const text = (body || "").trim()
    if (!text) return { ok: false, error: "The SMS message is empty." }
    if (text.length > 1600) {
      return { ok: false, error: "The SMS message is too long (max 1600 characters)." }
    }

    const accountSid = process.env.TWILIO_ACCOUNT_SID
    const authToken = process.env.TWILIO_AUTH_TOKEN
    const messagingServiceSid = process.env.TWILIO_MESSAGING_SERVICE_SID
    const fromNumber = process.env.TWILIO_FROM_NUMBER

    if (!accountSid || !authToken) {
      return { ok: false, error: "SMS is not configured (Twilio credentials are missing)." }
    }
    if (!messagingServiceSid && !fromNumber) {
      return {
        ok: false,
        error: "SMS is not configured (set TWILIO_MESSAGING_SERVICE_SID or TWILIO_FROM_NUMBER).",
      }
    }

    const form = new URLSearchParams()
    form.set("To", recipient)
    if (messagingServiceSid) form.set("MessagingServiceSid", messagingServiceSid)
    else form.set("From", fromNumber as string)
    form.set("Body", text)

    const auth = Buffer.from(`${accountSid}:${authToken}`).toString("base64")
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), SEND_TIMEOUT_MS)
    let res: Response
    try {
      res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`, {
        method: "POST",
        headers: {
          Authorization: `Basic ${auth}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: form.toString(),
        signal: controller.signal,
      })
    } finally {
      clearTimeout(timer)
    }

    const payload = (await res.json().catch(() => ({}))) as { sid?: string; message?: string; code?: number }
    if (!res.ok) {
      console.log("[v0] NQAi sendOutboundSms error:", res.status, JSON.stringify(payload), "-> to:", recipient)
      return { ok: false, to: recipient, error: payload.message || `Twilio responded ${res.status}.` }
    }
    console.log("[v0] NQAi SMS sent:", payload.sid ?? "(no sid)", "->", recipient)
    return { ok: true, id: payload.sid, to: recipient }
  } catch (err) {
    const aborted = err instanceof Error && err.name === "AbortError"
    console.log("[v0] NQAi sendOutboundSms exception:", err)
    return { ok: false, error: aborted ? `SMS provider timed out after ${SEND_TIMEOUT_MS}ms.` : "An unexpected error occurred while sending the SMS." }
  }
}
