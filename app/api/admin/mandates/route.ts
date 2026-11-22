import { NextResponse } from "next/server"
import { adminActionAuthorized, resolveActingUserId } from "@/lib/admin-auth"
import { listDynamicUsers } from "@/lib/admin-users-db"
import { resolveDataOwnerIdFor } from "@/lib/session-user"
import {
  assertOwnerSolvent,
  availableByCurrency,
  deleteLedgerEntry,
  readLedgerEntries,
  upsertLedgerEntry,
} from "@/lib/ledger-db"
import { insertNotification } from "@/lib/notifications-db"
import { persistActivityEvent } from "@/lib/activity-persist"
import { debitInterestRateFor, STANDARD_MAX_LEVERAGE } from "@/lib/leverage-rates"
import { decideApproval, deleteApprovalForUser, insertApproval } from "@/lib/approvals-db"
import { isValidIsin } from "@/lib/instrument-identifiers"

const BOND_ISSUER = "HSBC Hong Kong"
import {
  getMandate,
  insertMandate,
  listAllMandates,
  updateMandate,
  type ManagedMandate,
  type MandateDistribution,
} from "@/lib/managed-mandates-db"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const round2 = (n: number) => Math.round(n * 100) / 100
const reserveId = (id: string) => `MANDATE-RSV-${id}`
const COUNTERPARTY = "MCC Capital — Managed Mandate"

function fail(error: string, status = 400) {
  return NextResponse.json({ ok: false, error }, { status })
}

async function audit(action: string, details: Record<string, string | number | null>, userId?: string) {
  try {
    await persistActivityEvent(
      { action, category: "Administration / Managed Mandates", details, userId },
      { ipAddress: "server", userAgent: null },
    )
  } catch (err) {
    console.log("[v0] mandate audit failed:", err)
  }
}

async function notify(userId: string, title: string, body: string, tone: "info" | "success" | "warning" = "info") {
  try {
    await insertNotification({ userId, tone, title, body, href: "/dashboard/treasury" })
  } catch {
    /* best-effort */
  }
}

/** Debit interest accrued on the borrowed portion since the last charge. */
function accruedInterest(m: ManagedMandate, now: Date): number {
  if (m.borrowed <= 0 || m.annualInterestRate <= 0) return 0
  const from = new Date(m.lastInterestAt ?? m.activatedAt ?? now.toISOString())
  const days = Math.max(0, (now.getTime() - from.getTime()) / 86_400_000)
  return round2(m.borrowed * m.annualInterestRate * (days / 365))
}

/** Post entries, then roll every one of them back if the account would go negative. */
async function postSolvently(ownerId: string, entries: Parameters<typeof upsertLedgerEntry>[1][]): Promise<string | null> {
  for (const e of entries) await upsertLedgerEntry(ownerId, e)
  try {
    await assertOwnerSolvent(ownerId)
    return null
  } catch (err) {
    for (const e of entries) await deleteLedgerEntry(ownerId, e.id)
    return err instanceof Error ? err.message.replace(/^[A-Z_]+:\s*/, "") : "Insufficient funds"
  }
}

