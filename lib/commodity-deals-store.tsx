"use client"

import { createContext, useContext, useEffect, useRef, useState } from "react"
import { generateUetr } from "@/lib/swift-gpi"
import { scopedKey } from "@/lib/user-scope"
import { mirrorSubmission } from "@/lib/approval-sync"
import { useApprovalReconcile } from "@/lib/use-approval-reconcile"
import { useLedger } from "@/lib/ledger-store"
import { revokeMyCommodityDeal } from "@/app/actions/approvals"

export type DealStatus = "pending" | "approved" | "rejected" | "cancelled"

// Standard professional commodity-trading sequence. The client advances through
// the pre-execution stages as the deal progresses; only the Administrator can
// move a deal to "execution" (by approving it) — no automatic customer execution.
export type DealStage = "icpo" | "fco" | "contract" | "pop" | "pof" | "execution"

export const DEAL_STAGES: { key: DealStage; label: string; description: string }[] = [
  { key: "icpo", label: "ICPO", description: "Buyer submits Irrevocable Corporate Purchase Order" },
  { key: "fco", label: "FCO", description: "Seller issues Full Corporate Offer & contract draft" },
  { key: "contract", label: "Contract", description: "Signed contract exchange between parties" },
  { key: "pop", label: "POP", description: "Seller submits Proof of Product documents" },
  { key: "pof", label: "POF", description: "Buyer submits Proof of Funds / banking instrument" },
  { key: "execution", label: "Execution", description: "Admin-authorized execution / shipment" },
]

// Commodity transaction structures.
export type TradeStructure = "FOB" | "CIF" | "Spot" | "Long-term"

// Specialized transaction categories supported by the desk.
export type DealCategory =
  | "Commodity Trade"
  | "Download of Funds"
  | "DTC/IP Transfer"
  | "Bank Instrument Monetization"

// Instrument backing the value of the deal.
export type InstrumentType = "Cash" | "SBLC" | "BG" | "Securities" | "Commodity" | "DLC"

export type DocModule = "POP" | "POF"

export type DocStatus = "submitted" | "verified" | "rejected"

// A single immutable version of a document record (metadata only — no binaries).
export interface DealDocumentVersion {
  version: number
  fileName: string // descriptive file name, e.g. "BL-2024-0042.pdf"
  reference: string // document reference / number
  issuedBy: string // issuing bank / authority / inspector
  issueDate: string // ISO yyyy-mm-dd
  notes: string
  uploadedAt: string // ISO timestamp
}

export interface DealDocument {
  id: string
  module: DocModule // POP (seller) or POF (buyer)
  docType: string // e.g. "Bill of Lading", "Bank Comfort Letter (BCL)"
  status: DocStatus
  currentVersion: number
  versions: DealDocumentVersion[]
  // SWIFT reference where relevant (e.g. MT799 pre-advice for POF instruments).
  swiftRef?: string
  decidedAt?: string
  decisionNote?: string
}

export interface CommodityDeal {
  id: string // platform reference, e.g. "DEAL-1A2B3C4D"
  /** DB approval id once mirrored, so admin decisions can be reconciled back. */
  approvalId?: string
  uetr: string // SWIFT gpi Unique End-to-End Transaction Reference (UUID v4)

  // Deal identity
  title: string
  category: DealCategory
  tradeStructure: TradeStructure
  commodity: string
  quantity: string // free-form, e.g. "100,000 MT" / "2,000,000 BBL"
  approxValue: number
  currency: string

  // Parties
  buyerName: string
  sellerName: string

  // Banking / transaction context
  sendingBank: string
  sendingBankBic: string
  receivingBank: string
  receivingBankBic: string
  instrumentType: InstrumentType
  originCountry: string
  destinationCountry: string

  // SWIFT message references
  mt103Ref: string // MT103 single customer credit transfer
  mt202Ref: string // MT202 / MT202 COV financial institution transfer
  mt799Ref: string // MT799 free-format / pre-advice

  notes: string

