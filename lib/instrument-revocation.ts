import "server-only"

import {
  cancelApproval,
  decideApproval,
  deleteApprovalForUser,
  getApprovalById,
  insertApproval,
  listAllApprovals,
  listApprovalsForUsers,
  revokeApprovedApproval,
  updateApprovalPayload,
  type ApprovalRequest,
} from "@/lib/approvals-db"
import type { ApprovalKind } from "@/lib/approval-kinds"
import { readLedgerEntries, upsertLedgerEntry } from "@/lib/ledger-db"
import { resolveDataOwnerIdFor, resolveEnvironmentMemberIds } from "@/lib/session-user"
import { isLiveRequest } from "@/lib/live-request"
import { buildTerminationPlan } from "@/lib/debit-settlement"
import type { DebitKind } from "@/lib/debit-schedule"
import type { LedgerEntry } from "@/lib/ledger-store"
import type { LeverageRequest } from "@/lib/leverage-requests-store"
import type { MonetizationRequest } from "@/lib/monetization-requests-store"
import type { InternalLoanRecordLike } from "@/lib/internal-loan"
import { listPpiPoliciesForOwner, appendPpiMessage } from "@/lib/ppi-insurance-db"
import { effectivePpiStatus, type PpiPolicy } from "@/lib/ppi-insurance"
import { buildInstrumentIdentifiers } from "@/lib/instrument-identifiers"
import { findInstrumentType } from "@/lib/instrument-marketplace"
import { insertNotification } from "@/lib/notifications-db"
import { round2 } from "@/lib/interest-accrual"

/** Fresh-cut replacement issuer used when PPI cover replaces a revoked instrument. */
export const REPLACEMENT_ISSUER = {
  name: "Lloyds Bank plc, London",
  bic: "LOYDGB2L",
  address: "25 Gresham Street, London EC2V 7HN, United Kingdom",
  country: "United Kingdom",
} as const

type Rec = Record<string, unknown>

export type AmlFlag = { flaggedAt: string; flaggedBy: string; reason: string }

export type EngagementKind = "leverage" | "internal_loan" | "monetization" | "ppp" | "trading_fund"

/** The record field each financing product uses to point at its pledged instrument. */
const PLEDGE_FIELDS: Record<EngagementKind, string[]> = {
  leverage: ["pledgedInstrumentId"],
  internal_loan: ["collateralInstrumentId"],
  monetization: ["instrumentId"],
  ppp: ["fundingInstrumentId"],
  trading_fund: ["fundingInstrumentId", "pledgedInstrumentId", "instrumentId"],
}

const ENGAGEMENT_LABEL: Record<EngagementKind, string> = {
  leverage: "Leverage line",
  internal_loan: "Internal loan",
  monetization: "Monetization",
  ppp: "Yield / PPP program",
  trading_fund: "Treuhand fund investment",
}

export type Engagement = {
  approvalId: string
  kind: EngagementKind
  label: string
  title: string
  status: string
  field: string
  amount: number
  currency: string
}

export type AdminInstrumentRow = {
  approvalId: string
  userId: string
  instrument: Rec
  flag: AmlFlag | null
  engagements: Engagement[]
  ppiActive: { id: string; lloydsReference: string; coverAmount: number; currency: string } | null
}

function instrumentBase(payload: Rec | null | undefined): Rec | null {
  if (!payload) return null
  const p = payload as { issuedByAdmin?: boolean; instrument?: Rec; record?: Rec }
  const base = p.issuedByAdmin ? p.instrument : (p.record ?? p.instrument)
  return base && typeof base === "object" && typeof base.id === "string" ? base : null
}

function mergedRecord(a: ApprovalRequest): Rec {
  const payload = (a.payload ?? {}) as Rec
  const rec = (payload.record as Rec | undefined) ?? {}
  return { ...payload, ...rec, status: a.status }
}

async function memberIdsFor(userId: string): Promise<string[]> {
  const extra = await resolveEnvironmentMemberIds(userId).catch(() => [] as string[])
  return Array.from(new Set([userId, ...extra]))
}

