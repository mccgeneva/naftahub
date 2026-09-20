// ---------------------------------------------------------------------------
// Customer Investigation — server-side aggregation.
//
// Reconstructs a single customer's COMPLETE, exact-time-order activity for a
// chosen date range by merging TWO authoritative server stores:
//   1. the money ledger (ledger_entries) — every transaction and debit, with
//      the resulting settled balance; and
//   2. the security audit trail (security_audit_events) — logins, approvals,
//      blocks, fees, cashback, instrument movements, document generation,
//      cTrader activity, navigation, etc.
// It also snapshots CURRENT positions (balances, blocked funds, equity saving,
// and live facilities/exposures) so an administrator can inspect what the
// customer holds right now.
//
// Data is isolated per customer (and their shared-pool sub/joint members) and
// read-only — the account holder can never see or alter any of it.
// ---------------------------------------------------------------------------

import "server-only"
import { readLedgerEntries } from "@/lib/ledger-db"
import { resolveDataOwnerIdFor, resolveFinancialMemberIds, resolveAccountProfileById } from "@/lib/session-user"
import { listApprovalsForUsers, type ApprovalRequest } from "@/lib/approvals-db"
import { isLiveRequest } from "@/lib/live-request"
import { KIND_LABELS, type ApprovalKind } from "@/lib/approval-kinds"
import { listAuditEventsInRange } from "@/lib/security-audit-db"
import { listSubAccountsForUser } from "@/lib/sub-account-db"
import {
  classifyEvent,
  type CustomerInvestigation,
  type InvestigationBalance,
  type InvestigationCategory,
  type InvestigationCompartment,
  type InvestigationFacility,
  type TimelineItem,
} from "@/lib/investigation-types"

const round2 = (n: number) => Math.round(n * 100) / 100

/** Absolute cap on merged timeline rows to keep the payload/PDF sane. */
const TIMELINE_CAP = 5000

/** Facility kinds that represent an open position / exposure worth snapshotting. */
const POSITION_KINDS: ApprovalKind[] = [
  "leverage",
  "monetization",
  "project_funding",
  "treasury_lending",
  "internal_loan",
  "instrument",
  "ppp",
  "trading_fund",
  "commodity",
]

/** Merge an approval's payload layers into a flat record for isLiveRequest. */
function livenessRecord(a: ApprovalRequest): { status: string } & Record<string, unknown> {
  const payload = (a.payload ?? {}) as Record<string, unknown>
  const record = (payload.record as Record<string, unknown>) ?? {}
  return { ...record, ...payload, status: a.status }
}

/** Pull a numeric amount + currency out of an audit event's free-form details. */
function amountFromDetails(details: Record<string, unknown> | null): { amount: number | null; currency: string | null } {
  if (!details) return { amount: null, currency: null }
  const rawAmount = details.amount ?? details.value ?? details.total
  let amount: number | null = null
  if (typeof rawAmount === "number" && Number.isFinite(rawAmount)) amount = rawAmount
  else if (typeof rawAmount === "string") {
    const n = Number(rawAmount.replace(/[^0-9.-]/g, ""))
    if (Number.isFinite(n) && n !== 0) amount = n
  }
  const cur = details.currency
  return { amount, currency: typeof cur === "string" && cur ? cur : null }
}

/** Build a concise human description from an audit event's details. */
function describeDetails(details: Record<string, unknown> | null, action: string): string {
  if (!details) return ""
  // Prefer a single human-readable field when present.
  for (const key of ["summary", "description", "details", "reference", "note", "message"]) {
    const v = details[key]
    if (typeof v === "string" && v.trim()) return v.trim().slice(0, 200)
  }
  // Otherwise compose a compact key:value list, skipping noise.
  const skip = new Set(["actingAdmin", "path", "userAgent", "ip", "ipAddress"])
  const parts: string[] = []
  for (const [k, v] of Object.entries(details)) {
    if (skip.has(k)) continue
    if (v === null || v === undefined || v === "") continue
    if (typeof v === "object") continue
    parts.push(`${k}: ${String(v)}`)
    if (parts.length >= 6) break
  }
  const composed = parts.join(" · ")
  return composed ? composed.slice(0, 200) : ""
}

/**
 * Build the full investigation for one customer.
 * @param userId  the selected account (may be a master, sub or joint).
 * @param from    inclusive ISO lower bound (optional).
 * @param to      inclusive ISO upper bound (optional).
 */
