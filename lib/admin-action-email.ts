import "server-only"
import { Resend } from "resend"

export const ADMIN_ACTION_EMAIL = "admin@mccgva.ch"

const FROM_EMAIL = process.env.ACTIVITY_LOG_FROM_EMAIL || "MCC Capital Alerts <alerts@mccgva.ch>"
const SEND_TIMEOUT_MS = 8000

// Admin-action alerts are delivered to admin@mccgva.ch only when the bell links
// into an administrator work surface; ordinary account notifications never email.
const ACTION_HREF_PREFIXES = ["/dashboard/admin", "/dashboard/bankeka"]

let adminIdCache: { id: string | null; at: number } | null = null

async function resolveAdminUserId(): Promise<string | null> {
  if (adminIdCache && Date.now() - adminIdCache.at < 5 * 60_000) return adminIdCache.id
  try {
    const { getDynamicUserByEmail } = await import("@/lib/admin-users-db")
    const user = await getDynamicUserByEmail(ADMIN_ACTION_EMAIL)
    adminIdCache = { id: user?.id ?? null, at: Date.now() }
  } catch {
    adminIdCache = { id: null, at: Date.now() }
  }
  return adminIdCache.id
}

function esc(s: string): string {
  return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;")
}

function appBaseUrl(): string {
  const explicit = process.env.NEXT_PUBLIC_APP_URL || process.env.NEXT_PUBLIC_SITE_URL
  if (explicit) return explicit.replace(/\/$/, "")
  const prod = process.env.VERCEL_PROJECT_PRODUCTION_URL || process.env.VERCEL_URL
  return prod ? `https://${prod.replace(/\/$/, "")}` : ""
}

function sectionFromHref(href: string): string {
  if (href.startsWith("/dashboard/bankeka")) return "Bankeka Messages"
  const view = new URL(href, "https://x.local").searchParams.get("view")
  if (!view) return "Administrator panel — Pending Decisions"
  return `Administrator panel → ${view.replace(/[-_]/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())}`
}

function buildHtml(n: { title: string; body: string; href: string; tone: string; createdAt: Date }) {
  const base = appBaseUrl()
  const link = base ? `${base}${n.href}` : n.href
  const section = sectionFromHref(n.href)
  const when = n.createdAt.toLocaleString("en-GB", { timeZone: "Europe/Zurich", dateStyle: "medium", timeStyle: "short" })
  const row = (label: string, value: string) =>
    `<tr><td style="padding:6px 0;color:#a1a1aa;width:150px;vertical-align:top;">${esc(label)}</td><td style="padding:6px 0;color:#f4f4f5;font-weight:600;">${esc(value)}</td></tr>`
  return `<!doctype html><html><body style="margin:0;background:#0b0b0d;padding:24px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
  <div style="max-width:600px;margin:0 auto;background:#16161a;border:1px solid #2a2a31;border-radius:12px;overflow:hidden;">
    <div style="background:#1f1f25;padding:18px 24px;border-bottom:1px solid #2a2a31;">
      <div style="color:#e7b15a;font-size:12px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;">Administrator action required</div>
      <div style="color:#f4f4f5;font-size:18px;font-weight:700;margin-top:4px;">${esc(n.title)}</div>
    </div>
    <div style="padding:24px;color:#d4d4d8;font-size:14px;line-height:1.6;">
      <p style="margin:0 0 16px;">${esc(n.body)}</p>
      <table style="width:100%;border-collapse:collapse;">
        ${row("Received", `${when} (Geneva)`)}
        ${row("Priority", n.tone === "warning" || n.tone === "error" ? "Needs a decision" : "For review")}
        ${row("Where to act", section)}
      </table>
      <div style="margin-top:20px;padding:14px 16px;background:#1f1f25;border:1px solid #2a2a31;border-radius:8px;">
        <div style="color:#e7b15a;font-weight:700;margin-bottom:6px;">What to do</div>
        <ol style="margin:0;padding-left:18px;color:#d4d4d8;">
          <li>Sign in to the platform as an administrator.</li>
          <li>Open <b>${esc(section)}</b>.</li>
          <li>Review the customer's request and its documents, then approve, negotiate or reject it.</li>
          <li>The customer is notified automatically once you decide.</li>
        </ol>
      </div>
      ${base ? `<div style="margin-top:20px;"><a href="${esc(link)}" style="display:inline-block;background:#e7b15a;color:#16161a;text-decoration:none;font-weight:700;padding:12px 18px;border-radius:8px;">Open and take action</a></div>` : ""}
    </div>
    <div style="padding:14px 24px;border-top:1px solid #2a2a31;color:#71717a;font-size:11px;">Automated message from the MCC Capital platform. Nothing has been approved — the request is waiting for you.</div>
  </div></body></html>`
}

async function send(subject: string, html: string): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY
  if (!apiKey) {
    console.log("[v0] admin-action-email skipped: RESEND_API_KEY not set")
    return
  }
  const resend = new Resend(apiKey)
  const { error } = await Promise.race([
    resend.emails.send({ from: FROM_EMAIL, to: ADMIN_ACTION_EMAIL, subject, html }),
    new Promise<{ data: null; error: { message: string } }>((resolve) =>
      setTimeout(() => resolve({ data: null, error: { message: "timeout" } }), SEND_TIMEOUT_MS),
    ),
  ])
  if (error) console.log("[v0] admin-action-email send error:", JSON.stringify(error))
}

/**
 * Mirrors an administrator bell notification to admin@mccgva.ch by email.
 * Called from the single notification writer, so every customer request that
 * alerts the admins (approvals backbone and own-table requests alike) emails too.
 * Best-effort: never throws and never delays the caller.
 */
export function mirrorAdminActionEmail(n: {
  userId: string
  title: string
  body: string
  href?: string | null
  tone?: string | null
}): void {
  const href = n.href ?? ""
  if (!ACTION_HREF_PREFIXES.some((p) => href.startsWith(p))) return
  void (async () => {
    try {
      const adminId = await resolveAdminUserId()
      if (!adminId || adminId !== n.userId) return
      const html = buildHtml({ title: n.title, body: n.body, href, tone: n.tone ?? "info", createdAt: new Date() })
      await send(`[Action required] ${n.title}`, html)
    } catch (err) {
      console.log("[v0] admin-action-email exception:", err)
    }
  })()
}
