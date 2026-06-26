"use server"

import type { UIMessage } from "ai"
import { resolveCurrentSession } from "@/lib/session-user"
import {
  listNqaiThreads,
  loadNqaiThread,
  deleteNqaiThread,
  type NqaiThreadSummary,
} from "@/lib/nqai-chat-db"
import { getNqaiUserSnapshot } from "@/lib/nqai-user-context"
import { buildPersonalGreeting } from "@/lib/nqai-greeting"

export interface NqaiBootstrap {
  /** A personalized one-line briefing shown under the canonical welcome. */
  greeting: string
  /** The user's stored conversation threads (metadata for the history panel). */
  threads: NqaiThreadSummary[]
}

/**
 * Load everything the NQAi client needs on mount for the signed-in user. The
 * console ALWAYS opens clean (just the welcome) — so we return a personalized
 * greeting plus the list of past threads for the history panel, but never seed
 * the live transcript. The user explicitly opens a thread to continue it.
 */
export async function bootstrapNqai(): Promise<NqaiBootstrap> {
  try {
    const session = await resolveCurrentSession()
    if (!session) return { greeting: "", threads: [] }

    const [threads, snapshot] = await Promise.all([
      listNqaiThreads(session.id).catch(() => [] as NqaiThreadSummary[]),
      getNqaiUserSnapshot().catch(() => null),
    ])

    return {
      greeting: buildPersonalGreeting(snapshot, threads.length > 0),
      threads,
    }
  } catch {
    return { greeting: "", threads: [] }
  }
}

/** Re-fetch the signed-in user's thread list (for refreshing the history panel). */
export async function listNqaiThreadsAction(): Promise<NqaiThreadSummary[]> {
  try {
    const session = await resolveCurrentSession()
    if (!session) return []
    return await listNqaiThreads(session.id)
  } catch {
    return []
  }
}

/** Load a single thread's transcript so the client can switch into it. */
export async function loadNqaiThreadAction(
  threadId: string,
): Promise<{ ok: boolean; messages: UIMessage[]; title: string }> {
  try {
    const session = await resolveCurrentSession()
    if (!session) return { ok: false, messages: [], title: "" }
    const thread = await loadNqaiThread(session.id, threadId)
    if (!thread) return { ok: false, messages: [], title: "" }
    return { ok: true, messages: thread.messages, title: thread.title }
  } catch {
    return { ok: false, messages: [], title: "" }
  }
}

/** Permanently delete one of the signed-in user's threads. */
export async function deleteNqaiThreadAction(threadId: string): Promise<{ ok: boolean }> {
  try {
    const session = await resolveCurrentSession()
    if (!session) return { ok: false }
    await deleteNqaiThread(session.id, threadId)
    return { ok: true }
  } catch {
    return { ok: false }
  }
}
