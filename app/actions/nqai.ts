"use server"

import type { UIMessage } from "ai"
import { resolveCurrentSession } from "@/lib/session-user"
import { loadNqaiChat, clearNqaiChat } from "@/lib/nqai-chat-db"
import { getNqaiUserSnapshot } from "@/lib/nqai-user-context"
import { buildPersonalGreeting } from "@/lib/nqai-greeting"

export interface NqaiBootstrap {
  /** Prior conversation transcript, reloaded so the chat continues. */
  messages: UIMessage[]
  /** A personalized one-line briefing shown under the canonical welcome. */
  greeting: string
  /** Whether this user already had a stored conversation. */
  returning: boolean
}

/**
 * Load everything the NQAi client needs on mount for the signed-in user:
 * their prior transcript (session continuity) and a personalized greeting.
 * Best-effort — any failure degrades to an empty, non-personalized state.
 */
export async function bootstrapNqai(): Promise<NqaiBootstrap> {
  try {
    const session = await resolveCurrentSession()
    if (!session) return { messages: [], greeting: "", returning: false }

    const [stored, snapshot] = await Promise.all([
      loadNqaiChat(session.id).catch(() => ({ messages: [], summary: "", updatedAt: null })),
      getNqaiUserSnapshot().catch(() => null),
    ])

    return {
      messages: stored.messages ?? [],
      greeting: buildPersonalGreeting(snapshot, Boolean(stored.updatedAt)),
      returning: Boolean(stored.updatedAt),
    }
  } catch {
    return { messages: [], greeting: "", returning: false }
  }
}

/** Start a fresh conversation: wipe stored transcript + rolling memory. */
export async function resetNqaiConversation(): Promise<{ ok: boolean }> {
  try {
    const session = await resolveCurrentSession()
    if (!session) return { ok: false }
    await clearNqaiChat(session.id)
    return { ok: true }
  } catch {
    return { ok: false }
  }
}
