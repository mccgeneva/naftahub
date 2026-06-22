"use client"

import Link from "next/link"
import useSWR from "swr"
import { Ship, Clock, ChevronRight, Flame } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"
import { dealCountdown, isDealLive, type SpotDeal } from "@/lib/spot-deals-shared"
import { listLiveSpotDeals } from "@/app/actions/spot-deals"

function money(value: number, currency: string) {
  return `${currency} ${value.toLocaleString("en-US", { maximumFractionDigits: 0 })}`
}

/**
 * Dashboard highlight tile for limited-time spot cargoes. Renders nothing when
 * the desk has no live offers, so it never shows an empty shell. Links straight
 * to the Commodity Trading page with the Spot Deals tab pre-opened.
 */
export function SpotDealsHighlight() {
  const { data: deals = [] } = useSWR<SpotDeal[]>("spot-deals-highlight", () => listLiveSpotDeals(), {
    refreshInterval: 30_000,
    revalidateOnFocus: true,
  })

  const live = deals.filter((d) => isDealLive(d))
  if (live.length === 0) return null

  const featured = [...live].sort(
    (a, b) => new Date(a.expiresAt).getTime() - new Date(b.expiresAt).getTime(),
  )[0]
  const cd = dealCountdown(featured.expiresAt)

  return (
    <Card className="border-primary/30 bg-card">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
        <CardTitle className="flex items-center gap-2 text-base font-semibold">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10">
            <Flame className="h-4 w-4 text-primary" />
          </span>
          Spot Deals
        </CardTitle>
        <Badge variant="outline" className="border-primary/30 bg-primary/10 text-primary">
          {live.length} live
        </Badge>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="rounded-lg border border-border bg-muted/40 p-3">
          <div className="flex items-start justify-between gap-2">
            <p className="text-pretty text-sm font-semibold leading-tight text-foreground">{featured.product}</p>
            <span
              className={cn(
                "inline-flex shrink-0 items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-semibold tabular-nums",
                cd.urgent
                  ? "border-destructive/30 bg-destructive/10 text-destructive"
                  : "border-primary/30 bg-primary/10 text-primary",
              )}
            >
              <Clock className="h-3 w-3" />
              {cd.label}
            </span>
          </div>
          <div className="mt-2 flex items-center gap-1.5 text-xs text-muted-foreground">
            <Ship className="h-3.5 w-3.5 shrink-0" />
            <span className="truncate">{featured.vesselName}</span>
            <span>·</span>
            <span className="truncate">{featured.loadPort}</span>
          </div>
          <div className="mt-2 flex items-end justify-between">
            <span className="text-xs text-muted-foreground">
              {featured.quantity.toLocaleString("en-US")} {featured.unit}
            </span>
            <span className="text-sm font-bold text-primary">{money(featured.totalValue, featured.currency)}</span>
          </div>
        </div>
        <Button asChild variant="ghost" size="sm" className="w-full justify-between">
          <Link href="/dashboard/commodity?tab=spot">
            View all spot offers
            <ChevronRight className="h-4 w-4" />
          </Link>
        </Button>
      </CardContent>
    </Card>
  )
}
