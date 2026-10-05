import "server-only"
import { Resend } from "resend"
import { DEFAULT_LEGAL_DESK_SENDER, type LegalDeskSender } from "@/lib/legal-desk-senders"

export const LEGAL_DESK_FROM_ADDRESS = DEFAULT_LEGAL_DESK_SENDER.address

const SEND_TIMEOUT_MS = 12000

export interface LegalMt799 {
  transactionReference: string // :20:
  relatedReference: string // :21:
  recipientName: string
  subject: string
  subjectMatter: string[] // client / instrument / transaction lines
  narrative: string // :79:
  dateIso: string
}

function esc(s: string): string {
  return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
}

/** Wraps text to the 50-character lines used by the SWIFT :79: narrative field. */
function wrap50(text: string): string[] {
  const out: string[] = []
  for (const para of text.replace(/\r/g, "").split("\n")) {
    if (!para.trim()) {
      out.push("")
      continue
    }
    let line = ""
    for (const word of para.split(/\s+/)) {
      if (!word) continue
      if (word.length > 50) {
        if (line) out.push(line)
        for (let i = 0; i < word.length; i += 50) out.push(word.slice(i, i + 50))
        line = ""
        continue
      }
      if ((line ? line.length + 1 : 0) + word.length > 50) {
        out.push(line)
        line = word
      } else {
        line = line ? `${line} ${word}` : word
      }
    }
    if (line) out.push(line)
  }
  return out
}

/** Plain-text MT799 free-format message, as shown in the email and the preview. */
export function buildMt799Text(m: LegalMt799, sender: LegalDeskSender = DEFAULT_LEGAL_DESK_SENDER): string {
  const city = sender.location.split(",")[0].trim()
  const d = new Date(m.dateIso)
  const yymmdd = `${String(d.getUTCFullYear()).slice(2)}${String(d.getUTCMonth() + 1).padStart(2, "0")}${String(d.getUTCDate()).padStart(2, "0")}`
  const narrativeLines = [
    `RE: ${m.subject}`.toUpperCase(),
    ...m.subjectMatter.map((l) => l.toUpperCase()),
    "",
    ...wrap50(m.narrative),
  ]
  return [
    "MT799 FREE FORMAT MESSAGE",
    `DATE: ${yymmdd}`,
    `SENDER: ${sender.organisation}, ${city} - ${sender.department}`.toUpperCase(),
    `RECEIVER: ${m.recipientName.toUpperCase() || "TO WHOM IT MAY CONCERN"}`,
    "",
    `:20:${m.transactionReference}`,
    `:21:${m.relatedReference || "NONREF"}`,
    `:79:${narrativeLines[0]}`,
    ...narrativeLines.slice(1),
    "-}",
  ].join("\n")
}

function buildHtml(m: LegalMt799, mt: string, sender: LegalDeskSender): string {
  return `<!doctype html><html><body style="margin:0;background:#f4f4f2;padding:24px;font-family:Georgia,'Times New Roman',serif;color:#1c1c1c;">
  <div style="max-width:640px;margin:0 auto;background:#ffffff;border:1px solid #d9d7d0;">
    <div style="padding:20px 28px;border-bottom:2px solid #1c1c1c;">
      <div style="font-size:18px;font-weight:700;letter-spacing:.04em;">${esc(sender.organisation)}</div>
      <div style="font-size:12px;color:#5b5b5b;margin-top:2px;">${esc(sender.department)} · ${esc(sender.location)} · ${esc(sender.address)}</div>
    </div>
    <div style="padding:24px 28px;font-size:14px;line-height:1.6;">
      <p style="margin:0 0 4px;"><strong>To:</strong> ${esc(m.recipientName || "To whom it may concern")}</p>
      <p style="margin:0 0 16px;"><strong>Subject:</strong> ${esc(m.subject)}</p>
      <p style="margin:0 0 8px;font-size:12px;color:#5b5b5b;">The following is transmitted in SWIFT MT799 free-format layout.</p>
      <pre style="margin:0;padding:16px;background:#f7f7f5;border:1px solid #e3e1da;font-family:'Courier New',Courier,monospace;font-size:13px;line-height:1.5;white-space:pre-wrap;word-break:break-word;">${esc(mt)}</pre>
      <p style="margin:20px 0 0;">Yours faithfully,</p>
      <p style="margin:4px 0 0;"><strong>${esc(sender.organisation)}</strong><br/>${esc(sender.department)}</p>
    </div>
    <div style="padding:14px 28px;border-top:1px solid #e3e1da;font-size:11px;color:#7a7a7a;line-height:1.5;">
      This message is confidential and intended solely for the addressee. If you received it in error, please notify the sender at ${esc(sender.address)} and delete it.
    </div>
  </div></body></html>`
}

export type LegalSendResult = { ok: true; id: string | null } | { ok: false; error: string }

export async function sendLegalMt799(input: {
  to: string[]
  cc: string[]
  message: LegalMt799
  sender?: LegalDeskSender
}): Promise<LegalSendResult> {
  const apiKey = process.env.RESEND_API_KEY
  if (!apiKey) return { ok: false, error: "Email service is not configured (RESEND_API_KEY missing)." }
  const sender = input.sender ?? DEFAULT_LEGAL_DESK_SENDER
  const mt = buildMt799Text(input.message, sender)
  const domain = sender.address.split("@")[1]
  try {
    const resend = new Resend(apiKey)
    const { data, error } = await Promise.race([
      resend.emails.send({
        from: `${sender.organisation} — ${sender.department} <${sender.address}>`,
        to: input.to,
        cc: input.cc.length ? input.cc : undefined,
        replyTo: sender.address,
        subject: `MT799 ${input.message.transactionReference} — ${input.message.subject}`,
        html: buildHtml(input.message, mt, sender),
        text: `${mt}\n\nYours faithfully,\n${sender.organisation} — ${sender.department}\n${sender.address}`,
      }),
      new Promise<{ data: null; error: { message: string } }>((resolve) =>
        setTimeout(() => resolve({ data: null, error: { message: "The email service timed out." } }), SEND_TIMEOUT_MS),
      ),
    ])
    if (error) {
      const msg = (error as { message?: string }).message ?? "send failed"
      const domainHint = /domain|verif|not allowed|403/i.test(msg)
        ? ` The ${domain} domain must be verified in the Resend account before it can send.`
        : ""
      return { ok: false, error: `${msg}.${domainHint}` }
    }
    return { ok: true, id: data?.id ?? null }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "The email could not be sent." }
  }
}
