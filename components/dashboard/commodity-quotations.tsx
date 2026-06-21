"use client"

import { useEffect, useMemo, useState } from "react"
import {
  Search,
  RefreshCw,
  TrendingUp,
  TrendingDown,
  Minus,
  LayoutGrid,
  Table as TableIcon,
  MapPin,
  Droplet,
  Info,
  ShoppingCart,
  Loader2,
  ArrowLeftRight,
} from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
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
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { cn } from "@/lib/utils"
import {
  PORTS,
  PRODUCTS,
  PRODUCT_CATEGORIES,
  getQuote,
  formatQuotePrice,
  formatUnit,
  convertQuantity,
  bblPerMtFor,
  type PriceBasis,
  type ProductCategory,
  type PetroleumProduct,
  type Port,
} from "@/lib/commodity-quotations"
import { useCommodityDeals } from "@/lib/commodity-deals-store"
import { useCurrentUser } from "@/lib/use-current-user"
import { useActivityLog } from "@/components/activity-tracker"
import { toast } from "sonner"

type CompareMode = "port" | "product"
type ViewMode = "cards" | "table"
type BasisFilter = PriceBasis | "BOTH"

function ChangeIndicator({ pct }: { pct: number }) {
  const flat = Math.abs(pct) < 0.0005
  const up = pct > 0
  const Icon = flat ? Minus : up ? TrendingUp : TrendingDown
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 text-xs font-medium tabular-nums",
        flat && "text-muted-foreground",
        !flat && up && "text-green-500",
        !flat && !up && "text-red-500",
      )}
    >
      <Icon className="h-3 w-3" />
      {up && !flat ? "+" : ""}
      {(pct * 100).toFixed(2)}%
    </span>
  )
}

