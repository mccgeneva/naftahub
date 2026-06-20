"use server"

import { ADMIN_PASSCODE } from "@/lib/admin-config"
import { resolveCurrentSession, resolveAccountProfileById, resolveDataOwnerIdFor } from "@/lib/session-user"
import { logActivity } from "@/app/actions/log-activity"
import { upsertLedgerEntry } from "@/lib/ledger-db"
import type { LedgerEntry } from "@/lib/ledger-store"
import { insertNotification } from "@/lib/notifications-db"
import {
  insertApproval,
  listApprovalsForUser,
  listAllApprovals,
  listApprovalsForMaster,
  countPendingByKind,
  decideApproval,
  recordAdminDecision,
  recordMasterDecision,
  cancelApproval,
  getApprovalById,
  type ApprovalRequest,
  type ApprovalStatus,
  type LedgerEffect,
} from "@/lib/approvals-db"
import { KIND_LABELS, KIND_HREF, type ApprovalKind } from "@/lib/approval-kinds"
import { MASTER_CONSENT_KINDS } from "@/lib/account-hierarchy"

// --- Auth helpers -----------------------------------------------------------

function adminOk(passcode: string): boolean {
  return String(passcode) === ADMIN_PASSCODE
}

// --- Client-facing ----------------------------------------------------------

export interface SubmitApprovalInput {
  kind: ApprovalKind
  title: string
  summary: string
  amount?: number | null
  currency?: string | null
  payload?: Record<string, unknown>
  /** Optional ledger effect applied to the owner's balance on approval. */
  ledgerEffect?: LedgerEffect | null
}

export type SubmitApprovalResult =
  | { ok: true; request: ApprovalRequest }
  | { ok: false; error: string }

/** Submit a new request for administrator decision (status = pending). */
export async function submitApproval(input: SubmitApprovalInput): Promise<SubmitApprovalResult> {
  const session = await resolveCurrentSession()
  if (!session) return { ok: false, error: "Your session has expired. Please sign in again." }

  if (!input.kind || !KIND_LABELS[input.kind]) {
    return { ok: false, error: "Unknown request type." }
  }

  // A Sub-account's outgoing payments must clear a second gate: their Master's
  // consent (in addition to administrator approval). Detected here from the
  // authoritative session, so no client can opt out of the Master gate.
  const requiresMasterApproval =
    session.relationship === "sub" && !!session.masterId && MASTER_CONSENT_KINDS.has(input.kind)

  try {
    const request = await insertApproval({
      userId: session.id,
      kind: input.kind,
      title: input.title?.trim() || KIND_LABELS[input.kind],
      summary: input.summary?.trim() || "",
      amount: input.amount ?? null,
      currency: input.currency ?? null,
      payload: input.payload ?? {},
      ledgerEffect: input.ledgerEffect ?? null,
      requiresMasterApproval,
      masterId: requiresMasterApproval ? session.masterId : null,
      initiatedById: requiresMasterApproval ? session.id : null,
      initiatedByName: requiresMasterApproval ? session.profile.fullName : null,
    })

    // Let the Master know one of their Sub-accounts needs their consent.
    if (requiresMasterApproval && session.masterId) {
      try {
        await insertNotification({
          userId: session.masterId,
          tone: "warning",
          title: "Sub-account payment needs your approval",
          body: `${session.profile.fullName} requested an outgoing payment ("${
            input.title?.trim() || KIND_LABELS[input.kind]
          }") that requires your consent.`,
          href: "/dashboard/network",
        })
      } catch (err) {
        console.log("[v0] master consent notification failed:", (err as Error).message)
      }
    }

    // NOTE: We intentionally do NOT emit an activity-log email here. The
    // client flow that mirrors the submission (e.g. the Payments page) already
    // logs the activity with the correct signed-in user. Logging again here
    // produced a duplicate email — and, because this server context passes no
    // `user`, it fell back to a hardcoded demo name, misattributing the action
    // to the wrong client. The approvals backbone's role is DB persistence for
    // administrator review, not activity notification.

    return { ok: true, request }
  } catch (err) {
    console.log("[v0] submitApproval failed:", (err as Error).message)
    return { ok: false, error: "Your request could not be submitted. Please try again." }
  }
}