/** Every live facility (of any product) currently pledging this instrument. */
export async function findEngagements(instrumentId: string, userId: string): Promise<Engagement[]> {
  const ids = await memberIdsFor(userId)
  const out: Engagement[] = []
  for (const kind of Object.keys(PLEDGE_FIELDS) as EngagementKind[]) {
    let rows: ApprovalRequest[] = []
    try {
      rows = await listApprovalsForUsers(ids, kind as ApprovalKind)
    } catch {
      continue
    }
    for (const row of rows) {
      if (row.status === "rejected" || row.status === "cancelled") continue
      const rec = mergedRecord(row)
      if (!isLiveRequest(rec as { status?: string })) continue
      const field = PLEDGE_FIELDS[kind].find((f) => rec[f] === instrumentId)
      if (!field) continue
      out.push({
        approvalId: row.id,
        kind,
        label: ENGAGEMENT_LABEL[kind],
        title: row.title,
        status: row.status,
        field,
        amount: Number(rec.borrowedAmount ?? rec.amount ?? row.amount ?? 0) || 0,
        currency: String(rec.currency ?? row.currency ?? "EUR"),
      })
    }
  }
  return out
}

async function activePpiFor(ownerId: string): Promise<PpiPolicy | null> {
  try {
    const policies = await listPpiPoliciesForOwner(ownerId)
    return policies.find((p) => effectivePpiStatus(p) === "active") ?? null
  } catch {
    return null
  }
}

/** Every held (approved) bank instrument across all customers, with its engagements. */
export async function listInstrumentsForAml(): Promise<AdminInstrumentRow[]> {
  const rows = await listAllApprovals({ kind: "instrument", status: "approved" })
  const ppiCache = new Map<string, PpiPolicy | null>()
  const out: AdminInstrumentRow[] = []
  for (const row of rows) {
    const payload = (row.payload ?? {}) as Rec
    const inst = instrumentBase(payload)
    if (!inst) continue
    const ownerId = await resolveDataOwnerIdFor(row.userId)
    if (!ppiCache.has(ownerId)) ppiCache.set(ownerId, await activePpiFor(ownerId))
    const ppi = ppiCache.get(ownerId) ?? null
    out.push({
      approvalId: row.id,
      userId: row.userId,
      instrument: inst,
      flag: (payload.amlFlag as AmlFlag | undefined) ?? null,
      engagements: await findEngagements(String(inst.id), row.userId),
      ppiActive: ppi
        ? { id: ppi.id, lloydsReference: ppi.lloydsReference, coverAmount: ppi.coverAmount, currency: ppi.currency }
        : null,
    })
  }
  return out
}

export async function setInstrumentFlag(approvalId: string, flag: AmlFlag | null): Promise<boolean> {
  const row = await getApprovalById(approvalId)
  if (!row || row.kind !== "instrument") return false
  const payload = { ...((row.payload ?? {}) as Rec) }
  const wasFlagged = Boolean(payload.amlFlag)
  if (flag) payload.amlFlag = flag
  else delete payload.amlFlag
  const saved = Boolean(await updateApprovalPayload(approvalId, payload))
  if (!saved) return false
  const inst = ((payload.issuedByAdmin ? payload.instrument : (payload.record ?? payload.instrument)) ?? {}) as Rec
  const label = [inst.type, inst.id].filter(Boolean).join(" ") || "your bank instrument"
  try {
    if (flag && !wasFlagged) {
      await insertNotification({
        userId: row.userId,
        tone: "warning",
        title: `Bank instrument blocked — ${label}`,
        body: `${label} has been placed under a compliance review hold and is blocked. It cannot be pledged, transferred, monetized or returned until the review is completed. Please contact the administrator if you have questions.`,
        href: "/dashboard/instruments",
      })
    } else if (!flag && wasFlagged) {
      await insertNotification({
        userId: row.userId,
        tone: "success",
        title: `Bank instrument released — ${label}`,
        body: `The compliance review hold on ${label} has been lifted. The instrument is available again.`,
        href: "/dashboard/instruments",
      })
    }
  } catch (err) {
    console.log("[v0] compliance hold notification failed:", err)
  }
  return true
}

export type RevocationOutcome = {
  mode: "ppi_replacement" | "collapsed"
  instrumentId: string
  replacementInstrumentId?: string
  ppiPolicyId?: string
  engagements: Array<Engagement & { result: string; debited?: number }>
  totalDebitedEur?: number
}

const ENGINE_KIND: Partial<Record<EngagementKind, DebitKind>> = {
  leverage: "leverage",
  monetization: "monetization",
  internal_loan: "internal_loan",
}

