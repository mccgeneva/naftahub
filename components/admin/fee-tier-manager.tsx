"use client"

import { useEffect, useMemo, useState } from "react"
import { Layers, Save, Loader2, RotateCcw, Plus, Trash2, Calculator, UserCog } from "lucide-react"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { toast } from "sonner"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Input } from "@/components/ui/input"
import { MoneyInput } from "@/components/ui/money-input"
import { calculateTieredFee, DEFAULT_FEE_TIERS, type FeeTier } from "@/lib/tiered-fees"

/** A tier row in the editor. `max` empty string = unbounded top tier. */
interface EditRow {
  min: string
  max: string
  /** Rate as a PERCENT string in the UI (e.g. "2" for 2%). */
  ratePct: string
}

function toRows(tiers: FeeTier[]): EditRow[] {
  return tiers.map((t) => ({
    min: String(t.min),
    max: t.max == null ? "" : String(t.max),
    ratePct: String(+(t.rate * 100).toFixed(6)),
  }))
}

function rowsToTiers(rows: EditRow[]): FeeTier[] {
  return rows.map((r) => ({
    min: Number(r.min.replace(/[^0-9.]/g, "")) || 0,
    max: r.max.trim() === "" ? null : Number(r.max.replace(/[^0-9.]/g, "")) || 0,
    rate: (Number(r.ratePct) || 0) / 100,
  }))
}

function fmt(n: number) {
  return n.toLocaleString("en-US", { maximumFractionDigits: 2 })
}

interface ClientRow {
  id: string
  fullName?: string
  company?: string
  email?: string
}

interface OverrideRow {
  userId: string
  tiers: FeeTier[]
  updatedAt: string
}

const STANDARD = "__standard__"

function clientLabel(c: ClientRow | undefined, fallback: string) {
  if (!c) return fallback
  const name = c.fullName || c.email || c.id
  return c.company ? `${name} — ${c.company}` : name
}

function ratesSummary(tiers: FeeTier[]) {
  const first = tiers[0]?.rate ?? 0
  return `${(first * 100).toLocaleString("en-US", { maximumFractionDigits: 3 })}% first tier`
}

async function postFeeTiers(body: Record<string, unknown>) {
  const resp = await fetch("/api/fee-tiers", {
    method: "POST",
    credentials: "include",
    cache: "no-store",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  })
  return resp.json()
}

