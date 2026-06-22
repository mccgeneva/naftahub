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
  importVesselFromMarineTraffic,
  listSpotDealsAdmin,
  createSpotDealAdmin,
  publishSpotDealAdmin,
  withdrawSpotDealAdmin,
  type CreateSpotDealInput,
} from "@/app/actions/spot-deals"

const CURRENCIES = ["USD", "EUR", "GBP", "CHF", "AED", "SGD"]
const INCOTERMS = ["FOB", "CIF", "CFR", "FCA", "DES", "DAP"]

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

  const openCreate = () => {
    setForm({ ...emptyVessel })
    setEditTarget({ ...emptyVessel })
  }
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

  const handleImport = async () => {
    setImporting(true)
    try {
      const res = await importVesselFromMarineTraffic(ADMIN_PASSCODE, importImo.trim())
      if (res.ok) {
        toast.success("Vessel imported", { description: `${res.vessel?.name} (IMO ${res.vessel?.imo})` })
        setImportImo("")
        await load(search)
      } else {
        toast.message("Import unavailable", { description: res.error })
      }
    } finally {
      setImporting(false)
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
                  onKeyDown={(e) => e.key === "Enter" && load(search)}
                  placeholder="e.g. Pacific Triton, 9512331, Jet A-1"
                  className="pl-8"
                />
              </div>
            </div>
            <Button variant="outline" onClick={() => load(search)} className="shrink-0">
              <Search className="mr-1.5 h-4 w-4" />
              Search
            </Button>
            <Button onClick={openCreate} className="shrink-0">
              <Plus className="mr-1.5 h-4 w-4" />
              Add vessel
            </Button>
          </div>

          <div className="flex flex-col gap-2 rounded-lg border border-dashed border-border bg-muted/30 p-3 sm:flex-row sm:items-end">
            <div className="flex-1">
              <Label htmlFor="import-imo" className="text-xs">
                Import from MarineTraffic (by IMO)
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
            <Button variant="secondary" onClick={handleImport} disabled={importing || !importImo.trim()} className="shrink-0">
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
            <p className="py-10 text-center text-sm text-muted-foreground">No vessels found.</p>
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
