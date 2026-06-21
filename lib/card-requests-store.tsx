"use client"

import { createContext, useContext, useEffect, useState } from "react"
import { scopedKey } from "@/lib/user-scope"
import { mirrorSubmission } from "@/lib/approval-sync"
import { useApprovalReconcile } from "@/lib/use-approval-reconcile"

// ---------------------------------------------------------------------------
// Payment card lifecycle store.
//
// Mirrors the instrument store's architecture: a per-user localStorage read
// model that MIRRORS each request into the DB-backed approvals backbone (so the
// administrator can review/customize/approve cross-client) and RECONCILES the
// administrator's decision back here. Unlike instruments, an approved card may
// have been CUSTOMIZED by the administrator (network, tier, limit, features),
// so we also pull the finalized card from the approval payload and adopt it.
//
// After activation the client manages the card locally (spending limit,
// block/unblock, controls) — those edits live in this isolated, per-user store.
// ---------------------------------------------------------------------------

export type CardNetwork = "Visa" | "Mastercard"
export type CardTier = "standard" | "gold" | "platinum" | "signature" | "world_elite"
export type CardFormat = "physical" | "virtual"
export type CardStatus = "pending" | "active" | "blocked" | "rejected" | "cancelled"
export type CardVariant = "amber" | "dark" | "platinum"

export interface CardControls {
  online: boolean
  contactless: boolean
  atm: boolean
  international: boolean
}

export interface ClientCard {
  id: string
  /** DB approval id once mirrored, so admin decisions reconcile back. */
  approvalId?: string
  label: string
  holder: string
  network: CardNetwork
  tier: CardTier
  format: CardFormat
  last4: string
  expiry: string
  currency: string
  monthlyLimit: number
  monthlySpent: number
  status: CardStatus
  controls: CardControls
  features: string[]
  variant: CardVariant
  /** Client's requested values (kept for the audit/admin view). */
  requestedLimit?: number
  purpose?: string
  submittedAt?: string
  decidedAt?: string
  decisionNote?: string
}

export const TIER_LABELS: Record<CardTier, string> = {
  standard: "Standard",
  gold: "Gold",
  platinum: "Platinum",
  signature: "Signature",
  world_elite: "World Elite",
}

export const CARD_FEATURES = [
  "Airport lounge access",
  "24/7 concierge service",
  "Comprehensive travel insurance",
  "Purchase protection",
  "Premium metal card",
  "Elevated cashback rewards",
  "No foreign transaction fees",
  "Priority customer support",
] as const

export function tierVariant(tier: CardTier): CardVariant {
  if (tier === "platinum" || tier === "world_elite") return "platinum"
  if (tier === "gold" || tier === "signature") return "amber"
  return "dark"
}

export function defaultControls(): CardControls {
  return { online: true, contactless: true, atm: true, international: false }
}

/** Generate a stable-ish demo card id. */
export function genCardId(): string {
  const rand = Math.random().toString(36).slice(2, 7).toUpperCase()
  return `CARD-${Date.now().toString(36).toUpperCase()}-${rand}`
}

/** Random last-4 for the embossed number (demo issuance). */
export function genLast4(): string {
  return String(Math.floor(1000 + Math.random() * 9000))
}

/** Expiry four years out, formatted MM/YY. */
export function genExpiry(): string {
  const d = new Date()
  d.setFullYear(d.getFullYear() + 4)
  return `${String(d.getMonth() + 1).padStart(2, "0")}/${String(d.getFullYear()).slice(-2)}`
}

const KEY_BASE = "mcc.cards.v1"
const storageKey = () => scopedKey(KEY_BASE)

/** Normalize a possibly-partial stored/remote card into a complete ClientCard. */
function hydrateCard(raw: Partial<ClientCard> & { id: string }): ClientCard {
  const tier = (raw.tier as CardTier) ?? "standard"
  return {
    id: raw.id,
    approvalId: raw.approvalId,
    label: raw.label ?? `${raw.network ?? "Visa"} ${TIER_LABELS[tier]}`,
    holder: raw.holder ?? "",
    network: (raw.network as CardNetwork) ?? "Visa",
    tier,
    format: (raw.format as CardFormat) ?? "physical",
    last4: raw.last4 ?? genLast4(),
    expiry: raw.expiry ?? genExpiry(),
    currency: raw.currency ?? "EUR",
    monthlyLimit: Number(raw.monthlyLimit ?? 0),
    monthlySpent: Number(raw.monthlySpent ?? 0),
    status: (raw.status as CardStatus) ?? "pending",
    controls: { ...defaultControls(), ...(raw.controls ?? {}) },
    features: Array.isArray(raw.features) ? raw.features : [],
    variant: (raw.variant as CardVariant) ?? tierVariant(tier),
    requestedLimit: raw.requestedLimit,
    purpose: raw.purpose,
    submittedAt: raw.submittedAt,
    decidedAt: raw.decidedAt,
    decisionNote: raw.decisionNote,
  }
}

