"use server"

// ---------------------------------------------------------------------------
// Bankeka (Bank Messenger) — Server Actions.
//
// Two audiences share this module:
//  - Clients (customers & staff) use the session-scoped actions. Identity is
//    resolved from the authoritative httpOnly session cookie, NEVER from a
//    client-supplied id, so a user can only ever read/write their own threads.
//  - The administrator console uses the passcode-gated `admin*` actions, which
//    operate strictly as the reserved MCC Capital administration participant and
//    therefore can only see threads that participant is part of.
//
// Privacy guarantee: a thread read is always constrained to the exact pair of
// participants (see lib/bankeka-db.ts), so no third party can observe a
// conversation they are not in.
// ---------------------------------------------------------------------------

import { resolveCurrentSession } from "@/lib/session-user"
import { getDynamicUserById, listDynamicUsers } from "@/lib/admin-users-db"
import { ADMIN_PASSCODE } from "@/lib/admin-config"
import { logActivity } from "@/app/actions/log-activity"
import {
  insertMessage,
  markThreadRead,
  markAllDelivered,
  getThreadMessages,
  getUnreadCount,
  getMessagesForParticipant,
  recordAudit,
  listAudit,
  type MessageRow,
} from "@/lib/bankeka-db"
import {
  BANKEKA_ADMIN_ID,
  BANKEKA_ADMIN_LABEL,
  BANKEKA_ADMIN_INITIALS,
  type BankekaMessage,
  type BankekaParticipant,
  type BankekaConversation,
  type BankekaAuditEntry,
  type MessageStatus,
} from "@/lib/bankeka-shared"

const MAX_BODY = 4000

// --- Identity helpers ------------------------------------------------------

const adminParticipant: BankekaParticipant = {
  id: BANKEKA_ADMIN_ID,
  name: BANKEKA_ADMIN_LABEL,
  company: "MCC Capital",
  initials: BANKEKA_ADMIN_INITIALS,
  isAdmin: true,
}

async function resolveParticipant(id: string): Promise<BankekaParticipant> {
  if (id === BANKEKA_ADMIN_ID) return adminParticipant
  try {
    const rec = await getDynamicUserById(id)
    if (rec) {
      return {
        id,
        name: rec.profile.fullName || rec.profile.shortName || rec.email,
        company: rec.profile.company || "",
        initials: rec.profile.initials || rec.email.slice(0, 2).toUpperCase(),
        isAdmin: false,
      }
    }
  } catch {
    // fall through to placeholder
  }
  return { id, name: "Unknown account", company: "", initials: "??", isAdmin: false }
}

function statusOf(row: MessageRow): MessageStatus {
  if (row.readAt) return "read"
  if (row.deliveredAt) return "delivered"
  return "sent"
}

function toMessage(row: MessageRow, viewerId: string): BankekaMessage {
  return {
    id: row.id,
    senderId: row.senderId,
    recipientId: row.recipientId,
    body: row.body,
    kind: row.kind,
    createdAt: row.createdAt,
    outgoing: row.senderId === viewerId,
    status: statusOf(row),
  }
}

async function requireSessionId(): Promise<string | null> {
  const session = await resolveCurrentSession()
  return session?.id ?? null
}

// --- Conversation building (shared between client & admin) -----------------

async function buildConversations(viewerId: string): Promise<BankekaConversation[]> {
  const rows = await getMessagesForParticipant(viewerId)

  // Group by counterpart; rows arrive newest-first so the first row per
  // counterpart is the latest message.
  const byCounterpart = new Map<string, { last: MessageRow; unread: number }>()
  for (const row of rows) {
    const counterpart = row.senderId === viewerId ? row.recipientId : row.senderId
    const entry = byCounterpart.get(counterpart)
    const isUnread = row.recipientId === viewerId && !row.readAt
    if (!entry) {
      byCounterpart.set(counterpart, { last: row, unread: isUnread ? 1 : 0 })
    } else if (isUnread) {
      entry.unread += 1
    }
  }

  const conversations = await Promise.all(
    Array.from(byCounterpart.entries()).map(async ([counterpart, { last, unread }]) => {
      const participant = await resolveParticipant(counterpart)
      const conv: BankekaConversation = {
        participant,
        lastMessage: last.body,
        lastMessageAt: last.createdAt,
        lastOutgoing: last.senderId === viewerId,
        lastStatus: statusOf(last),
        unread,
      }
      return conv
    }),
  )

  conversations.sort((a, b) => new Date(b.lastMessageAt).getTime() - new Date(a.lastMessageAt).getTime())
  return conversations
}