/** The signed-in user's own requests (optionally filtered by kind). */
export async function listMyApprovals(kind?: ApprovalKind): Promise<ApprovalRequest[]> {
  const session = await resolveCurrentSession()
  if (!session) return []
  try {
    return await listApprovalsForUser(session.id, kind)
  } catch (err) {
    console.log("[v0] listMyApprovals failed:", (err as Error).message)
    return []
  }
}

/** Cancel one of the user's own still-pending requests. */
export async function cancelMyApproval(id: string): Promise<{ ok: boolean; error?: string }> {
  const session = await resolveCurrentSession()
  if (!session) return { ok: false, error: "Your session has expired. Please sign in again." }
  try {
    const cancelled = await cancelApproval(id, session.id)
    if (!cancelled) return { ok: false, error: "This request can no longer be cancelled." }
    return { ok: true }
  } catch (err) {
    console.log("[v0] cancelMyApproval failed:", (err as Error).message)
    return { ok: false, error: "The request could not be cancelled. Please try again." }
  }
}

// --- Admin (cross-client) ---------------------------------------------------

export type AdminApprovalsResult =
  | { ok: true; requests: ApprovalRequest[] }
  | { ok: false; error: string }

export async function adminListApprovals(
  passcode: string,
  filters?: { status?: ApprovalStatus; kind?: ApprovalKind; userId?: string },
): Promise<AdminApprovalsResult> {
  if (!adminOk(passcode)) return { ok: false, error: "Administrator authorization failed." }
  try {
    const requests = await listAllApprovals(filters)
    return { ok: true, requests }
  } catch (err) {
    console.log("[v0] adminListApprovals failed:", (err as Error).message)
    return { ok: false, error: "Could not load requests. Please try again." }
  }
}

export async function adminCountPending(passcode: string): Promise<Record<string, number>> {
  if (!adminOk(passcode)) return {}
  try {
    return await countPendingByKind()
  } catch (err) {
    console.log("[v0] adminCountPending failed:", (err as Error).message)
    return {}
  }
}

// Approval kinds that, when approved, CREDIT the owner's balance. These are
// surfaced as available funds (e.g. monetization proceeds, downloaded funds,
// project funding draws). Used as a fallback when an approval was created
// before an explicit `ledgerEffect` was attached, so the amount/currency stored
// on the approval itself still posts to the client's ledger on approval.
const CREDIT_KINDS = new Set<ApprovalKind>(["monetization", "dof", "project_funding"])

/**
 * Resolve the ledger entry an approved request should post (or null if none).
 * Prefers an explicit `ledgerEffect`; otherwise falls back to the approval's
 * own amount/currency for known crediting kinds. Idempotent id (`APPR-<id>`)
 * means re-applying never double-posts.
 */
function ledgerEntryForApproval(req: ApprovalRequest): LedgerEntry | null {
  const fx = req.ledgerEffect
  if (fx) {
    const amount = Number(fx.amount)
    if (!Number.isFinite(amount) || amount <= 0) return null
    return {
      id: `APPR-${req.id}`,
      direction: fx.direction,
      amount,
      currency: fx.currency || req.currency || "USD",
      status: fx.status ?? "completed",
      date: new Date().toISOString(),
      counterparty: fx.counterparty ?? req.title,
      account: fx.account,
      bank: fx.bank,
      reference: fx.reference ?? req.id,
      comment: `Approved ${KIND_LABELS[req.kind]} — ${req.title}`,
      category: fx.category ?? KIND_LABELS[req.kind],
    }
  }
  // Fallback: credit the stored amount for known crediting kinds (e.g. a
  // monetization approved before ledger effects were attached).
  if (CREDIT_KINDS.has(req.kind)) {
    const amount = Number(req.amount)
    if (!Number.isFinite(amount) || amount <= 0) return null
    return {
      id: `APPR-${req.id}`,
      direction: "credit",
      amount,
      currency: req.currency || "USD",
      status: "completed",
      date: new Date().toISOString(),
      counterparty: req.title,
      reference: req.id,
      comment: `Approved ${KIND_LABELS[req.kind]} — ${req.title}`,
      category: KIND_LABELS[req.kind],
    }
  }
  return null
}

/**
 * Apply the financial effect (if any) of an approved request to the SHARED-data
 * owner's ledger. For a Sub-account the balance lives under its Master, so the
 * debit/credit must post to the Master's id — not the sub's own (empty) ledger.
 * Idempotent on the entry id so re-running never double-posts.
 */