  // Workflow
  stage: DealStage
  status: DealStatus

  // Embedded document records (POP + POF)
  documents: DealDocument[]

  submittedAt: string
  decidedAt?: string
  decisionNote?: string
  // Ledger entry created when the deal is authorized for execution (proceeds credited).
  settledEntryId?: string
  // Set by the administrator once the commodity is received/settled. A delivered
  // deal is finalized and can no longer be revoked by the client.
  delivered?: boolean
  deliveredAt?: string
}

const KEY_BASE = "mcc.commodity-deals.v1"
const storageKey = () => scopedKey(KEY_BASE)

// Document type catalogues surfaced in the UI (extensible — "not limited to").
export const POP_DOC_TYPES = [
  "Certificate of Origin",
  "Product Availability Statement",
  "Refinery Allocation Letter",
  "Tank Storage Receipt (TSR)",
  "SGS Inspection Report",
  "Export License",
  "Warehouse Receipt",
  "Bill of Lading",
  "Authority to Sell (ATS)",
]

export const POF_DOC_TYPES = [
  "Bank Comfort Letter (BCL)",
  "Ready, Willing and Able (RWA) Letter",
  "Bank-issued Proof of Funds Letter",
  "Recent Bank Statement",
  "MT799 Pre-Advice",
  "Confirmation of Available Credit Line",
  "Irrevocable Documentary Letter of Credit (DLC)",
  "Standby Letter of Credit (SBLC)",
]

interface CommodityDealsContextValue {
  deals: CommodityDeal[]
  /** Create a new pending deal (nothing executes yet). Returns the stored record. */
  addDeal: (
    deal: Omit<
      CommodityDeal,
      "id" | "uetr" | "status" | "stage" | "documents" | "submittedAt" | "decidedAt" | "decisionNote"
    > & { stage?: DealStage },
  ) => CommodityDeal
  /** Attach a new document record (version 1) to a deal. */
  addDocument: (
    dealId: string,
    doc: { module: DocModule; docType: string; swiftRef?: string } & Omit<
      DealDocumentVersion,
      "version" | "uploadedAt"
    >,
  ) => CommodityDeal | null
  /** Append a new version to an existing document (resets it to "submitted"). */
  addDocumentVersion: (
    dealId: string,
    docId: string,
    version: Omit<DealDocumentVersion, "version" | "uploadedAt">,
  ) => CommodityDeal | null
  /** Client-side stage advance (cannot set "execution" — admin only). */
  setStage: (dealId: string, stage: DealStage) => CommodityDeal | null
  /** Admin: mark a document verified. */
  verifyDocument: (dealId: string, docId: string) => CommodityDeal | null
  /** Admin: reject a document with an optional reason. */
  rejectDocument: (dealId: string, docId: string, reason?: string) => CommodityDeal | null
  /** Admin: approve the deal — advances it to the execution stage. */
  approveDeal: (dealId: string, note?: string, settledEntryId?: string) => CommodityDeal | null
  /** Admin: reject the deal with an optional reason. Nothing executes. */
  rejectDeal: (dealId: string, reason?: string) => CommodityDeal | null
  /**
   * Client: revoke an approved (not-yet-delivered) deal. Releases the reserved
   * funds back to the available balance server-side, marks the local deal
   * cancelled, and refreshes the ledger. Rejected by the server once the deal
   * has been flagged delivered by the administrator.
   */
  revokeDeal: (dealId: string) => Promise<{ ok: boolean; error?: string }>
  hydrated: boolean
}

const CommodityDealsContext = createContext<CommodityDealsContextValue | null>(null)

function generateDealId(): string {
  return `DEAL-${Math.random().toString(16).slice(2, 10).toUpperCase()}`
}

function generateDocId(): string {
  return `DOC-${Math.random().toString(16).slice(2, 10).toUpperCase()}`
}

