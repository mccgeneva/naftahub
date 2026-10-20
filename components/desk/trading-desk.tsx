"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import useSWR from "swr"
import { Maximize2, Minimize2, Terminal } from "lucide-react"
import { useCurrentUser } from "@/lib/use-current-user"
import { useActivityLog } from "@/components/activity-tracker"
import { useMarketQuotes } from "@/lib/use-market"
import {
  DEFAULT_DESK_LAYOUT,
  DESK_PANELS,
  DESK_TILE_OPTIONS,
  normalizeDeskLayout,
  type DeskLayout,
  type DeskPanelId,
  type DeskTiles,
} from "@/lib/desk-layout"
import {
  AlertsPanel,
  BlotterPanel,
  ChartPanel,
  DESK_UNIVERSE,
  MessagesPanel,
  NewsPanel,
  QuotesPanel,
  RiskPanel,
  TicketPanel,
  useDeskBook,
  fmtPrice,
  type AssetClass,
  type DeskLog,
} from "@/components/desk/desk-panels"
import { BankInstrumentsPanel, CompanySearchPanel, HeadlinesPanel } from "@/components/desk/desk-lookup-panels"
import { cn } from "@/lib/utils"

const ASSET_KEYS: Array<{ id: AssetClass | "All"; code: string }> = [
  { id: "All", code: "ALL" },
  { id: "Forex", code: "CRNCY" },
  { id: "Commodities", code: "CMDTY" },
  { id: "Equities", code: "EQUITY" },
  { id: "Indices", code: "INDEX" },
  { id: "Crypto", code: "CRYPTO" },
]

const GRID_CLASS: Record<DeskTiles, string> = {
  1: "lg:grid-cols-1 lg:grid-rows-1",
  2: "lg:grid-cols-2 lg:grid-rows-1",
  4: "lg:grid-cols-2 lg:grid-rows-2",
  6: "lg:grid-cols-3 lg:grid-rows-2",
  8: "lg:grid-cols-4 lg:grid-rows-2",
}

const panelMeta = (id: DeskPanelId) => DESK_PANELS.find((p) => p.id === id)!

