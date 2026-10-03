"use client"

import { useState } from "react"
import useSWR from "swr"
import { toast } from "sonner"
import { Loader2, Umbrella } from "lucide-react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { PPI_INSURER, type PpiPolicy } from "@/lib/ppi-insurance"
import { useLedger } from "@/lib/ledger-store"

type State = { ok: boolean; policy: (PpiPolicy & { remainingCover: number }) | null; negativeEur: number }

const eur = (n: number) =>
  `EUR ${(Number(n) || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

const fetcher = (url: string) => fetch(url).then((r) => r.json() as Promise<State>)

export function PpiInsuranceCard() {
  const { data, mutate } = useSWR<State>("/api/ppi", fetcher, { refreshInterval: 30000 })
  const { refresh } = useLedger()
  const [confirming, setConfirming] = useState(false)
  const [busy, setBusy] = useState(false)

  const policy = data?.policy
  if (!policy) return null

  const negative = data?.negativeEur ?? 0
  const inDebit = negative > 0.01
  const claimAmount = Math.min(negative, policy.remainingCover)

  const reconcile = async () => {
    setBusy(true)
    try {
      const res = await fetch("/api/ppi", { method: "POST" })
      const out = await res.json()
      if (out.ok) {
        toast.success(`Debit reconciled — ${eur(out.amount)} credited from your PPI cover.`)
        setConfirming(false)
        await Promise.all([mutate(), refresh()])
      } else toast.error(out.error ?? "Reconciliation failed.")
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card className="min-w-0">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Umbrella className="h-5 w-5 text-primary" aria-hidden />
          PPI insurance — active
        </CardTitle>
        <CardDescription className="leading-relaxed">
          Payment Protection Insurance with {PPI_INSURER}, full cover, valid until{" "}
          {policy.expiresAt ? new Date(policy.expiresAt).toLocaleDateString("en-GB") : "—"}.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <dl className="grid grid-cols-2 gap-3 text-sm">
          <div className="flex flex-col gap-1 rounded-lg border border-border p-3">
            <dt className="text-muted-foreground">Total cover</dt>
            <dd className="font-mono font-medium tabular-nums">{eur(policy.coverAmount)}</dd>
          </div>
          <div className="flex flex-col gap-1 rounded-lg border border-border p-3">
            <dt className="text-muted-foreground">Remaining cover</dt>
            <dd className="font-mono font-medium tabular-nums">{eur(policy.remainingCover)}</dd>
          </div>
        </dl>

        {inDebit ? (
          <div className="flex flex-col gap-3 rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-sm leading-relaxed">
            <p>
              Your Master Account is in debit by <span className="font-medium">{eur(negative)}</span>. You can
              reconcile it with your PPI cover — {eur(claimAmount)} will be credited to your account.
            </p>
            {confirming ? (
              <div className="flex flex-col gap-2 sm:flex-row">
                <Button onClick={reconcile} disabled={busy || claimAmount <= 0} className="min-h-11">
                  {busy && <Loader2 className="h-4 w-4 animate-spin" />}
                  Confirm — use {eur(claimAmount)}
                </Button>
                <Button variant="outline" onClick={() => setConfirming(false)} disabled={busy} className="min-h-11">
                  Keep as is
                </Button>
              </div>
            ) : (
              <Button onClick={() => setConfirming(true)} disabled={claimAmount <= 0} className="min-h-11">
                Reconcile with my PPI
              </Button>
            )}
          </div>
        ) : (
          <p className="text-sm leading-relaxed text-muted-foreground">
            Your account is not in debit. If it goes into debit, you can reconcile it here using your PPI cover.
          </p>
        )}
      </CardContent>
    </Card>
  )
}
