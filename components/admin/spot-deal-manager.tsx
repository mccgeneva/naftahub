"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import {
  Ship,
  Search,
  Plus,
  Pencil,
  Trash2,
  Loader2,
  Tag,
  Megaphone,
  Ban,
  Clock,
  Download,
  Anchor,
  Gauge,
  Satellite,
  CheckCircle2,
  ExternalLink,
  ShieldCheck,
  ShieldAlert,
  ShieldQuestion,
  RefreshCw,
} from "lucide-react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Textarea } from "@/components/ui/textarea"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { ScrollArea } from "@/components/ui/scroll-area"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { cn } from "@/lib/utils"
import { toast } from "sonner"
import { ADMIN_PASSCODE } from "@/lib/admin-config"
import {
  PETROLEUM_PRODUCTS,
  COMMODITY_CATEGORIES,
  getCatalogProduct,
} from "@/lib/petroleum-products"
import {
  VESSEL_TYPE_LABELS,
  VESSEL_TYPES,
  VESSEL_STATUSES,
  VESSEL_STATUS_LABELS,
  SPOT_DEAL_STATUS_LABELS,
  computeTotalValue,
  dealCountdown,
  type Vessel,
  type VesselType,
  type VesselStatus,
  type SpotDeal,
} from "@/lib/spot-deals-shared"
import {
  listVesselsAdmin,
  upsertVesselAdmin,
  deleteVesselAdmin,
  importVesselFromProvider,
  rescreenVesselAdmin,
  getVesselProviderStatus,
  listSpotDealsAdmin,
  createSpotDealAdmin,
  publishSpotDealAdmin,
  withdrawSpotDealAdmin,
  type CreateSpotDealInput,
} from "@/app/actions/spot-deals"
import { VESSEL_PROVIDERS, type VesselCompliance } from "@/lib/spot-deals-shared"

const CURRENCIES = ["USD", "EUR", "GBP", "CHF", "AED", "SGD"]
const INCOTERMS = ["FOB", "CIF", "CFR", "FCA", "DES", "DAP"]

/** Compact sanctions / IMO-validity badge shown on each vessel row. */
function ComplianceBadge({ compliance }: { compliance?: VesselCompliance }) {
  if (!compliance) return null
  const map = {
    clear: { cls: "border-emerald-500/30 bg-emerald-500/10 text-emerald-600", Icon: ShieldCheck, label: "Clear" },
    flagged: { cls: "border-red-500/40 bg-red-500/10 text-red-600", Icon: ShieldAlert, label: "Sanctions hit" },
    unverified: { cls: "border-amber-500/30 bg-amber-500/10 text-amber-600", Icon: ShieldQuestion, label: "Unverified" },
  }[compliance.status]
  return (
    <Badge variant="outline" className={cn("gap-1 text-[10px]", map.cls)} title={compliance.note}>
      <map.Icon className="h-3 w-3" />
      {map.label}
    </Badge>
  )
}

const TYPE_BADGE: Record<VesselType, string> = {
  crude: "border-amber-500/30 bg-amber-500/10 text-amber-600",
  product: "border-blue-500/30 bg-blue-500/10 text-blue-600",
  gas: "border-emerald-500/30 bg-emerald-500/10 text-emerald-600",
}

