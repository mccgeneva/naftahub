import { NextResponse } from "next/server"
import { adminActionAuthorized } from "@/lib/admin-auth"
import { listDynamicUsers } from "@/lib/admin-users-db"
import { listInstrumentsForAml } from "@/lib/instrument-revocation"
import { readLedgerEntries } from "@/lib/ledger-db"
import { resolveDataOwnerIdFor } from "@/lib/session-user"
import { listLegalMessages, newLegalReference, saveLegalMessage } from "@/lib/legal-desk-db"
import { LEGAL_DESK_FROM_ADDRESS, buildMt799Text, sendLegalMt799 } from "@/lib/legal-desk-email"
import { logActivity } from "@/app/actions/log-activity"
import { DEFAULT_LEGAL_DESK_SENDER, findLegalDeskSender } from "@/lib/legal-desk-senders"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const maxDuration = 60

const EMAIL_RE = /^[^\s@,;]+@[^\s@,;]+\.[^\s@,;]+$/

function str(v: unknown, max = 4000): string {
  return typeof v === "string" ? v.trim().slice(0, max) : ""
}
function emails(v: unknown): string[] {
  const raw = Array.isArray(v) ? v.join(",") : typeof v === "string" ? v : ""
  return Array.from(new Set(raw.split(/[,;\s]+/).map((e) => e.trim().toLowerCase()).filter(Boolean)))
}
function holderLabel(u: { email: string; profile?: { fullName?: string; company?: string } }): string {
  const name = u.profile?.fullName?.trim() || u.email
  const company = u.profile?.company?.trim()
  return company ? `${name} · ${company}` : name
}
function fmt(amount: number, currency: string): string {
  return `${currency} ${Number(amount || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null
  if (!body || !(await adminActionAuthorized(String(body.passcode ?? "")))) {
    return NextResponse.json({ ok: false, error: "Administrator authorization failed." }, { status: 401 })
  }
  const op = String(body.op ?? "")

  try {
    if (op === "list") {
      const [users, messages] = await Promise.all([listDynamicUsers(), listLegalMessages()])
      const clients = users
        .map((u) => ({ id: u.id, label: holderLabel(u), email: u.email }))
        .sort((a, b) => a.label.localeCompare(b.label))
      return NextResponse.json({ ok: true, clients, messages, fromEmail: LEGAL_DESK_FROM_ADDRESS, nextReference: newLegalReference() })
    }

    if (op === "check-domains") {
      const key = process.env.RESEND_API_KEY
      if (!key) return NextResponse.json({ ok: false, error: "RESEND_API_KEY is not set on this deployment." })
      const res = await fetch("https://api.resend.com/domains", {
        headers: { Authorization: `Bearer ${key}` },
        cache: "no-store",
      })
      const json = (await res.json().catch(() => null)) as
        | { data?: Array<{ name: string; status: string }>; message?: string }
        | null
      if (!res.ok || !json?.data) {
        return NextResponse.json({
          ok: false,
          error: `Resend rejected the API key: ${json?.message ?? `HTTP ${res.status}`}`,
        })
      }
      const domains = json.data
      const { LEGAL_DESK_SENDERS } = await import("@/lib/legal-desk-senders")
      const senders = LEGAL_DESK_SENDERS.map((s) => {
        const domain = s.address.split("@")[1]
        const found = domains.find((d) => d.name.toLowerCase() === domain)
        return { address: s.address, domain, status: found ? found.status : "not_added" }
      })
      return NextResponse.json({ ok: true, senders })
    }

    if (op === "context") {
      const userId = str(body.userId, 120)
      if (!userId) return NextResponse.json({ ok: false, error: "Choose a client." }, { status: 400 })
      const [allInstruments, ledger] = await Promise.all([
        listInstrumentsForAml().catch(() => []),
        resolveDataOwnerIdFor(userId).then((owner) => readLedgerEntries(owner)).catch(() => []),
      ])
      const instruments = allInstruments
        .filter((r) => r.userId === userId)
        .map((r) => {
          const i = r.instrument as Record<string, unknown>
          const type = String(i.typeFull ?? i.type ?? "Instrument")
          const ref = String(i.id ?? r.approvalId)
          const isin = i.isin ? String(i.isin) : null
          const face = Number(i.faceValue ?? 0)
          const ccy = String(i.currency ?? "EUR")
          return {
            id: ref,
            label: `${type} ${ref}`,
            detail: [isin ? `ISIN ${isin}` : null, face ? fmt(face, ccy) : null, i.issuer ? `Issuer ${String(i.issuer)}` : null]
              .filter(Boolean)
              .join(" · "),
          }
        })
      const transactions = [...ledger]
        .sort((a, b) => String(b.date).localeCompare(String(a.date)))
        .slice(0, 60)
        .map((e) => ({
          id: e.id,
          label: `${e.direction === "credit" ? "+" : "−"}${fmt(e.amount, e.currency)} · ${e.counterparty || e.category || "Transaction"}`,
          detail: `${String(e.date).slice(0, 10)} · Ref ${e.id}`,
        }))
      return NextResponse.json({ ok: true, instruments, transactions })
    }

    if (op === "send") {
      const to = emails(body.to)
      const cc = emails(body.cc)
      const bad = [...to, ...cc].filter((e) => !EMAIL_RE.test(e))
      if (!to.length) return NextResponse.json({ ok: false, error: "Add at least one recipient email." }, { status: 400 })
      if (bad.length) return NextResponse.json({ ok: false, error: `Invalid email address: ${bad.join(", ")}` }, { status: 400 })
      if (to.length + cc.length > 20) return NextResponse.json({ ok: false, error: "Up to 20 recipients per message." }, { status: 400 })

      const subject = str(body.subject, 200)
      const narrative = str(body.narrative, 20000)
      if (!subject) return NextResponse.json({ ok: false, error: "Add a subject." }, { status: 400 })
      if (!narrative) return NextResponse.json({ ok: false, error: "Write the message body." }, { status: 400 })

      const reference = (str(body.transactionReference, 16) || newLegalReference()).toUpperCase().replace(/[^A-Z0-9/\-]/g, "")
      const relatedReference = (str(body.relatedReference, 16) || "NONREF").toUpperCase().replace(/[^A-Z0-9/\-]/g, "")
      const clientLabel = str(body.clientLabel, 200)
      const instrumentLabel = str(body.instrumentLabel, 300)
      const transactionLabel = str(body.transactionLabel, 300)
      const subjectMatter = [
        clientLabel ? `CLIENT: ${clientLabel}` : null,
        instrumentLabel ? `INSTRUMENT: ${instrumentLabel}` : null,
        transactionLabel ? `TRANSACTION: ${transactionLabel}` : null,
      ].filter((l): l is string => !!l)

      const createdAt = new Date().toISOString()
      const message = {
        transactionReference: reference,
        relatedReference,
        recipientName: str(body.recipientName, 200),
        subject,
        subjectMatter,
        narrative,
        dateIso: createdAt,
      }

      const sender = findLegalDeskSender(str(body.fromEmail, 120)) ?? DEFAULT_LEGAL_DESK_SENDER
      const result = await sendLegalMt799({ to, cc, message, sender })
      const id = `LGL-${Date.now().toString(36).toUpperCase()}`
      await saveLegalMessage({
        id,
        userId: str(body.userId, 120) || null,
        clientLabel,
        instrumentRef: str(body.instrumentRef, 120) || null,
        transactionRef: str(body.transactionRef, 120) || null,
        toEmails: to,
        ccEmails: cc,
        recipientName: message.recipientName,
        subject,
        transactionReference: reference,
        relatedReference,
        narrative: buildMt799Text(message, sender),
        fromEmail: sender.address,
        status: result.ok ? "sent" : "failed",
        providerId: result.ok ? result.id : null,
        error: result.ok ? null : result.error,
        sentBy: "Administrator",
        createdAt,
      }).catch((err) => console.log("[v0] legal-desk save failed:", err))

      await logActivity({
        action: `Legal Desk MT799 ${reference} ${result.ok ? "sent" : "failed"} to ${to.join(", ")}`,
        category: "Administration / Legal Desk",
        details: { reference, subject, client: clientLabel || "—", from: sender.address },
      }).catch(() => {})

      if (!result.ok) return NextResponse.json({ ok: false, error: result.error }, { status: 502 })
      return NextResponse.json({ ok: true, id, reference })
    }

    return NextResponse.json({ ok: false, error: "Unknown operation." }, { status: 400 })
  } catch (err) {
    console.log("[v0] legal-desk route error:", err)
    return NextResponse.json({ ok: false, error: "The Legal Desk request failed. Please try again." }, { status: 500 })
  }
}
