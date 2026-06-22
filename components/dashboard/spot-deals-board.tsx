"use client"

import { useCallback, useEffect, useState } from "react"
import { Ship, Clock, MapPin, Anchor, Flame, Droplet, Handshake, Loader2, Gauge, RefreshCw } from "lucide-react"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"
import { toast } from "sonner"
import {
  type SpotDeal,
  type VesselType,
  dealCountdown,
  VESSEL_TYPE_LABELS,
} from "@/lib/spot-deals-shared"
import { listLiveSpotDeals, recordSpotDealInterest } from "@/app/actions/spot-deals"

const VESSEL_ICON: Record<VesselType, typeof Ship> = {
  crude: Droplet,
  product: Ship,
  gas: Flame,
}

function formatMoney(value: number, currency: string) {
  return `${currency} ${value.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`
}

/** A live, self-updating countdown chip. Re-renders every second off a shared tick. */
function CountdownChip({ expiresAt, tick }: { expiresAt: string; tick: number }) {
  const cd = dealCountdown(expiresAt, tick)
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-semibold tabular-nums",
        cd.expired
          ? "border-muted-foreground/30 bg-muted text-muted-foreground"
          : cd.urgent
            ? "border-destructive/30 bg-destructive/10 text-destructive"
            : "border-primary/30 bg-primary/10 text-primary",
      )}
    >
      <Clock className="h-3 w-3" />
      {cd.expired ? "Expired" : cd.label}
    </span>
  )
}

function SpotDealCard({
  deal,
  tick,
  onEngage,
}: {
  deal: SpotDeal
  tick: number
  onEngage: (deal: SpotDeal) => void
}) {
  const Icon = VESSEL_ICON[deal.vesselType]
  const cd = dealCountdown(deal.expiresAt, tick)
  return (
    <Card className="overflow-hidden border-border bg-card transition-colors hover:border-primary/40">
      <CardContent className="flex flex-col gap-4 p-5">
        {/* Header: product + countdown */}
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <Icon className="h-5 w-5" />
            </span>
            <div className="min-w-0">
              <p className="text-pretty text-sm font-semibold leading-tight text-foreground">{deal.product}</p>
              <p className="mt-0.5 text-xs text-muted-foreground">{VESSEL_TYPE_LABELS[deal.vesselType]}</p>
            </div>
          </div>
          <CountdownChip expiresAt={deal.expiresAt} tick={tick} />
        </div>

        {/* Vessel + route */}
        <div className="grid grid-cols-2 gap-x-4 gap-y-2 rounded-lg border border-border bg-muted/40 p-3 text-xs">
          <div className="col-span-2 flex items-center gap-1.5 text-foreground">
            <Anchor className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
            <span className="truncate font-medium">{deal.vesselName}</span>
            <span className="text-muted-foreground">IMO {deal.vesselImo}</span>
          </div>
          <div className="flex items-center gap-1.5 text-muted-foreground">
            <MapPin className="h-3.5 w-3.5 shrink-0" />
            <span className="truncate">{deal.loadPort}</span>
          </div>
          <div className="flex items-center gap-1.5 text-muted-foreground">
            <Gauge className="h-3.5 w-3.5 shrink-0" />
            <span className="truncate">{deal.incoterm}</span>
          </div>
        </div>

        {/* Commercials */}
        <div className="flex items-end justify-between gap-3">
          <div>
            <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Quantity</p>
            <p className="text-sm font-semibold text-foreground">
              {deal.quantity.toLocaleString("en-US")} {deal.unit}
            </p>
          </div>
          <div className="text-right">
            <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Spot price</p>
            <p className="text-sm font-semibold text-foreground">
              {formatMoney(deal.spotPrice, deal.currency)}
              <span className="text-xs font-normal text-muted-foreground">/{deal.unit}</span>
            </p>
          </div>
        </div>

        <div className="flex items-center justify-between gap-3 border-t border-border pt-3">
          <div>
            <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Total value</p>
            <p className="text-base font-bold text-primary">{formatMoney(deal.totalValue, deal.currency)}</p>
          </div>
          <Button size="sm" disabled={cd.expired} onClick={() => onEngage(deal)} className="gap-1.5">
            <Handshake className="h-4 w-4" />
            Accept / Negotiate
          </Button>
        </div>

        {deal.terms ? <p className="text-pretty text-xs text-muted-foreground">{deal.terms}</p> : null}
      </CardContent>
    </Card>
  )
}

export function SpotDealsBoard({ onEngage }: { onEngage: (deal: SpotDeal) => void }) {
  const [deals, setDeals] = useState<SpotDeal[]>([])
  const [loading, setLoading] = useState(true)
  const [tick, setTick] = useState(() => Date.now())

  const load = useCallback(async () => {
    try {
      const live = await listLiveSpotDeals()
      setDeals(live)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
    // Refresh the board periodically so newly published / withdrawn deals appear.
    const poll = setInterval(load, 30_000)
    // Drive all countdowns from a single 1s tick.
    const ticker = setInterval(() => setTick(Date.now()), 1000)
    return () => {
      clearInterval(poll)
      clearInterval(ticker)
    }
  }, [load])

  // Drop deals the moment their countdown hits zero, without waiting for a poll.
  const liveDeals = deals.filter((d) => dealCountdown(d.expiresAt, tick).expired === false)

  const handleEngage = useCallback(
    (deal: SpotDeal) => {
      // Fire-and-forget interest record; the parent handles the actual pre-fill.
      recordSpotDealInterest(deal.id, "engaged").catch(() => {})
      onEngage(deal)
      toast.success("Spot offer loaded into the deal form below", {
        description: "Review the pre-filled terms and submit for Administrator approval.",
      })
    },
    [onEngage],
  )

  if (loading) {
    return (
      <div className="flex items-center justify-center gap-2 rounded-lg border border-border bg-card py-16 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        Loading live spot offers…
      </div>
    )
  }

  if (liveDeals.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-border bg-card py-16 text-center">
        <span className="flex h-12 w-12 items-center justify-center rounded-full bg-muted text-muted-foreground">
          <Ship className="h-6 w-6" />
        </span>
        <div>
          <p className="text-sm font-medium text-foreground">No live spot deals right now</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Special limited-time cargoes published by the trading desk will appear here.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={load} className="gap-1.5 bg-transparent">
          <RefreshCw className="h-4 w-4" />
          Refresh
        </Button>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          <span className="font-semibold text-foreground">{liveDeals.length}</span> limited-time spot{" "}
          {liveDeals.length === 1 ? "offer" : "offers"} from the trading desk. Accepting pre-fills a deal for
          Administrator approval — nothing executes automatically.
        </p>
        <Button variant="ghost" size="sm" onClick={load} className="gap-1.5">
          <RefreshCw className="h-4 w-4" />
          <span className="hidden sm:inline">Refresh</span>
        </Button>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {liveDeals.map((deal) => (
          <SpotDealCard key={deal.id} deal={deal} tick={tick} onEngage={handleEngage} />
        ))}
      </div>
    </div>
  )
}
