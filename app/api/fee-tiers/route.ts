import { NextResponse } from "next/server"
import { resolveCurrentSession, resolveDataOwnerIdFor } from "@/lib/session-user"
import { adminActionAuthorized } from "@/lib/admin-auth"
import {
  deleteCustomerFeeTiers,
  getCustomerFeeTiers,
  getFeeTiers,
  getFeeTiersForOwner,
  listCustomerFeeTierOverrides,
  saveCustomerFeeTiers,
  saveFeeTiers,
} from "@/lib/tiered-fees-db"
import { listDynamicUsers } from "@/lib/admin-users-db"
import { DEFAULT_FEE_TIERS, type FeeTier } from "@/lib/tiered-fees"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/**
 * Marginal tiered transaction-fee table API.
 *
 * A plain API route (NOT behind the /dashboard proxy) so client payment
 * previews can always load the LIVE tiers, and a stale meta cookie can't
 * silently 401 it.
 *
 *   • GET  — the signed-in user's applicable table (their custom table if the
 *            admin set one, else the standard table). Falls back to defaults.
 *   • POST — admin only. No `op` (or op "save-global") replaces the standard
 *            table; ops "list" / "load-customer" / "save-customer" /
 *            "delete-customer" manage per-customer tables.
 */
export async function GET() {
  try {
    const session = await resolveCurrentSession()
    if (!session?.id) {
      return NextResponse.json({ ok: true, tiers: DEFAULT_FEE_TIERS, custom: false }, { status: 200 })
    }
    const ownerId = await resolveDataOwnerIdFor(session.id)
    const custom = await getCustomerFeeTiers(ownerId)
    const tiers = custom ?? (await getFeeTiersForOwner(null))
    return NextResponse.json({ ok: true, tiers, custom: !!custom }, { status: 200 })
  } catch {
    return NextResponse.json({ ok: true, tiers: DEFAULT_FEE_TIERS, custom: false }, { status: 200 })
  }
}

type Body = { pin?: string; op?: string; tiers?: FeeTier[]; userId?: string }

export async function POST(req: Request) {
  let body: Body
  try {
    body = (await req.json()) as Body
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid request body." }, { status: 200 })
  }

  const pin = typeof body?.pin === "string" ? body.pin : ""
  const op = String(body?.op ?? "save-global")
  try {
    if (!(await adminActionAuthorized(pin))) {
      return NextResponse.json({ ok: false, reason: "unauthorized" }, { status: 200 })
    }

    if (op === "list") {
      const [users, overrides, globalTiers] = await Promise.all([
        listDynamicUsers(),
        listCustomerFeeTierOverrides(),
        getFeeTiers(),
      ])
      const clients = users
        .filter((u) => u.status === "active")
        .map((u) => ({ id: u.id, fullName: u.profile.fullName, company: u.profile.company, email: u.email }))
      return NextResponse.json({ ok: true, clients, overrides, globalTiers }, { status: 200 })
    }

    const userId = typeof body.userId === "string" ? body.userId.trim() : ""
    const ownerId = userId ? await resolveDataOwnerIdFor(userId) : ""

    if (op === "load-customer") {
      if (!ownerId) return NextResponse.json({ ok: false, error: "Choose a customer." }, { status: 200 })
      const custom = await getCustomerFeeTiers(ownerId)
      const tiers = custom ?? (await getFeeTiers())
      return NextResponse.json({ ok: true, tiers, custom: !!custom, ownerId }, { status: 200 })
    }

    if (op === "delete-customer") {
      if (!ownerId) return NextResponse.json({ ok: false, error: "Choose a customer." }, { status: 200 })
      await deleteCustomerFeeTiers(ownerId)
      return NextResponse.json({ ok: true, tiers: await getFeeTiers(), custom: false }, { status: 200 })
    }

    if (!Array.isArray(body.tiers)) {
      return NextResponse.json({ ok: false, error: "Missing tier table." }, { status: 200 })
    }

    if (op === "save-customer") {
      if (!ownerId) return NextResponse.json({ ok: false, error: "Choose a customer." }, { status: 200 })
      const saved = await saveCustomerFeeTiers(ownerId, body.tiers)
      return NextResponse.json({ ok: true, tiers: saved, custom: true }, { status: 200 })
    }

    const saved = await saveFeeTiers(body.tiers)
    return NextResponse.json({ ok: true, tiers: saved }, { status: 200 })
  } catch (err) {
    return NextResponse.json({ ok: false, error: (err as Error)?.message ?? "Save failed." }, { status: 200 })
  }
}
