"use client"

import Link from "next/link"
import { ArrowUpRight, ShieldCheck } from "lucide-react"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { useCurrentUser } from "@/lib/use-current-user"
import { resolvePlatformTier } from "@/lib/platform-tier"

/**
 * The first thing a client sees on the dashboard overview: which platform
 * membership they are on (PRO or Avant-Garde). Derived from the signed-in
 * user's account badge so it always matches whoever is logged in.
 */
export function PlatformTierBanner() {
  const user = useCurrentUser()
  const tier = resolvePlatformTier(user.accountBadge)
  const TierIcon = tier.icon

  return (
    <section
      aria-label="Your platform membership"
      className={cn(
        "relative overflow-hidden rounded-xl border p-5 sm:p-6",
        tier.premium
          ? "border-primary/40 bg-primary/10"
          : "border-border bg-card",
      )}
    >
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-4">
          <div
            className={cn(
              "flex h-14 w-14 shrink-0 items-center justify-center rounded-xl",
              tier.premium ? "bg-primary text-primary-foreground" : "bg-primary/10 text-primary",
            )}
          >
            <TierIcon className="h-7 w-7" />
          </div>
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
              Your platform membership
            </p>
            <div className="mt-0.5 flex flex-wrap items-center gap-2">
              <h2 className="text-2xl font-bold leading-tight text-foreground sm:text-3xl">
                {tier.label}
              </h2>
              <span className="inline-flex items-center gap-1 rounded-full border border-success/40 bg-success/10 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wider text-success">
                <ShieldCheck className="h-3 w-3" />
                Active
              </span>
            </div>
            <p className="mt-1 text-sm text-muted-foreground text-pretty">{tier.tagline}</p>
          </div>
        </div>

        <div className="shrink-0">
          <Button
            asChild
            variant={tier.premium ? "outline" : "default"}
            className="w-full sm:w-auto"
          >
            <Link href="/dashboard/plans">
              {tier.id === "pro" ? "Upgrade to Avant-Garde" : "Manage membership"}
              <ArrowUpRight className="ml-1 h-4 w-4" />
            </Link>
          </Button>
        </div>
      </div>
    </section>
  )
}