async function applyLedgerEffect(req: ApprovalRequest): Promise<void> {
  const entry = ledgerEntryForApproval(req)
  if (!entry) return
  const ownerId = await resolveDataOwnerIdFor(req.userId)
  await upsertLedgerEntry(ownerId, entry)
}

/**
 * Back-fill ledger credits for the signed-in client's already-approved
 * requests. Safe to call on every dashboard load: posting is idempotent on
 * `APPR-<id>`, so an entry that already exists is simply overwritten with the
 * same values. This guarantees that any approved monetization (including ones
 * approved before ledger effects existed) reflects in the master account
 * balance the next time the ledger hydrates. Returns the number of credit
 * entries reconciled.
 */
export async function reconcileMyApprovedCredits(): Promise<{ ok: boolean; applied: number }> {
  const session = await resolveCurrentSession()
  if (!session) return { ok: false, applied: 0 }
  try {
    const mine = await listApprovalsForUser(session.id)
    const approved = mine.filter((r) => r.status === "approved")
    let applied = 0
    for (const req of approved) {
      const entry = ledgerEntryForApproval(req)
      if (entry && entry.direction === "credit") {
        // Post to the shared-data owner (Master for a sub) so the credit lands
        // on the same ledger the balance is read from.
        const ownerId = await resolveDataOwnerIdFor(req.userId)
        await upsertLedgerEntry(ownerId, entry)
        applied += 1
      }
    }
    return { ok: true, applied }
  } catch (err) {
    console.log("[v0] reconcileMyApprovedCredits failed:", (err as Error).message)
    return { ok: false, applied: 0 }
  }
}

export type DecideResult =
  | { ok: true; request: ApprovalRequest }
  | { ok: false; error: string }

export async function adminDecideApproval(
  passcode: string,
  id: string,
  decision: "approved" | "rejected",
  note?: string,
): Promise<DecideResult> {
  if (!adminOk(passcode)) return { ok: false, error: "Administrator authorization failed." }
  if (decision === "rejected" && !note?.trim()) {
    return { ok: false, error: "A reason is required to reject a request." }
  }

  try {
    const existing = await getApprovalById(id)
    if (!existing) return { ok: false, error: "Request not found." }
    if (existing.status !== "pending" && existing.status !== "awaiting_master") {
      return { ok: false, error: "This request has already been decided." }
    }

    // Record the administrator's verdict (first gate). For a Sub-account
    // payment this lands the request on "awaiting_master" rather than
    // "approved" until the Master also consents.
    const updated = await recordAdminDecision(id, decision, "Administrator", note)
    if (!updated) return { ok: false, error: "This request has already been decided." }

    // Money only moves once ALL required gates clear (final status approved).
    if (updated.status === "approved") {
      try {
        await applyLedgerEffect(updated)
      } catch (err) {
        console.log("[v0] applyLedgerEffect failed:", (err as Error).message)
      }
    }

    // Notify the owning client.
    const label = KIND_LABELS[updated.kind]
    const awaitingMaster = updated.status === "awaiting_master"
    try {
      await insertNotification({
        userId: updated.userId,
        tone: decision === "approved" ? (awaitingMaster ? "info" : "success") : "warning",
        title:
          decision === "approved"
            ? awaitingMaster
              ? `${label} awaiting Master approval`
              : `${label} approved`
            : `${label} declined`,
        body:
          decision === "approved"
            ? awaitingMaster
              ? `Your ${label.toLowerCase()} request "${updated.title}" was approved by the administrator and now awaits your Master account's consent.`
              : `Your ${label.toLowerCase()} request "${updated.title}" was approved.`
            : `Your ${label.toLowerCase()} request "${updated.title}" was declined. Reason: ${note?.trim()}`,
        href: KIND_HREF[updated.kind] ?? null,
      })
    } catch (err) {
      console.log("[v0] approval notification failed:", (err as Error).message)
    }

    // When the admin gate clears but a Master gate remains, nudge the Master.
    if (awaitingMaster && updated.masterId) {
      try {
        await insertNotification({
          userId: updated.masterId,
          tone: "warning",
          title: "Sub-account payment awaiting your approval",
          body: `${updated.initiatedByName ?? "A sub-account"}'s ${label.toLowerCase()} "${updated.title}" was approved by the administrator and needs your consent to execute.`,
          href: "/dashboard/network",
        })
      } catch (err) {
        console.log("[v0] master nudge notification failed:", (err as Error).message)
      }
    }

    // Audit trail.
    const target = await resolveAccountProfileById(updated.userId)
    await logActivity({
      action: `Administrator ${decision} a ${label} request for ${target.fullName}`,
      category: "Administration / Approvals",
      user: "Administrator",
      details: {
        referenceId: updated.id,
        targetAccount: `${target.fullName} — ${target.email}`,
        summary: updated.summary || updated.title,
        amount: updated.amount != null ? `${updated.currency ?? ""} ${updated.amount.toLocaleString("en-US")}` : "(n/a)",
        decision,
        reason: note?.trim() || "(none)",
      },
    })

    return { ok: true, request: updated }
  } catch (err) {
    console.log("[v0] adminDecideApproval failed:", (err as Error).message)
    return { ok: false, error: "The decision could not be recorded. Please try again." }
  }
}

