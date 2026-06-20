import "server-only"
import { Resend } from "resend"

// The FROM domain MUST be verified in the Resend account that owns
// RESEND_API_KEY, otherwise Resend rejects the send with a 403. We reuse the
// same verified sender the activity log uses.
const FROM_EMAIL = process.env.ACTIVITY_LOG_FROM_EMAIL || "MCC Capital SWIFT <alerts@mccgva.ch>"

const SEND_TIMEOUT_MS = 8000

function esc(s: string): string {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
}

type SendResult = { ok: true; id?: string } | { ok: false; error: string }

async function send(to: string, subject: string, html: string): Promise<SendResult> {
  try {
    const apiKey = process.env.RESEND_API_KEY
    if (!apiKey) {
      console.log("[v0] swift-email skipped: RESEND_API_KEY not set")
      return { ok: false, error: "missing_api_key" }
    }
    if (!to || !to.includes("@")) {
      console.log("[v0] swift-email skipped: invalid recipient", to)
      return { ok: false, error: "invalid_recipient" }
    }
    const resend = new Resend(apiKey)
    const { data, error } = await Promise.race([
      resend.emails.send({ from: FROM_EMAIL, to, subject, html }),
      new Promise<{ data: null; error: { message: string } }>((resolve) =>
        setTimeout(() => resolve({ data: null, error: { message: `timeout after ${SEND_TIMEOUT_MS}ms` } }), SEND_TIMEOUT_MS),
      ),
    ])
    if (error) {
      console.log("[v0] swift-email send error:", JSON.stringify(error), "| to:", to)
      return { ok: false, error: "send_failed" }
    }
    console.log("[v0] swift-email sent:", data?.id ?? "(no id)", "->", to)
    return { ok: true, id: data?.id }
  } catch (err) {
    console.log("[v0] swift-email exception:", err)
    return { ok: false, error: "exception" }
  }
}

function shell(title: string, bodyRows: string, extra = ""): string {
  return `<!doctype html><html><body style="margin:0;background:#0b0b0d;padding:24px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
    <div style="max-width:600px;margin:0 auto;background:#16161a;border:1px solid #2a2a31;border-radius:12px;overflow:hidden;">
      <div style="background:#1f1f25;padding:18px 24px;border-bottom:1px solid #2a2a31;">
        <div style="color:#e7b15a;font-size:13px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;">MCC Capital · SWIFT</div>
        <div style="color:#f4f4f5;font-size:18px;font-weight:700;margin-top:4px;">${esc(title)}</div>
      </div>
      <div style="padding:24px;color:#d4d4d8;font-size:14px;line-height:1.6;">
        <table style="width:100%;border-collapse:collapse;">${bodyRows}</table>
        ${extra}
      </div>
      <div style="padding:14px 24px;border-top:1px solid #2a2a31;color:#71717a;font-size:11px;">
        This is an automated message from the MCC Capital treasury platform.
      </div>
    </div>
  </body></html>`
}

function row(label: string, value: string): string {
  return `<tr>
    <td style="padding:6px 0;color:#a1a1aa;width:160px;vertical-align:top;">${esc(label)}</td>
    <td style="padding:6px 0;color:#f4f4f5;font-weight:600;">${esc(value)}</td>
  </tr>`
}

export interface SwiftEmailInfo {
  messageType: string
  messageName: string
  uetr: string
  reference: string | null
  amount: string | null
  currency: string | null
  senderBic: string
}

/** Sent to the client immediately when they submit a SWIFT message for routing. */
export async function sendSwiftSubmittedEmail(to: string, info: SwiftEmailInfo): Promise<SendResult> {
  const amount = info.amount ? `${info.currency ?? ""} ${info.amount}`.trim() : "—"
  const html = shell(
    "Message submitted for routing",
    row("Message type", `${info.messageType} · ${info.messageName}`) +
      row("UETR", info.uetr) +
      (info.reference ? row("Reference", info.reference) : "") +
      row("Amount", amount) +
      row("Sender BIC", info.senderBic) +
      row("Status", "Pending administrator approval"),
    `<p style="margin:18px 0 0;color:#a1a1aa;">Your SWIFT ${esc(info.messageType)} has been generated and submitted. An administrator will review it and route it to the designated beneficiary. You will see the outcome reflected in your SWIFT message log.</p>`,
  )
  return send(to, `[MCC SWIFT] ${info.messageType} submitted for routing — ${info.uetr.slice(0, 13)}…`, html)
}

/** Sent to the chosen beneficiary when an administrator approves & routes the message. */
export async function sendSwiftRoutedEmail(
  to: string,
  beneficiaryName: string,
  info: SwiftEmailInfo,
  rawFin: string,
): Promise<SendResult> {
  const amount = info.amount ? `${info.currency ?? ""} ${info.amount}`.trim() : "—"
  const html = shell(
    "Incoming SWIFT message",
    row("Beneficiary", beneficiaryName) +
      row("Message type", `${info.messageType} · ${info.messageName}`) +
      row("UETR", info.uetr) +
      (info.reference ? row("Reference", info.reference) : "") +
      row("Amount", amount) +
      row("Sender BIC", info.senderBic),
    `<p style="margin:18px 0 8px;color:#a1a1aa;">The following SWIFT FIN message has been routed to you:</p>
     <pre style="margin:0;padding:16px;background:#0b0b0d;border:1px solid #2a2a31;border-radius:8px;color:#e4e4e7;font-family:'SF Mono',Menlo,Consolas,monospace;font-size:12px;line-height:1.5;white-space:pre-wrap;word-break:break-word;">${esc(rawFin)}</pre>`,
  )
  return send(to, `[MCC SWIFT] ${info.messageType} routed to you — ${info.uetr.slice(0, 13)}…`, html)
}
