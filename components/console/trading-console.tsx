"use client"

import { useEffect, useState } from "react"
import { LayoutGrid, Cpu, PanelRightClose, PanelRightOpen, LineChart, Ship, Activity } from "lucide-react"
import { ResizablePanelGroup, ResizablePanel, ResizableHandle } from "@/components/ui/resizable"
import { cn } from "@/lib/utils"
import { useMarketQuotes } from "@/lib/use-market"
import type { SpotDeal } from "@/lib/spot-deals-shared"
import { MarketsPanel } from "@/components/console/panels/markets-panel"
import { CommodityPanel } from "@/components/console/panels/commodity-panel"
import { SpotDealsPanel } from "@/components/console/panels/spot-deals-panel"
import { ConsolePanel } from "@/components/console/console-panel"
import { NqaiChat } from "@/components/nqai/nqai-chat"

const TICKER_SYMBOLS = ["BRENT", "WTI", "XAU/USD", "NG", "EUR/USD", "GBP/USD", "USD/CHF", "SPX", "BTC/USD", "US10Y"]

/** Thin scrolling ticker tape across the top of the console for ambient density. */
function ConsoleTicker() {
  const { quotes } = useMarketQuotes(TICKER_SYMBOLS)
  const items = TICKER_SYMBOLS.map((s) => ({ symbol: s, q: quotes[s] }))
  const doubled = [...items, ...items]
  return (
    <div className="relative overflow-hidden border-b border-border bg-card">
      <div className="ticker-track flex w-max animate-ticker items-center gap-6 whitespace-nowrap px-4 py-1.5">
        {doubled.map((it, i) => {
          const up = (it.q?.changePct ?? 0) >= 0
          return (
            <span key={`${it.symbol}-${i}`} className="flex items-center gap-1.5 text-[11px]">
              <span className="font-semibold text-foreground">{it.symbol}</span>
              <span className="font-mono tabular-nums text-muted-foreground">
                {it.q ? it.q.price.toLocaleString("en-US", { maximumFractionDigits: 2 }) : "—"}
              </span>
              {it.q && (
                <span className={cn("font-mono tabular-nums", up ? "text-success" : "text-destructive")}>
                  {up ? "+" : ""}
                  {it.q.changePct.toFixed(2)}%
                </span>
              )}
            </span>
          )
        })}
      </div>
    </div>
  )
}

/** Live UTC clock for the console toolbar. */
function ConsoleClock() {
  const [now, setNow] = useState<Date | null>(null)
  useEffect(() => {
    setNow(new Date())
    const id = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(id)
  }, [])
  return (
    <span className="hidden items-center gap-2 rounded-sm border border-border bg-secondary px-2.5 py-1 md:flex">
      <span className="h-1.5 w-1.5 rounded-full bg-success animate-pulse" />
      <span className="font-mono text-[11px] tabular-nums text-foreground">
        {now ? now.toLocaleTimeString("en-GB", { hour12: false, timeZone: "UTC" }) : "--:--:--"}
      </span>
      <span className="text-[9px] font-semibold uppercase tracking-wider text-muted-foreground">UTC</span>
    </span>
  )
}

type MobileTab = "markets" | "deals" | "nqai"