export function CommodityQuotations() {
  const [mode, setMode] = useState<CompareMode>("port")
  const [view, setView] = useState<ViewMode>("cards")
  const [basis, setBasis] = useState<BasisFilter>("BOTH")
  const [selectedPortId, setSelectedPortId] = useState(PORTS[14]?.id ?? PORTS[0].id) // Rotterdam
  const [selectedProductId, setSelectedProductId] = useState(PRODUCTS[0].id) // Brent
  const [category, setCategory] = useState<ProductCategory | "All">("All")
  const [search, setSearch] = useState("")
  const [tick, setTick] = useState(0)

  // One-click product request: holds the quotation context to pre-fill the form.
  const [requestSeed, setRequestSeed] = useState<{
    product: PetroleumProduct
    port: Port
    basis: PriceBasis
  } | null>(null)

  // Re-tick every 60s so the "last updated" stamp stays fresh and the board
  // re-evaluates on each hour boundary.
  useEffect(() => {
    const t = setInterval(() => setTick((n) => n + 1), 60_000)
    return () => clearInterval(t)
  }, [])

  const now = useMemo(() => new Date(), [tick])

  const selectedPort = PORTS.find((p) => p.id === selectedPortId) ?? PORTS[0]
  const selectedProduct = PRODUCTS.find((p) => p.id === selectedProductId) ?? PRODUCTS[0]

  // Rows for "By Port" mode: products (filtered by category + search) at one port.
  const portRows = useMemo(() => {
    const q = search.trim().toLowerCase()
    return PRODUCTS.filter((p) => category === "All" || p.category === category)
      .filter((p) => !q || p.name.toLowerCase().includes(q))
      .map((product) => ({
        key: product.id,
        product,
        port: selectedPort,
        fob: getQuote(product, selectedPort, "FOB", now),
        cif: getQuote(product, selectedPort, "CIF", now),
      }))
  }, [category, search, selectedPort, now])

  // Rows for "By Product" mode: ports (filtered by search) for one product.
  const productRows = useMemo(() => {
    const q = search.trim().toLowerCase()
    return PORTS.filter(
      (p) => !q || p.name.toLowerCase().includes(q) || p.country.toLowerCase().includes(q),
    ).map((port) => ({
      key: port.id,
      product: selectedProduct,
      port,
      fob: getQuote(selectedProduct, port, "FOB", now),
      cif: getQuote(selectedProduct, port, "CIF", now),
    }))
  }, [search, selectedProduct, now])

  const rows = mode === "port" ? portRows : productRows
  const unit = mode === "port" ? undefined : selectedProduct.unit

  const showFob = basis === "FOB" || basis === "BOTH"
  const showCif = basis === "CIF" || basis === "BOTH"

  const lastUpdated = now.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })

  return (
    <div className="space-y-4">
      {/* Intro / live banner */}
      <Card className="border-border bg-card">
        <CardHeader className="pb-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <CardTitle className="flex items-center gap-2 text-base font-semibold">
              <Droplet className="h-4 w-4 text-primary" />
              CIF / FOB Quotations Board
            </CardTitle>
            <div className="flex items-center gap-2">
              <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <span className="relative flex h-2 w-2">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-green-500 opacity-75" />
                  <span className="relative inline-flex h-2 w-2 rounded-full bg-green-500" />
                </span>
                Live · updated {lastUpdated}
              </span>
              <Button
                variant="outline"
                size="sm"
                className="h-8"
                onClick={() => setTick((n) => n + 1)}
                aria-label="Refresh quotations"
              >
                <RefreshCw className="h-3.5 w-3.5" />
                <span className="ml-1.5 hidden sm:inline">Refresh</span>
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="pt-0">
          <p className="text-pretty text-xs text-muted-foreground">
            Indicative cargo quotations across major world petroleum ports and grades, differentiated
            by <span className="font-medium text-foreground">FOB</span> (Free On Board) and{" "}
            <span className="font-medium text-foreground">CIF</span> (Cost, Insurance &amp; Freight).
            Figures are reference levels for structuring SKR, POP/POF and trading workflows — confirm
            firm pricing with the desk before execution.
          </p>
        </CardContent>
      </Card>

      {/* Controls */}
      <Card className="border-border bg-card">
        <CardContent className="space-y-4 p-4">
          {/* Compare mode + view toggles */}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="inline-flex rounded-lg border border-border bg-secondary/30 p-0.5">
              <button
                type="button"
                onClick={() => setMode("port")}
                className={cn(
                  "flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
                  mode === "port"
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                <MapPin className="h-3.5 w-3.5" />
                By Port
              </button>
              <button
                type="button"
                onClick={() => setMode("product")}
                className={cn(
                  "flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
                  mode === "product"
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                <Droplet className="h-3.5 w-3.5" />
                By Product
              </button>
            </div>

            <div className="inline-flex rounded-lg border border-border bg-secondary/30 p-0.5">
              <button
                type="button"
                onClick={() => setView("cards")}
                className={cn(
                  "flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
                  view === "cards"
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:text-foreground",
                )}
                aria-label="Card view"
              >
                <LayoutGrid className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">Cards</span>
              </button>
              <button
                type="button"
                onClick={() => setView("table")}
                className={cn(
                  "flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
                  view === "table"
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:text-foreground",
                )}
                aria-label="Table view"
              >
                <TableIcon className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">Table</span>
              </button>
            </div>
          </div>

          {/* Selectors */}
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {mode === "port" ? (
              <>
                <div className="space-y-1.5">
                  <Label className="text-xs">Port / terminal</Label>
                  <Select value={selectedPortId} onValueChange={setSelectedPortId}>
                    <SelectTrigger className="h-9">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {PORTS.map((p) => (
                        <SelectItem key={p.id} value={p.id}>
                          {p.name} — {p.country}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Product category</Label>
                  <Select value={category} onValueChange={(v) => setCategory(v as ProductCategory | "All")}>
                    <SelectTrigger className="h-9">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="All">All categories</SelectItem>
                      {PRODUCT_CATEGORIES.map((c) => (
                        <SelectItem key={c} value={c}>
                          {c}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </>
            ) : (
              <div className="space-y-1.5 sm:col-span-2">
                <Label className="text-xs">Product / grade</Label>
                <Select value={selectedProductId} onValueChange={setSelectedProductId}>
                  <SelectTrigger className="h-9">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {PRODUCT_CATEGORIES.map((cat) => (
                      <SelectGroupBlock key={cat} category={cat} />
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            <div className="space-y-1.5">
              <Label className="text-xs">Basis</Label>
              <Select value={basis} onValueChange={(v) => setBasis(v as BasisFilter)}>
                <SelectTrigger className="h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="BOTH">FOB &amp; CIF</SelectItem>
                  <SelectItem value="FOB">FOB only</SelectItem>
                  <SelectItem value="CIF">CIF only</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs">Search</Label>
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder={mode === "port" ? "Filter products…" : "Filter ports…"}
                  className="h-9 pl-8"
                />
              </div>
            </div>
          </div>

          {/* Context line */}
          <div className="flex items-center gap-2 rounded-md border border-border bg-secondary/20 px-3 py-2 text-xs text-muted-foreground">
            <Info className="h-3.5 w-3.5 shrink-0 text-primary" />
            {mode === "port" ? (
              <span>
                Showing <span className="font-medium text-foreground">{rows.length}</span> grades at{" "}
                <span className="font-medium text-foreground">
                  {selectedPort.name}, {selectedPort.country}
                </span>{" "}
                · {selectedPort.region}
              </span>
            ) : (
              <span>
                Showing <span className="font-medium text-foreground">{selectedProduct.name}</span> across{" "}
                <span className="font-medium text-foreground">{rows.length}</span> ports · priced per{" "}
                {formatUnit(selectedProduct.unit)}
              </span>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Results */}
      {rows.length === 0 ? (
        <Card className="border-border bg-card">
          <CardContent className="flex flex-col items-center gap-2 py-12 text-center">
            <Search className="h-8 w-8 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">No quotations match your filters.</p>
          </CardContent>
        </Card>
      ) : view === "table" ? (
        <Card className="border-border bg-card">
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-xs text-muted-foreground">
                    <th className="px-4 py-3 font-medium">
                      {mode === "port" ? "Product / grade" : "Port / terminal"}
                    </th>
                    <th className="px-4 py-3 font-medium">
                      {mode === "port" ? "Category" : "Region"}
                    </th>
                    {showFob && <th className="px-4 py-3 text-right font-medium">FOB</th>}
                    {showCif && <th className="px-4 py-3 text-right font-medium">CIF</th>}
                    <th className="px-4 py-3 text-right font-medium">24h</th>
                    <th className="px-4 py-3 text-right font-medium">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr
                      key={row.key}
                      className="border-b border-border/60 last:border-0 hover:bg-secondary/20"
                    >
                      <td className="px-4 py-3">
                        <p className="font-medium text-foreground">
                          {mode === "port" ? row.product.name : row.port.name}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {mode === "port"
                            ? `per ${formatUnit(row.product.unit)}`
                            : row.port.country}
                        </p>
                      </td>
                      <td className="px-4 py-3 text-xs text-muted-foreground">
                        {mode === "port" ? row.product.category : row.port.region}
                      </td>
                      {showFob && (
                        <td className="px-4 py-3 text-right font-medium tabular-nums text-foreground">
                          {formatQuotePrice(row.fob.price, row.product.unit)}
                        </td>
                      )}
                      {showCif && (
                        <td className="px-4 py-3 text-right font-medium tabular-nums text-foreground">
                          {formatQuotePrice(row.cif.price, row.product.unit)}
                        </td>
                      )}
                      <td className="px-4 py-3 text-right">
                        <ChangeIndicator pct={(showCif ? row.cif : row.fob).changePct} />
                      </td>
                      <td className="px-4 py-3 text-right">
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-8"
                          onClick={() =>
                            setRequestSeed({
                              product: row.product,
                              port: row.port,
                              basis: showCif ? "CIF" : "FOB",
                            })
                          }
                        >
                          <ShoppingCart className="h-3.5 w-3.5" />
                          <span className="ml-1.5 hidden sm:inline">Request</span>
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {rows.map((row) => (
            <Card key={row.key} className="border-border bg-card">
              <CardContent className="space-y-3 p-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate font-medium text-foreground">
                      {mode === "port" ? row.product.name : row.port.name}
                    </p>
                    <p className="truncate text-xs text-muted-foreground">
                      {mode === "port"
                        ? row.product.category
                        : `${row.port.country} · ${row.port.region}`}
                    </p>
                  </div>
                  <ChangeIndicator pct={(showCif ? row.cif : row.fob).changePct} />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  {showFob && (
                    <div className="rounded-lg bg-secondary/30 p-2.5">
                      <p className="text-[10px] uppercase tracking-wide text-muted-foreground">FOB</p>
                      <p className="font-semibold tabular-nums text-foreground">
                        {formatQuotePrice(row.fob.price, row.product.unit)}
                      </p>
                    </div>
                  )}
                  {showCif && (
                    <div className="rounded-lg bg-primary/10 p-2.5">
                      <p className="text-[10px] uppercase tracking-wide text-muted-foreground">CIF</p>
                      <p className="font-semibold tabular-nums text-foreground">
                        {formatQuotePrice(row.cif.price, row.product.unit)}
                      </p>
                    </div>
                  )}
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full"
                  onClick={() =>
                    setRequestSeed({
                      product: row.product,
                      port: row.port,
                      basis: showCif ? "CIF" : "FOB",
                    })
                  }
                >
                  <ShoppingCart className="mr-1.5 h-3.5 w-3.5" />
                  Request product
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* One-click purchase request form, pre-filled from the chosen quotation. */}
      <RequestProductDialog seed={requestSeed} onClose={() => setRequestSeed(null)} />
    </div>
  )
}

// Renders a category's products as grouped <SelectItem>s with a heading label.
function SelectGroupBlock({ category }: { category: ProductCategory }) {
  const items = PRODUCTS.filter((p) => p.category === category)
  if (items.length === 0) return null
  return (
    <>
      <div className="px-2 py-1.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
        {category}
      </div>
      {items.map((p) => (
        <SelectItem key={p.id} value={p.id}>
          {p.name}
        </SelectItem>
      ))}
    </>
  )
}

// Streamlined one-click purchase request, pre-filled from a selected quotation.
// On submit it creates a pending commodity deal that mirrors into the shared
// approval engine — identical workflow to the full Deal Workflow tab.
function RequestProductDialog({
  seed,
  onClose,
}: {
  seed: { product: PetroleumProduct; port: Port; basis: PriceBasis } | null
  onClose: () => void
}) {
  const { addDeal } = useCommodityDeals()
  const user = useCurrentUser()
  const log = useActivityLog()

  const [basis, setBasis] = useState<PriceBasis>("CIF")
  const [portId, setPortId] = useState<string>(PORTS[0].id)
  const [quantity, setQuantity] = useState("")
  // The unit the client enters the quantity in. Defaults to the product's
  // canonical pricing unit but can be switched (bbl<->MT) for dual-quoted grades.
  const [qtyUnit, setQtyUnit] = useState<"bbl" | "MT">("MT")
  const [notes, setNotes] = useState("")
  const [submitting, setSubmitting] = useState(false)

  // Re-seed the form whenever a new quotation is selected from the board.
  useEffect(() => {
    if (!seed) return
    setBasis(seed.basis)
    setPortId(seed.port.id)
    setQuantity("")
    setQtyUnit(seed.product.unit)
    setNotes("")
    setSubmitting(false)
  }, [seed])

  const product = seed?.product ?? null
  const port = PORTS.find((p) => p.id === portId) ?? seed?.port ?? PORTS[0]

  const quote = useMemo(
    () => (product ? getQuote(product, port, basis, new Date()) : null),
    [product, port, basis],
  )

  const qtyNum = Number.parseFloat(quantity.replace(/,/g, ""))
  const qtyValid = Number.isFinite(qtyNum) && qtyNum > 0
  // The quote price is per the product's canonical unit, so convert the entered
  // quantity into that unit before valuing it (handles bbl<->MT correctly).
  const canonicalQty =
    product && qtyValid ? convertQuantity(qtyNum, qtyUnit, product.unit, product) : 0
  const estValue = quote && qtyValid ? quote.price * canonicalQty : 0

  // Live converted preview into the other unit, plus the toggle handler.
  const otherUnit: "bbl" | "MT" = qtyUnit === "MT" ? "bbl" : "MT"
  const conversionFactor = product ? bblPerMtFor(product) : 0
  const convertedPreview =
    product && qtyValid ? convertQuantity(qtyNum, qtyUnit, otherUnit, product) : 0

  const handleConvertUnit = () => {
    if (!product || !qtyValid) return
    const converted = convertQuantity(qtyNum, qtyUnit, otherUnit, product)
    const rounded =
      otherUnit === "bbl" ? Math.round(converted) : Math.round(converted * 1000) / 1000
    setQuantity(rounded.toLocaleString("en-US"))
    setQtyUnit(otherUnit)
  }

  const handleSubmit = () => {
    if (!product || !quote || !qtyValid) {
      toast.error("Enter a valid quantity")
      return
    }
    setSubmitting(true)
    const unitLabel = formatUnit(qtyUnit)
    const buyer = user.company?.trim() || user.fullName?.trim() || "Client account"
    const deal = addDeal({
      title: `${product.name} — ${basis} Purchase Request`,
      category: "Commodity Trade",
      tradeStructure: basis,
      commodity: product.name,
      quantity: `${qtyNum.toLocaleString("en-US")} ${unitLabel}`,
      approxValue: estValue,
      currency: "USD",
      buyerName: buyer,
      sellerName: "MCC Global Commodity Desk",
      sendingBank: "",
      sendingBankBic: "",
      receivingBank: "",
      receivingBankBic: "",
      instrumentType: "Cash",
      originCountry: port.country,
      destinationCountry: "",
      mt103Ref: "",
      mt202Ref: "",
      mt799Ref: "",
      notes:
        `Quotation request from board: ${product.name} (${product.category}) @ ` +
        `${formatQuotePrice(quote.price, product.unit)} ${basis}, ${port.name}, ${port.country}. ` +
        (notes.trim() ? `Client notes: ${notes.trim()}` : "No additional notes."),
    })
    toast.success("Purchase request submitted", {
      description: `${deal.id} created for ${product.name}. Pending Administrator approval.`,
    })
    log({
      action: `Client requested ${product.name} (${basis}) from quotations board`,
      category: "Commodity Trading",
      details: {
        summary: `Client submitted a one-click purchase request ${deal.id} for ${qtyNum.toLocaleString("en-US")} ${unitLabel} of ${product.name} on ${basis} basis at ${port.name}, ${port.country} (~$${estValue.toLocaleString("en-US", { maximumFractionDigits: 0 })}). Pending review.`,
        referenceId: deal.id,
        uetr: deal.uetr,
        commodity: product.name,
        basis,
        port: `${port.name}, ${port.country}`,
      },
    })
    onClose()
  }

  return (
    <Dialog open={!!seed} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="flex max-h-[90dvh] flex-col gap-0 sm:max-w-[520px]">
        {product && quote && (
          <>
            <DialogHeader className="shrink-0 pb-2">
              <DialogTitle className="flex items-center gap-2">
                <ShoppingCart className="h-4 w-4 text-primary" />
                Request {product.name}
              </DialogTitle>
              <DialogDescription>
                Pre-filled from the live quotations board. Submit to create a pending purchase
                request for Administrator approval — nothing executes automatically.
              </DialogDescription>
            </DialogHeader>

            <div className="-mr-2 flex-1 space-y-4 overflow-y-auto py-1 pr-2">
              {/* Pre-filled product summary */}
              <div className="grid grid-cols-2 gap-2">
                <div className="rounded-lg bg-secondary/30 p-2.5">
                  <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Product</p>
                  <p className="text-sm font-medium text-foreground">{product.name}</p>
                  <p className="text-xs text-muted-foreground">{product.category}</p>
                </div>
                <div className="rounded-lg bg-primary/10 p-2.5">
                  <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
                    Indicative {basis}
                  </p>
                  <p className="text-sm font-semibold tabular-nums text-foreground">
                    {formatQuotePrice(quote.price, product.unit)}
                  </p>
                  <ChangeIndicator pct={quote.changePct} />
                </div>
              </div>

              {/* Basis + port */}
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label className="text-xs">Delivery terms</Label>
                  <Select value={basis} onValueChange={(v) => setBasis(v as PriceBasis)}>
                    <SelectTrigger className="h-9">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="CIF">CIF (Cost, Insurance &amp; Freight)</SelectItem>
                      <SelectItem value="FOB">FOB (Free On Board)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Port / terminal</Label>
                  <Select value={portId} onValueChange={setPortId}>
                    <SelectTrigger className="h-9">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {PORTS.map((p) => (
                        <SelectItem key={p.id} value={p.id}>
                          {p.name} — {p.country}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* Quantity */}
              <div className="space-y-1.5">
                <Label className="text-xs">Quantity required ({formatUnit(qtyUnit)})</Label>
                <div className="relative">
                  <Input
                    inputMode="decimal"
                    value={quantity}
                    onChange={(e) => setQuantity(e.target.value)}
                    placeholder={qtyUnit === "bbl" ? "e.g. 1,000,000" : "e.g. 50,000"}
                    className="h-9 pr-14"
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-medium text-muted-foreground">
                    {formatUnit(qtyUnit)}
                  </span>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={handleConvertUnit}
                    disabled={!qtyValid}
                    className="h-8 gap-1.5"
                  >
                    <ArrowLeftRight className="h-3.5 w-3.5" />
                    Convert to {formatUnit(otherUnit)}
                  </Button>
                  {qtyValid && (
                    <span className="text-xs text-muted-foreground">
                      ≈{" "}
                      {convertedPreview.toLocaleString("en-US", {
                        maximumFractionDigits: otherUnit === "bbl" ? 0 : 3,
                      })}{" "}
                      {formatUnit(otherUnit)}
                      <span className="ml-1 opacity-70">({conversionFactor} BBL/MT)</span>
                    </span>
                  )}
                </div>
                <p className="text-[11px] leading-relaxed text-muted-foreground">
                  BBL↔MT is approximate and density (API gravity) dependent. Contract value is
                  always computed from the {formatUnit(product.unit)} price.
                </p>
              </div>

              {/* Estimated value */}
              <div className="flex items-center justify-between rounded-lg border border-border bg-secondary/20 px-3 py-2.5">
                <span className="text-xs text-muted-foreground">Estimated contract value</span>
                <span className="text-base font-bold tabular-nums text-foreground">
                  {qtyValid
                    ? `$${estValue.toLocaleString("en-US", { maximumFractionDigits: 0 })}`
                    : "—"}
                </span>
              </div>

              {/* Notes */}
              <div className="space-y-1.5">
                <Label className="text-xs">Additional requirements / notes</Label>
                <Textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  rows={3}
                  placeholder="Inspection (SGS), target delivery window, destination port, payment instrument preference, etc."
                />
              </div>

              <div className="flex items-start gap-2 rounded-lg border border-primary/20 bg-primary/5 p-3">
                <Info className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                <p className="text-pretty text-xs text-muted-foreground">
                  Indicative pricing only. The desk confirms firm pricing and allocation after review.
                  Your request joins the Pending Approvals queue and follows the standard SKR / POP /
                  POF workflow.
                </p>
              </div>
            </div>

            <DialogFooter className="mt-2 shrink-0 flex-col gap-2 border-t border-border pt-4 sm:flex-row">
              <Button variant="outline" onClick={onClose} disabled={submitting}>
                Cancel
              </Button>
              <Button onClick={handleSubmit} disabled={!qtyValid || submitting}>
                {submitting ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <ShoppingCart className="mr-2 h-4 w-4" />
                )}
                Submit request
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}