/**
 * The signed-in Master's consent queue: Sub-account requests routed to them for
 * a second-gate decision. `pendingOnly` returns just those still awaiting the
 * Master's verdict (used for the badge/queue), otherwise the full history.
 */
export async function getMyMasterApprovalQueue(opts?: { pendingOnly?: boolean }): Promise<ApprovalRequest[]> {
  const session = await resolveCurrentSession()
  if (!session) return []
  try {
    return await listApprovalsForMaster(session.id, opts)
  } catch (err) {
    console.log("[v0] getMyMasterApprovalQueue failed:", (err as Error).message)
    return []
  }
}

/**
 * Record the signed-in MASTER's verdict (second gate) for a Sub-account
 * request. The money movement applies here when the Master's approval is the
 * final gate (the admin already approved). The caller must be the request's
 * designated Master — enforced from the session, not the client.
 */
export async function masterDecideApproval(
  id: string,
  decision: "approved" | "rejected",
  note?: string,
): Promise<DecideResult> {
  const session = await resolveCurrentSession()
  if (!session) return { ok: false, error: "Your session has expired. Please sign in again." }
  if (decision === "rejected" && !note?.trim()) {
    return { ok: false, error: "A reason is required to reject a request." }
  }

  try {
    const existing = await getApprovalById(id)
    if (!existing) return { ok: false, error: "Request not found." }
    if (existing.masterId !== session.id || !existing.requiresMasterApproval) {
      return { ok: false, error: "You are not authorized to decide this request." }
    }
    if (existing.status !== "pending" && existing.status !== "awaiting_master") {
      return { ok: false, error: "This request has already been decided." }
    }

    const updated = await recordMasterDecision(id, session.id, decision, note)
    if (!updated) return { ok: false, error: "This request has already been decided." }

    // Apply money movement only when BOTH gates have now cleared.
    if (updated.status === "approved") {
      try {
        await applyLedgerEffect(updated)
      } catch (err) {
        console.log("[v0] applyLedgerEffect (master gate) failed:", (err as Error).message)
      }
    }

    // Notify the initiating Sub-account of the Master's verdict.
    const label = KIND_LABELS[updated.kind]
    const fullyApproved = updated.status === "approved"
    try {
      await insertNotification({
        userId: updated.userId,
        tone: decision === "approved" ? (fullyApproved ? "success" : "info") : "warning",
        title:
          decision === "approved"
            ? fullyApproved
              ? `${label} approved`
              : `${label} awaiting administrator`
            : `${label} declined by Master`,
        body:
          decision === "approved"
            ? fullyApproved
              ? `Your ${label.toLowerCase()} "${updated.title}" was approved by your Master account and has been executed.`
              : `Your Master account approved "${updated.title}"; it now awaits administrator approval.`
            : `Your ${label.toLowerCase()} "${updated.title}" was declined by your Master account. Reason: ${note?.trim()}`,
        href: KIND_HREF[updated.kind] ?? null,
      })
    } catch (err) {
      console.log("[v0] master decision notification failed:", (err as Error).message)
    }

    // Audit trail.
    const target = await resolveAccountProfileById(updated.userId)
    await logActivity({
      action: `Master ${session.profile.fullName} ${decision} a ${label} request from ${target.fullName}`,
      category: "Account Hierarchy / Approvals",
      user: session.profile.fullName,
      details: {
        referenceId: updated.id,
        subAccount: `${target.fullName} — ${target.email}`,
        summary: updated.summary || updated.title,
        amount: updated.amount != null ? `${updated.currency ?? ""} ${updated.amount.toLocaleString("en-US")}` : "(n/a)",
        decision,
        reason: note?.trim() || "(none)",
      },
    })

    return { ok: true, request: updated }
  } catch (err) {
    console.log("[v0] masterDecideApproval failed:", (err as Error).message)
    return { ok: false, error: "The decision could not be recorded. Please try again." }
  }
}

