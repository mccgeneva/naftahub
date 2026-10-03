import { NextResponse } from "next/server"
import { adminActionAuthorized } from "@/lib/admin-auth"
import { listDynamicUsers, getDynamicUserById } from "@/lib/admin-users-db"
import { resolveDataOwnerIdFor } from "@/lib/session-user"
import { readLedgerEntries, availableByCurrency, upsertLedgerEntry, deleteLedgerEntry } from "@/lib/ledger-db"
import { getOverdraftStatusForOwner } from "@/lib/overdraft"
import { convertCurrency } from "@/lib/fx"
import { insertNotification } from "@/lib/notifications-db"
import { logActivity } from "@/app/actions/log-activity"
import { analyzePpiProfile } from "@/lib/ppi-profile"
import {
  listPpiPolicies,
  getPpiPolicy,
  upsertPpiDeal,
  activatePpiPolicy,
  cancelPpiPolicy,
} from "@/lib/ppi-insurance-db"
import { PPI_INSURER, PPI_CURRENCY, PPI_VALIDITY_DAYS, ppiPremiumDue } from "@/lib/ppi-insurance"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/**
 * Admin PPI (Payment Protection Insurance) desk. Plain /api route (not a Server
 * Action) so it is never 401'd by the /dashboard proxy; authorized per request
 * via the admin PIN + admin session.
 *
 * Ops: load · analyze · save-deal · activate · cancel
 */

type Body = {
  op: "load" | "analyze" | "save-deal" | "activate" | "cancel"
  pin: string
  userId?: string
  policyId?: string
  negotiatedPremium?: number | null
  lloydsReference?: string
  note?: string
}

