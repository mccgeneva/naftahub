import type { NqaiUserSnapshot } from "@/lib/nqai-user-context"

/**
 * Compose a short, personalized briefing line shown beneath the canonical NQAi
 * welcome message. Deterministic (no model call) so the page renders instantly.
 * Returns "" when there is no snapshot, leaving the fixed welcome untouched.
 */
export function buildPersonalGreeting(snap: NqaiUserSnapshot | null, returning: boolean): string {
  if (!snap) return ""

  const hour = new Date().toLocaleString("en-US", { timeZone: "UTC", hour: "2-digit", hour12: false })
  const h = Number(hour)
  const partOfDay = h < 12 ? "morning" : h < 18 ? "afternoon" : "evening"

  const parts: string[] = []
  parts.push(
    `Good ${partOfDay}, ${snap.firstName}${returning ? " — welcome back" : ""}. I have your ${snap.company} desk loaded.`,
  )

  const flags: string[] = []

  if (!snap.kycComplete) {
    flags.push("your KYC verification is incomplete — I can walk you through completing it")
  }

  const balKeys = Object.keys(snap.balances)
  if (balKeys.length) {
    const top = balKeys
      .map((c) => ({ c, v: snap.balances[c] }))
      .sort((a, b) => Math.abs(b.v) - Math.abs(a.v))[0]
    flags.push(
      `available balance ${top.v.toLocaleString("en-US", { maximumFractionDigits: 0 })} ${top.c}`,
    )
  }

  if (snap.skrPendingCount > 0) {
    flags.push(`${snap.skrPendingCount} SKR instrument${snap.skrPendingCount > 1 ? "s" : ""} pending review`)
  }

  if (snap.unreadNotifications > 0) {
    flags.push(`${snap.unreadNotifications} unread alert${snap.unreadNotifications > 1 ? "s" : ""}`)
  }

  if (flags.length) {
    parts.push(`At a glance: ${flags.join("; ")}. How can I assist?`)
  } else {
    parts.push("Everything on your account looks in order. How can I assist today?")
  }

  return parts.join(" ")
}