export function CommodityDealsProvider({ children }: { children: React.ReactNode }) {
  const [deals, setDeals] = useState<CommodityDeal[]>([])
  const [hydrated, setHydrated] = useState(false)

  // Load persisted deals once on mount so submissions survive navigation,
  // reloads, and logout/login.
  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(storageKey())
      setDeals(stored ? (JSON.parse(stored) as CommodityDeal[]) : [])
    } catch {
      setDeals([])
    }
    setHydrated(true)
  }, [])

  // Persist on change, but only after hydration to avoid clobbering stored data.
  useEffect(() => {
    if (!hydrated) return
    try {
      window.localStorage.setItem(storageKey(), JSON.stringify(deals))
    } catch {
      // ignore quota/availability errors
    }
  }, [deals, hydrated])

  // Keep state in sync across tabs/windows (client submits while Administrator
  // reviews elsewhere) and when returning to a backgrounded tab.
  useEffect(() => {
    if (!hydrated) return
    const resync = () => {
      try {
        const stored = window.localStorage.getItem(storageKey())
        setDeals(stored ? (JSON.parse(stored) as CommodityDeal[]) : [])
      } catch {
        // ignore parse/availability errors
      }
    }
    const onStorage = (e: StorageEvent) => {
      if (e.key === storageKey()) resync()
    }
    const onVisible = () => {
      if (document.visibilityState === "visible") resync()
    }
    window.addEventListener("storage", onStorage)
    window.addEventListener("focus", resync)
    document.addEventListener("visibilitychange", onVisible)
    return () => {
      window.removeEventListener("storage", onStorage)
      window.removeEventListener("focus", resync)
      document.removeEventListener("visibilitychange", onVisible)
    }
  }, [hydrated])

  const { refresh: refreshLedger } = useLedger()

  // Reconcile administrator decisions made cross-client (in the DB) back here.
  // When a deal is newly approved, also advance it to the execution stage to
  // match the in-app approveDeal() behaviour, and refresh the ledger so the
  // funds reserved (held) for the deal show up on the client's balance at once.
  useApprovalReconcile(
    "commodity",
    hydrated,
    deals,
    setDeals,
    (approved) => {
      const ids = new Set(approved.map((d) => d.id))
      setDeals((prev) =>
        prev.map((d) => (ids.has(d.id) ? { ...d, stage: "execution" as DealStage } : d)),
      )
      // Pull the server ledger so the newly-posted hold (reserved funds) is
      // reflected in the balance overview without requiring a manual reload.
      refreshLedger()
    },
  )

  // Cross-client sync for APPROVED deals: pick up the administrator's "delivered"
  // flag (which locks the deal from revocation) and any revocation performed on
  // another device, merging both back into the local records. A ref keeps the
  // polling timer stable so it doesn't re-subscribe on every deal edit; it only
  // does work while at least one approved deal is still open (not delivered).
  const dealsRef = useRef<CommodityDeal[]>(deals)
  useEffect(() => {
    dealsRef.current = deals
  }, [deals])

  useEffect(() => {
    if (!hydrated) return
    let cancelled = false

    const sync = async () => {
      const current = dealsRef.current
      const hasOpen = current.some((d) => d.approvalId && d.status === "approved" && !d.delivered)
      if (!hasOpen) return
      // Read via the Route Handler (not a Server Action) so this background poll
      // can never serialize behind / block in-app navigation. The endpoint
      // returns the signed-in user's commodity approvals with their payload.
      let items: {
        id: string
        status: string
        payload?: { delivered?: boolean; deliveredAt?: string }
      }[] = []
      try {
        const res = await fetch("/api/approvals?kind=commodity")
        if (!res.ok) return
        const data = (await res.json()) as { ok: boolean; items?: typeof items }
        items = data.items ?? []
      } catch {
        return
      }
      if (cancelled || !items.length) return
      const byId = new Map(items.map((s) => [s.id, s]))
      let changed = false
      const next = current.map((d) => {
        if (!d.approvalId) return d
        const s = byId.get(d.approvalId)
        if (!s) return d
        let merged = d
        if (s.payload?.delivered === true && !d.delivered) {
          merged = {
            ...merged,
            delivered: true,
            deliveredAt: s.payload.deliveredAt ?? new Date().toISOString(),
          }
          changed = true
        }
        if (s.status === "cancelled" && d.status !== "cancelled") {
          merged = { ...merged, status: "cancelled" as DealStatus }
          changed = true
        }
        return merged
      })
      if (changed) {
        setDeals(next)
        // A revocation elsewhere released the hold — refresh so the balance reflects it.
        refreshLedger()
      }
    }

    void sync()
    const id = setInterval(sync, 30000)
    return () => {
      cancelled = true
      clearInterval(id)
    }
  }, [hydrated])

  const addDeal: CommodityDealsContextValue["addDeal"] = (deal) => {
    const { stage, ...rest } = deal
    const full: CommodityDeal = {
      ...rest,
      id: generateDealId(),
      uetr: generateUetr(),
      stage: stage && stage !== "execution" ? stage : "icpo",
      status: "pending",
      documents: [],
      submittedAt: new Date().toISOString(),
    }
    setDeals((prev) => [full, ...prev])
    // Mirror into the DB so the Administrator can review it cross-client.
    void mirrorSubmission({
      kind: "commodity",
      title: `${full.title} · ${full.commodity}`,
      summary: `${full.tradeStructure} ${full.commodity} ${full.quantity} — ${full.currency} ${full.approxValue.toLocaleString("en-US")} (${full.buyerName} ⇄ ${full.sellerName})`,
      amount: full.approxValue,
      currency: full.currency,
      // On approval, reserve (place a hold on) the deal value on the client's
      // balance — funds earmarked to settle the petroleum / supplier payment.
      ledgerEffect:
        full.approxValue > 0
          ? {
              direction: "debit",
              amount: full.approxValue,
              currency: full.currency,
              status: "hold",
              counterparty: full.sellerName || "Commodity supplier",
              reference: full.uetr || full.id,
              category: "Commodity Trade — Reserved Funds",
            }
          : null,
      payload: { localId: full.id, uetr: full.uetr, category: full.category, commodity: full.commodity },
    }).then((approvalId) => {
      if (!approvalId) return
      setDeals((prev) => prev.map((d) => (d.id === full.id ? { ...d, approvalId } : d)))
    })
    return full
  }

  const addDocument: CommodityDealsContextValue["addDocument"] = (dealId, doc) => {
    let updated: CommodityDeal | null = null
    const { module, docType, swiftRef, ...versionFields } = doc
    const newDoc: DealDocument = {
      id: generateDocId(),
      module,
      docType,
      swiftRef: swiftRef?.trim() || undefined,
      status: "submitted",
      currentVersion: 1,
      versions: [{ ...versionFields, version: 1, uploadedAt: new Date().toISOString() }],
    }
    setDeals((prev) =>
      prev.map((d) => {
        if (d.id === dealId) {
          updated = { ...d, documents: [...d.documents, newDoc] }
          return updated
        }
        return d
      }),
    )
    return updated
  }

  const addDocumentVersion: CommodityDealsContextValue["addDocumentVersion"] = (
    dealId,
    docId,
    version,
  ) => {
    let updated: CommodityDeal | null = null
    setDeals((prev) =>
      prev.map((d) => {
        if (d.id !== dealId) return d
        const documents = d.documents.map((doc) => {
          if (doc.id !== docId) return doc
          const nextVersion = doc.currentVersion + 1
          return {
            ...doc,
            status: "submitted" as DocStatus,
            currentVersion: nextVersion,
            decidedAt: undefined,
            decisionNote: undefined,
            versions: [
              ...doc.versions,
              { ...version, version: nextVersion, uploadedAt: new Date().toISOString() },
            ],
          }
        })
        updated = { ...d, documents }
        return updated
      }),
    )
    return updated
  }

  const setStage: CommodityDealsContextValue["setStage"] = (dealId, stage) => {
    // Guard: clients cannot self-advance to execution.
    if (stage === "execution") return null
    let updated: CommodityDeal | null = null
    setDeals((prev) =>
      prev.map((d) => {
        if (d.id === dealId && d.status === "pending") {
          updated = { ...d, stage }
          return updated
        }
        return d
      }),
    )
    return updated
  }

  const verifyDocument: CommodityDealsContextValue["verifyDocument"] = (dealId, docId) => {
    let updated: CommodityDeal | null = null
    setDeals((prev) =>
      prev.map((d) => {
        if (d.id !== dealId) return d
        const documents = d.documents.map((doc) =>
          doc.id === docId
            ? { ...doc, status: "verified" as DocStatus, decidedAt: new Date().toISOString(), decisionNote: undefined }
            : doc,
        )
        updated = { ...d, documents }
        return updated
      }),
    )
    return updated
  }

  const rejectDocument: CommodityDealsContextValue["rejectDocument"] = (dealId, docId, reason) => {
    let updated: CommodityDeal | null = null
    setDeals((prev) =>
      prev.map((d) => {
        if (d.id !== dealId) return d
        const documents = d.documents.map((doc) =>
          doc.id === docId
            ? {
                ...doc,
                status: "rejected" as DocStatus,
                decidedAt: new Date().toISOString(),
                decisionNote: reason?.trim() || undefined,
              }
            : doc,
        )
        updated = { ...d, documents }
        return updated
      }),
    )
    return updated
  }

  const approveDeal: CommodityDealsContextValue["approveDeal"] = (dealId, note, settledEntryId) => {
    let updated: CommodityDeal | null = null
    setDeals((prev) =>
      prev.map((d) => {
        if (d.id === dealId && d.status === "pending") {
          updated = {
            ...d,
            status: "approved",
            stage: "execution",
            decidedAt: new Date().toISOString(),
            decisionNote: note?.trim() || undefined,
            settledEntryId: settledEntryId || undefined,
          }
          return updated
        }
        return d
      }),
    )
    return updated
  }

  const rejectDeal: CommodityDealsContextValue["rejectDeal"] = (dealId, reason) => {
    let updated: CommodityDeal | null = null
    setDeals((prev) =>
      prev.map((d) => {
        if (d.id === dealId && d.status === "pending") {
          updated = {
            ...d,
            status: "rejected",
            decidedAt: new Date().toISOString(),
            decisionNote: reason?.trim() || undefined,
          }
          return updated
        }
        return d
      }),
    )
    return updated
  }

  const revokeDeal: CommodityDealsContextValue["revokeDeal"] = async (dealId) => {
    const target = deals.find((d) => d.id === dealId)
    if (!target) return { ok: false, error: "Deal not found." }
    if (target.status !== "approved") return { ok: false, error: "Only an approved deal can be revoked." }
    if (target.delivered) {
      return { ok: false, error: "This deal has been delivered and can no longer be revoked." }
    }
    if (!target.approvalId) {
      return { ok: false, error: "This deal cannot be revoked yet. Please try again shortly." }
    }

    const res = await revokeMyCommodityDeal(target.approvalId)
    if (!res.ok) return res

    // Mark the local deal cancelled and pull the server ledger so the released
    // (unfrozen) funds reappear in the available balance right away.
    setDeals((prev) =>
      prev.map((d) =>
        d.id === dealId
          ? { ...d, status: "cancelled" as DealStatus, decidedAt: new Date().toISOString() }
          : d,
      ),
    )
    refreshLedger()
    return { ok: true }
  }

  return (
    <CommodityDealsContext.Provider
      value={{
        deals,
        addDeal,
        addDocument,
        addDocumentVersion,
        setStage,
        verifyDocument,
        rejectDocument,
        approveDeal,
        rejectDeal,
        revokeDeal,
        hydrated,
      }}
    >
      {children}
    </CommodityDealsContext.Provider>
  )
}

export function useCommodityDeals() {
  const ctx = useContext(CommodityDealsContext)
  if (!ctx) {
    throw new Error("useCommodityDeals must be used within a CommodityDealsProvider")
  }
  return ctx
}
