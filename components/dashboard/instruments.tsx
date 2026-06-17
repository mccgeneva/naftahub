"use client"

import Link from "next/link"
import { FileText, ExternalLink, Clock, CheckCircle2, AlertCircle } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Progress } from "@/components/ui/progress"
import { cn } from "@/lib/utils"
import { useInstrumentRequests } from "@/lib/instrument-requests-store"

const currencySymbols: Record<string, string> = {
  EUR: "€",
  USD: "$",
  GBP: "£",
  CHF: "CHF ",
}

function formatFaceValue(amount: number, currency: string): string {
  const symbol = currencySymbols[currency] || `${currency} `
  return `${symbol}${amount.toLocaleString("en-US")}`
}

const typeColors = {
  SBLC: "bg-blue-500/10 text-blue-400 border-blue-500/20",
  MTN: "bg-green-500/10 text-green-400 border-green-500/20",
  BG: "bg-orange-500/10 text-orange-400 border-orange-500/20",
}

const statusIcons = {
  active: CheckCircle2,
  pending: Clock,
  expired: AlertCircle,
}

export function Instruments() {
  const { instruments } = useInstrumentRequests()
  return (
    <Card className="bg-card border-border">
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardTitle className="text-lg font-semibold">Bank Instruments</CardTitle>
          <p className="text-xs text-muted-foreground mt-1">
            SBLC, MTN, and Bank Guarantees
          </p>
        </div>
        <Button asChild variant="outline" size="sm" className="text-xs">
          <Link href="/dashboard/instruments">
            Trade Instruments
            <ExternalLink className="ml-2 h-3 w-3" />
          </Link>
        </Button>
      </CardHeader>
      <CardContent>
        {instruments.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-secondary mb-3">
              <FileText className="h-5 w-5 text-muted-foreground" />
            </div>
            <p className="text-sm font-medium text-foreground">No instruments yet</p>
            <p className="text-xs text-muted-foreground mt-1">
              Your SBLC, MTN, and Bank Guarantees will appear here
            </p>
          </div>
        ) : (
          <div className="space-y-4">
          {instruments.map((instrument) => {
            const StatusIcon = statusIcons[instrument.status as keyof typeof statusIcons]
            const progressPercent = Math.min(100, (instrument.daysRemaining / 365) * 100)

            return (
              <div
                key={instrument.id}
                className="rounded-lg border border-border bg-secondary/30 p-4"
              >
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                      <FileText className="h-5 w-5 text-primary" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <Badge
                          variant="outline"
                          className={cn(
                            "text-xs font-medium",
                            typeColors[instrument.type as keyof typeof typeColors]
                          )}
                        >
                          {instrument.type}
                        </Badge>
                        <span className="text-sm font-semibold text-foreground">
                          {instrument.id}
                        </span>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {instrument.typeFull}
                      </p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-lg font-bold text-foreground">
                      {formatFaceValue(instrument.faceValue, instrument.currency)}
                    </p>
                    <div className="flex items-center justify-end gap-1">
                      <StatusIcon
                        className={cn(
                          "h-3 w-3",
                          instrument.status === "active"
                            ? "text-green-500"
                            : instrument.status === "pending"
                            ? "text-yellow-500"
                            : "text-red-500"
                        )}
                      />
                      <span
                        className={cn(
                          "text-xs capitalize",
                          instrument.status === "active"
                            ? "text-green-500"
                            : instrument.status === "pending"
                            ? "text-yellow-500"
                            : "text-red-500"
                        )}
                      >
                        {instrument.status}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-4 pt-3 border-t border-border">
                  <div>
                    <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">
                      Issuer
                    </p>
                    <p className="text-xs font-medium text-foreground">
                      {instrument.issuer}
                    </p>
                  </div>
                  <div>
                    <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">
                      Rating
                    </p>
                    <Badge
                      variant="outline"
                      className="bg-primary/10 text-primary border-primary/20 text-[10px]"
                    >
                      {instrument.rating}
                    </Badge>
                  </div>
                  <div>
                    <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">
                      Expires
                    </p>
                    <p className="text-xs font-medium text-foreground">
                      {instrument.expiryDate}
                    </p>
                  </div>
                </div>

                <div className="mt-3">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-[10px] text-muted-foreground">
                      Time remaining
                    </span>
                    <span className="text-[10px] text-muted-foreground">
                      {instrument.daysRemaining} days
                    </span>
                  </div>
                  <Progress value={progressPercent} className="h-1" />
                </div>
              </div>
            )
          })}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