export async function buildCustomerInvestigation(
  userId: string,
  from?: string | null,
  to?: string | null,
): Promise<CustomerInvestigation> {
  const [memberIds, ownerId, profile] = await Promise.all([
    resolveFinancialMemberIds(userId),
    resolveDataOwnerIdFor(userId),
    resolveAccountProfileById(userId),
  ])

  const [ledgerAll, approvals, auditEvents, subAccounts] = await Promise.all([
    readLedgerEntries(ownerId).catch(() => []),
    listApprovalsForUsers(memberIds).catch(() => [] as ApprovalRequest[]),
    listAuditEventsInRange({ userIds: memberIds, from: from ?? undefined, to: to ?? undefined, limit: TIMELINE_CAP }).catch(
      () => [],
    ),
    listSubAccountsForUser(ownerId).catch(() => []),
  ])

  // Sub-account compartment labels (the shared ledger tags each row with an
  // optional sub_account_id; NULL ⇒ the master "Main account" pocket).
  const MAIN = "main"
  const compartmentLabel = (subId: string | undefined | null): { id: string; label: string } => {
    if (!subId) return { id: MAIN, label: "Main account" }
    const s = subAccounts.find((x) => x.id === subId)
    return { id: subId, label: s?.label ? `Sub · ${s.label}` : `Sub-account ${subId.slice(-6)}` }
  }

  // --- Current positions (as of now — independent of the range) -------------
  const byCurrency = new Map<string, InvestigationBalance>()
  for (const e of ledgerAll) {
    const cur = e.currency || "USD"
    const line = byCurrency.get(cur) ?? { currency: cur, available: 0, onHold: 0, equitySaving: 0 }
    if (e.status === "hold") {
      line.onHold += e.amount
      if (e.id.startsWith("EQSAV-")) line.equitySaving += e.amount
    } else {
      line.available += e.direction === "credit" ? e.amount : -e.amount
    }
    byCurrency.set(cur, line)
  }
  const balances: InvestigationBalance[] = Array.from(byCurrency.values())
    .map((b) => ({
      currency: b.currency,
      available: round2(b.available),
      onHold: round2(b.onHold),
      equitySaving: round2(b.equitySaving),
    }))
    .sort((a, b) => Math.abs(b.available) - Math.abs(a.available))

  // Same positions math, but split per pocket (Main account + each sub-account
  // compartment) so the admin sees which pocket holds what.
  const compartmentMap = new Map<string, { id: string; label: string; byCcy: Map<string, InvestigationBalance> }>()
  for (const e of ledgerAll) {
    const { id, label } = compartmentLabel(e.subAccountId)
    const comp = compartmentMap.get(id) ?? { id, label, byCcy: new Map<string, InvestigationBalance>() }
    const cur = e.currency || "USD"
    const line = comp.byCcy.get(cur) ?? { currency: cur, available: 0, onHold: 0, equitySaving: 0 }
    if (e.status === "hold") {
      line.onHold += e.amount
      if (e.id.startsWith("EQSAV-")) line.equitySaving += e.amount
    } else {
      line.available += e.direction === "credit" ? e.amount : -e.amount
    }
    comp.byCcy.set(cur, line)
    compartmentMap.set(id, comp)
  }
  const compartments: InvestigationCompartment[] = Array.from(compartmentMap.values())
    .map((c) => ({
      id: c.id,
      label: c.label,
      balances: Array.from(c.byCcy.values())
        .map((b) => ({
          currency: b.currency,
          available: round2(b.available),
          onHold: round2(b.onHold),
          equitySaving: round2(b.equitySaving),
        }))
        .sort((a, b) => Math.abs(b.available) - Math.abs(a.available)),
    }))
    // Main pocket first, then sub-accounts alphabetically.
    .sort((a, b) => (a.id === MAIN ? -1 : b.id === MAIN ? 1 : a.label.localeCompare(b.label)))

  // Live facilities / exposures grouped by kind.
  const facilityMap = new Map<string, InvestigationFacility>()
  for (const a of approvals) {
    if (!POSITION_KINDS.includes(a.kind)) continue
    if (a.status !== "approved") continue
    if (!isLiveRequest(livenessRecord(a))) continue
    const label = KIND_LABELS[a.kind] ?? a.kind
    const entry =
      facilityMap.get(a.kind) ?? { kind: a.kind, label, liveCount: 0, items: [] as InvestigationFacility["items"] }
    entry.liveCount += 1
    if (entry.items.length < 25) {
      entry.items.push({
        title: a.title || a.summary || label,
        amount: a.amount,
        currency: a.currency,
        status: a.status,
        createdAt: a.createdAt,
      })
    }
    facilityMap.set(a.kind, entry)
  }
  const facilities = Array.from(facilityMap.values()).sort((a, b) => b.liveCount - a.liveCount)

  // --- Chronological timeline (merged ledger + audit trail) -----------------
  // Ledger: run a cumulative SETTLED balance PER POCKET+currency over the FULL
  // ledger (ascending) so each in-range money movement carries the resulting
  // balance of its own pocket (master vs a sub-account), then keep the rows in
  // range. Keying per pocket is what makes a sub-account's balance independent
  // of the master's.
  const ledgerAsc = [...ledgerAll].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0))
  const running: Record<string, number> = {}
  const ledgerItems: TimelineItem[] = []
  for (const e of ledgerAsc) {
    const cur = e.currency || "USD"
    const pocket = compartmentLabel(e.subAccountId)
    const key = `${pocket.id}\u0000${cur}`
    if (running[key] === undefined) running[key] = 0
    const signed = e.direction === "credit" ? e.amount : -e.amount
    if (e.status !== "hold") running[key] += signed
    const inRange = (!from || e.date >= from) && (!to || e.date <= to)
    if (!inRange) continue
    const held = e.status === "hold"
    const section = e.category || "Transaction"
    const type = held
      ? e.direction === "credit"
        ? "Hold (credit)"
        : "Blocked (debit)"
      : e.direction === "credit"
        ? "Credit"
        : "Debit"
    const description = [e.counterparty, e.comment].filter(Boolean).join(" — ") || e.reference || e.id
    const amount = round2(signed)
    ledgerItems.push({
      at: e.date,
      source: "Ledger",
      section,
      type,
      category: classifyEvent({ source: "Ledger", section, type, description, amount, status: e.status }),
      description,
      amount,
      currency: cur,
      status: e.status,
      balanceAfter: held ? null : round2(running[key]),
      ref: e.reference || e.id,
      ip: null,
      device: null,
      actor: null,
      compartmentId: pocket.id,
      compartment: pocket.label,
    })
  }

  // Audit events: already range-filtered + ascending from the DB.
  const memberLabel = new Map<string, string>()
  memberLabel.set(userId, profile.fullName || profile.company || profile.email || userId)
  const activityItems: TimelineItem[] = auditEvents.map((e) => {
    const { amount, currency } = amountFromDetails(e.details)
    const device = [e.deviceType, e.os, e.browser].filter(Boolean).join(" / ") || null
    const section = e.category || "Activity"
    const type = e.action || "Event"
    const description = describeDetails(e.details, e.action)
    return {
      at: e.createdAt,
      source: "Activity" as const,
      section,
      type,
      category: classifyEvent({ source: "Activity", section, type, description, amount, status: null }),
      description,
      amount,
      currency,
      status: null,
      balanceAfter: null,
      ref: e.id,
      ip: e.ipAddress,
      device,
      actor: e.account || (e.userId && memberLabel.get(e.userId)) || e.userId || null,
      compartmentId: "",
      compartment: "",
    }
  })

  const merged = [...ledgerItems, ...activityItems].sort((a, b) => {
    if (a.at < b.at) return -1
    if (a.at > b.at) return 1
    // Stable tiebreak: money movements before activity at the same instant.
    if (a.source !== b.source) return a.source === "Ledger" ? -1 : 1
    return 0
  })
  const truncated = merged.length > TIMELINE_CAP
  const timeline = truncated ? merged.slice(0, TIMELINE_CAP) : merged

  // Per-category tally over the (capped) timeline that is shown / exported.
  const catCounts = new Map<InvestigationCategory, number>()
  for (const t of timeline) catCounts.set(t.category, (catCounts.get(t.category) ?? 0) + 1)
  const byCategory = Array.from(catCounts.entries())
    .map(([category, count]) => ({ category, count }))
    .sort((a, b) => b.count - a.count)

  return {
    userId,
    account: profile.fullName || profile.company || profile.email || userId,
    company: profile.company || "",
    email: profile.email || "",
    accountBadge: profile.accountBadge || "",
    relationship: profile.relationship || "",
    memberIds,
    range: { from: from ?? null, to: to ?? null },
    balances,
    compartments,
    facilities,
    timeline,
    counts: { total: timeline.length, ledger: ledgerItems.length, activity: activityItems.length },
    byCategory,
    truncated,
    generatedAt: new Date().toISOString(),
  }
}