export function TradingDesk() {
  const user = useCurrentUser()
  const activity = useActivityLog()
  const log = useCallback<DeskLog>(
    (action, details) => activity({ action, category: "Trading Desk", details }),
    [activity],
  )

  const { data } = useSWR<{ ok: boolean; layout: DeskLayout }>("/api/desk/layout", (u: string) =>
    fetch(u).then((r) => r.json()),
  )
  const [layout, setLayout] = useState<DeskLayout>(DEFAULT_DESK_LAYOUT)
  const loadedRef = useRef(false)
  useEffect(() => {
    if (!loadedRef.current && data?.ok && data.layout) {
      loadedRef.current = true
      setLayout(normalizeDeskLayout(data.layout))
    }
  }, [data])

  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const update = useCallback((patch: Partial<DeskLayout>, audit?: string) => {
    setLayout((prev) => {
      const next = normalizeDeskLayout({ ...prev, ...patch })
      if (saveTimer.current) clearTimeout(saveTimer.current)
      saveTimer.current = setTimeout(() => {
        void fetch("/api/desk/layout", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ layout: next }),
        })
      }, 600)
      return next
    })
    if (audit)
      log(audit, {
        symbol: patch.symbol,
        tiles: patch.tiles,
        slots: patch.slots?.join(","),
      })
  }, [log])

  const [activeSlot, setActiveSlot] = useState(0)
  const [maximized, setMaximized] = useState<number | null>(null)
  const [assetClass, setAssetClass] = useState<AssetClass | "All">("All")
  const [command, setCommand] = useState("")
  const [cmdStatus, setCmdStatus] = useState<{ tone: "ok" | "info" | "error"; text: string } | null>(null)
  const cmdInputRef = useRef<HTMLInputElement>(null)

  const symbols = useMemo(() => {
    const set = new Set(DESK_UNIVERSE.map((i) => i.symbol))
    set.add(layout.symbol)
    return [...set]
  }, [layout.symbol])
  const { quotes } = useMarketQuotes(symbols)
  const book = useDeskBook(user.id, quotes)

  const loadSecurity = useCallback(
    (sym: string) => {
      const s = sym.trim().toUpperCase()
      if (!s || s === layout.symbol) return
      update({ symbol: s }, `Desk loaded security ${s}`)
    },
    [layout.symbol, update],
  )

  const visible = layout.slots.slice(0, layout.tiles)
  const focusSlot = Math.min(activeSlot, layout.tiles - 1)

  const setSlotPanel = useCallback(
    (slot: number, panel: DeskPanelId) => {
      const slots = [...layout.slots]
      const existing = slots.indexOf(panel)
      if (existing >= 0 && existing !== slot) [slots[existing], slots[slot]] = [slots[slot], panel]
      else slots[slot] = panel
      update({ slots }, `Desk panel ${slot + 1} set to ${panelMeta(panel).label}`)
    },
    [layout.slots, update],
  )

  // F1–F11 place the matching function into the focused panel; Esc restores the grid.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const m = /^F([1-9]|1[01])$/.exec(e.key)
      if (m) {
        e.preventDefault()
        const panel = DESK_PANELS[Number(m[1]) - 1].id
        const shown = visible.indexOf(panel)
        if (shown >= 0) setActiveSlot(shown)
        else setSlotPanel(focusSlot, panel)
      } else if (e.key === "Escape") {
        setMaximized(null)
      }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [visible, focusSlot, setSlotPanel])

  const showPanel = useCallback(
    (panel: DeskPanelId) => {
      const shown = visible.indexOf(panel)
      if (shown >= 0) setActiveSlot(shown)
      else setSlotPanel(focusSlot, panel)
    },
    [visible, focusSlot, setSlotPanel],
  )

  // Command line: "<SECURITY> <GO>" loads a security, "/<function>" opens one.
  // Every path gives visible feedback so GO never looks dead.
  const runCommand = () => {
    const raw = command.trim()
    if (!raw) {
      setCmdStatus({ tone: "info", text: "Type a security (e.g. AAPL, EURUSD, HSBC) or /companies, /instruments, /headlines, then GO." })
      cmdInputRef.current?.focus()
      return
    }
    setCommand("")
    if (raw.startsWith("/")) {
      const name = raw.slice(1).toLowerCase()
      const panel = DESK_PANELS.find((p) => p.id === name || p.label.toLowerCase() === name)
      if (!panel) {
        setCmdStatus({
          tone: "error",
          text: `Unknown function "${raw}". Try: ${DESK_PANELS.map((p) => "/" + p.label.toLowerCase()).join(" ")}`,
        })
        return
      }
      showPanel(panel.id)
      setCmdStatus({ tone: "ok", text: `${panel.key} ${panel.label} opened.` })
      return
    }
    const sym = raw.replace(/\s*<?GO>?$/i, "").trim().toUpperCase()
    if (!sym) return
    if (sym !== layout.symbol) loadSecurity(sym)
    showPanel("chart")
    setCmdStatus({
      tone: "ok",
      text: sym === layout.symbol ? `${sym} is already loaded — showing chart.` : `${sym} loaded into chart, news and ticket.`,
    })
  }

  const renderPanel = (id: DeskPanelId) => {
    switch (id) {
      case "quotes":
        return <QuotesPanel quotes={quotes} assetClass={assetClass} symbol={layout.symbol} onSelect={loadSecurity} />
      case "chart":
        return <ChartPanel symbol={layout.symbol} />
      case "news":
        return <NewsPanel symbol={layout.symbol} />
      case "ticket":
        return <TicketPanel symbol={layout.symbol} quotes={quotes} log={log} />
      case "blotter":
        return <BlotterPanel book={book} onSelect={loadSecurity} />
      case "risk":
        return <RiskPanel book={book} />
      case "alerts":
        return <AlertsPanel book={book} quotes={quotes} />
      case "messages":
        return <MessagesPanel symbol={layout.symbol} log={log} />
      case "search":
        return <CompanySearchPanel onLoad={loadSecurity} log={log} />
      case "instruments":
        return <BankInstrumentsPanel log={log} />
      case "headlines":
        return <HeadlinesPanel symbol={layout.symbol} onLoad={loadSecurity} log={log} />
    }
  }

  const q = quotes[layout.symbol]
  const decimals = DESK_UNIVERSE.find((i) => i.symbol === layout.symbol)?.decimals ?? 2

  return (
    <div className="terminal-desk -m-4 flex min-h-[calc(100dvh-8rem)] flex-col gap-3 p-3 md:-m-6 md:p-4">
      <header className="flex flex-col gap-2 border-b border-border pb-2 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex items-center gap-2">
          <Terminal className="size-5 text-primary" aria-hidden />
          <h1 className="text-balance text-lg font-semibold uppercase tracking-wider text-foreground">Trading Desk</h1>
          <span className="rounded bg-primary px-1.5 py-0.5 font-mono text-[10px] font-semibold text-primary-foreground">
            LIVE
          </span>
        </div>
        <div className="flex items-baseline gap-3 font-mono">
          <span className="text-sm font-semibold text-foreground">{layout.symbol}</span>
          <span className="text-sm tabular-nums text-foreground">{fmtPrice(q?.price, decimals)}</span>
          {q && (
            <span className={cn("text-xs tabular-nums", q.changePct >= 0 ? "text-emerald-500" : "text-red-500")}>
              {q.changePct >= 0 ? "+" : ""}
              {q.changePct.toFixed(2)}%
            </span>
          )}
        </div>
      </header>

      {/* Command line */}
      <form
        onSubmit={(e) => {
          e.preventDefault()
          runCommand()
        }}
        className="flex items-center gap-2 rounded-md border border-primary/50 bg-card px-3"
      >
        <span className="font-mono text-xs font-semibold text-primary">{">"}</span>
        <label htmlFor="desk-cmd" className="sr-only">
          Desk command
        </label>
        <input
          ref={cmdInputRef}
          id="desk-cmd"
          value={command}
          onChange={(e) => {
            setCommand(e.target.value)
            if (cmdStatus) setCmdStatus(null)
          }}
          enterKeyHint="go"
          placeholder="AAPL <GO> · /companies · /instruments"
          autoComplete="off"
          autoCorrect="off"
          autoCapitalize="characters"
          spellCheck={false}
          className="min-h-11 flex-1 bg-transparent font-mono text-base uppercase text-foreground placeholder:normal-case placeholder:text-muted-foreground focus:outline-none md:text-sm"
        />
        <button type="submit" className="min-h-9 rounded bg-primary px-3 font-mono text-xs font-semibold text-primary-foreground">
          GO
        </button>
      </form>
      {cmdStatus && (
        <p
          role="status"
          aria-live="polite"
          className={cn(
            "-mt-1 px-1 font-mono text-xs leading-relaxed",
            cmdStatus.tone === "error" ? "text-red-500" : cmdStatus.tone === "ok" ? "text-emerald-500" : "text-muted-foreground",
          )}
        >
          {cmdStatus.text}
        </p>
      )}

      {/* Asset-class keys + tile count */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex gap-1 overflow-x-auto" role="group" aria-label="Asset class">
          {ASSET_KEYS.map((a) => (
            <button
              key={a.id}
              type="button"
              onClick={() => setAssetClass(a.id)}
              aria-pressed={assetClass === a.id}
              className={cn(
                "min-h-9 shrink-0 rounded px-2.5 font-mono text-[11px] font-semibold",
                assetClass === a.id ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground",
              )}
            >
              {a.code}
            </button>
          ))}
        </div>
        <div className="ml-auto hidden items-center gap-1 lg:flex" role="group" aria-label="Panels on screen">
          <span className="mr-1 text-xs text-muted-foreground">Panels</span>
          {DESK_TILE_OPTIONS.map((n) => (
            <button
              key={n}
              type="button"
              onClick={() => update({ tiles: n }, `Desk layout set to ${n} panels`)}
              aria-pressed={layout.tiles === n}
              className={cn(
                "min-h-9 min-w-9 rounded font-mono text-xs font-semibold",
                layout.tiles === n ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground",
              )}
            >
              {n}
            </button>
          ))}
        </div>
      </div>

      {/* Function keys (mobile: one panel at a time) */}
      <nav className="flex gap-1 overflow-x-auto lg:hidden" aria-label="Desk functions">
        {DESK_PANELS.map((p) => (
          <button
            key={p.id}
            type="button"
            onClick={() => setSlotPanel(0, p.id)}
            aria-pressed={visible[0] === p.id && layout.tiles >= 1}
            className={cn(
              "flex min-h-11 shrink-0 flex-col items-center justify-center rounded px-3",
              layout.slots[0] === p.id ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground",
            )}
          >
            <span className="font-mono text-[9px] opacity-80">{p.key}</span>
            <span className="text-xs font-semibold">{p.label}</span>
          </button>
        ))}
      </nav>

      {/* Mobile: single focused panel */}
      <section className="flex h-[70dvh] flex-col overflow-hidden rounded-md border border-border bg-card lg:hidden">
        <PanelHeader id={layout.slots[0]} />
        <div className="min-h-0 flex-1">{renderPanel(layout.slots[0])}</div>
      </section>

      {/* Desktop: tiled workstation */}
      <div
        className={cn(
          "hidden min-h-0 flex-1 gap-2 lg:grid",
          maximized == null ? GRID_CLASS[layout.tiles] : "lg:grid-cols-1 lg:grid-rows-1",
        )}
        style={{ minHeight: "calc(100dvh - 15rem)" }}
      >
        {visible.map((id, slot) => {
          if (maximized != null && maximized !== slot) return null
          return (
            <section
              key={`${slot}-${id}`}
              onMouseDown={() => setActiveSlot(slot)}
              className={cn(
                "flex min-h-64 min-w-0 flex-col overflow-hidden rounded-md border bg-card",
                focusSlot === slot ? "border-primary" : "border-border",
              )}
            >
              <div className="flex items-center gap-2 border-b border-border px-2 py-1">
                <span className="font-mono text-[10px] text-muted-foreground">{slot + 1}</span>
                <label htmlFor={`slot-${slot}`} className="sr-only">
                  Panel {slot + 1} function
                </label>
                <select
                  id={`slot-${slot}`}
                  value={id}
                  onChange={(e) => setSlotPanel(slot, e.target.value as DeskPanelId)}
                  className="bg-transparent font-mono text-xs font-semibold uppercase text-foreground focus:outline-none"
                >
                  {DESK_PANELS.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.key} {p.label}
                    </option>
                  ))}
                </select>
                <span className="truncate text-[11px] text-muted-foreground">{panelMeta(id).desc}</span>
                <button
                  type="button"
                  onClick={() => setMaximized(maximized === slot ? null : slot)}
                  className="ml-auto rounded p-1 text-muted-foreground hover:text-foreground"
                  aria-label={maximized === slot ? "Restore panel" : "Maximize panel"}
                >
                  {maximized === slot ? <Minimize2 className="size-3.5" /> : <Maximize2 className="size-3.5" />}
                </button>
              </div>
              <div className="min-h-0 flex-1">{renderPanel(id)}</div>
            </section>
          )
        })}
      </div>

      <p className="hidden font-mono text-[10px] text-muted-foreground lg:block">
        F1–F11 functions · Esc restore · type a security then GO · layout saves automatically
      </p>
    </div>
  )
}

function PanelHeader({ id }: { id: DeskPanelId }) {
  const p = panelMeta(id)
  return (
    <div className="flex items-baseline gap-2 border-b border-border px-3 py-2">
      <span className="font-mono text-xs font-semibold uppercase text-foreground">{p.label}</span>
      <span className="truncate text-[11px] text-muted-foreground">{p.desc}</span>
    </div>
  )
}
