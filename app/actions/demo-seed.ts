"use server"

import { query } from "@/lib/db"
import { resolveCurrentSession } from "@/lib/session-user"
import { DEMO_USER_ID } from "@/lib/users"
import type { ApprovalKind } from "@/lib/approval-kinds"
import { seedApproval } from "@/lib/approvals-db"
import { upsertLedgerEntry } from "@/lib/ledger-db"
import { upsertBeneficiary } from "@/lib/beneficiaries-db"
import { replaceSkrRecordsForUser } from "@/lib/skr-db"
import type { LedgerEntry } from "@/lib/ledger-store"
import {
  ledgerEntries,
  paymentRequests,
  pppRequests,
  instruments,
  dofRequests,
  dtcRequests,
  commodityDeals,
  leverageRequests,
  skrRecords,
  demoBeneficiaries,
} from "@/lib/demo-seed-data"

/**
 * Server-side demo seeding.
 *
 * The demo account (user u3) is pre-populated with a rich, simulated dataset
 * across every section of the platform. Previously this was written to the
 * browser's localStorage; now that every store hydrates from Neon (the single
 * source of truth, visible cross-device and to the administrator), the seed
 * must live server-side too. This action inserts the canonical dataset directly
 * into the same tables the live app reads from, keyed by the demo user's id.
 *
 * Idempotency: a one-row marker table (`demo_seed_marks`) records that the demo
 * account has been seeded. The marker is NEVER cleared by an administrator
 * account reset, so the demo is seeded EXACTLY ONCE, ever — a reset (which wipes
 * the per-user data tables) leaves the account empty rather than silently
 * re-seeding it. Every individual insert is additionally `ON CONFLICT DO
 * NOTHING`, so even a concurrent double-call can never duplicate a record.
 *
 * Scope & isolation: it is a hard no-op for every non-demo session.
 */

export type DemoSeedResult = { seeded: boolean }

let markEnsured = false
async function ensureMarkTable(): Promise<void> {
  if (markEnsured) return
  await query(
    `CREATE TABLE IF NOT EXISTS demo_seed_marks (
       user_id   text        PRIMARY KEY,
       seeded_at timestamptz NOT NULL DEFAULT now()
     )`,
  )
  markEnsured = true
}

/** True once a marker exists for the demo user (already seeded). */
async function alreadySeeded(userId: string): Promise<boolean> {
  await ensureMarkTable()
  const { rows } = await query(`SELECT 1 FROM demo_seed_marks WHERE user_id = $1`, [userId])
  return rows.length > 0
}

/** Map a kind's record into a seeded approval row. */
async function seedRecord(
  userId: string,
  kind: ApprovalKind,
  record: Record<string, unknown>,
  fields: {
    title: string
    summary: string
    amount: number | null
    currency: string | null
    /** DB lifecycle status; defaults to the record's own `status` field. */
    status?: "pending" | "approved" | "rejected"
  },
): Promise<void> {
  const recordStatus = String(record.status ?? "pending")
  const dbStatus =
    fields.status ??
    (recordStatus === "approved" || recordStatus === "active"
      ? "approved"
      : recordStatus === "rejected"
        ? "rejected"
        : "pending")
  await seedApproval({
    id: String(record.id),
    userId,
    kind,
    status: dbStatus,
    title: fields.title,
    summary: fields.summary,
    amount: fields.amount,
    currency: fields.currency,
    payload: { record },
    decidedAt: (record.decidedAt as string) ?? null,
    createdAt: (record.submittedAt as string) ?? null,
  })
}

/**
 * Seed the demo account's data into Neon, exactly once. Returns `{ seeded: true }`
 * only on the run that actually performed the seed (so the caller can refresh
 * the just-mounted providers). A no-op — `{ seeded: false }` — for any non-demo
 * session, when already seeded, or if the database is unavailable.
 */
