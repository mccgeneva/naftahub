"use client"

import { useState } from "react"
import { Sparkles, Loader2, Eye, ArrowRightLeft, AlertTriangle } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { MoneyInput } from "@/components/ui/money-input"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { toast } from "sonner"
import { purgeDustBalancesAdmin, type DustSweepResult } from "@/app/actions/ledger"
import { ADMIN_PASSCODE } from "@/lib/admin-config"
import { useActivityLog } from "@/components/activity-tracker"

/** Format a per-currency totals map into a readable "USD 4.21 · EUR 0.09" line. */
function formatTotals(totals: Record<string, number>): string {
  const parts = Object.entries(totals)
    .filter(([, a]) => a > 0)
    .sort((a, b) => b[1] - a[1])
    .map(([c, a]) => `${c} ${a.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`)
  return parts.length ? parts.join(" · ") : "—"
}

export function DustSweepCard() {
  const logActivity = useActivityLog()
  const [threshold, setThreshold] = useState("1.00")
  const [preview, setPreview] = useState<DustSweepResult | null>(null)
  const [previewing, setPreviewing] = useState(false)
  const [sweeping, setSweeping] = useState(false)
  const [confirmOpen, setConfirmOpen] = useState(false)

  const thresholdValue = Number.parseFloat(threshold.replace(/,/g, "")) || 0

  const runPreview = async () => {
    if (thresholdValue <= 0) {
      toast.error("Enter a dust threshold greater than zero.")
      return
    }
    setPreviewing(true)
    try {
      const res = await purgeDustBalancesAdmin(ADMIN_PASSCODE, {
        thresholdPerCurrency: thresholdValue,
        dryRun: true,
      })
      if (!res.ok) {
        toast.error(res.error ?? "Preview failed.")
        return
      }
      setPreview(res)
      if (res.entriesSwept === 0) toast.info("No dust balances found under this threshold.")
    } catch {
      toast.error("Preview failed. Please try again.")
    } finally {
      setPreviewing(false)
    }
  }

  const runSweep = async () => {
    setSweeping(true)
    try {
      const res = await purgeDustBalancesAdmin(ADMIN_PASSCODE, {
        thresholdPerCurrency: thresholdValue,
        dryRun: false,
      })
      if (!res.ok) {
        toast.error(res.error ?? "The sweep could not be completed.")
        return
      }
      setConfirmOpen(false)
      setPreview({ ...res, dryRun: true }) // keep the panel showing what was swept
      if (res.entriesSwept === 0) {
        toast.info("No dust balances to sweep.")
      } else {
        toast.success(
          `Swept ${res.entriesSwept} balance${res.entriesSwept === 1 ? "" : "s"} from ${res.ownersAffected} account${res.ownersAffected === 1 ? "" : "s"} to the master account.`,
        )
        logActivity({
          action: `Swept dust balances to the master account (≈ EUR ${res.totalEur.toFixed(2)})`,
          category: "Administration",
          details: {
            accountsAffected: res.ownersAffected,
            entriesSwept: res.entriesSwept,
            totals: formatTotals(res.totalsByCurrency),
          },
        })
      }
    } catch {
      toast.error("The sweep could not be completed. Please try again.")
    } finally {
      setSweeping(false)
    }
  }

  return (
    <>
      <Card className="bg-card border-border">
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10">
              <Sparkles className="h-5 w-5 text-primary" />
            </div>
            <div>
              <CardTitle className="text-lg font-semibold">Purge dust balances</CardTitle>
              <p className="text-sm text-muted-foreground text-pretty">
                Sweep tiny, un-transferable residual balances (e.g. USD 0.01 from FX rounding) out of
                every client account and into the admin@mccgva.ch master account.
              </p>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="dust-threshold">Dust threshold (per currency)</Label>
            <MoneyInput
              id="dust-threshold"
              value={threshold}
              onValueChange={setThreshold}
              placeholder="1.00"
            />
            <p className="text-xs text-muted-foreground leading-5">
              Any main-account balance greater than 0 and up to this amount (in each currency&apos;s own
              units) is treated as dust. Sub-account compartments are never touched.
            </p>
          </div>

          <Button
            type="button"
            variant="outline"
            className="w-full"
            onClick={runPreview}
            disabled={previewing || sweeping}
          >
            {previewing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Eye className="mr-2 h-4 w-4" />}
            Preview dust
          </Button>

          {preview && (
            <div className="rounded-lg border border-border bg-muted/30 p-3 text-sm">
              {preview.entriesSwept === 0 ? (
                <p className="text-muted-foreground">No dust balances found under this threshold.</p>
              ) : (
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-muted-foreground">Accounts affected</span>
                    <span className="font-medium text-foreground">{preview.ownersAffected}</span>
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-muted-foreground">Balances</span>
                    <span className="font-medium text-foreground">{preview.entriesSwept}</span>
                  </div>
                  <div className="flex items-start justify-between gap-3">
                    <span className="text-muted-foreground">Totals</span>
                    <span className="text-right font-medium text-foreground break-words">
                      {formatTotals(preview.totalsByCurrency)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-2 border-t border-border pt-1.5">
                    <span className="text-muted-foreground">≈ EUR equivalent</span>
                    <span className="font-semibold text-foreground">
                      EUR {preview.totalEur.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </span>
                  </div>
                </div>
              )}
            </div>
          )}

          <Button
            type="button"
            className="w-full"
            onClick={() => setConfirmOpen(true)}
            disabled={sweeping || previewing || thresholdValue <= 0}
          >
            {sweeping ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <ArrowRightLeft className="mr-2 h-4 w-4" />}
            Sweep to master account
          </Button>
        </CardContent>
      </Card>

      <Dialog open={confirmOpen} onOpenChange={(o) => !sweeping && setConfirmOpen(o)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-primary" />
              <DialogTitle>Confirm dust sweep</DialogTitle>
            </div>
            <DialogDescription className="text-pretty">
              This moves every client&apos;s residual balance up to{" "}
              <span className="font-medium text-foreground">
                {thresholdValue.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </span>{" "}
              (per currency) into the admin@mccgva.ch master account. This affects real balances and
              cannot be undone in bulk.
              {preview && preview.entriesSwept > 0 && (
                <>
                  {" "}
                  Your last preview found{" "}
                  <span className="font-medium text-foreground">
                    {preview.entriesSwept} balance{preview.entriesSwept === 1 ? "" : "s"}
                  </span>{" "}
                  across {preview.ownersAffected} account{preview.ownersAffected === 1 ? "" : "s"} (≈ EUR{" "}
                  {preview.totalEur.toFixed(2)}).
                </>
              )}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-2">
            <Button variant="outline" onClick={() => setConfirmOpen(false)} disabled={sweeping}>
              Cancel
            </Button>
            <Button onClick={runSweep} disabled={sweeping}>
              {sweeping ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Sweep now
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
