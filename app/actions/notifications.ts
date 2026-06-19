"use server"

import { resolveCurrentSession } from "@/lib/session-user"
import {
  listNotificationsForUser,
  countUnreadForUser,
  markNotificationsRead,
  type NotificationRecord,
} from "@/lib/notifications-db"

export interface NotificationsSnapshot {
  items: NotificationRecord[]
  unread: number
}

/** The signed-in user's most recent notifications + unread count. */
export async function getMyNotifications(): Promise<NotificationsSnapshot> {
  const session = await resolveCurrentSession()
  if (!session) return { items: [], unread: 0 }
  try {
    const [items, unread] = await Promise.all([
      listNotificationsForUser(session.id),
      countUnreadForUser(session.id),
    ])
    return { items, unread }
  } catch (err) {
    console.log("[v0] getMyNotifications failed:", (err as Error).message)
    return { items: [], unread: 0 }
  }
}

/** Mark some (or all) of the user's notifications read. */
export async function markMyNotificationsRead(ids?: string[]): Promise<{ ok: boolean }> {
  const session = await resolveCurrentSession()
  if (!session) return { ok: false }
  try {
    await markNotificationsRead(session.id, ids)
    return { ok: true }
  } catch (err) {
    console.log("[v0] markMyNotificationsRead failed:", (err as Error).message)
    return { ok: false }
  }
}
