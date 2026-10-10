import { NextResponse } from "next/server"
import { adminActionAuthorized } from "@/lib/admin-auth"
import { listDynamicUsers, getDynamicUserByEmail } from "@/lib/admin-users-db"
import { getGuaranteeConfig } from "@/lib/guarantees-config-db"
import { gatherGuaranteeProfile } from "@/lib/guarantees-profile"
import { getResolvedCashbackForUser } from "@/lib/fee-cashback-db"
import { getFeeTiers } from "@/lib/tiered-fees-db"
import { DEFAULT_FEE_TIERS } from "@/lib/tiered-fees"
import { resolveDataOwnerIdFor } from "@/lib/session-user"
import { insertMessage } from "@/lib/bankeka-db"
import { insertNotification } from "@/lib/notifications-db"
import { logActivity } from "@/app/actions/log-activity"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/**
 * Admin Cost & Fee Forecaster API. Under /api (not a Server Action) for the same
 * reason as the other admin panels: the /dashboard proxy can silently 401 a
 * Server Action. The fee MATH runs client-side from the shared pure fee modules;
 * this route only supplies the per-customer context those formulas depend on
 * (trust score for PPI, cashback rates, fee tiers, spendable funds + overdraft).
 *
 * Ops: clients · context · send
 */
type Payload =
  | { op: "clients"; pin: string }
  | { op: "context"; pin: string; userId: string }
  | { op: "send"; pin: string; userId: string; text: string }

export async function POST(req: Request) {
  let body: Payload
  try {
    body = (await req.json()) as Payload
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid request body." })
  }
  if (!(await adminActionAuthorized(body.pin))) {
    return NextResponse.json({ ok: false, error: "Not authorized." })
  }

  try {
    if (body.op === "clients") {
      const users = await listDynamicUsers()
      const clients = users
        .filter((u) => u.status === "active")
        .map((u) => ({
          id: u.id,
          fullName: u.profile?.fullName ?? "",
          company: u.profile?.company ?? "",
          email: u.email,
        }))
        .sort((a, b) => (a.fullName || a.email).localeCompare(b.fullName || b.email))
      return NextResponse.json({ ok: true, clients })
    }

    if (body.op === "context") {
      const ownerId = await resolveDataOwnerIdFor(body.userId)
      const [profile, cashback, tiers] = await Promise.all([
        gatherGuaranteeProfile(body.userId, await getGuaranteeConfig()).catch(() => null),
        getResolvedCashbackForUser(ownerId).catch(() => ({ transaction: 0, instrument: 0, swift: 0, platform: 0 })),
        getFeeTiers().catch(() => DEFAULT_FEE_TIERS),
      ])
      const inputs = profile?.score.inputs
      const available = inputs?.availableBalance ?? 0
      const exposure = inputs?.totalExposure ?? 0
      return NextResponse.json({
        ok: true,
        context: {
          trustScore: profile?.score.finalScore ?? 0,
          highRisk: profile?.score.highRisk ?? false,
          availableEur: available,
          exposureEur: exposure,
          freeEur: Math.max(0, available - exposure),
          overdraftRemainingEur: profile?.overdraft.available ? profile.overdraft.remainingEur : 0,
          overdraftLimitEur: profile?.overdraft.available ? profile.overdraft.limitEur : 0,
          cashback,
          tiers,
        },
      })
    }

    if (body.op === "send") {
      const text = (body.text ?? "").trim()
      if (!text) return NextResponse.json({ ok: false, error: "Nothing to send." })
      const op = await getDynamicUserByEmail("admin@mccgva.ch").catch(() => null)
      if (!op || op.status !== "active" || op.id === body.userId) {
        return NextResponse.json({ ok: false, error: "Support inbox unavailable." })
      }
      await insertMessage({ senderId: op.id, recipientId: body.userId, body: `[Cost forecast] ${text}` })
      await insertNotification({
        userId: body.userId,
        tone: "info",
        title: "Cost forecast from MCC",
        body: "Your administrator sent you an indicative cost forecast. Open Messages to read it.",
        href: "/dashboard/bankeka",
      }).catch(() => null)
      await logActivity({
        action: "Sent cost forecast to client",
        category: "Administration",
        details: { summary: `Indicative cost forecast sent via Bankeka to ${body.userId}.`, referenceId: body.userId },
      }).catch(() => null)
      return NextResponse.json({ ok: true })
    }

    return NextResponse.json({ ok: false, error: "Unknown operation." })
  } catch (err) {
    console.error("[cost-forecast] failed:", err)
    return NextResponse.json({ ok: false, error: "Could not load the forecast." })
  }
}