export function TradingConsole({ initialDeals }: { initialDeals: SpotDeal[] }) {
  const [nqaiDocked, setNqaiDocked] = useState(true)
  const [mobileTab, setMobileTab] = useState<MobileTab>("markets")

  return (
    <div className="flex h-full min-h-0 flex-col border border-border bg-background">
      {/* Toolbar */}
      <div className="flex h-11 shrink-0 items-center justify-between gap-3 border-b border-border bg-card px-3">
        <div className="flex items-center gap-2">
          <LayoutGrid className="h-4 w-4 text-primary" />
          <span className="text-sm font-semibold tracking-tight text-foreground">Trading Console</span>
          <span className="hidden rounded-sm border border-primary/30 bg-primary/10 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-primary sm:inline">
            Terminal
          </span>
        </div>
        <div className="flex items-center gap-2">
          <ConsoleClock />
          <button
            type="button"
            onClick={() => setNqaiDocked((v) => !v)}
            className={cn(
              "hidden items-center gap-1.5 rounded-sm border px-2.5 py-1.5 text-[11px] font-medium transition-colors lg:flex",
              nqaiDocked
                ? "border-primary/40 bg-primary/10 text-primary hover:bg-primary/20"
                : "border-border bg-secondary text-muted-foreground hover:text-foreground",
            )}
            aria-pressed={nqaiDocked}
          >
            {nqaiDocked ? <PanelRightClose className="h-3.5 w-3.5" /> : <PanelRightOpen className="h-3.5 w-3.5" />}
            <Cpu className="h-3.5 w-3.5" />
            NQAi
          </button>
        </div>
      </div>

      <ConsoleTicker />

      {/* Desktop: resizable multi-panel grid */}
      <div className="hidden min-h-0 flex-1 lg:block">
        <ResizablePanelGroup direction="horizontal" className="h-full">
          {/* Left column: markets over commodity board */}
          <ResizablePanel defaultSize={28} minSize={18}>
            <ResizablePanelGroup direction="vertical">
              <ResizablePanel defaultSize={58} minSize={25}>
                <MarketsPanel />
              </ResizablePanel>
              <ResizableHandle withHandle />
              <ResizablePanel defaultSize={42} minSize={20}>
                <CommodityPanel />
              </ResizablePanel>
            </ResizablePanelGroup>
          </ResizablePanel>

          <ResizableHandle withHandle />

          {/* Center column: live spot deals */}
          <ResizablePanel defaultSize={nqaiDocked ? 36 : 72} minSize={25}>
            <SpotDealsPanel initialDeals={initialDeals} />
          </ResizablePanel>

          {/* Right column: dockable NQAi */}
          {nqaiDocked && (
            <>
              <ResizableHandle withHandle />
              <ResizablePanel defaultSize={36} minSize={22}>
                <NqaiChat variant="panel" />
              </ResizablePanel>
            </>
          )}
        </ResizablePanelGroup>
      </div>

      {/* Mobile / tablet: tabbed single-panel view */}
      <div className="flex min-h-0 flex-1 flex-col lg:hidden">
        <div className="flex shrink-0 border-b border-border bg-card">
          {(
            [
              { id: "markets", label: "Markets", icon: LineChart },
              { id: "deals", label: "Deals", icon: Ship },
              { id: "nqai", label: "NQAi", icon: Cpu },
            ] as const
          ).map((tab) => {
            const active = mobileTab === tab.id
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setMobileTab(tab.id)}
                className={cn(
                  "flex h-11 flex-1 items-center justify-center gap-1.5 text-xs font-medium transition-colors",
                  active
                    ? "border-b-2 border-primary text-primary"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                <tab.icon className="h-4 w-4" />
                {tab.label}
              </button>
            )
          })}
        </div>
        <div className="min-h-0 flex-1">
          {mobileTab === "markets" && (
            <ResizablePanelGroup direction="vertical" className="h-full">
              <ResizablePanel defaultSize={55}>
                <MarketsPanel />
              </ResizablePanel>
              <ResizableHandle withHandle />
              <ResizablePanel defaultSize={45}>
                <CommodityPanel />
              </ResizablePanel>
            </ResizablePanelGroup>
          )}
          {mobileTab === "deals" && <SpotDealsPanel initialDeals={initialDeals} />}
          {mobileTab === "nqai" && <NqaiChat variant="panel" />}
        </div>
      </div>

      {/* Status bar */}
      <div className="flex h-7 shrink-0 items-center justify-between border-t border-border bg-card px-3 text-[10px] text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <Activity className="h-3 w-3 text-success" />
          Market data live · Yahoo Finance
        </span>
        <span className="hidden sm:inline">NAFTAhub Terminal · MCC Capital</span>
      </div>
    </div>
  )
}