const fmt = (n: number) =>
  `${PPI_CURRENCY} ${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

async function holderLabelFor(userId: string): Promise<string> {
  const u = await getDynamicUserById(userId)
  if (!u) return userId
  const name = u.profile.fullName || u.email
  return u.profile.company ? `${name} · ${u.profile.company}` : name
}

export async function POST(req: Request) {
  let body: Body
  try {
    body = (await req.json()) as Body
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid request body." })
  }

  try {
    if (!(await adminActionAuthorized(typeof body?.pin === "string" ? body.pin : ""))) {
      return NextResponse.json({ ok: false, error: "Not authorized." })
    }

    if (body.op === "load") {
      const [users, policies] = await Promise.all([listDynamicUsers(), listPpiPolicies()])
      const clients = users
        .filter((u) => u.status === "active")
        .map((u) => ({ id: u.id, fullName: u.profile.fullName, company: u.profile.company, email: u.email }))
        .sort((a, b) => (a.fullName || a.email).localeCompare(b.fullName || b.email))
      return NextResponse.json({ ok: true, clients, policies })
    }

    if (body.op === "analyze") {
      if (!body.userId) return NextResponse.json({ ok: false, error: "Select a customer first." })
      const analysis = await analyzePpiProfile(body.userId)
      return NextResponse.json({ ok: true, analysis })
    }

    if (body.op === "save-deal") {
      if (!body.userId) return NextResponse.json({ ok: false, error: "Select a customer first." })
      const analysis = await analyzePpiProfile(body.userId)
      if (analysis.quote.coverEur <= 0) {
        return NextResponse.json({ ok: false, error: "This customer has no exposure to insure." })
      }
      const negotiated =
        body.negotiatedPremium == null || !Number.isFinite(Number(body.negotiatedPremium))
          ? null
          : Math.round(Number(body.negotiatedPremium) * 100) / 100
      if (negotiated != null && negotiated <= 0) {
        return NextResponse.json({ ok: false, error: "The negotiated premium must be above zero." })
      }
      const ownerId = await resolveDataOwnerIdFor(body.userId)
      const policy = await upsertPpiDeal({
        id: body.policyId || `PPI-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`,
        userId: body.userId,
        ownerId,
        holderLabel: await holderLabelFor(body.userId),
        coverAmount: analysis.quote.coverEur,
        computedPremium: analysis.quote.premiumEur,
        negotiatedPremium: negotiated,
        lloydsReference: (body.lloydsReference ?? "").trim().slice(0, 80),
        note: (body.note ?? "").trim().slice(0, 1000),
      })
      return NextResponse.json({ ok: true, policy })
    }

    if (body.op === "activate") {
      const policy = body.policyId ? await getPpiPolicy(body.policyId) : null
      if (!policy) return NextResponse.json({ ok: false, error: "Policy not found." })
      if (policy.status !== "negotiating") {
        return NextResponse.json({ ok: false, error: "Only a policy in negotiation can be approved." })
      }
      const premium = ppiPremiumDue(policy)
      if (!(premium > 0)) return NextResponse.json({ ok: false, error: "No premium set on this policy." })

      // Solvency: spendable balance across all currencies + authorized overdraft.
      const entries = await readLedgerEntries(policy.ownerId)
      const available = Object.entries(availableByCurrency(entries)).reduce(
        (sum, [ccy, amt]) => sum + convertCurrency(amt, ccy, PPI_CURRENCY),
        0,
      )
      let overdraftHeadroom = 0
      try {
        const od = await getOverdraftStatusForOwner(policy.ownerId)
        overdraftHeadroom = Math.max(0, od.remainingEur)
      } catch {
        overdraftHeadroom = 0
      }
      if (premium > available + overdraftHeadroom + 0.01) {
        return NextResponse.json({
          ok: false,
          error: `The customer cannot cover the ${fmt(premium)} premium (available ${fmt(Math.max(0, available))} plus overdraft ${fmt(overdraftHeadroom)}). Ask them to top up first.`,
        })
      }

      const chargeId = `PPI-PREM-${policy.id}`
      await upsertLedgerEntry(policy.ownerId, {
        id: chargeId,
        direction: "debit",
        amount: premium,
        currency: PPI_CURRENCY,
        status: "completed",
        date: new Date().toISOString(),
        counterparty: `${PPI_INSURER} — Payment Protection Insurance`,
        reference: policy.id,
        category: "PPI Insurance Premium",
        comment: `Annual PPI premium, full cover of ${fmt(policy.coverAmount)}${
          policy.lloydsReference ? ` · Lloyd's ref ${policy.lloydsReference}` : ""
        }.`,
      })

      const expiresAt = new Date(Date.now() + PPI_VALIDITY_DAYS * 86_400_000).toISOString()
      const activated = await activatePpiPolicy(policy.id, chargeId, expiresAt)
      if (!activated) {
        await deleteLedgerEntry(policy.ownerId, chargeId).catch(() => null)
        return NextResponse.json({ ok: false, error: "The policy changed while approving. Nothing was charged." })
      }

      await insertNotification({
        userId: policy.userId,
        tone: "success",
        title: "PPI insurance is now active",
        body: `Your Payment Protection Insurance with ${PPI_INSURER} is active until ${new Date(expiresAt).toLocaleDateString("en-GB")}. Full cover of ${fmt(policy.coverAmount)}; premium ${fmt(premium)} charged to your Master Account. If your account goes into debit you can reconcile it with your PPI from the Debits page.`,
        href: "/dashboard/debits",
      }).catch(() => null)
      await logActivity({
        action: `Activated PPI policy ${policy.id} for ${policy.holderLabel}`,
        category: "Administration / Insurance",
        details: { summary: `Premium ${fmt(premium)}, cover ${fmt(policy.coverAmount)}, valid until ${expiresAt.slice(0, 10)}.`, referenceId: policy.id, amount: fmt(premium) },
      })
      return NextResponse.json({ ok: true, policy: activated })
    }

    if (body.op === "cancel") {
      const cancelled = body.policyId ? await cancelPpiPolicy(body.policyId) : null
      if (!cancelled) return NextResponse.json({ ok: false, error: "Only a policy in negotiation can be cancelled." })
      return NextResponse.json({ ok: true, policy: cancelled })
    }

    return NextResponse.json({ ok: false, error: "Unknown operation." })
  } catch (err) {
    return NextResponse.json({ ok: false, error: (err as Error)?.message ?? "Request failed." })
  }
}