// --- Client (session-scoped) actions ---------------------------------------

export interface ThreadResult {
  participant: BankekaParticipant
  messages: BankekaMessage[]
}

/** The signed-in user's conversation list (newest first). */
export async function listConversations(): Promise<BankekaConversation[]> {
  const me = await requireSessionId()
  if (!me) return []
  try {
    await markAllDelivered(me)
    return await buildConversations(me)
  } catch {
    return []
  }
}

/** Open a private thread with `otherId`; marks incoming messages as read. */
export async function getThread(otherId: string): Promise<ThreadResult | null> {
  const me = await requireSessionId()
  if (!me || !otherId || otherId === me) return null
  try {
    await markThreadRead(me, otherId)
    const rows = await getThreadMessages(me, otherId)
    const participant = await resolveParticipant(otherId)
    return { participant, messages: rows.map((r) => toMessage(r, me)) }
  } catch {
    return null
  }
}

export type SendResult = { ok: true; message: BankekaMessage } | { ok: false; error: string }

/** Send a private message from the signed-in user to `otherId`. */
export async function sendMessage(otherId: string, body: string): Promise<SendResult> {
  const me = await requireSessionId()
  if (!me) return { ok: false, error: "Your session has expired. Please sign in again." }
  const trimmed = (body ?? "").trim()
  if (!trimmed) return { ok: false, error: "Message cannot be empty." }
  if (trimmed.length > MAX_BODY) return { ok: false, error: "Message is too long." }
  if (!otherId || otherId === me) return { ok: false, error: "Invalid recipient." }

  try {
    // Confirm the recipient exists & is reachable (a real account or the admin).
    const recipient = await resolveParticipant(otherId)
    if (recipient.name === "Unknown account") {
      return { ok: false, error: "Recipient not found." }
    }
    const row = await insertMessage({ senderId: me, recipientId: otherId, body: trimmed })
    const sender = await resolveParticipant(me)
    await recordAudit({
      actorId: me,
      actorLabel: `${sender.name}${sender.company ? ` (${sender.company})` : ""}`,
      action: otherId === BANKEKA_ADMIN_ID ? "reply" : "message",
      recipientId: otherId,
      recipientLabel: `${recipient.name}${recipient.company ? ` (${recipient.company})` : ""}`,
      messageId: row.id,
      charCount: trimmed.length,
    })
    return { ok: true, message: toMessage(row, me) }
  } catch {
    return { ok: false, error: "Could not send the message. Please try again." }
  }
}

/** Total unread count for the signed-in user (header badge + dashboard tile). */
export async function getMyUnreadCount(): Promise<number> {
  const me = await requireSessionId()
  if (!me) return 0
  try {
    await markAllDelivered(me)
    return await getUnreadCount(me)
  } catch {
    return 0
  }
}

/**
 * The directory of contacts the signed-in user can start a conversation with:
 * every other active account, plus the pinned MCC Capital administration
 * contact. Secrets-free.
 */
export async function listContacts(): Promise<BankekaParticipant[]> {
  const me = await requireSessionId()
  if (!me) return []
  try {
    const users = (await listDynamicUsers())
      .filter((u) => u.status === "active" && u.id !== me)
      .map<BankekaParticipant>((u) => ({
        id: u.id,
        name: u.profile.fullName || u.profile.shortName || u.email,
        company: u.profile.company || "",
        initials: u.profile.initials || u.email.slice(0, 2).toUpperCase(),
        isAdmin: false,
      }))
    users.sort((a, b) => a.name.localeCompare(b.name))
    // Pin the administration contact to the top so support is always reachable.
    return [adminParticipant, ...users]
  } catch {
    return []
  }
}

// --- Administrator (passcode-gated) actions --------------------------------

function adminOk(passcode: string): boolean {
  return String(passcode) === ADMIN_PASSCODE
}

export type BroadcastResult = { ok: true; delivered: number } | { ok: false; error: string }

/**
 * Publish an administrator message to one, several, or all active clients. Each
 * recipient receives a private message from the MCC Capital administration
 * participant — they cannot see who else received it.
 */
