import "server-only"
import { Resend } from "resend"

const FROM_EMAIL = process.env.ACTIVITY_LOG_FROM_EMAIL || "MCC Capital Alerts <alerts@mccgva.ch>"

function esc(s: string): string {
  return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;")
}

function buildHtml(name: string, link: string, locked: boolean): string {
  const intro = locked
    ? "You reported that your account may be compromised. For your protection the account is now locked and every active session has been signed out. Sign-in stays blocked until you choose a new password."
    : "We received a request to reset the password for your MCC Capital account."
  return `<!doctype html><html><body style="margin:0;background:#0b0b0d;padding:24px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
  <div style="max-width:560px;margin:0 auto;background:#16161a;border:1px solid #2a2a31;border-radius:12px;overflow:hidden;">
    <div style="background:#1f1f25;padding:18px 24px;border-bottom:1px solid #2a2a31;">
      <div style="color:#e7b15a;font-size:12px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;">${locked ? "Account locked for security" : "Password reset"}</div>
      <div style="color:#f4f4f5;font-size:18px;font-weight:700;margin-top:4px;">Set a new password</div>
    </div>
    <div style="padding:24px;color:#d4d4d8;font-size:14px;line-height:1.6;">
      <p style="margin:0 0 12px;">Hello ${esc(name)},</p>
      <p style="margin:0 0 20px;">${esc(intro)}</p>
      <a href="${esc(link)}" style="display:inline-block;background:#e7b15a;color:#16161a;text-decoration:none;font-weight:700;padding:12px 18px;border-radius:8px;">Choose a new password</a>
      <p style="margin:20px 0 0;color:#a1a1aa;font-size:12px;">This link works once and expires in 30 minutes. If the button doesn't work, copy this address into your browser:<br><span style="color:#d4d4d8;word-break:break-all;">${esc(link)}</span></p>
      <p style="margin:16px 0 0;color:#a1a1aa;font-size:12px;">If you didn't ask for this, ignore this email — your password stays the same${locked ? ", but the account remains locked until a new password is set" : ""}.</p>
    </div>
    <div style="padding:14px 24px;border-top:1px solid #2a2a31;color:#71717a;font-size:11px;">Automated security message from the MCC Capital platform. MCC will never ask for your password.</div>
  </div></body></html>`
}

/** Send the reset link to the address registered on the account. */
export async function sendPasswordResetEmail(input: {
  to: string
  name: string
  link: string
  locked: boolean
}): Promise<boolean> {
  const apiKey = process.env.RESEND_API_KEY
  if (!apiKey) {
    console.log("[v0] password-reset email skipped: RESEND_API_KEY not set")
    return false
  }
  try {
    const resend = new Resend(apiKey)
    const { error } = await resend.emails.send({
      from: FROM_EMAIL,
      to: input.to,
      subject: input.locked ? "Your MCC Capital account is locked — set a new password" : "Reset your MCC Capital password",
      html: buildHtml(input.name, input.link, input.locked),
    })
    if (error) {
      console.log("[v0] password-reset email error:", JSON.stringify(error))
      return false
    }
    return true
  } catch (err) {
    console.log("[v0] password-reset email exception:", (err as Error).message)
    return false
  }
}