/** Settle one financing facility in full, posting every leg to the master even into deep debit. */
async function collapseFacility(eng: Engagement, ledgerOwnerId: string, reason: string): Promise<{ result: string; debited: number }> {
  const row = await getApprovalById(eng.approvalId)
  if (!row) return { result: "Not found", debited: 0 }
  const payload = (row.payload ?? {}) as Rec
  const rec = (payload.record as Rec | undefined) ?? {}
  const now = new Date().toISOString()
  const note = `Collapsed by administrator: pledged instrument revoked (AML). ${reason}`.trim()

  if (row.status === "pending" || row.status === "awaiting_master") {
    await cancelApproval(row.id, row.userId)
    return { result: "Application cancelled", debited: 0 }
  }

  const engineKind = ENGINE_KIND[eng.kind]
  if (!engineKind) {
    // Instrument-funded investments: the instrument WAS the funding, so the position ends.
    await updateApprovalPayload(row.id, {
      ...payload,
      record: { ...rec, cancelledAt: now, closedAt: now, closureKind: "aml_revocation", closureNote: note },
    })
    await revokeApprovedApproval(row.id, row.userId, note)
    return { result: "Position terminated", debited: 0 }
  }

  const entries = await readLedgerEntries(ledgerOwnerId)
  const facilities = {
    leverage: engineKind === "leverage" ? [rec as unknown as LeverageRequest] : [],
    monetization: engineKind === "monetization" ? [rec as unknown as MonetizationRequest] : [],
    internalLoans:
      engineKind === "internal_loan" ? [{ ...(rec as unknown as InternalLoanRecordLike), approvalId: row.id }] : [],
    funding: [],
    treasury: null,
  }
  const plan = buildTerminationPlan({
    kind: engineKind,
    facilityId: engineKind === "internal_loan" ? row.id : String(rec.id ?? row.id),
    ...facilities,
    entries,
  })
  let debited = 0
  if (plan) {
    for (const p of [...plan.reconcilePosts, ...plan.settlementPosts]) {
      const entry: LedgerEntry = {
        ...p.entry,
        direction: "debit",
        comment: `${p.entry.comment ?? ""} Forced collapse — pledged instrument revoked.`.trim(),
      }
      await upsertLedgerEntry(ledgerOwnerId, entry)
      debited += p.entry.amount
    }
  }
  await updateApprovalPayload(row.id, {
    ...payload,
    record: {
      ...rec,
      ...(plan?.closePatch ?? {}),
      status: engineKind === "leverage" ? "closed" : rec.status,
      closedAt: now,
      closureKind: "aml_revocation",
      closureNote: note,
    },
  })
  return { result: plan ? "Settled into master account" : "Already settled", debited: round2(debited) }
}

/**
 * Force-revoke a bank instrument. With an active PPI policy, a fresh Lloyds Bank BG of the
 * same value replaces it and every pledge is re-linked; otherwise every facility relying on
 * it is collapsed and settled into the master account, even into deep debit.
 */