export async function ensureDemoSeedServer(): Promise<DemoSeedResult> {
  const session = await resolveCurrentSession()
  if (!session) return { seeded: false }
  // Strictly the demo account (by its own id or its shared-data owner id).
  const isDemo = session.id === DEMO_USER_ID || session.dataOwnerId === DEMO_USER_ID
  if (!isDemo) return { seeded: false }

  try {
    if (await alreadySeeded(session.id)) return { seeded: false }

    // 1. Ledger — balances + transaction history live under the shared-data
    //    owner id (how getMyLedger reads them).
    const ledgerOwner = session.dataOwnerId || session.id
    for (const e of ledgerEntries()) {
      await upsertLedgerEntry(ledgerOwner, e as unknown as LedgerEntry)
    }

    // 2. Approval-backed sections — keyed by the session id (how the approvals
    //    backbone reads a client's own requests). Each carries its complete
    //    view-model in `payload.record`.
    for (const p of paymentRequests()) {
      await seedRecord(session.id, "payment", p, {
        title: `Payment to ${p.beneficiary}`,
        summary: `${p.currency} ${p.amount.toLocaleString("en-US")} to ${p.beneficiary}${p.reference ? ` · ${p.reference}` : ""}`,
        amount: p.total,
        currency: p.currency,
      })
    }
    for (const r of pppRequests()) {
      await seedRecord(session.id, "ppp", r, {
        title: r.programName,
        summary: `${r.currency} ${r.amount.toLocaleString("en-US")} · ${r.expectedReturn}`,
        amount: r.amount,
        currency: r.currency,
      })
    }
    for (const r of instruments()) {
      await seedRecord(session.id, "instrument", r, {
        title: `${r.typeFull} — ${r.issuer}`,
        summary: `${r.currency} ${r.faceValue.toLocaleString("en-US")} · ${r.type}`,
        amount: r.faceValue,
        currency: r.currency,
      })
    }
    for (const r of dofRequests()) {
      await seedRecord(session.id, "dof", r, {
        title: `Download of Funds — ${r.originatorName}`,
        summary: `${r.currency} ${r.amount.toLocaleString("en-US")} · ${r.purpose}`,
        amount: r.amount,
        currency: r.currency,
      })
    }
    // DTC + Euroclear settlements both historically lived in the DTC list.
    for (const r of dtcRequests()) {
      await seedRecord(session.id, "dtc", r, {
        title: `${r.depository} ${r.direction} — ${r.securityName}`,
        summary: `${r.currency} ${r.cashAmount.toLocaleString("en-US")} · ${r.settlementBasis}`,
        amount: r.cashAmount,
        currency: r.currency,
      })
    }
    for (const r of commodityDeals()) {
      await seedRecord(session.id, "commodity", r, {
        title: r.title,
        summary: `${r.currency} ${r.approxValue.toLocaleString("en-US")} · ${r.commodity}`,
        amount: r.approxValue,
        currency: r.currency,
      })
    }
    for (const r of leverageRequests()) {
      await seedRecord(session.id, "leverage", r, {
        title: `Leverage line — ${r.accountLabel}`,
        summary: `${r.currency} ${r.equity.toLocaleString("en-US")} equity · ${r.leverageRatio}x`,
        amount: r.equity,
        currency: r.currency,
      })
    }

    // 3. Beneficiaries — keyed by the session id (how listBeneficiariesForUser
    //    reads them); the full object is the JSONB payload.
    for (const b of demoBeneficiaries()) {
      await upsertBeneficiary(
        session.id,
        b.id,
        b as unknown as Record<string, unknown>,
        b.status,
      )
    }

    // 4. SKR records — administrator-owned, assigned to the demo client.
    await replaceSkrRecordsForUser(
      session.id,
      skrRecords().map((r) => ({
        id: r.id,
        data: r as unknown as Record<string, unknown>,
        status: r.status,
      })),
    )

    // Stamp the marker last, so a failure partway through is retried on the next
    // login rather than leaving a half-seeded account permanently marked done.
    await query(
      `INSERT INTO demo_seed_marks (user_id) VALUES ($1) ON CONFLICT (user_id) DO NOTHING`,
      [session.id],
    )

    return { seeded: true }
  } catch (err) {
    console.log("[v0] ensureDemoSeedServer failed:", (err as Error).message)
    return { seeded: false }
  }
}
