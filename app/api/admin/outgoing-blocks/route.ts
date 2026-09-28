import { NextResponse } from "next/server"
import { adminActionAuthorized } from "@/lib/admin-auth"
import { listDynamicUsers } from "@/lib/admin-users-db"
import { getOutgoingBlock, saveOutgoingBlock, clearOutgoingBlock } from "@/lib/outgoing-blocks-db"
import type { OutgoingBlockConfig } from "@/lib/outgoing-blocks-eval"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/**
 * Admin outgoing-block API.
 *
 * Lives under /api (NOT behind the /dashboard proxy) so it is reached with a
 * plain fetch returning real JSON — the Server Actions equivalent POSTs to
 * /dashboard/* and is 401'd by the session proxy whenever it judges the signed
 * meta cookie stale/idle, which silently emptied the client picker. It talks to
 * the `lib/*` data modules directly (never the `"use server"` wrappers) so
 * nothing in the action-module graph can break this route at load. Authorization
 * is enforced here via `adminActionAuthorized` (admin PIN + admin-session check).
 */

type LoadPayload = { op: "load"; pin: string; targetId: string }
type SavePayload = {
  op: "save"
  pin: string
  targetId: string
  targetName?: string
  blockPayments: boolean
  blockTrades: boolean
  reason: string
  until: string | null
}
type ClearPayload = { op: "clear"; pin: string; targetId: string; targetName?: string }

type SelectableClient = { id: string; fullName: string; company: string; email: string; kind: "dynamic" }

async function buildClientList(): Promise<SelectableClient[]> {
  const users = await listDynamicUsers()
  return users
    .filter((u) => u.status === "active")
    .map((u) => ({
      id: u.id,
      fullName: u.profile.fullName,
      company: u.profile.company,
      email: u.email,
      kind: "dynamic" as const,
    }))
}

export async function POST(req: Request) {
  let body: LoadPayload | SavePayload | ClearPayload
  try {
    body = (await req.json()) as LoadPayload | SavePayload | ClearPayload
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid request body." }, { status: 200 })
  }

  const pin = typeof body?.pin === "string" ? body.pin : ""

  try {
    if (!(await adminActionAuthorized(pin))) {
      return NextResponse.json({ ok: false, reason: "unauthorized", clients: [] }, { status: 200 })
    }

    if (body.op === "load") {
      const [clients, block] = await Promise.all([
        buildClientList(),
        body.targetId ? getOutgoingBlock(body.targetId) : Promise.resolve<OutgoingBlockConfig | null>(null),
      ])
      return NextResponse.json({ ok: true, clients, block })
    }

    if (body.op === "save") {
      if (!body.targetId) {
        return NextResponse.json({ ok: false, error: "Select a user to block." }, { status: 200 })
      }
      const block = await saveOutgoingBlock(body.targetId, {
        blockPayments: !!body.blockPayments,
        blockTrades: !!body.blockTrades,
        reason: (body.reason || "").trim(),
        until: body.until ?? null,
        createdBy: body.targetName || "Administrator",
      })
      return NextResponse.json({ ok: true, block })
    }

    if (body.op === "clear") {
      if (!body.targetId) {
        return NextResponse.json({ ok: false, error: "Select a user to unblock." }, { status: 200 })
      }
      await clearOutgoingBlock(body.targetId)
      return NextResponse.json({ ok: true, block: null })
    }

    return NextResponse.json({ ok: false, error: "Unknown operation." }, { status: 200 })
  } catch (err) {
    return NextResponse.json({ ok: false, error: (err as Error)?.message ?? "Request failed." }, { status: 200 })
  }
}