export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>
  if (!(await adminActionAuthorized(String(body.pin ?? "")))) return fail("Unauthorized", 401)
  const actor = (await resolveActingUserId()) ?? "admin"
  const op = String(body.op ?? "")

  if (op === "list") {
    const [mandates, users] = await Promise.all([listAllMandates(), listDynamicUsers()])
    const clients = users
      .filter((u) => u.status === "active")
      .map((u) => ({ id: u.id, label: [u.profile.fullName, u.profile.company].filter(Boolean).join(" — ") || u.email, email: u.email }))
    return NextResponse.json({ ok: true, mandates, clients, actor })
  }

  if (op === "create") {
    const userId = String(body.userId ?? "")
    const currency = String(body.currency ?? "EUR").toUpperCase()
    const deposit = round2(Number(body.deposit))
    const ratio = Math.round(Number(body.leverageRatio) || 1)
    const title = String(body.title ?? "").trim() || "Managed mandate"
    if (!userId) return fail("Choose a client.")
    if (!(deposit > 0)) return fail("Enter a deposit greater than zero.")
    if (ratio < 1 || ratio > STANDARD_MAX_LEVERAGE) return fail(`Leverage must be between 1:1 and 1:${STANDARD_MAX_LEVERAGE}.`)
    const users = await listDynamicUsers()
    const u = users.find((x) => x.id === userId)
    const mandate: ManagedMandate = {
      id: `MAN-${Date.now().toString(36).toUpperCase()}`,
      userId,
      ownerId: await resolveDataOwnerIdFor(userId),
      holderLabel: u ? [u.profile.fullName, u.profile.company].filter(Boolean).join(" — ") || u.email : userId,
      title,
      currency,
      deposit,
      leverageRatio: ratio,
      borrowed: ratio > 1 ? round2(deposit * (ratio - 1)) : 0,
      annualInterestRate: ratio > 1 ? debitInterestRateFor(ratio) : 0,
      targetNote: String(body.targetNote ?? "").trim().slice(0, 500),
      status: "pending_financing",
      distributions: [],
      createdAt: new Date().toISOString(),
      createdBy: actor,
      activatedAt: null,
      activatedBy: null,
      lastInterestAt: null,
      closedAt: null,
      exchangeRequestedAt: null,
      exchangedAt: null,
      instrumentId: null,
      bondReference: null,
    }
    await insertMandate(mandate)
    await audit("Mandate created", { mandate: mandate.id, deposit, currency, ratio }, userId)
    try {
      await insertNotification({
        userId,
        tone: "info",
        title: `Managed mandate opened — ${title}`,
        body: `MCC Capital opened a managed mandate for ${currency} ${deposit.toLocaleString("en-US")}. It is pending financing; nothing is reserved until it is activated.`,
        href: "/dashboard/treasury",
      })
    } catch (err) {
      console.log("[v0] mandate create notification failed:", err)
    }
    return NextResponse.json({ ok: true, mandate })
  }

  const id = String(body.id ?? "")
  const m = await getMandate(id)
  if (!m) return fail("Mandate not found.", 404)

  if (op === "activate") {
    if (m.status !== "pending_financing") return fail("Only a mandate pending financing can be activated.")
    if (m.createdBy !== "admin" && actor !== "admin" && m.createdBy === actor) {
      return fail("A second administrator must confirm financing — the creator cannot activate their own mandate.")
    }
    const available = availableByCurrency(await readLedgerEntries(m.ownerId))[m.currency] ?? 0
    if (available + 0.01 < m.deposit) {
      return fail(`Client has ${m.currency} ${available.toFixed(2)} available — the ${m.currency} ${m.deposit.toFixed(2)} deposit can't be reserved.`)
    }
    const now = new Date().toISOString()
    const err = await postSolvently(m.ownerId, [
      {
        id: reserveId(m.id),
        direction: "debit",
        amount: m.deposit,
        currency: m.currency,
        status: "hold",
        date: now,
        counterparty: COUNTERPARTY,
        reference: m.id,
        category: "Managed Mandate Reserve",
        comment: `Capital reserved for managed mandate "${m.title}". Released when the mandate closes.`,
      },
    ])
    if (err) return fail(err)
    await updateMandate(m.id, { status: "active", activatedAt: now, activatedBy: actor, lastInterestAt: now })
    await audit("Mandate activated", { mandate: m.id, deposit: m.deposit }, m.userId)
    await notify(m.userId, "Managed mandate active", `${m.currency} ${m.deposit.toLocaleString("en-US")} is now reserved for "${m.title}".`, "success")
    return NextResponse.json({ ok: true })
  }

  if (op === "record") {
    if (m.status !== "active") return fail("Distributions can only be recorded on an active mandate.")
    const amount = round2(Number(body.amount))
    if (!(amount >= 0)) return fail("Enter the realised amount (0 or more).")
    const dist: MandateDistribution = {
      id: `D${Date.now().toString(36).toUpperCase()}`,
      periodLabel: String(body.periodLabel ?? "").trim() || new Date().toISOString().slice(0, 7),
      amount,
      interestCharged: 0,
      note: String(body.note ?? "").trim().slice(0, 500),
      status: "pending",
      recordedBy: actor,
      recordedAt: new Date().toISOString(),
    }
    await updateMandate(m.id, { distributions: [...m.distributions, dist] })
    await audit("Mandate distribution recorded", { mandate: m.id, distribution: dist.id, amount }, m.userId)
    return NextResponse.json({ ok: true })
  }

  if (op === "approve" || op === "reject") {
    const distId = String(body.distributionId ?? "")
    const d = m.distributions.find((x) => x.id === distId)
    if (!d || d.status !== "pending") return fail("Distribution is not pending.")
    if (actor !== "admin" && d.recordedBy === actor) {
      return fail("A second administrator must approve — you recorded this distribution.")
    }
    const now = new Date()
    if (op === "reject") {
      const next = m.distributions.map((x) =>
        x.id === distId ? { ...x, status: "rejected" as const, approvedBy: actor, approvedAt: now.toISOString(), rejectedReason: String(body.reason ?? "").slice(0, 300) } : x,
      )
      await updateMandate(m.id, { distributions: next })
      await audit("Mandate distribution rejected", { mandate: m.id, distribution: distId }, m.userId)
      return NextResponse.json({ ok: true })
    }
    const interest = accruedInterest(m, now)
    const entries: Parameters<typeof upsertLedgerEntry>[1][] = []
    if (d.amount > 0) {
      entries.push({
        id: `MANDATE-DIST-${m.id}-${d.id}`,
        direction: "credit",
        amount: d.amount,
        currency: m.currency,
        status: "completed",
        date: now.toISOString(),
        counterparty: COUNTERPARTY,
        reference: m.id,
        category: "Managed Mandate Distribution",
        comment: `Realised distribution for ${d.periodLabel}. Returns are not guaranteed.`,
      })
    }
    if (interest > 0) {
      entries.push({
        id: `MANDATE-INT-${m.id}-${d.id}`,
        direction: "debit",
        amount: interest,
        currency: m.currency,
        status: "completed",
        date: new Date(now.getTime() + 1000).toISOString(),
        counterparty: COUNTERPARTY,
        reference: m.id,
        category: "Managed Mandate Debit Interest",
        comment: `Debit interest at ${(m.annualInterestRate * 100).toFixed(2)}% p.a. on ${m.currency} ${m.borrowed.toFixed(2)} borrowed (1:${m.leverageRatio}).`,
      })
    }
    const err = await postSolvently(m.ownerId, entries)
    if (err) return fail(`Not approved: ${err}`)
    const next = m.distributions.map((x) =>
      x.id === distId ? { ...x, status: "credited" as const, interestCharged: interest, approvedBy: actor, approvedAt: now.toISOString() } : x,
    )
    await updateMandate(m.id, { distributions: next, lastInterestAt: now.toISOString() })
    await audit("Mandate distribution approved", { mandate: m.id, distribution: distId, amount: d.amount, interest }, m.userId)
    await notify(m.userId, "Mandate distribution credited", `${m.currency} ${d.amount.toLocaleString("en-US")} credited for ${d.periodLabel}${interest > 0 ? `, debit interest ${m.currency} ${interest.toLocaleString("en-US")} charged` : ""}.`, "success")
    return NextResponse.json({ ok: true })
  }

  if (op === "issue_bond") {
    if (m.status !== "active") return fail("The bond can only be issued once financing is confirmed and the mandate is active.")
    if (m.instrumentId) return fail("A bond has already been issued for this mandate.")
    const isin = String(body.isin ?? "").trim().toUpperCase()
    const bondReference = String(body.bondReference ?? "").trim()
    if (!isValidIsin(isin)) return fail("Enter the valid ISIN of the bond issued by HSBC Hong Kong.")
    if (!bondReference) return fail("Enter HSBC Hong Kong's issuance / custody reference.")
    const faceValue = round2(m.deposit * m.leverageRatio)
    const now = new Date()
    const maturity = new Date(now)
    maturity.setFullYear(maturity.getFullYear() + 1)
    const instrumentId = `TBOND-${m.id}`
    const instrument = {
      id: instrumentId,
      type: "TBOND",
      typeFull: "Treasury Bond",
      issuer: BOND_ISSUER,
      faceValue,
      currency: m.currency,
      rating: "AA-",
      issuedDate: now.toISOString(),
      expiryDate: maturity.toISOString(),
      status: "active",
      owner: m.holderLabel,
      isin,
      serialNumber: bondReference,
      // Backed by the reserved mandate capital plus the MCC financing, so it
      // stays lodged with the client and cannot be sold or monetized.
      assignable: false,
      monetizable: false,
      blocked: false,
      deliveryMethod: "Custody — HSBC Hong Kong",
      tradeType: `Exchanged from managed mandate "${m.title}" (${m.currency} ${m.deposit.toLocaleString("en-US")} × 1:${m.leverageRatio})`,
      mandateId: m.id,
    }
    const created = await insertApproval({
      id: `INST-${instrumentId}`,
      userId: m.userId,
      kind: "instrument",
      title: `Treasury Bond · ${BOND_ISSUER}`,
      summary: `${m.currency} ${faceValue.toLocaleString("en-US")} Treasury Bond (${isin}) issued by ${BOND_ISSUER} in exchange for mandate ${m.id}.`,
      amount: faceValue,
      currency: m.currency,
      payload: { issuedByAdmin: true, instrument },
    })
    await decideApproval(created.id, "approved", "Administrator")
    await updateMandate(m.id, { exchangedAt: now.toISOString(), instrumentId: created.id, bondReference: `${isin} · ${bondReference}` })
    await audit("Mandate exchanged for treasury bond", { mandate: m.id, isin, faceValue, approval: created.id }, m.userId)
    try {
      await insertNotification({
        userId: m.userId,
        tone: "success",
        title: "Treasury bond lodged",
        body: `Your ${m.currency} ${faceValue.toLocaleString("en-US")} ${BOND_ISSUER} Treasury Bond (${isin}) is active under Bank Instruments.`,
        href: "/dashboard/instruments",
      })
    } catch {
      /* best-effort */
    }
    return NextResponse.json({ ok: true, faceValue })
  }

  if (op === "close" || op === "cancel") {
    if (op === "cancel") {
      if (m.status !== "pending_financing") return fail("Only a mandate pending financing can be cancelled.")
      await updateMandate(m.id, { status: "cancelled", closedAt: new Date().toISOString() })
      await audit("Mandate cancelled", { mandate: m.id }, m.userId)
      return NextResponse.json({ ok: true })
    }
    if (m.status !== "active") return fail("Only an active mandate can be closed.")
    if (m.distributions.some((d) => d.status === "pending")) return fail("Approve or reject pending distributions first.")
    const now = new Date()
    const interest = accruedInterest(m, now)
    if (interest > 0) {
      // Release the reserve first so the reserved capital can settle the final interest.
      await deleteLedgerEntry(m.ownerId, reserveId(m.id))
      const err = await postSolvently(m.ownerId, [
        {
          id: `MANDATE-INT-${m.id}-CLOSE`,
          direction: "debit",
          amount: interest,
          currency: m.currency,
          status: "completed",
          date: now.toISOString(),
          counterparty: COUNTERPARTY,
          reference: m.id,
          category: "Managed Mandate Debit Interest",
          comment: `Final debit interest on closing mandate "${m.title}".`,
        },
      ])
      if (err) {
        await upsertLedgerEntry(m.ownerId, {
          id: reserveId(m.id), direction: "debit", amount: m.deposit, currency: m.currency, status: "hold",
          date: m.activatedAt ?? now.toISOString(), counterparty: COUNTERPARTY, reference: m.id,
          category: "Managed Mandate Reserve", comment: `Capital reserved for managed mandate "${m.title}".`,
        })
        return fail(`Not closed: ${err}`)
      }
    } else {
      await deleteLedgerEntry(m.ownerId, reserveId(m.id))
    }
    if (m.instrumentId) {
      // The bond is backed by this mandate, so it is retired when the mandate unwinds.
      await deleteApprovalForUser(m.instrumentId, m.userId).catch(() => false)
    }
    await updateMandate(m.id, { status: "closed", closedAt: now.toISOString(), lastInterestAt: now.toISOString() })
    await audit("Mandate closed", { mandate: m.id, finalInterest: interest }, m.userId)
    await notify(m.userId, "Managed mandate closed", `"${m.title}" is closed and the reserved ${m.currency} ${m.deposit.toLocaleString("en-US")} is released.`)
    return NextResponse.json({ ok: true })
  }

  return fail("Unknown operation.")
}