export async function adminBroadcast(
  passcode: string,
  target: "all" | string[],
  body: string,
): Promise<BroadcastResult> {
  if (!adminOk(passcode)) return { ok: false, error: "Administrator authorization failed." }
  const trimmed = (body ?? "").trim()
  if (!trimmed) return { ok: false, error: "Message cannot be empty." }
  if (trimmed.length > MAX_BODY) return { ok: false, error: "Message is too long." }

  try {
    const all = (await listDynamicUsers()).filter((u) => u.status === "active")
    const recipients =
      target === "all" ? all.map((u) => u.id) : all.filter((u) => target.includes(u.id)).map((u) => u.id)
    if (recipients.length === 0) return { ok: false, error: "No active recipients selected." }

    const broadcastId = `bcast_${Date.now().toString(36)}`
    for (const rid of recipients) {
      const row = await insertMessage({
        senderId: BANKEKA_ADMIN_ID,
        recipientId: rid,
        body: trimmed,
        kind: "broadcast",
        broadcastId,
      })
      await recordAudit({
        actorId: BANKEKA_ADMIN_ID,
        actorLabel: BANKEKA_ADMIN_LABEL,
        action: "broadcast",
        recipientId: rid,
        recipientLabel: (await resolveParticipant(rid)).name,
        messageId: row.id,
        charCount: trimmed.length,
      })
    }

    // A single audit-trail email for the whole broadcast (no per-recipient spam).
    await logActivity({
      action: `Administrator broadcast a Bankeka message to ${recipients.length} client${recipients.length === 1 ? "" : "s"}`,
      category: "Administration",
      details: {
        summary: `Administrator published a Bankeka broadcast to ${recipients.length} active client${recipients.length === 1 ? "" : "s"} (${target === "all" ? "all clients" : "selected clients"}).`,
        recipients: String(recipients.length),
        characters: String(trimmed.length),
      },
    })

    return { ok: true, delivered: recipients.length }
  } catch {
    return { ok: false, error: "Broadcast failed. Please try again." }
  }
}

/** Admin inbox: conversations where the administration participant is involved. */
export async function adminListConversations(passcode: string): Promise<BankekaConversation[]> {
  if (!adminOk(passcode)) return []
  try {
    await markAllDelivered(BANKEKA_ADMIN_ID)
    return await buildConversations(BANKEKA_ADMIN_ID)
  } catch {
    return []
  }
}

/** Admin opens a thread with a specific client; marks incoming as read. */
export async function adminGetThread(passcode: string, otherId: string): Promise<ThreadResult | null> {
  if (!adminOk(passcode) || !otherId) return null
  try {
    await markThreadRead(BANKEKA_ADMIN_ID, otherId)
    const rows = await getThreadMessages(BANKEKA_ADMIN_ID, otherId)
    const participant = await resolveParticipant(otherId)
    return { participant, messages: rows.map((r) => toMessage(r, BANKEKA_ADMIN_ID)) }
  } catch {
    return null
  }
}

/** Admin replies to a client inside an existing admin thread. */
export async function adminReply(passcode: string, otherId: string, body: string): Promise<SendResult> {
  if (!adminOk(passcode)) return { ok: false, error: "Administrator authorization failed." }
  const trimmed = (body ?? "").trim()
  if (!trimmed) return { ok: false, error: "Message cannot be empty." }
  if (trimmed.length > MAX_BODY) return { ok: false, error: "Message is too long." }
  if (!otherId) return { ok: false, error: "Invalid recipient." }
  try {
    const row = await insertMessage({ senderId: BANKEKA_ADMIN_ID, recipientId: otherId, body: trimmed })
    await recordAudit({
      actorId: BANKEKA_ADMIN_ID,
      actorLabel: BANKEKA_ADMIN_LABEL,
      action: "reply",
      recipientId: otherId,
      recipientLabel: (await resolveParticipant(otherId)).name,
      messageId: row.id,
      charCount: trimmed.length,
    })
    return { ok: true, message: toMessage(row, BANKEKA_ADMIN_ID) }
  } catch {
    return { ok: false, error: "Could not send the reply. Please try again." }
  }
}

/** Unread count for the administration inbox (admin console badge). */
export async function adminUnreadCount(passcode: string): Promise<number> {
  if (!adminOk(passcode)) return 0
  try {
    await markAllDelivered(BANKEKA_ADMIN_ID)
    return await getUnreadCount(BANKEKA_ADMIN_ID)
  } catch {
    return 0
  }
}

/** The compliance audit trail (metadata only — never message bodies). */
export async function adminListAudit(passcode: string): Promise<BankekaAuditEntry[]> {
  if (!adminOk(passcode)) return []
  try {
    const rows = await listAudit(300)
    return rows.map((r) => ({
      id: r.id,
      actorLabel: r.actorLabel,
      action: r.action,
      recipientLabel: r.recipientLabel,
      charCount: r.charCount,
      createdAt: r.createdAt,
    }))
  } catch {
    return []
  }
}
