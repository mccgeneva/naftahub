"use client"

import { useEffect, useMemo, useState } from "react"
import { Layers, Search, Loader2, Check } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Switch } from "@/components/ui/switch"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { ADMIN_PASSCODE } from "@/lib/admin-config"
import { PARTNER_BANKS, partnerBankByKey, type BankRegion, BANK_REGIONS, type BankAvailability } from "@/lib/partner-banks"
import {
  getBankInventoryAdmin,
  setBankAvailabilityAdmin,
} from "@/app/actions/bank-inventory"
import { toast } from "sonner"
import { cn } from "@/lib/utils"

type InventoryMap = Map<string, BankAvailability>
const keyOf = (bankKey: string, currency: string) => `${bankKey}::${currency}`

export function BankInventoryManager() {
  const [inventory, setInventory] = useState<InventoryMap>(new Map())
  const [loading, setLoading] = useState(true)
  const [savingKey, setSavingKey] = useState<string | null>(null)
  const [search, setSearch] = useState("")
  const [region, setRegion] = useState<BankRegion | "all">("all")
  // Draft capacity inputs keyed by bank::currency so typing doesn't fight state.
  const [drafts, setDrafts] = useState<Record<string, string>>({})

  const applyInventory = (rows: BankAvailability[]) => {
    const map: InventoryMap = new Map()
    for (const row of rows) map.set(keyOf(row.bankKey, row.currency), row)
    setInventory(map)
  }

  useEffect(() => {
    let active = true
    setLoading(true)
    getBankInventoryAdmin(ADMIN_PASSCODE)
      .then((res) => {
        if (!active) return
        if (!res.ok) {
          toast.error(res.error)
          return
        }
        applyInventory(res.inventory)
      })
      .finally(() => active && setLoading(false))
    return () => {
      active = false
    }
  }, [])

  const banks = useMemo(() => {
    const q = search.trim().toLowerCase()
    return PARTNER_BANKS.filter((b) => {
      if (region !== "all" && b.region !== region) return false
      if (!q) return true
      return (
        b.name.toLowerCase().includes(q) ||
        b.country.toLowerCase().includes(q) ||
        b.currencies.some((c) => c.toLowerCase().includes(q))
      )
    })
  }, [search, region])

  const save = async (
    bankKey: string,
    currency: string,
    patch: { enabled?: boolean; capacity?: number },
  ) => {
    const k = keyOf(bankKey, currency)
    setSavingKey(k)
    const res = await setBankAvailabilityAdmin(ADMIN_PASSCODE, bankKey, currency, patch)
    setSavingKey(null)
    if (!res.ok) {
      toast.error(res.error)
      // Revert any draft to the authoritative value.
      setDrafts((d) => {
        const next = { ...d }
        delete next[k]
        return next
      })
      return
    }
    applyInventory(res.inventory)
    setDrafts((d) => {
      const next = { ...d }
      delete next[k]
      return next
    })
    const bankName = partnerBankByKey(bankKey)?.name ?? bankKey
    toast.success("Account pool updated", {
      description: `${bankName} · ${currency}`,
    })
  }

  const totals = useMemo(() => {
    let pools = 0
    let enabled = 0
    let capacity = 0
    let allocated = 0
    for (const row of inventory.values()) {
      pools += 1
      if (row.enabled) enabled += 1
      capacity += row.capacity
      allocated += row.allocated
    }
    return { pools, enabled, capacity, allocated, remaining: Math.max(0, capacity - allocated) }
  }, [inventory])

  return (
    <Card className="bg-card border-border">
      <CardHeader>
        <CardTitle className="flex flex-wrap items-center gap-2 text-lg font-semibold">
          <Layers className="h-5 w-5 text-primary" />
          Partner Bank Availability &amp; Capacity
          <span className="ml-auto flex flex-wrap items-center gap-2 text-xs font-normal text-muted-foreground">
            <Badge variant="secondary" className="bg-secondary text-foreground">
              {totals.enabled}/{totals.pools} pools enabled
            </Badge>
            <Badge variant="secondary" className="bg-emerald-500/15 text-emerald-600 dark:text-emerald-400">
              {totals.remaining.toLocaleString("en-US")} accounts available
            </Badge>
          </span>
        </CardTitle>
        <p className="text-sm text-muted-foreground">
          Control which partner banks can issue accounts and how many remain in each currency pool.
          Clients only see, and the approval flow only allocates from, enabled pools with spare
          capacity.
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Filters */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search bank, country, or currency"
              className="pl-9"
            />
          </div>
          <Select value={region} onValueChange={(v) => setRegion(v as BankRegion | "all")}>
            <SelectTrigger className="sm:w-56">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All regions</SelectItem>
              {BANK_REGIONS.map((r) => (
                <SelectItem key={r} value={r}>
                  {r}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {loading ? (
          <div className="flex items-center justify-center gap-2 py-12 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading account pools…
          </div>
        ) : banks.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">
            No partner banks match your filters.
          </p>
        ) : (
          <div className="space-y-3">
            {banks.map((bank) => (
              <div key={bank.key} className="rounded-lg border border-border bg-secondary/20 p-4">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <div>
                    <p className="font-semibold text-foreground">{bank.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {bank.country} · {bank.bic}
                    </p>
                  </div>
                  <Badge variant="secondary" className="bg-secondary text-muted-foreground">
                    {bank.region}
                  </Badge>
                </div>

                <div className="mt-3 grid gap-2">
                  {bank.currencies.map((currency) => {
                    const k = keyOf(bank.key, currency)
                    const row = inventory.get(k)
                    const enabled = row?.enabled ?? true
                    const capacity = row?.capacity ?? 0
                    const allocated = row?.allocated ?? 0
                    const remaining = row?.remaining ?? Math.max(0, capacity - allocated)
                    const isSaving = savingKey === k
                    const draft = drafts[k]
                    const exhausted = enabled && remaining <= 0

                    return (
                      <div
                        key={currency}
                        className={cn(
                          "flex flex-wrap items-center gap-x-4 gap-y-2 rounded-md border border-border/60 bg-card px-3 py-2",
                          !enabled && "opacity-70",
                        )}
                      >
                        <span className="w-12 font-mono text-sm font-semibold text-foreground">
                          {currency}
                        </span>

                        <label className="flex items-center gap-2 text-sm text-muted-foreground">
                          <Switch
                            checked={enabled}
                            disabled={isSaving}
                            onCheckedChange={(checked) =>
                              save(bank.key, currency, { enabled: checked })
                            }
                            aria-label={`${enabled ? "Disable" : "Enable"} ${bank.name} ${currency} issuance`}
                          />
                          <span className={enabled ? "text-foreground" : ""}>
                            {enabled ? "Enabled" : "Disabled"}
                          </span>
                        </label>

                        <div className="flex items-center gap-2">
                          <span className="text-sm text-muted-foreground">Capacity</span>
                          <Input
                            type="number"
                            min={allocated}
                            inputMode="numeric"
                            disabled={isSaving}
                            value={draft ?? String(capacity)}
                            onChange={(e) =>
                              setDrafts((d) => ({ ...d, [k]: e.target.value }))
                            }
                            onKeyDown={(e) => {
                              if (e.key === "Enter") (e.target as HTMLInputElement).blur()
                            }}
                            onBlur={() => {
                              if (draft === undefined) return
                              const value = Number.parseInt(draft, 10)
                              if (!Number.isFinite(value) || String(value) === String(capacity)) {
                                setDrafts((d) => {
                                  const next = { ...d }
                                  delete next[k]
                                  return next
                                })
                                return
                              }
                              save(bank.key, currency, { capacity: value })
                            }}
                            className="h-9 w-24"
                          />
                        </div>

                        <span className="text-sm text-muted-foreground">
                          {allocated.toLocaleString("en-US")} issued ·{" "}
                          <span
                            className={cn(
                              "font-semibold",
                              exhausted
                                ? "text-rose-600 dark:text-rose-400"
                                : "text-emerald-600 dark:text-emerald-400",
                            )}
                          >
                            {remaining.toLocaleString("en-US")} available
                          </span>
                        </span>

                        <span className="ml-auto flex items-center text-xs text-muted-foreground">
                          {isSaving ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : exhausted ? (
                            <Badge
                              variant="secondary"
                              className="bg-rose-500/15 text-rose-600 dark:text-rose-400"
                            >
                              Pool exhausted
                            </Badge>
                          ) : !enabled ? (
                            <Badge variant="secondary" className="bg-secondary text-muted-foreground">
                              Closed to new issuance
                            </Badge>
                          ) : (
                            <span className="flex items-center gap-1 text-emerald-600 dark:text-emerald-400">
                              <Check className="h-3.5 w-3.5" /> Accepting
                            </span>
                          )}
                        </span>
                      </div>
                    )
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
