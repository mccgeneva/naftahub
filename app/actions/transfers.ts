"use server"

import { cookies } from "next/headers"
import { pool } from "@/lib/db"
import { SESSION_COOKIE } from "@/lib/auth"
import { getUserBySessionToken, findUserByEmail, type UserProfile } from "@/lib/users"
import { logActivity } from "@/app/actions/log-activity"

export interface TransferRecord {
  id: string
  direction: "credit" | "debit" // relative to the viewing user
  counterpartyName: string
  counterpartyEmail: string
  amount: number
  currency: string
  note: string | null
  createdAt: string
}

export type SendTransferResult =
  | { ok: true; transfer: TransferRecord }
  | { ok: false; error: string }

// Securely resolve the signed-in user from the httpOnly session cookie. The
// sender is NEVER taken from client input — only from the verified session.
async function getSessionUser(): Promise<UserProfile | undefined> {
  const cookieStore = await cookies()
  const token = cookieStore.get(SESSION_COOKIE)?.value
  return getUserBySessionToken(token)
}

function genId(): string {
  // Reference style consistent with the rest of the platform (e.g. "PPY…").
  const n = Math.floor(1000000 + Math.random() * 9000000)
  return `P2P${n}`
}

/**
 * Send an instant internal transfer to another platform user, identified by
 * their registered email address. The amount is debited from the sender and
 * credited to the recipient in a single atomic row that both parties can read.
 */
export async function sendTransfer(input: {
  recipientEmail: string
  amount: number
  currency: string
  note?: string
}): Promise<SendTransferResult> {
  const sender = await getSessionUser()
  if (!sender) return { ok: false, error: "Your session has expired. Please sign in again." }

  const recipientEmail = String(input.recipientEmail || "").trim().toLowerCase()
  const amount = Number(input.amount)
  const currency = String(input.currency || "").trim().toUpperCase()
  const note = input.note?.toString().trim() || null

  if (!recipientEmail) return { ok: false, error: "Enter the recipient's email address." }
  if (!Number.isFinite(amount) || amount <= 0) return { ok: false, error: "Enter a valid amount greater than zero." }
  if (!currency) return { ok: false, error: "Select a currency." }

  const recipient = findUserByEmail(recipientEmail)
  if (!recipient) {
    return { ok: false, error: "No account is registered with that email address." }
  }
  if (recipient.id === sender.id) {
    return { ok: false, error: "You cannot send a transfer to your own account." }
  }

  const id = genId()
  const createdAt = new Date().toISOString()

  try {
    await pool.query(
      `INSERT INTO p2p_transfers
        (id, sender_id, sender_email, sender_name, recipient_id, recipient_email, recipient_name, amount, currency, note, created_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
      [
        id,
        sender.id,
        sender.email.toLowerCase(),
        sender.fullName,
        recipient.id,
        recipient.email.toLowerCase(),
        recipient.fullName,
        amount,
        currency,
        note,
        createdAt,
      ],
    )
  } catch (err) {
    console.log("[v0] sendTransfer insert failed:", (err as Error).message)
    return { ok: false, error: "The transfer could not be completed. Please try again." }
  }

  await logActivity({
    action: "P2P transfer sent",
    category: "Transfers",
    user: `${sender.fullName} (${sender.company})`,
    details: {
      reference: id,
      to: `${recipient.fullName} <${recipient.email}>`,
      amount: `${amount.toFixed(2)} ${currency}`,
      note: note ?? "(none)",
    },
  })

  return {
    ok: true,
    transfer: {
      id,
      direction: "debit",
      counterpartyName: recipient.fullName,
      counterpartyEmail: recipient.email,
      amount,
      currency,
      note,
      createdAt,
    },
  }
}

/**
 * Return every transfer involving the signed-in user (sent or received),
 * normalised so the caller sees a direction relative to themselves: money they
 * received is a "credit", money they sent is a "debit".
 */
export async function getMyTransfers(): Promise<TransferRecord[]> {
  const user = await getSessionUser()
  if (!user) return []

  try {
    const { rows } = await pool.query(
      `SELECT id, sender_id, sender_name, sender_email, recipient_id, recipient_name, recipient_email,
              amount, currency, note, created_at
         FROM p2p_transfers
        WHERE sender_id = $1 OR recipient_id = $1
        ORDER BY created_at DESC`,
      [user.id],
    )

    return rows.map((r): TransferRecord => {
      const isRecipient = r.recipient_id === user.id
      return {
        id: r.id,
        direction: isRecipient ? "credit" : "debit",
        counterpartyName: isRecipient ? r.sender_name : r.recipient_name,
        counterpartyEmail: isRecipient ? r.sender_email : r.recipient_email,
        amount: Number(r.amount),
        currency: r.currency,
        note: r.note,
        createdAt: new Date(r.created_at).toISOString(),
      }
    })
  } catch (err) {
    console.log("[v0] getMyTransfers query failed:", (err as Error).message)
    return []
  }
}