function formatMoney(value: number, currency: string): string {
  return `${currency} ${value.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

const emptyVessel: Vessel = {
  imo: "",
  name: "",
  type: "crude",
  vesselClass: "",
  capacity: 0,
  capacityUnit: "DWT",
  status: "idle",
  location: "",
  flag: "",
  builtYear: undefined,
  cargo: "",
  source: "manual",
  updatedAt: "",
}

// --- Vessel catalogue -------------------------------------------------------

function VesselCatalogue({ onVesselsChanged }: { onVesselsChanged: (v: Vessel[]) => void }) {
  const [vessels, setVessels] = useState<Vessel[]>([])
  const [search, setSearch] = useState("")
  const [loading, setLoading] = useState(true)
  const [editTarget, setEditTarget] = useState<Vessel | null>(null)
  const [form, setForm] = useState<Vessel>({ ...emptyVessel })
  const [saving, setSaving] = useState(false)
  const [importImo, setImportImo] = useState("")
  const [importing, setImporting] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<Vessel | null>(null)
  const [provider, setProvider] = useState<Awaited<ReturnType<typeof getVesselProviderStatus>> | null>(null)
  const [providersOpen, setProvidersOpen] = useState(false)

  useEffect(() => {
    getVesselProviderStatus()
      .then(setProvider)
      .catch(() => {})
  }, [])

  const providerLabel = provider?.active?.label ?? null
  const providerConnected = Boolean(provider?.connected)

  const load = useCallback(
    async (term?: string) => {
      setLoading(true)
      try {
        const res = await listVesselsAdmin(ADMIN_PASSCODE, term)
        if (res.ok) {
          setVessels(res.vessels)
          onVesselsChanged(res.vessels)
        }
      } finally {
        setLoading(false)
      }
    },
    [onVesselsChanged],
  )

  useEffect(() => {
    load()
  }, [load])

  const openCreate = (prefillImo?: string) => {
    const imo = (prefillImo ?? "").trim()
    const seed = imo && /^\d{7}$/.test(imo) ? { ...emptyVessel, imo } : { ...emptyVessel }
    setForm(seed)
    setEditTarget(seed)
  }

  // The IMO the admin is currently searching for, if the term contains a valid
  // 7-digit IMO number. We strip non-digits first so pasted values like
  // "IMO 9512331", "9512331 " or "IMO-9512331" (as copied from MarineTraffic)
  // are still recognised and offered as a direct "import / add this vessel".
  const searchDigits = search.replace(/\D/g, "")
  const searchedImo = searchDigits.length === 7 ? searchDigits : ""

  // Run a catalogue search. When the term resolves to a 7-digit IMO we query by
  // the bare digits so it matches the stored `imo` even if the admin typed an
  // "IMO " prefix or extra spacing.
  const runSearch = () => load(searchedImo || search.trim())
  const openEdit = (v: Vessel) => {
    setForm({ ...v, vesselClass: v.vesselClass ?? "", flag: v.flag ?? "", cargo: v.cargo ?? "" })
    setEditTarget(v)
  }

  const set = <K extends keyof Vessel>(key: K, value: Vessel[K]) => setForm((p) => ({ ...p, [key]: value }))

  const handleSave = async () => {
    setSaving(true)
    try {
      const res = await upsertVesselAdmin(ADMIN_PASSCODE, { ...form, capacity: Number(form.capacity) || 0 })
      if (res.ok) {
        toast.success("Vessel saved", { description: `${res.vessel?.name} (IMO ${res.vessel?.imo})` })
        setEditTarget(null)
        await load(search)
      } else {
        toast.error(res.error)
      }
    } finally {
      setSaving(false)
    }
  }

  const handleImport = async (imoOverride?: string) => {
    const imo = (imoOverride ?? importImo).trim()
    if (!imo) return
    setImporting(true)
    try {
      const res = await importVesselFromProvider(ADMIN_PASSCODE, imo)
      if (res.ok) {
        const c = res.vessel?.compliance
        // A bare stub still has the IMO placeholder as its name (no data found).
        const bareStub = res.vessel?.name === `IMO ${res.vessel?.imo}`
        // Free public enrichment resolves name/type/flag but not tonnage.
        const needsCapacity = res.vessel?.source === "compliance" && !res.vessel?.capacity
        const hint = bareStub
          ? " — screened; add particulars manually"
          : needsCapacity
            ? " — add capacity to complete"
            : ""
        const desc = `${res.vessel?.name} (IMO ${res.vessel?.imo})${hint}`
        if (c?.status === "flagged") {
          toast.error("Sanctions match — do not transact", { description: c.note ?? desc })
        } else if (c?.status === "unverified") {
          toast.warning("Imported (compliance unverified)", { description: desc })
        } else {
          toast.success("Vessel imported · compliance clear", { description: desc })
        }
        setImportImo("")
        await load(search)
      } else {
        // No provider linked (or IMO not found upstream): guide the admin to
        // connect a provider, or add the vessel manually with the IMO pre-filled.
        toast.message("Live import unavailable", {
          description: res.error,
          action: providerConnected
            ? /^\d{7}$/.test(imo)
              ? { label: "Add manually", onClick: () => openCreate(imo) }
              : undefined
            : { label: "Connect provider", onClick: () => setProvidersOpen(true) },
        })
      }
    } finally {
      setImporting(false)
    }
  }

  const [rescreening, setRescreening] = useState<string | null>(null)
  const handleRescreen = async (v: Vessel) => {
    setRescreening(v.imo)
    try {
      const res = await rescreenVesselAdmin(ADMIN_PASSCODE, v.imo)
      if (res.ok) {
        const c = res.vessel?.compliance
        if (c?.status === "flagged") {
          toast.error(`${v.name}: sanctions match`, { description: c.note })
        } else if (c?.status === "unverified") {
          toast.warning(`${v.name}: compliance unverified`, { description: c?.note })
        } else {
          toast.success(`${v.name}: compliance clear`)
        }
        await load(search)
      } else {
        toast.error(res.error)
      }
    } finally {
      setRescreening(null)
    }
  }

  const handleDelete = async () => {
    if (!deleteTarget) return
    const res = await deleteVesselAdmin(ADMIN_PASSCODE, deleteTarget.imo)
    if (res.ok) {
      toast.success("Vessel removed", { description: `${deleteTarget.name} (IMO ${deleteTarget.imo})` })
      setDeleteTarget(null)
      await load(search)
    } else {
      toast.error(res.error)
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Ship className="h-4 w-4 text-muted-foreground" />
            Marine Vessel Catalogue
          </CardTitle>
          <CardDescription>
            Crude, refined-product and gas tankers. Search, add, edit, or import live data by IMO.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
            <div className="flex-1">
              <Label htmlFor="vessel-search" className="text-xs">
                Search by name, IMO or cargo
              </Label>
              <div className="relative mt-1">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  id="vessel-search"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && runSearch()}
                  placeholder="e.g. Pacific Triton, 9512331, Jet A-1"
                  className="pl-8"
                />
              </div>
            </div>
            <Button variant="outline" onClick={runSearch} className="shrink-0">
              <Search className="mr-1.5 h-4 w-4" />
              Search
            </Button>
            <Button onClick={() => openCreate(searchedImo)} className="shrink-0">
              <Plus className="mr-1.5 h-4 w-4" />
              Add vessel
            </Button>
          </div>

          {/* Live data provider + free compliance status */}
          <div className="flex flex-col gap-2 rounded-lg border border-border bg-muted/30 px-3 py-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2 text-sm">
                <Satellite className="h-4 w-4 text-muted-foreground" />
                {providerConnected ? (
                  <span className="flex items-center gap-1.5">
                    <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
                    Live master data: <span className="font-medium text-foreground">{providerLabel}</span> connected
                  </span>
                ) : (
                  <span className="text-muted-foreground">
                    No paid master-data provider — imports validate the IMO and run compliance only.
                  </span>
                )}
              </div>
              <Button variant="outline" size="sm" onClick={() => setProvidersOpen(true)} className="shrink-0">
                <Satellite className="mr-1.5 h-3.5 w-3.5" />
                {providerConnected ? "Manage providers" : "Add master data"}
              </Button>
            </div>
            <div className="flex items-center gap-1.5 text-xs text-emerald-600">
              <ShieldCheck className="h-3.5 w-3.5" />
              <span>
                Free compliance auto-check active — official IMO validation + OFAC sanctions screening, no token
                required.
              </span>
            </div>
          </div>

          <div className="flex flex-col gap-2 rounded-lg border border-dashed border-border bg-muted/30 p-3 sm:flex-row sm:items-end">
            <div className="flex-1">
              <Label htmlFor="import-imo" className="text-xs">
                {providerConnected
                  ? `Import from ${providerLabel} + compliance (by IMO)`
                  : "Validate & compliance-check by IMO"}
              </Label>
              <Input
                id="import-imo"
                value={importImo}
                onChange={(e) => setImportImo(e.target.value)}
                placeholder="7-digit IMO number"
                className="mt-1"
                inputMode="numeric"
              />
            </div>
            <Button variant="secondary" onClick={() => handleImport()} disabled={importing || !importImo.trim()} className="shrink-0">
              {importing ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Download className="mr-1.5 h-4 w-4" />}
              Import
            </Button>
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-10 text-muted-foreground">
              <Loader2 className="mr-2 h-5 w-5 animate-spin" />
              Loading catalogue…
            </div>
          ) : vessels.length === 0 ? (
            <div className="flex flex-col items-center gap-3 py-10 text-center">
              <Ship className="h-8 w-8 text-muted-foreground/60" />
              {searchedImo ? (
                <>
                  <div>
                    <p className="text-sm font-medium">No catalogue match for IMO {searchedImo}</p>
                    <p className="mx-auto mt-1 max-w-sm text-xs text-muted-foreground">
                      This vessel isn&apos;t in the catalogue yet.{" "}
                      {providerConnected
                        ? `Import full particulars from ${providerLabel} (with compliance), or add it manually.`
                        : "Validate the IMO and run the free compliance check now, or add it manually."}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center justify-center gap-2">
                    <Button
                      variant="secondary"
                      onClick={() => handleImport(searchedImo)}
                      disabled={importing}
                    >
                      {importing ? (
                        <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                      ) : (
                        <ShieldCheck className="mr-1.5 h-4 w-4" />
                      )}
                      {providerConnected ? `Import IMO ${searchedImo}` : `Validate & screen ${searchedImo}`}
                    </Button>
                    <Button onClick={() => openCreate(searchedImo)}>
                      <Plus className="mr-1.5 h-4 w-4" />
                      Add IMO {searchedImo} manually
                    </Button>
                  </div>
                </>
              ) : (
                <>
                  <p className="text-sm font-medium">No vessels found</p>
                  <p className="mx-auto max-w-sm text-xs text-muted-foreground">
                    {search.trim()
                      ? "No catalogue entry matches that search. Search by exact 7-digit IMO to validate, screen and add a specific vessel."
                      : "The catalogue is empty. Add a vessel, or screen one by IMO."}
                  </p>
                  <Button onClick={() => openCreate()}>
                    <Plus className="mr-1.5 h-4 w-4" />
                    Add vessel
                  </Button>
                </>
              )}
            </div>
          ) : (
            <ScrollArea className="h-[360px] pr-3">
              <div className="flex flex-col gap-2">
                {vessels.map((v) => (
                  <div
                    key={v.imo}
                    className="flex flex-col gap-2 rounded-lg border border-border bg-card p-3 sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="truncate font-medium">{v.name}</span>
                        <Badge variant="outline" className={cn("text-[10px]", TYPE_BADGE[v.type])}>
                          {VESSEL_TYPE_LABELS[v.type]}
                        </Badge>
                        <ComplianceBadge compliance={v.compliance} />
                      </div>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        IMO {v.imo} · {v.vesselClass || "—"} · {v.capacity.toLocaleString("en-US")} {v.capacityUnit}
                      </p>
                      <p className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
                        <span className="inline-flex items-center gap-1">
                          <Anchor className="h-3 w-3" />
                          {v.location || "—"}
                        </span>
                        <span className="inline-flex items-center gap-1">
                          <Gauge className="h-3 w-3" />
                          {VESSEL_STATUS_LABELS[v.status]}
                        </span>
                        <span className="inline-flex items-center gap-1">
                          <Tag className="h-3 w-3" />
                          {v.cargo || "No cargo"}
                        </span>
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleRescreen(v)}
                        disabled={rescreening === v.imo}
                        title="Re-run compliance check"
                      >
                        {rescreening === v.imo ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <RefreshCw className="h-3.5 w-3.5" />
                        )}
                        <span className="sr-only">Re-screen {v.name}</span>
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => openEdit(v)}>
                        <Pencil className="h-3.5 w-3.5" />
                        <span className="sr-only">Edit {v.name}</span>
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => setDeleteTarget(v)}>
                        <Trash2 className="h-3.5 w-3.5 text-red-500" />
                        <span className="sr-only">Remove {v.name}</span>
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </ScrollArea>
          )}
        </CardContent>
      </Card>

      {/* Add / edit dialog */}
      <Dialog open={!!editTarget} onOpenChange={(o) => !o && setEditTarget(null)}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{editTarget?.updatedAt ? "Edit vessel" : "Add vessel"}</DialogTitle>
            <DialogDescription>Maintain accurate IMO, specifications, status and cargo.</DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="sm:col-span-1">
              <Label htmlFor="f-imo" className="text-xs">
                IMO number
              </Label>
              <Input
                id="f-imo"
                value={form.imo}
                onChange={(e) => set("imo", e.target.value.replace(/\D/g, "").slice(0, 7))}
                placeholder="7 digits"
                disabled={!!editTarget?.updatedAt}
                className="mt-1"
              />
            </div>
            <div className="sm:col-span-1">
              <Label htmlFor="f-name" className="text-xs">
                Vessel name
              </Label>
              <Input id="f-name" value={form.name} onChange={(e) => set("name", e.target.value)} className="mt-1" />
            </div>
            <div>
              <Label className="text-xs">Type</Label>
              <Select value={form.type} onValueChange={(v) => set("type", v as VesselType)}>
                <SelectTrigger className="mt-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {VESSEL_TYPES.map((t) => (
                    <SelectItem key={t} value={t}>
                      {VESSEL_TYPE_LABELS[t]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="f-class" className="text-xs">
                Class
              </Label>
              <Input
                id="f-class"
                value={form.vesselClass}
                onChange={(e) => set("vesselClass", e.target.value)}
                placeholder="VLCC, Suezmax, MR, LNG…"
                className="mt-1"
              />
            </div>
            <div>
              <Label htmlFor="f-cap" className="text-xs">
                Capacity
              </Label>
              <Input
                id="f-cap"
                value={form.capacity ? String(form.capacity) : ""}
                onChange={(e) => set("capacity", Number(e.target.value.replace(/[^\d]/g, "")) || 0)}
                inputMode="numeric"
                className="mt-1"
              />
            </div>
            <div>
              <Label className="text-xs">Capacity unit</Label>
              <Select value={form.capacityUnit} onValueChange={(v) => set("capacityUnit", v as Vessel["capacityUnit"])}>
                <SelectTrigger className="mt-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="DWT">DWT (deadweight tonnes)</SelectItem>
                  <SelectItem value="CBM">CBM (cubic metres)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Status</Label>
              <Select value={form.status} onValueChange={(v) => set("status", v as VesselStatus)}>
                <SelectTrigger className="mt-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {VESSEL_STATUSES.map((s) => (
                    <SelectItem key={s} value={s}>
                      {VESSEL_STATUS_LABELS[s]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="f-built" className="text-xs">
                Year built
              </Label>
              <Input
                id="f-built"
                value={form.builtYear ? String(form.builtYear) : ""}
                onChange={(e) => set("builtYear", Number(e.target.value.replace(/[^\d]/g, "")) || undefined)}
                inputMode="numeric"
                placeholder="e.g. 2016"
                className="mt-1"
              />
            </div>
            <div className="sm:col-span-2">
              <Label htmlFor="f-loc" className="text-xs">
                Last known location
              </Label>
              <Input
                id="f-loc"
                value={form.location}
                onChange={(e) => set("location", e.target.value)}
                placeholder="Port or sea area"
                className="mt-1"
              />
            </div>
            <div>
              <Label htmlFor="f-flag" className="text-xs">
                Flag
              </Label>
              <Input id="f-flag" value={form.flag} onChange={(e) => set("flag", e.target.value)} className="mt-1" />
            </div>
            <div>
              <Label htmlFor="f-cargo" className="text-xs">
                Cargo (oil / gas)
              </Label>
              <Input
                id="f-cargo"
                value={form.cargo}
                onChange={(e) => set("cargo", e.target.value)}
                placeholder="e.g. Arab Light Crude"
                className="mt-1"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditTarget(null)}>
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
              Save vessel
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirmation */}
      <Dialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Remove vessel?</DialogTitle>
            <DialogDescription>
              {deleteTarget ? `${deleteTarget.name} (IMO ${deleteTarget.imo}) will be removed from the catalogue.` : ""}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteTarget(null)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleDelete}>
              Remove
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Live data provider management */}
      <Dialog open={providersOpen} onOpenChange={setProvidersOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Satellite className="h-4 w-4" />
              Live vessel-data providers
            </DialogTitle>
            <DialogDescription>
              The free compliance auto-check runs automatically with no token. Optionally link a paid AIS
              company for full master data (name, class, tonnage). No token is ever shown here.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-3">
            {/* Always-on, token-free compliance */}
            <div className="flex items-start justify-between gap-3 rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-medium">Compliance auto-check</span>
                  <span className="inline-flex items-center gap-1 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-xs text-emerald-600">
                    <ShieldCheck className="h-3 w-3" /> Active · free
                  </span>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  Official IMO check-digit validation + OFAC SDN &amp; Consolidated sanctions screening. Runs on
                  every import and vessel save — no API token required.
                </p>
              </div>
            </div>

            <p className="text-xs font-medium text-muted-foreground">Optional paid master-data providers</p>
            {(provider?.providers ?? VESSEL_PROVIDERS.map((p) => ({ ...p, configured: false }))).map((p) => (
              <div
                key={p.id}
                className="flex items-start justify-between gap-3 rounded-lg border border-border p-3"
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-medium">{p.label}</span>
                    {p.configured ? (
                      <span className="inline-flex items-center gap-1 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-xs text-emerald-600">
                        <CheckCircle2 className="h-3 w-3" /> Connected
                      </span>
                    ) : (
                      <span className="rounded-full border border-border bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                        Not connected
                      </span>
                    )}
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Add token as{" "}
                    <code className="rounded bg-muted px-1 py-0.5 font-mono text-[11px]">{p.envVar}</code> in
                    project settings.
                  </p>
                </div>
                <a
                  href={p.signupUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex shrink-0 items-center gap-1 text-xs font-medium text-primary hover:underline"
                >
                  Get token <ExternalLink className="h-3 w-3" />
                </a>
              </div>
            ))}
            <p className="rounded-lg bg-muted/50 p-3 text-xs text-muted-foreground">
              In v0, add these tokens via the <span className="font-medium text-foreground">Vars</span> section
              of the project settings (top-right). Once a token is saved, return here and the provider will show
              as connected.
            </p>
          </div>
          <DialogFooter>
            <Button onClick={() => setProvidersOpen(false)}>Done</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

// --- Create spot deal -------------------------------------------------------

const emptyDealForm = {
  vesselImo: "",
  productId: "",
  product: "",
  unit: "bbl" as SpotDeal["unit"],
  quantity: "",
  spotPrice: "",
  currency: "USD",
  incoterm: "FOB",
  loadPort: "",
  dischargePort: "",
  terms: "",
  expiresAt: "",
}

function CreateDeal({ vessels, onCreated }: { vessels: Vessel[]; onCreated: () => void }) {
  const [form, setForm] = useState({ ...emptyDealForm })
  const [submitting, setSubmitting] = useState(false)

  const set = <K extends keyof typeof form>(key: K, value: (typeof form)[K]) =>
    setForm((p) => ({ ...p, [key]: value }))

  const selectedVessel = useMemo(() => vessels.find((v) => v.imo === form.vesselImo), [vessels, form.vesselImo])

  const handleProduct = (id: string) => {
    const product = getCatalogProduct(id)
    if (product) setForm((p) => ({ ...p, productId: id, product: product.name, unit: product.unit }))
  }

  // Default the expiry to 48h ahead the first time the form opens.
  useEffect(() => {
    if (!form.expiresAt) {
      const d = new Date(Date.now() + 48 * 60 * 60 * 1000)
      d.setMinutes(d.getMinutes() - d.getTimezoneOffset())
      set("expiresAt", d.toISOString().slice(0, 16))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const qty = Number.parseFloat(form.quantity.replace(/[, ]/g, ""))
  const price = Number.parseFloat(form.spotPrice.replace(/[, ]/g, ""))
  const total = computeTotalValue(Number.isFinite(qty) ? qty : 0, Number.isFinite(price) ? price : 0)

  const submit = async (publish: boolean) => {
    if (!form.vesselImo) return toast.error("Select a vessel.")
    if (!form.product.trim()) return toast.error("Select a product.")
    if (!Number.isFinite(qty) || qty <= 0) return toast.error("Enter a valid quantity.")
    if (!Number.isFinite(price) || price <= 0) return toast.error("Enter a valid spot price.")
    if (!form.expiresAt) return toast.error("Set an expiry.")
    const expiresIso = new Date(form.expiresAt).toISOString()
    if (new Date(expiresIso).getTime() <= Date.now()) return toast.error("Expiry must be in the future.")

    const payload: CreateSpotDealInput = {
      vesselImo: form.vesselImo,
      product: form.product.trim(),
      productId: form.productId || undefined,
      quantity: qty,
      unit: form.unit,
      spotPrice: price,
      currency: form.currency,
      incoterm: form.incoterm,
      loadPort: form.loadPort.trim(),
      dischargePort: form.dischargePort.trim() || undefined,
      terms: form.terms.trim(),
      expiresAt: expiresIso,
      publish,
    }

    setSubmitting(true)
    try {
      const res = await createSpotDealAdmin(ADMIN_PASSCODE, payload)
      if (res.ok) {
        toast.success(publish ? "Spot deal published" : "Draft saved", {
          description: publish
            ? `${res.deal?.id} broadcast to ${res.delivered} active client${res.delivered === 1 ? "" : "s"} via Bankeka.`
            : `${res.deal?.id} saved as a draft.`,
        })
        setForm({ ...emptyDealForm })
        onCreated()
      } else {
        toast.error(res.error)
      }
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Tag className="h-4 w-4 text-muted-foreground" />
          Create Spot Deal
        </CardTitle>
        <CardDescription>
          Publish a limited-time offer against a vessel. Publishing broadcasts it to all active clients and lists it in
          Commodity Trading.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <Label className="text-xs">Vessel</Label>
            <Select value={form.vesselImo} onValueChange={(v) => set("vesselImo", v)}>
              <SelectTrigger className="mt-1">
                <SelectValue placeholder="Select a vessel from the catalogue" />
              </SelectTrigger>
              <SelectContent>
                {vessels.map((v) => (
                  <SelectItem key={v.imo} value={v.imo}>
                    {v.name} — IMO {v.imo} ({VESSEL_TYPE_LABELS[v.type]})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {selectedVessel && (
              <p className="mt-1 text-xs text-muted-foreground">
                {selectedVessel.vesselClass || "—"} · {selectedVessel.capacity.toLocaleString("en-US")}{" "}
                {selectedVessel.capacityUnit} · {VESSEL_STATUS_LABELS[selectedVessel.status]} ·{" "}
                {selectedVessel.location || "—"}
                {selectedVessel.cargo ? ` · carrying ${selectedVessel.cargo}` : ""}
              </p>
            )}
          </div>

          <div className="sm:col-span-2">
            <Label className="text-xs">Product</Label>
            <Select value={form.productId} onValueChange={handleProduct}>
              <SelectTrigger className="mt-1">
                <SelectValue placeholder="Select the transported product" />
              </SelectTrigger>
              <SelectContent>
                {COMMODITY_CATEGORIES.map((cat) => (
                  <SelectGroup key={cat}>
                    <SelectLabel>{cat}</SelectLabel>
                    {PETROLEUM_PRODUCTS.filter((p) => p.category === cat).map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.name}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label htmlFor="d-qty" className="text-xs">
              Quantity available
            </Label>
            <div className="mt-1 flex gap-2">
              <Input
                id="d-qty"
                value={form.quantity}
                onChange={(e) => set("quantity", e.target.value)}
                placeholder="e.g. 1,000,000"
                inputMode="decimal"
              />
              <Select value={form.unit} onValueChange={(v) => set("unit", v as SpotDeal["unit"])}>
                <SelectTrigger className="w-24">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="bbl">bbl</SelectItem>
                  <SelectItem value="MT">MT</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div>
            <Label htmlFor="d-price" className="text-xs">
              Spot price (per {form.unit})
            </Label>
            <div className="mt-1 flex gap-2">
              <Select value={form.currency} onValueChange={(v) => set("currency", v)}>
                <SelectTrigger className="w-24">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CURRENCIES.map((c) => (
                    <SelectItem key={c} value={c}>
                      {c}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Input
                id="d-price"
                value={form.spotPrice}
                onChange={(e) => set("spotPrice", e.target.value)}
                placeholder="Special spot price"
                inputMode="decimal"
              />
            </div>
          </div>

          <div>
            <Label className="text-xs">Incoterm</Label>
            <Select value={form.incoterm} onValueChange={(v) => set("incoterm", v)}>
              <SelectTrigger className="mt-1">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {INCOTERMS.map((i) => (
                  <SelectItem key={i} value={i}>
                    {i}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label htmlFor="d-expiry" className="text-xs">
              Offer expires (limited time)
            </Label>
            <Input
              id="d-expiry"
              type="datetime-local"
              value={form.expiresAt}
              onChange={(e) => set("expiresAt", e.target.value)}
              className="mt-1"
            />
          </div>

          <div>
            <Label htmlFor="d-load" className="text-xs">
              Load port
            </Label>
            <Input
              id="d-load"
              value={form.loadPort}
              onChange={(e) => set("loadPort", e.target.value)}
              placeholder="e.g. Ras Tanura"
              className="mt-1"
            />
          </div>
          <div>
            <Label htmlFor="d-disch" className="text-xs">
              Discharge port (optional)
            </Label>
            <Input
              id="d-disch"
              value={form.dischargePort}
              onChange={(e) => set("dischargePort", e.target.value)}
              placeholder="e.g. Rotterdam"
              className="mt-1"
            />
          </div>

          <div className="sm:col-span-2">
            <Label htmlFor="d-terms" className="text-xs">
              Other relevant terms
            </Label>
            <Textarea
              id="d-terms"
              value={form.terms}
              onChange={(e) => set("terms", e.target.value)}
              placeholder="Payment terms, inspection, laycan, performance bond, etc."
              rows={3}
              className="mt-1"
            />
          </div>
        </div>

        <div className="flex flex-col items-start justify-between gap-3 rounded-lg border border-border bg-muted/30 p-3 sm:flex-row sm:items-center">
          <div>
            <p className="text-xs text-muted-foreground">Estimated total value</p>
            <p className="text-lg font-semibold tabular-nums">{formatMoney(total, form.currency)}</p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => submit(false)} disabled={submitting}>
              Save draft
            </Button>
            <Button onClick={() => submit(true)} disabled={submitting}>
              {submitting ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Megaphone className="mr-1.5 h-4 w-4" />}
              Publish &amp; broadcast
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

// --- Published deals --------------------------------------------------------

function DealStatusBadge({ status }: { status: SpotDeal["status"] }) {
  const cls: Record<SpotDeal["status"], string> = {
    published: "border-green-500/30 bg-green-500/10 text-green-600",
    draft: "border-muted-foreground/30 bg-muted text-muted-foreground",
    withdrawn: "border-red-500/30 bg-red-500/10 text-red-600",
    expired: "border-amber-500/30 bg-amber-500/10 text-amber-600",
    engaged: "border-blue-500/30 bg-blue-500/10 text-blue-600",
  }
  return (
    <Badge variant="outline" className={cn("text-[10px]", cls[status])}>
      {SPOT_DEAL_STATUS_LABELS[status]}
    </Badge>
  )
}

function DealsList({ refreshKey, onChanged }: { refreshKey: number; onChanged: () => void }) {
  const [deals, setDeals] = useState<SpotDeal[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await listSpotDealsAdmin(ADMIN_PASSCODE)
      if (res.ok) setDeals(res.deals)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load, refreshKey])

  const act = async (fn: () => Promise<{ ok: boolean; error?: string; delivered?: number }>, id: string, ok: string) => {
    setBusy(id)
    try {
      const res = await fn()
      if (res.ok) {
        toast.success(ok)
        await load()
        onChanged()
      } else {
        toast.error(res.error)
      }
    } finally {
      setBusy(null)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-10 text-muted-foreground">
        <Loader2 className="mr-2 h-5 w-5 animate-spin" />
        Loading spot deals…
      </div>
    )
  }
  if (deals.length === 0) {
    return <p className="py-10 text-center text-sm text-muted-foreground">No spot deals yet.</p>
  }

  return (
    <div className="flex flex-col gap-2">
      {deals.map((d) => {
        const cd = dealCountdown(d.expiresAt)
        return (
          <div key={d.id} className="flex flex-col gap-2 rounded-lg border border-border bg-card p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <span className="font-medium">{d.product}</span>
                <DealStatusBadge status={d.status} />
                <span className="font-mono text-[10px] text-muted-foreground">{d.id}</span>
              </div>
              <span
                className={cn(
                  "inline-flex items-center gap-1 text-xs",
                  cd.expired ? "text-muted-foreground" : cd.urgent ? "text-red-500" : "text-muted-foreground",
                )}
              >
                <Clock className="h-3 w-3" />
                {cd.expired ? "Expired" : `Ends in ${cd.label}`}
              </span>
            </div>
            <p className="text-xs text-muted-foreground">
              {d.vesselName} (IMO {d.vesselImo}) · {d.quantity.toLocaleString("en-US")} {d.unit} ·{" "}
              {formatMoney(d.spotPrice, d.currency)}/{d.unit} · total {formatMoney(d.totalValue, d.currency)} · {d.incoterm}
              {d.loadPort ? ` ${d.loadPort}` : ""}
            </p>
            {(d.interests?.length ?? 0) > 0 && (
              <p className="text-[11px] text-muted-foreground">
                {d.interests!.length} client interaction{d.interests!.length === 1 ? "" : "s"} recorded
              </p>
            )}
            <div className="flex flex-wrap gap-2">
              {(d.status === "draft" || d.status === "withdrawn") && !cd.expired && (
                <Button
                  size="sm"
                  variant="outline"
                  disabled={busy === d.id}
                  onClick={() => act(() => publishSpotDealAdmin(ADMIN_PASSCODE, d.id), d.id, "Spot deal published")}
                >
                  <Megaphone className="mr-1.5 h-3.5 w-3.5" />
                  Publish
                </Button>
              )}
              {d.status === "published" && (
                <Button
                  size="sm"
                  variant="outline"
                  disabled={busy === d.id}
                  onClick={() => act(() => withdrawSpotDealAdmin(ADMIN_PASSCODE, d.id), d.id, "Spot deal withdrawn")}
                >
                  <Ban className="mr-1.5 h-3.5 w-3.5 text-red-500" />
                  Withdraw
                </Button>
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}

// --- Top-level manager ------------------------------------------------------

export function SpotDealManager() {
  const [vessels, setVessels] = useState<Vessel[]>([])
  const [refreshKey, setRefreshKey] = useState(0)
  const bump = useCallback(() => setRefreshKey((k) => k + 1), [])

  // Load the catalogue at the top level so the Create tab has vessels to choose
  // from immediately, even before the Vessels tab is opened. The VesselCatalogue
  // tab keeps this in sync via the same onVesselsChanged callback.
  useEffect(() => {
    let cancelled = false
    listVesselsAdmin(ADMIN_PASSCODE)
      .then((res) => {
        if (!cancelled && res.ok) setVessels(res.vessels)
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [])

  return (
    <Tabs defaultValue="deals" className="w-full">
      <TabsList className="grid w-full grid-cols-3">
        <TabsTrigger value="deals" className="gap-1.5">
          <Tag className="h-4 w-4" />
          Create
        </TabsTrigger>
        <TabsTrigger value="published" className="gap-1.5">
          <Megaphone className="h-4 w-4" />
          Published
        </TabsTrigger>
        <TabsTrigger value="vessels" className="gap-1.5">
          <Ship className="h-4 w-4" />
          Vessels
        </TabsTrigger>
      </TabsList>

      <TabsContent value="deals" className="mt-4">
        <CreateDeal vessels={vessels} onCreated={bump} />
      </TabsContent>

      <TabsContent value="published" className="mt-4">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Spot Deals</CardTitle>
            <CardDescription>Published, draft, withdrawn and expired offers with their countdowns.</CardDescription>
          </CardHeader>
          <CardContent>
            <DealsList refreshKey={refreshKey} onChanged={bump} />
          </CardContent>
        </Card>
      </TabsContent>

      <TabsContent value="vessels" className="mt-4">
        <VesselCatalogue onVesselsChanged={setVessels} />
      </TabsContent>
    </Tabs>
  )
}