export function FeeTierManager({ passcode }: { passcode: string }) {
  const [rows, setRows] = useState<EditRow[]>(toRows(DEFAULT_FEE_TIERS))
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [sample, setSample] = useState("3500000")
  const [scope, setScope] = useState<string>(STANDARD)
  const [clients, setClients] = useState<ClientRow[]>([])
  const [overrides, setOverrides] = useState<OverrideRow[]>([])
  const [globalTiers, setGlobalTiers] = useState<FeeTier[]>(DEFAULT_FEE_TIERS)
  const [customerHasCustom, setCustomerHasCustom] = useState(false)
  const [clientQuery, setClientQuery] = useState("")
  const [discountPct, setDiscountPct] = useState("")

  const isCustomer = scope !== STANDARD
  const selectedClient = clients.find((c) => c.id === scope)
  const clientById = useMemo(() => new Map(clients.map((c) => [c.id, c])), [clients])

  const refreshList = async () => {
    try {
      const data = await postFeeTiers({ pin: passcode, op: "list" })
      if (data.ok) {
        setClients(Array.isArray(data.clients) ? data.clients : [])
        setOverrides(Array.isArray(data.overrides) ? data.overrides : [])
        if (Array.isArray(data.globalTiers) && data.globalTiers.length) setGlobalTiers(data.globalTiers)
      }
    } catch {
      // roster is optional — the standard table still works
    }
  }

  useEffect(() => {
    void refreshList()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [passcode])

  useEffect(() => {
    let active = true
    setLoading(true)
    setLoadError(null)
    ;(async () => {
      try {
        if (scope === STANDARD) {
          const data = await postFeeTiers({ pin: passcode, op: "list" })
          if (!active) return
          if (data.ok && Array.isArray(data.globalTiers) && data.globalTiers.length) {
            setRows(toRows(data.globalTiers as FeeTier[]))
            setGlobalTiers(data.globalTiers as FeeTier[])
          } else if (!data.ok) {
            setLoadError("Could not load the current fee table — showing defaults.")
          }
          setCustomerHasCustom(false)
        } else {
          const data = await postFeeTiers({ pin: passcode, op: "load-customer", userId: scope })
          if (!active) return
          if (data.ok && Array.isArray(data.tiers) && data.tiers.length) {
            setRows(toRows(data.tiers as FeeTier[]))
            setCustomerHasCustom(!!data.custom)
          } else {
            setLoadError(data.error || "Could not load this customer's fees.")
          }
        }
      } catch {
        if (active) setLoadError("Could not load the current fee table — showing defaults.")
      } finally {
        if (active) setLoading(false)
      }
    })()
    return () => {
      active = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [passcode, scope])

  const filteredClients = useMemo(() => {
    const q = clientQuery.trim().toLowerCase()
    const list = q
      ? clients.filter((c) =>
          [c.fullName, c.company, c.email].some((v) => (v ?? "").toLowerCase().includes(q)),
        )
      : clients
    return list.slice(0, 50)
  }, [clients, clientQuery])

  /** Scale every tier rate by (1 − discount%) — e.g. 25% off turns 2% into 1.5%. */
  const applyDiscount = () => {
    const d = Number(discountPct)
    if (!Number.isFinite(d) || d <= 0 || d >= 100) {
      toast.error("Enter a discount between 0 and 100%")
      return
    }
    setRows((prev) =>
      prev.map((r) => ({
        ...r,
        ratePct: String(+((Number(r.ratePct) || 0) * (1 - d / 100)).toFixed(4)),
      })),
    )
  }

  const removeCustomerTable = async () => {
    if (!isCustomer) return
    setSaving(true)
    try {
      const data = await postFeeTiers({ pin: passcode, op: "delete-customer", userId: scope })
      if (data.ok) {
        if (Array.isArray(data.tiers)) setRows(toRows(data.tiers as FeeTier[]))
        setCustomerHasCustom(false)
        toast.success("Back on standard fees", {
          description: `${clientLabel(selectedClient, "This customer")} now pays the standard rates.`,
        })
        void refreshList()
      } else {
        toast.error("Couldn't reset", { description: data.error || "Please try again." })
      }
    } catch {
      toast.error("Couldn't reach the server", { description: "Please try again." })
    } finally {
      setSaving(false)
    }
  }

  const tiers = useMemo(() => rowsToTiers(rows), [rows])

  // Validation: ascending mins, exactly one unbounded (last) tier, rates 0–100%.
  const validation = useMemo(() => {
    if (rows.length === 0) return "Add at least one tier."
    const sorted = [...tiers].sort((a, b) => a.min - b.min)
    for (const t of tiers) {
      if (!Number.isFinite(t.min) || t.min < 0) return "Each tier needs a valid lower bound."
      if (t.max != null && (!Number.isFinite(t.max) || t.max <= t.min)) return "Each tier's upper bound must exceed its lower bound."
      if (!Number.isFinite(t.rate) || t.rate < 0 || t.rate > 1) return "Rates must be between 0% and 100%."
    }
    const unbounded = tiers.filter((t) => t.max == null)
    if (unbounded.length !== 1) return "Exactly one tier must be the unbounded top tier (empty upper bound)."
    if (sorted[sorted.length - 1].max != null) return "The unbounded tier must be the highest (largest lower bound)."
    return null
  }, [rows, tiers])

  const sampleQuote = useMemo(() => {
    const amt = Number(sample.replace(/[^0-9.]/g, "")) || 0
    return calculateTieredFee(amt, validation ? DEFAULT_FEE_TIERS : tiers)
  }, [sample, tiers, validation])

  const updateRow = (i: number, patch: Partial<EditRow>) =>
    setRows((prev) => prev.map((r, idx) => (idx === i ? { ...r, ...patch } : r)))

  const addRow = () =>
    setRows((prev) => {
      // New bracket seeded above the current highest bounded min.
      const maxMin = prev.reduce((m, r) => Math.max(m, Number(r.min.replace(/[^0-9.]/g, "")) || 0), 0)
      return [...prev, { min: String(maxMin + 1_000_000), max: "", ratePct: "0.1" }]
    })

  const removeRow = (i: number) => setRows((prev) => prev.filter((_, idx) => idx !== i))

  const resetDefaults = () => setRows(toRows(isCustomer ? globalTiers : DEFAULT_FEE_TIERS))

  const save = async () => {
    if (validation) {
      toast.error("Fix the tier table first", { description: validation })
      return
    }
    setSaving(true)
    try {
      const data = await postFeeTiers(
        isCustomer
          ? { pin: passcode, op: "save-customer", userId: scope, tiers }
          : { pin: passcode, op: "save-global", tiers },
      )
      if (data.ok && Array.isArray(data.tiers)) {
        setRows(toRows(data.tiers as FeeTier[]))
        if (isCustomer) {
          setCustomerHasCustom(true)
          toast.success("Custom fees saved", {
            description: `${clientLabel(selectedClient, "This customer")} now pays these rates on every payment.`,
          })
        } else {
          setGlobalTiers(data.tiers as FeeTier[])
          toast.success("Fee tiers updated", {
            description: "The standard table now applies to every customer without custom fees.",
          })
        }
        void refreshList()
      } else if (data.reason === "unauthorized") {
        toast.error("Administrator authorization failed", { description: "Re-open the panel with your passcode." })
      } else {
        toast.error("Couldn't save", { description: data.error || "Please try again." })
      }
    } catch {
      toast.error("Couldn't reach the server", { description: "Please try again." })
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Layers className="h-5 w-5 text-primary" />
            Transaction Fee Tiers
          </CardTitle>
          <CardDescription>
            A progressive, bracket-based fee applied to every incoming and outgoing payment: each portion of the amount
            is charged only at the rate of its own tier (marginal pricing). Thresholds are in native currency units.
            Set the standard table, or pick a customer to give them their own rates.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          {/* Who these fees apply to */}
          <div className="space-y-2 rounded-lg border border-border p-3">
            <Label className="flex items-center gap-2 text-sm font-medium">
              <UserCog className="h-4 w-4 text-primary" />
              Apply fees to
            </Label>
            <Select value={scope} onValueChange={setScope}>
              <SelectTrigger className="h-11 w-full text-base">
                <SelectValue placeholder="Choose who these fees apply to" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={STANDARD}>Standard fees (all customers)</SelectItem>
                {selectedClient && !filteredClients.some((c) => c.id === selectedClient.id) && (
                  <SelectItem value={selectedClient.id}>{clientLabel(selectedClient, selectedClient.id)}</SelectItem>
                )}
                {filteredClients.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {clientLabel(c, c.id)}
                    {overrides.some((o) => o.userId === c.id) ? " · custom" : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {clients.length > 20 && (
              <Input
                className="h-11 text-base"
                placeholder="Filter customers by name, company or email"
                value={clientQuery}
                onChange={(e) => setClientQuery(e.target.value)}
              />
            )}
            {isCustomer ? (
              <p className={customerHasCustom ? "text-xs text-primary" : "text-xs text-muted-foreground"}>
                {customerHasCustom
                  ? "This customer has custom fees. Edit and save, or put them back on standard fees."
                  : "This customer pays the standard fees. Edit below and save to give them their own rates."}
              </p>
            ) : (
              <p className="text-xs text-muted-foreground">
                The standard table applies to every customer who doesn&apos;t have custom fees.
              </p>
            )}
          </div>

          {!isCustomer && overrides.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Customers with custom fees ({overrides.length})
              </p>
              <div className="flex flex-col gap-2">
                {overrides.map((o) => (
                  <button
                    key={o.userId}
                    type="button"
                    onClick={() => setScope(o.userId)}
                    className="flex min-h-11 items-center justify-between gap-3 rounded-lg border border-border px-3 py-2 text-left text-sm hover:bg-muted/40"
                  >
                    <span className="min-w-0 truncate text-foreground">
                      {clientLabel(clientById.get(o.userId), o.userId)}
                    </span>
                    <span className="shrink-0 text-xs text-primary">{ratesSummary(o.tiers)}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {loading ? (
            <div className="flex items-center gap-2 py-8 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading current fee tiers…
            </div>
          ) : (
            <>
              {loadError && <p className="text-[11px] text-amber-600">{loadError}</p>}

              {/* Column headers (hidden on mobile, shown from sm) */}
              <div className="hidden gap-2 px-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground sm:grid sm:grid-cols-[1fr_1fr_90px_36px]">
                <span>From</span>
                <span>To (blank = ∞)</span>
                <span>Rate %</span>
                <span />
              </div>

              <div className="space-y-3">
                {rows.map((row, i) => (
                  <div
                    key={i}
                    className="grid grid-cols-1 gap-2 rounded-lg border border-border p-3 sm:grid-cols-[1fr_1fr_90px_36px] sm:items-center sm:border-0 sm:p-0"
                  >
                    <div className="space-y-1">
                      <Label className="text-[11px] sm:hidden">From</Label>
                      <MoneyInput placeholder="0" value={row.min} onValueChange={(v) => updateRow(i, { min: v })} />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-[11px] sm:hidden">To (blank = no cap)</Label>
                      <MoneyInput
                        placeholder="∞ (top tier)"
                        value={row.max}
                        onValueChange={(v) => updateRow(i, { max: v })}
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-[11px] sm:hidden">Rate %</Label>
                      <Input
                        inputMode="decimal"
                        placeholder="2"
                        value={row.ratePct}
                        onChange={(e) => updateRow(i, { ratePct: e.target.value.replace(/[^0-9.]/g, "") })}
                      />
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-9 w-9 shrink-0 text-muted-foreground hover:text-destructive"
                      onClick={() => removeRow(i)}
                      aria-label={`Remove tier ${i + 1}`}
                      disabled={rows.length <= 1}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
              </div>

              <Button type="button" variant="outline" size="sm" className="gap-2" onClick={addRow}>
                <Plus className="h-4 w-4" />
                Add tier
              </Button>

              {isCustomer && (
                <div className="space-y-2 rounded-lg border border-border bg-muted/30 p-3">
                  <Label className="text-sm font-medium">Quick discount on every tier</Label>
                  <p className="text-xs text-muted-foreground">
                    E.g. 25% turns 2% into 1.5%. Or edit each rate above directly.
                  </p>
                  <div className="flex gap-2">
                    <Input
                      inputMode="decimal"
                      className="h-11 text-base"
                      placeholder="Discount %"
                      value={discountPct}
                      onChange={(e) => setDiscountPct(e.target.value.replace(/[^0-9.]/g, ""))}
                    />
                    <Button type="button" variant="outline" className="h-11 shrink-0" onClick={applyDiscount}>
                      Apply
                    </Button>
                  </div>
                </div>
              )}

              {validation && <p className="text-[11px] text-destructive">{validation}</p>}

              {/* Live sample calculation */}
              <div className="space-y-2 rounded-lg border border-border bg-muted/30 p-3">
                <Label className="flex items-center gap-2 text-sm font-medium">
                  <Calculator className="h-4 w-4 text-primary" />
                  Sample calculation
                </Label>
                <MoneyInput placeholder="3,500,000" value={sample} onValueChange={setSample} />
                <div className="space-y-0.5 text-xs">
                  {sampleQuote.breakdown.map((b, i) => (
                    <div key={i} className="flex items-center justify-between text-muted-foreground">
                      <span>
                        {fmt(b.min)}
                        {b.max == null ? "+" : ` – ${fmt(b.max)}`} @ {(b.rate * 100).toLocaleString("en-US", { maximumFractionDigits: 2 })}% on {fmt(b.amountInTier)}
                      </span>
                      <span className="text-foreground">{fmt(b.fee)}</span>
                    </div>
                  ))}
                  <div className="flex items-center justify-between border-t border-border pt-1 font-medium">
                    <span className="text-foreground">
                      Total fee ({(sampleQuote.effectiveRate * 100).toLocaleString("en-US", { maximumFractionDigits: 2 })}% effective)
                    </span>
                    <span className="text-foreground">{fmt(sampleQuote.totalFee)}</span>
                  </div>
                </div>
              </div>

              <div className="flex flex-col gap-2 sm:flex-row">
                <Button onClick={save} disabled={saving || !!validation} className="w-full gap-2">
                  {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                  {isCustomer ? "Save customer fees" : "Save standard fees"}
                </Button>
                <Button onClick={resetDefaults} disabled={saving} variant="outline" className="w-full gap-2 sm:w-auto">
                  <RotateCcw className="h-4 w-4" />
                  {isCustomer ? "Load standard" : "Reset to defaults"}
                </Button>
              </div>
              {isCustomer && customerHasCustom && (
                <Button
                  onClick={removeCustomerTable}
                  disabled={saving}
                  variant="ghost"
                  className="w-full gap-2 text-destructive hover:text-destructive"
                >
                  <Trash2 className="h-4 w-4" />
                  Put back on standard fees
                </Button>
              )}
            </>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