/**
 * Issue a bank instrument directly into a client's portfolio (administrator
 * only). Clients can no longer self-create instruments; issuance is an
 * administrator-controlled act. This records an `instrument` approval for the
 * target client that is born already-approved and carries the full instrument
 * in its payload, so the client's instrument store can materialise it as an
 * active holding on its next reconcile — durable and visible cross-device.
 */
export type IssueInstrumentResult =
  | { ok: true; request: ApprovalRequest }
  | { ok: false; error: string }

export async function adminIssueInstrument(
  passcode: string,
  userId: string,
  instrument: Record<string, unknown>,
): Promise<IssueInstrumentResult> {
  if (!adminOk(passcode)) return { ok: false, error: "Administrator authorization failed." }
  if (!userId) return { ok: false, error: "Select a client to issue to." }

  const id = String(instrument?.id ?? "").trim()
  const issuer = String(instrument?.issuer ?? "").trim()
  const typeFull = String(instrument?.typeFull ?? instrument?.type ?? "Bank Instrument").trim()
  const currency = String(instrument?.currency ?? "USD").trim()
  const faceValue = Number(instrument?.faceValue ?? 0)
  if (!id) return { ok: false, error: "The instrument is missing an identifier." }
  if (!issuer) return { ok: false, error: "An issuing bank is required." }
  if (!Number.isFinite(faceValue) || faceValue <= 0) {
    return { ok: false, error: "Enter a valid face value greater than 0." }
  }

  try {
    // Born pending, then immediately decided approved by the administrator, so
    // it shares the exact same audit + notification path as any other decision.
    const created = await insertApproval({
      userId,
      kind: "instrument",
      title: `${typeFull} · ${issuer}`,
      summary: `${currency} ${faceValue.toLocaleString("en-US")} ${typeFull} issued by ${issuer} (administrator issuance).`,
      amount: faceValue,
      currency,
      // The full instrument travels in the payload so the client can materialise
      // it. `issuedByAdmin` marks it as a brand-new holding (not a reconcile of
      // a client-originated request).
      payload: { issuedByAdmin: true, instrument },
    })

    const decided = await decideApproval(created.id, "approved", "Administrator")
    const request = decided ?? created

    try {
      await insertNotification({
        userId,
        tone: "success",
        title: "Bank instrument issued",
        body: `MCC Capital issued a ${typeFull} of ${currency} ${faceValue.toLocaleString("en-US")} (${issuer}) to your portfolio.`,
        href: KIND_HREF.instrument ?? "/dashboard/instruments",
      })
    } catch (err) {
      console.log("[v0] issue notification failed:", (err as Error).message)
    }

    const target = await resolveAccountProfileById(userId)
    await logActivity({
      action: `Administrator issued a ${typeFull} (${currency} ${faceValue.toLocaleString("en-US")}) to ${target.fullName}`,
      category: "Administration / Instruments",
      user: "Administrator",
      details: {
        referenceId: id,
        targetAccount: `${target.fullName} — ${target.email}`,
        instrument: `${typeFull} — ${issuer}`,
        faceValue: `${currency} ${faceValue.toLocaleString("en-US")}`,
        action: "Issued",
      },
    })

    return { ok: true, request }
  } catch (err) {
    console.log("[v0] adminIssueInstrument failed:", (err as Error).message)
    return { ok: false, error: "The instrument could not be issued. Please try again." }
  }
}

export interface BulkDecideResult {
  ok: boolean
  decided: number
  failed: number
}

/** Approve or reject many requests at once (e.g. from multi-select). */
export async function adminBulkDecide(
  passcode: string,
  ids: string[],
  decision: "approved" | "rejected",
  note?: string,
): Promise<BulkDecideResult> {
  if (!adminOk(passcode)) return { ok: false, decided: 0, failed: ids.length }
  if (decision === "rejected" && !note?.trim()) {
    return { ok: false, decided: 0, failed: ids.length }
  }
  let decided = 0
  let failed = 0
  for (const id of ids) {
    const res = await adminDecideApproval(passcode, id, decision, note)
    if (res.ok) decided++
    else failed++
  }
  return { ok: failed === 0, decided, failed }
}
