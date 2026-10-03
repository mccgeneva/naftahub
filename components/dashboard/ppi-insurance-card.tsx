"use client"

import { useState } from "react"
import useSWR from "swr"
import { toast } from "sonner"
import { Loader2, ShieldCheck, Umbrella } from "lucide-react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { PpiDiscussion } from "@/components/ppi-discussion"
import { PPI_INSURER, effectivePpiStatus, type PpiPolicy } from "@/lib/ppi-insurance"
import { useLedger } from "@/lib/ledger-store"

type Deficit = { currency: string; amount: number }
type State = {
  ok: boolean
  policy: (PpiPolicy & { remainingCover: number }) | null
  negativeEur: number
  deficits?: Deficit[]
}

const eur = (n: number) =>
  `EUR ${(Number(n) || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
const amt = (n: number) => n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const date = (iso?: string | null) => (iso ? new Date(iso).toLocaleDateString("en-GB") : "—")

const fetcher = (url: string) => fetch(url).then((r) => r.json() as Promise<State>)

const TITLE: Record<string, string> = {
  active: "PPI insurance — active",
  paused: "PPI insurance — paused",
  negotiating: "PPI insurance — being arranged",
  terminated: "PPI insurance — deactivated",
  used: "PPI insurance — used",
  expired: "PPI insurance — expired",
  cancelled: "PPI insurance — cancelled",
}

export function PpiInsuranceCard() {
  const { data, mutate } = useSWR<State>("/api/ppi", fetcher, { refreshInterval: 30000 })
  const { refresh } = useLedger()
  const [confirming, setConfirming] = useState(false)
  const [busy, setBusy] = useState(false)

  const policy = data?.policy
  if (!policy) return null

  const status = effectivePpiStatus(policy)
  const deficits = data?.deficits ?? []
  const negative = data?.negativeEur ?? 0
  const inDebit = deficits.length > 0 && negative > 0.01

  const consolidate = async () => {
    setBusy(true)
    try {
      const res = await fetch("/api/ppi", { method: "POST" })
      const out = await res.json()
      if (out.ok) {
        toast.success("Your Master Account debit was cleared to zero with your PPI.")
        setConfirming(false)
        await Promise.all([mutate(), refresh()])
      } else toast.error(out.error ?? "The PPI could not be used.")
    } finally {
      setBusy(false)
    }
  }

  const sendMessage = async (text: string) => {
    const res = await fetch("/api/ppi", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ op: "message", text }),
    })
    const out = await res.json()
    if (!out.ok) {
      toast.error(out.error ?? "Message not sent.")
      return false
    }
    await mutate()
    return true
  }

  const threadOpen = status === "negotiating" || status === "active" || status === "paused"

  return (
    <Card className="min-w-0">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Umbrella className="h-5 w-5 text-primary" aria-hidden />
          {TITLE[status] ?? "PPI insurance"}
        </CardTitle>
        <CardDescription className="text-pretty leading-relaxed">
          {status === "negotiating" && `Treasury is arranging Payment Protection Insurance with ${PPI_INSURER} for you.`}
          {status === "active" && `Full cover with ${PPI_INSURER}, valid until ${date(policy.expiresAt)}. Usable once.`}
          {status === "paused" && "Treasury has paused your cover. It can't be used until it is reactivated."}
          {status === "terminated" && "Treasury has deactivated your cover. It can't be used."}
          {status === "used" &&
            "Used to clear your Master Account debit to zero. PPI is single-use, so this policy is closed."}
          {(status === "expired" || status === "cancelled") && "This policy is no longer in force."}
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {status !== "negotiating" && (
          <dl className="grid grid-cols-2 gap-3 text-sm">
            <div className="flex min-w-0 flex-col gap-1 rounded-lg border border-border p-3">
              <dt className="text-muted-foreground">Cover</dt>
              <dd className="truncate font-mono font-medium tabular-nums">{eur(policy.coverAmount)}</dd>
            </div>
            <div className="flex min-w-0 flex-col gap-1 rounded-lg border border-border p-3">
              <dt className="text-muted-foreground">{status === "used" ? "Cleared" : "Lloyd's slip"}</dt>
              <dd className="truncate font-mono font-medium tabular-nums">
                {status === "used" ? eur(policy.claimedAmount) : policy.lloydsReference || "—"}
              </dd>
            </div>
          </dl>
        )}

        {status === "active" &&
          (inDebit ? (
            <div className="flex flex-col gap-3 rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-sm leading-relaxed">
              <p>Your Master Account has negative balances. Using your PPI clears all of them to zero:</p>
              <ul className="flex flex-col gap-1">
                {deficits.map((d) => (
                  <li key={d.currency} className="flex items-center justify-between gap-3">
                    <span className="text-muted-foreground">{d.currency}</span>
                    <span className="font-mono tabular-nums">
                      −{amt(d.amount)} → 0.00
                    </span>
                  </li>
                ))}
              </ul>
              {confirming ? (
                <>
                  <p className="font-medium">
                    PPI can be used only once. After this, the policy is terminated.
                  </p>
                  <div className="flex flex-col gap-2 sm:flex-row">
                    <Button onClick={consolidate} disabled={busy} className="min-h-11">
                      {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />}
                      Confirm — clear my debit
                    </Button>
                    <Button variant="outline" onClick={() => setConfirming(false)} disabled={busy} className="min-h-11">
                      Keep my PPI
                    </Button>
                  </div>
                </>
              ) : (
                <Button onClick={() => setConfirming(true)} className="min-h-11">
                  <ShieldCheck className="h-4 w-4" />
                  Use my PPI to clear the debit
                </Button>
              )}
            </div>
          ) : (
            <p className="text-sm leading-relaxed text-muted-foreground">
              Your account is not in debit. If it goes negative, you can clear it to zero here — once.
            </p>
          ))}

        {threadOpen && (
          <div className="flex flex-col gap-2">
            <p className="text-sm font-medium">Discuss with Treasury</p>
            <PpiDiscussion
              messages={policy.messages ?? []}
              viewer="client"
              onSend={sendMessage}
              placeholder="Ask Treasury about your cover…"
            />
          </div>
        )}
      </CardContent>
    </Card>
  )
}