export interface NewCardRequest {
  holder: string
  network: CardNetwork
  tier: CardTier
  format: CardFormat
  currency: string
  requestedLimit: number
  purpose?: string
}

interface CardRequestsContextValue {
  cards: ClientCard[]
  /** Submit a new card request (status = pending) for administrator review. */
  requestCard: (req: NewCardRequest) => ClientCard
  /** Update a card's monthly spending limit (active cards only). */
  setLimit: (id: string, limit: number) => void
  /** Block (freeze) or unblock an active card. */
  setBlocked: (id: string, blocked: boolean) => void
  /** Toggle one of the card's usage controls. */
  setControl: (id: string, control: keyof CardControls, enabled: boolean) => void
  /** Cancel a still-pending request. */
  cancelRequest: (id: string) => void
  /** Remove a card/record from the wallet entirely. */
  deleteCard: (id: string) => void
  hydrated: boolean
}

const CardRequestsContext = createContext<CardRequestsContextValue | null>(null)

export function CardRequestsProvider({ children }: { children: React.ReactNode }) {
  const [cards, setCards] = useState<ClientCard[]>([])
  const [hydrated, setHydrated] = useState(false)

  // Load persisted cards once on mount.
  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(storageKey())
      const parsed = stored ? (JSON.parse(stored) as (Partial<ClientCard> & { id: string })[]) : []
      setCards(parsed.map(hydrateCard))
    } catch {
      setCards([])
    }
    setHydrated(true)
  }, [])

  // Persist after hydration.
  useEffect(() => {
    if (!hydrated) return
    try {
      window.localStorage.setItem(storageKey(), JSON.stringify(cards))
    } catch {
      // ignore quota/availability errors
    }
  }, [cards, hydrated])

  // Cross-tab / cross-window sync.
  useEffect(() => {
    if (!hydrated) return
    const resync = () => {
      try {
        const stored = window.localStorage.getItem(storageKey())
        const parsed = stored ? (JSON.parse(stored) as (Partial<ClientCard> & { id: string })[]) : []
        setCards(parsed.map(hydrateCard))
      } catch {
        // ignore
      }
    }
    const onStorage = (e: StorageEvent) => {
      if (e.key === storageKey()) resync()
    }
    const onVisible = () => {
      if (document.visibilityState === "visible") resync()
    }
    window.addEventListener("storage", onStorage)
    document.addEventListener("visibilitychange", onVisible)
    return () => {
      window.removeEventListener("storage", onStorage)
      document.removeEventListener("visibilitychange", onVisible)
    }
  }, [hydrated])

  // Reconcile administrator REJECTIONS back into local records. Approvals are
  // handled by the payload poll below (so customized fields are adopted), so we
  // intentionally leave the approved mapping pointing at "pending" — the poll
  // flips it to active with the finalized card.
  useApprovalReconcile("card", hydrated, cards, setCards, undefined, {
    approvedStatus: "pending",
    rejectedStatus: "rejected",
  })

  // Pull administrator decisions on card approvals and adopt the FINALIZED card
  // from the payload. Handles both client-originated requests that were approved
  // (possibly customized) and admin-issued cards (cross-device, brand-new).
  useEffect(() => {
    if (!hydrated) return
    let cancelled = false
    const pull = async () => {
      try {
        const res = await fetch("/api/approvals?kind=card")
        if (!res.ok) return
        const data = (await res.json()) as {
          ok: boolean
          items: {
            id: string
            status: string
            decidedAt?: string
            payload?: Record<string, unknown>
          }[]
        }
        const approved = (data.items ?? []).filter(
          (it) => it.status === "approved" && !!(it.payload as { card?: unknown })?.card,
        )
        if (!approved.length || cancelled) return
        setCards((prev) => {
          let changed = false
          const byApprovalId = new Map(prev.filter((c) => c.approvalId).map((c) => [c.approvalId!, c]))
          const next = [...prev]
          for (const it of approved) {
            const finalCard = (it.payload as { card?: Partial<ClientCard> & { id: string } }).card
            if (!finalCard?.id) continue
            const existing = byApprovalId.get(it.id)
            if (existing) {
              // Only adopt while still pending locally so we never clobber the
              // client's own post-activation management edits.
              if (existing.status !== "pending") continue
              const idx = next.findIndex((c) => c.id === existing.id)
              if (idx === -1) continue
              next[idx] = hydrateCard({
                ...finalCard,
                approvalId: it.id,
                holder: finalCard.holder || existing.holder,
                status: "active",
                decidedAt: it.decidedAt ?? new Date().toISOString(),
              })
              changed = true
            } else if (!next.some((c) => c.id === finalCard.id)) {
              // Admin-issued (or another device): adopt as a brand-new active card.
              next.unshift(
                hydrateCard({
                  ...finalCard,
                  approvalId: it.id,
                  status: "active",
                  decidedAt: it.decidedAt ?? new Date().toISOString(),
                }),
              )
              changed = true
            }
          }
          return changed ? next : prev
        })
      } catch {
        // ignore — the next poll retries
      }
    }
    void pull()
    const id = setInterval(pull, 30000)
    return () => {
      cancelled = true
      clearInterval(id)
    }
  }, [hydrated])

  const requestCard: CardRequestsContextValue["requestCard"] = (req) => {
    const tier = req.tier
    const card: ClientCard = hydrateCard({
      id: genCardId(),
      holder: req.holder,
      network: req.network,
      tier,
      format: req.format,
      currency: req.currency,
      monthlyLimit: req.requestedLimit,
      requestedLimit: req.requestedLimit,
      purpose: req.purpose,
      status: "pending",
      label: `${req.network} ${TIER_LABELS[tier]}`,
      variant: tierVariant(tier),
      submittedAt: new Date().toISOString(),
    })
    setCards((prev) => [card, ...prev])
    // Mirror into the DB so the administrator can review/customize cross-client.
    void mirrorSubmission({
      kind: "card",
      title: `${card.label} card`,
      summary: `${card.network} ${TIER_LABELS[tier]} ${card.format} card requested with a ${card.currency} ${card.requestedLimit?.toLocaleString("en-US")} monthly limit${card.purpose ? ` (${card.purpose})` : ""}.`,
      amount: card.requestedLimit ?? null,
      currency: card.currency,
      payload: { card: { ...card } },
    }).then((approvalId) => {
      if (!approvalId) return
      setCards((prev) => prev.map((c) => (c.id === card.id ? { ...c, approvalId } : c)))
    })
    return card
  }

  const setLimit: CardRequestsContextValue["setLimit"] = (id, limit) => {
    setCards((prev) => prev.map((c) => (c.id === id ? { ...c, monthlyLimit: Math.max(0, limit) } : c)))
  }

  const setBlocked: CardRequestsContextValue["setBlocked"] = (id, blocked) => {
    setCards((prev) =>
      prev.map((c) => {
        if (c.id !== id) return c
        if (blocked && c.status === "active") return { ...c, status: "blocked" }
        if (!blocked && c.status === "blocked") return { ...c, status: "active" }
        return c
      }),
    )
  }

  const setControl: CardRequestsContextValue["setControl"] = (id, control, enabled) => {
    setCards((prev) =>
      prev.map((c) => (c.id === id ? { ...c, controls: { ...c.controls, [control]: enabled } } : c)),
    )
  }

  const cancelRequest: CardRequestsContextValue["cancelRequest"] = (id) => {
    setCards((prev) => prev.map((c) => (c.id === id && c.status === "pending" ? { ...c, status: "cancelled" } : c)))
  }

  const deleteCard: CardRequestsContextValue["deleteCard"] = (id) => {
    setCards((prev) => prev.filter((c) => c.id !== id))
  }

  return (
    <CardRequestsContext.Provider
      value={{
        cards,
        requestCard,
        setLimit,
        setBlocked,
        setControl,
        cancelRequest,
        deleteCard,
        hydrated,
      }}
    >
      {children}
    </CardRequestsContext.Provider>
  )
}

export function useCardRequests() {
  const ctx = useContext(CardRequestsContext)
  if (!ctx) {
    throw new Error("useCardRequests must be used within a CardRequestsProvider")
  }
  return ctx
}
