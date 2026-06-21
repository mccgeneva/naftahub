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
} from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
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
  type PriceBasis,
  type ProductCategory,
} from "@/lib/commodity-quotations"

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
                {selectedProduct.unit}
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
                            ? `per ${row.product.unit}`
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
              </CardContent>
            </Card>
          ))}
        </div>
      )}
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