export async function revokeInstrument(
  approvalId: string,
  reason: string,
  actor: string,
): Promise<{ ok: true; outcome: RevocationOutcome } | { ok: false; error: string }> {
  const row = await getApprovalById(approvalId)
  if (!row || row.kind !== "instrument") return { ok: false, error: "Instrument not found." }
  const payload = (row.payload ?? {}) as Rec
  const inst = instrumentBase(payload)
  if (!inst) return { ok: false, error: "Instrument record is incomplete." }
  const instrumentId = String(inst.id)
  const ownerId = await resolveDataOwnerIdFor(row.userId)
  const engagements = await findEngagements(instrumentId, row.userId)
  const ppi = await activePpiFor(ownerId)
  const label = `${String(inst.typeFull ?? inst.type ?? "Instrument")} ${instrumentId}`
  const faceValue = Number(inst.faceValue) || 0
  const currency = String(inst.currency ?? "EUR")
  const now = new Date()

  if (ppi) {
    const bgMeta = findInstrumentType("BG")
    const ids = buildInstrumentIdentifiers("Lloyds Bank", "BG", now)
    const expiry = new Date(now)
    expiry.setFullYear(expiry.getFullYear() + 1)
    const newId = `BG-LLOYDS-${now.getTime().toString(36).toUpperCase()}`
    const replacement: Rec = {
      ...inst,
      id: newId,
      type: "BG",
      typeFull: bgMeta?.full ?? "Bank Guarantee (BG)",
      issuer: REPLACEMENT_ISSUER.name,
      issuerBic: REPLACEMENT_ISSUER.bic,
      issuerAddress: REPLACEMENT_ISSUER.address,
      issuerCountry: REPLACEMENT_ISSUER.country,
      placeOfIssue: "London, United Kingdom",
      faceValue,
      currency,
      status: "active",
      issuedDate: now.toISOString(),
      expiryDate: String(inst.expiryDate ?? "") || expiry.toISOString(),
      rating: "AA-",
      assignable: bgMeta?.assignable ?? true,
      monetizable: bgMeta?.monetizable ?? true,
      blocked: false,
      deliveryMethod: "SWIFT MT760",
      governingLaw: "URDG 758 / English Law",
      tradeType: `PPI replacement for revoked ${label}`,
      isin: ids.isin,
      commonCode: ids.commonCode,
      cusip: ids.cusip,
      serialNumber: ids.serialNumber,
      upgrade: undefined,
      audit: undefined,
    }
    const created = await insertApproval({
      userId: row.userId,
      kind: "instrument",
      title: `Lloyds Bank BG ${currency} ${faceValue.toLocaleString("en-US")}`,
      summary: `Fresh-cut Bank Guarantee issued by ${REPLACEMENT_ISSUER.name} under PPI policy ${ppi.lloydsReference || ppi.id}, replacing revoked ${label}.`,
      amount: faceValue,
      currency,
      payload: {
        issuedByAdmin: true,
        instrument: replacement,
        replacesInstrumentId: instrumentId,
        ppiPolicyId: ppi.id,
      },
    })
    await decideApproval(created.id, "approved", actor, "PPI replacement of a revoked instrument")

    const results: RevocationOutcome["engagements"] = []
    for (const eng of engagements) {
      const fac = await getApprovalById(eng.approvalId)
      if (!fac) continue
      const fp = (fac.payload ?? {}) as Rec
      const frec = { ...((fp.record as Rec | undefined) ?? {}) }
      frec[eng.field] = newId
      frec.backedByReplacement = { instrumentId: newId, replacedInstrumentId: instrumentId, ppiPolicyId: ppi.id, at: now.toISOString() }
      await updateApprovalPayload(fac.id, { ...fp, record: frec })
      results.push({ ...eng, result: "Re-linked to Lloyds Bank BG" })
    }

    await deleteApprovalForUser(row.id, row.userId)
    try {
      await appendPpiMessage(ppi.id, {
        id: `MSG-${now.getTime().toString(36)}`,
        author: "treasury",
        authorName: "Treasury",
        text: `Policy applied: ${label} was revoked and replaced by a fresh-cut ${REPLACEMENT_ISSUER.name} BG (${newId}) of ${currency} ${faceValue.toLocaleString("en-US")}. ${results.length} facility(ies) re-linked. No debit to the Master Account.`,
        at: now.toISOString(),
      })
    } catch {
      /* best-effort */
    }
    await notify(row.userId, "Bank instrument replaced under your PPI cover", `${label} was revoked. Your PPI policy replaced it with a ${REPLACEMENT_ISSUER.name} Bank Guarantee of ${currency} ${faceValue.toLocaleString("en-US")}. Your investments and facilities now rely on the new guarantee and your Master Account was not debited.`)
    return {
      ok: true,
      outcome: { mode: "ppi_replacement", instrumentId, replacementInstrumentId: newId, ppiPolicyId: ppi.id, engagements: results },
    }
  }

  const results: RevocationOutcome["engagements"] = []
  for (const eng of engagements) {
    try {
      const r = await collapseFacility(eng, ownerId, reason)
      results.push({ ...eng, result: r.result, debited: r.debited })
    } catch (err) {
      results.push({ ...eng, result: `Failed: ${(err as Error).message}` })
    }
  }
  await deleteApprovalForUser(row.id, row.userId)
  const debitedList = results.filter((r) => (r.debited ?? 0) > 0)
  await notify(
    row.userId,
    "Bank instrument revoked",
    `${label} was revoked by compliance.${
      debitedList.length
        ? ` ${debitedList.length} facility(ies) it secured were collapsed and settled to your Master Account, which may now be in debit. Please top up.`
        : ""
    }`,
  )
  return { ok: true, outcome: { mode: "collapsed", instrumentId, engagements: results } }
}

async function notify(userId: string, title: string, body: string) {
  try {
    await insertNotification({ userId, tone: "warning", title, body, href: "/dashboard/instruments" })
  } catch {
    /* best-effort */
  }
}
