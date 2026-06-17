"use client"

import { useState } from "react"
import {
  FileText,
  Plus,
  Search,
  Filter,
  Download,
  MoreHorizontal,
  CheckCircle2,
  Clock,
  AlertCircle,
  ExternalLink,
  Shield,
  Building2,
  Calendar,
  TrendingUp,
  ArrowRight,
  XCircle,
  Trash2,
  Ban,
  Landmark,
  Copy,
  ShieldCheck,
} from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Progress } from "@/components/ui/progress"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Label } from "@/components/ui/label"
import { cn } from "@/lib/utils"
import { useActivityLog } from "@/components/activity-tracker"
import { exportToCsv } from "@/lib/export-utils"
import { toast } from "sonner"
import { useInstrumentRequests, type Instrument } from "@/lib/instrument-requests-store"
import { generateInstrumentCertificate } from "@/lib/certificate-pdf"

const BANKING_DETAILS = [
  { label: "Bank", value: "Barclays Bank PLC" },
  { label: "Branch", value: "1 Churchill Place" },
  { label: "Account Number", value: "23385574" },
  { label: "Sort Code", value: "20-00-00" },
  { label: "IBAN", value: "GB02 BARC 2000 0023 3855 74" },
  { label: "SWIFT/BIC", value: "BARCGB22XXX" },
  { label: "City", value: "Leicester, LE87 2BB" },
  { label: "Country", value: "United Kingdom" },
]

const typeColors = {
  SBLC: "bg-blue-500/10 text-blue-400 border-blue-500/20",
  MTN: "bg-green-500/10 text-green-400 border-green-500/20",
  BG: "bg-orange-500/10 text-orange-400 border-orange-500/20",
}

const statusConfig = {
  active: { icon: CheckCircle2, color: "text-green-500", bg: "bg-green-500/10" },
  pending: { icon: Clock, color: "text-yellow-500", bg: "bg-yellow-500/10" },
  rejected: { icon: XCircle, color: "text-red-500", bg: "bg-red-500/10" },
  expired: { icon: AlertCircle, color: "text-red-500", bg: "bg-red-500/10" },
  cancelled: { icon: Ban, color: "text-muted-foreground", bg: "bg-muted" },
}

const formatCurrency = (value: number, currency: string) => {
  const symbols: Record<string, string> = {
    EUR: "€",
    USD: "$",
    GBP: "£",
    CHF: "CHF ",
  }
  return `${symbols[currency]}${value.toLocaleString()}`
}

const typeMeta: Record<string, { short: string; full: string }> = {
  sblc: { short: "SBLC", full: "Stand-by Letter of Credit" },
  mtn: { short: "MTN", full: "Medium Term Note" },
  bg: { short: "BG", full: "Bank Guarantee" },
}

const bankNames: Record<string, string> = {
  natwest: "NatWest Bank PLC",
  jpmorgan: "JP Morgan Chase",
  ubs: "UBS Switzerland",
  hsbc: "HSBC London",
  deutsche: "Deutsche Bank AG",
  barclays: "Barclays Bank",
}

const tradeTypeLabels: Record<string, string> = {
  purchase: "Purchase (23% of face value)",
  lease: "Lease (4% of face value)",
  assign: "Assignee (0.2% of face value)",
}

const purposeNames: Record<string, string> = {
  trade: "Trade Finance",
  investment: "Investment",
  commodity: "Commodity Trading",
  performance: "Performance Guarantee",
  ppp: "PPP/Yield Program",
}

export default function InstrumentsPage() {
  const [isNewInstrumentOpen, setIsNewInstrumentOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState("")
  const [filterType, setFilterType] = useState("all")
  const [filterStatus, setFilterStatus] = useState("all")
  const { instruments, addInstrument, cancelInstrument, deleteInstrument } =
    useInstrumentRequests()

  // New trade form state
  const [tradeType, setTradeType] = useState("")
  const [instrumentType, setInstrumentType] = useState("")
  const [faceValue, setFaceValue] = useState("")
  const [currency, setCurrency] = useState("eur")
  const [issuingBank, setIssuingBank] = useState("")
  const [purpose, setPurpose] = useState("")
  const [formError, setFormError] = useState<string | null>(null)

  // View Details + Assign/Transfer/Monetize dialogs
  const [viewTarget, setViewTarget] = useState<Instrument | null>(null)
  const [actionTarget, setActionTarget] = useState<{
    instrument: Instrument
    action: "Assign/Transfer" | "Monetize"
  } | null>(null)
  const [actionDestination, setActionDestination] = useState("")

  const logActivity = useActivityLog()

  const handleCopyBankingDetails = () => {
    const text = BANKING_DETAILS.map((r) => `${r.label}: ${r.value}`).join("\n")
    navigator.clipboard?.writeText(text)
    toast.success("Banking details copied", {
      description: "Barclays Bank PLC account details copied to your clipboard.",
    })
    logActivity({
      action: "Copied dedicated bank instrument banking details",
      category: "Bank Instruments",
      details: {
        summary:
          "Client copied the dedicated Barclays Bank PLC banking details reserved for bank instrument transactions.",
        bank: "Barclays Bank PLC",
        iban: "GB02 BARC 2000 0023 3855 74",
        swift: "BARCGB22XXX",
      },
    })
  }

  const resetForm = () => {
    setTradeType("")
    setInstrumentType("")
    setFaceValue("")
    setCurrency("eur")
    setIssuingBank("")
    setPurpose("")
    setFormError(null)
  }

  const handleSubmitRequest = () => {
    const numericValue = Number.parseFloat(faceValue.replace(/[^0-9.]/g, ""))
    if (!instrumentType) {
      setFormError("Please select an instrument type.")
      return
    }
    if (!faceValue || Number.isNaN(numericValue) || numericValue <= 0) {
      setFormError("Please enter a valid face value greater than 0.")
      return
    }
    if (!issuingBank) {
      setFormError("Please select an issuing bank.")
      return
    }

    const meta = typeMeta[instrumentType]
    const now = new Date()
    const expiry = new Date(now)
    expiry.setFullYear(expiry.getFullYear() + 1)

    const newInstrument = addInstrument({
      id: `${meta.short}-${now.getTime().toString().slice(-6)}`,
      type: meta.short,
      typeFull: meta.full,
      issuer: bankNames[issuingBank] ?? "—",
      faceValue: numericValue,
      currency: currency.toUpperCase(),
      issuedDate: now.toISOString().split("T")[0],
      expiryDate: expiry.toISOString().split("T")[0],
      daysRemaining: 365,
      rating: "AAA+",
      purpose: purposeNames[purpose] ?? "Trade Finance",
      assignable: true,
      monetizable: true,
      tradeType,
    })

    const tradeTypeLabel = tradeTypeLabels[tradeType] ?? "(not specified)"
    const formattedFace = `${currency.toUpperCase()} ${numericValue.toLocaleString()}`
    logActivity({
      action: `Submitted a ${meta.short} request of ${formattedFace} from ${newInstrument.issuer} for Administrator approval`,
      category: "Bank Instruments",
      details: {
        summary: `Client submitted a request to ${tradeTypeLabel} a ${meta.full} (${meta.short}) with a face value of ${formattedFace}, issued by ${newInstrument.issuer}, for ${newInstrument.purpose}. The request is pending mandatory Administrator approval before the instrument is issued.`,
        referenceId: newInstrument.id,
        instrumentType: `${meta.short} — ${meta.full}`,
        tradeType: tradeTypeLabel,
        faceValue: formattedFace,
        currency: currency.toUpperCase(),
        issuingBank: newInstrument.issuer,
        purpose: newInstrument.purpose,
        creditRating: newInstrument.rating,
        issuedDate: newInstrument.issuedDate,
        expiryDate: newInstrument.expiryDate,
        status: "Pending Administrator Approval",
      },
    })
    toast.success("Instrument request submitted for approval", {
      description: `Your ${meta.short} request for ${formattedFace} is pending Administrator approval. It will be issued once approved.`,
    })
    resetForm()
    setIsNewInstrumentOpen(false)
  }

  const handleCancelOrder = (instrument: Instrument) => {
    cancelInstrument(instrument.id)
    logActivity({
      action: `Cancelled ${instrument.type} order ${instrument.id} (${formatCurrency(instrument.faceValue, instrument.currency)})`,
      category: "Bank Instruments",
      details: {
        summary: `Client cancelled the ${instrument.typeFull} (${instrument.type}) order ${instrument.id} with a face value of ${formatCurrency(instrument.faceValue, instrument.currency)}, issued by ${instrument.issuer}. The order is retained as cancelled.`,
        referenceId: instrument.id,
        instrumentType: `${instrument.type} — ${instrument.typeFull}`,
        faceValue: formatCurrency(instrument.faceValue, instrument.currency),
        issuingBank: instrument.issuer,
        previousStatus: instrument.status,
        newStatus: "Cancelled",
      },
    })
  }

  const handleDeleteOrder = (instrument: Instrument) => {
    deleteInstrument(instrument.id)
    logActivity({
      action: `Deleted ${instrument.type} order ${instrument.id} (${formatCurrency(instrument.faceValue, instrument.currency)})`,
      category: "Bank Instruments",
      details: {
        summary: `Client permanently deleted the ${instrument.typeFull} (${instrument.type}) order ${instrument.id} with a face value of ${formatCurrency(instrument.faceValue, instrument.currency)}, issued by ${instrument.issuer}.`,
        referenceId: instrument.id,
        instrumentType: `${instrument.type} — ${instrument.typeFull}`,
        faceValue: formatCurrency(instrument.faceValue, instrument.currency),
        issuingBank: instrument.issuer,
        action: "Permanently removed from list",
      },
    })
  }

  const viewInstrument = (instrument: Instrument) => {
    setViewTarget(instrument)
    logActivity({
      action: `Viewed details for ${instrument.type} ${instrument.id}`,
      category: "Bank Instruments",
      details: {
        summary: `Client opened the details for the ${instrument.typeFull} (${instrument.type}) ${instrument.id} with a face value of ${formatCurrency(instrument.faceValue, instrument.currency)}.`,
        referenceId: instrument.id,
        instrumentType: `${instrument.type} — ${instrument.typeFull}`,
        faceValue: formatCurrency(instrument.faceValue, instrument.currency),
        issuingBank: instrument.issuer,
        status: instrument.status,
      },
    })
  }

  const requestInstrumentAction = (
    instrument: Instrument,
    action: "Assign/Transfer" | "Monetize",
  ) => {
    setActionDestination("")
    setActionTarget({ instrument, action })
  }

  const confirmInstrumentAction = () => {
    if (!actionTarget) return
    const { instrument, action } = actionTarget
    const isMonetize = action === "Monetize"
    const destinationLabel = actionDestination.trim()

    logActivity({
      action: `Requested ${action} for ${instrument.type} ${instrument.id} (${formatCurrency(instrument.faceValue, instrument.currency)})`,
      category: "Bank Instruments",
      details: {
        summary: isMonetize
          ? `Client submitted a monetization request for the ${instrument.typeFull} (${instrument.type}) ${instrument.id} with a face value of ${formatCurrency(instrument.faceValue, instrument.currency)}${destinationLabel ? `, targeting ${destinationLabel}` : ""}. Pending desk review.`
          : `Client submitted an assignment/transfer request for the ${instrument.typeFull} (${instrument.type}) ${instrument.id} with a face value of ${formatCurrency(instrument.faceValue, instrument.currency)}${destinationLabel ? ` to ${destinationLabel}` : ""}. Pending desk review.`,
        referenceId: instrument.id,
        instrumentType: `${instrument.type} — ${instrument.typeFull}`,
        faceValue: formatCurrency(instrument.faceValue, instrument.currency),
        issuingBank: instrument.issuer,
        requestType: action,
        [isMonetize ? "monetizationTarget" : "transferTo"]: destinationLabel || "—",
        status: "Submitted for review",
      },
    })
    toast.success(`${action} request submitted`, {
      description: `Your ${action.toLowerCase()} request for ${instrument.id} has been sent to the instruments desk for review.`,
    })
    setActionTarget(null)
    setActionDestination("")
  }

  const downloadCertificate = (instrument: Instrument) => {
    generateInstrumentCertificate({
      id: instrument.id,
      type: instrument.type,
      typeFull: instrument.typeFull,
      issuer: instrument.issuer,
      faceValue: formatCurrency(instrument.faceValue, instrument.currency),
      currency: instrument.currency,
      status: instrument.status,
      rating: instrument.rating,
      purpose: instrument.purpose,
      issuedDate: instrument.issuedDate,
      expiryDate: instrument.expiryDate,
      assignable: instrument.assignable,
      monetizable: instrument.monetizable,
    })
    toast.success("Certificate downloaded", {
      description: `The certificate for ${instrument.id} has been generated as a PDF.`,
    })
    logActivity({
      action: `Downloaded certificate for ${instrument.type} ${instrument.id}`,
      category: "Bank Instruments",
      details: {
        summary: `Client downloaded the PDF certificate for the ${instrument.typeFull} (${instrument.type}) ${instrument.id} with a face value of ${formatCurrency(instrument.faceValue, instrument.currency)}, issued by ${instrument.issuer}.`,
        referenceId: instrument.id,
        instrumentType: `${instrument.type} — ${instrument.typeFull}`,
        faceValue: formatCurrency(instrument.faceValue, instrument.currency),
        issuingBank: instrument.issuer,
        format: "PDF",
      },
    })
  }

  const filteredInstruments = instruments.filter((instrument) => {
    const matchesSearch =
      instrument.id.toLowerCase().includes(searchQuery.toLowerCase()) ||
      instrument.issuer.toLowerCase().includes(searchQuery.toLowerCase())
    const matchesType = filterType === "all" || instrument.type === filterType
    const matchesStatus =
      filterStatus === "all" || instrument.status === filterStatus
    return matchesSearch && matchesType && matchesStatus
  })

  const handleExport = () => {
    const count = exportToCsv(
      "bank-instruments",
      filteredInstruments.map((i) => ({
        ...i,
        faceValue: `${i.currency} ${i.faceValue.toLocaleString()}`,
        assignable: i.assignable ? "Yes" : "No",
        monetizable: i.monetizable ? "Yes" : "No",
      })),
      [
        { key: "id", label: "Reference ID" },
        { key: "type", label: "Type" },
        { key: "typeFull", label: "Instrument" },
        { key: "issuer", label: "Issuing Bank" },
        { key: "faceValue", label: "Face Value" },
        { key: "currency", label: "Currency" },
        { key: "status", label: "Status" },
        { key: "rating", label: "Rating" },
        { key: "purpose", label: "Purpose" },
        { key: "issuedDate", label: "Issued Date" },
        { key: "expiryDate", label: "Expiry Date" },
        { key: "assignable", label: "Assignable" },
        { key: "monetizable", label: "Monetizable" },
      ],
    )
    logActivity({
      action: `Exported ${count} bank instrument${count === 1 ? "" : "s"} to CSV`,
      category: "Bank Instruments",
      details: {
        summary: `Client exported ${count} bank instrument record${count === 1 ? "" : "s"} (current filters applied) to a CSV file.`,
        recordCount: `${count}`,
        format: "CSV",
      },
    })
  }

  const totalFaceValue = instruments.reduce((sum, i) => sum + i.faceValue, 0)
  const activeCount = instruments.filter((i) => i.status === "active").length
  const pendingItems = instruments.filter((i) => i.status === "pending")
  const pendingValue = pendingItems.reduce((sum, i) => sum + i.faceValue, 0)
  const primaryCurrency = instruments[0]?.currency ?? "EUR"

  const stats = [
    {
      title: "Total Face Value",
      value: formatCurrency(totalFaceValue, primaryCurrency),
      subtext: "Across all instruments",
      icon: FileText,
      color: "text-primary",
    },
    {
      title: "Active Instruments",
      value: `${activeCount}`,
      subtext: "Ready for trading",
      icon: CheckCircle2,
      color: "text-green-400",
    },
    {
      title: "Pending Issuance",
      value: `${pendingItems.length}`,
      subtext: formatCurrency(pendingValue, primaryCurrency),
      icon: Clock,
      color: "text-yellow-400",
    },
    {
      title: "Total Requests",
      value: `${instruments.length}`,
      subtext: "SBLC, MTN & BG",
      icon: TrendingUp,
      color: "text-blue-400",
    },
  ]

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">
            Bank Instruments
          </h1>
          <p className="text-sm text-muted-foreground">
            Trade SBLC, MTN, and Bank Guarantees
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={handleExport}>
            <Download className="mr-2 h-4 w-4" />
            Export
          </Button>
          <Dialog
            open={isNewInstrumentOpen}
            onOpenChange={(open) => {
              setIsNewInstrumentOpen(open)
              if (!open) resetForm()
            }}
          >
            <DialogTrigger asChild>
              <Button size="sm">
                <Plus className="mr-2 h-4 w-4" />
                New Trade
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[500px]">
              <DialogHeader>
                <DialogTitle>Trade Bank Instrument</DialogTitle>
                <DialogDescription>
                  Purchase, lease, or assign a bank instrument
                </DialogDescription>
              </DialogHeader>
              <div className="grid gap-4 py-4">
                <div className="grid gap-2">
                  <Label>Trade Type</Label>
                  <Select value={tradeType} onValueChange={setTradeType}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select trade type" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="purchase">
                        Purchase (23% of face value)
                      </SelectItem>
                      <SelectItem value="lease">
                        Lease (4% of face value)
                      </SelectItem>
                      <SelectItem value="assign">
                        Assignee (0.2% of face value)
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid gap-2">
                  <Label>Instrument Type *</Label>
                  <Select value={instrumentType} onValueChange={setInstrumentType}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select instrument" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="sblc">
                        SBLC - Stand-by Letter of Credit
                      </SelectItem>
                      <SelectItem value="mtn">MTN - Medium Term Note</SelectItem>
                      <SelectItem value="bg">BG - Bank Guarantee</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="grid gap-2">
                    <Label>Face Value *</Label>
                    <Input
                      placeholder="50,000,000"
                      type="text"
                      value={faceValue}
                      onChange={(e) => setFaceValue(e.target.value)}
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label>Currency</Label>
                    <Select value={currency} onValueChange={setCurrency}>
                      <SelectTrigger>
                        <SelectValue placeholder="EUR" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="eur">EUR</SelectItem>
                        <SelectItem value="usd">USD</SelectItem>
                        <SelectItem value="gbp">GBP</SelectItem>
                        <SelectItem value="chf">CHF</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="grid gap-2">
                  <Label>Issuing Bank *</Label>
                  <Select value={issuingBank} onValueChange={setIssuingBank}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select bank" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="natwest">NatWest Bank PLC</SelectItem>
                      <SelectItem value="jpmorgan">JP Morgan Chase</SelectItem>
                      <SelectItem value="ubs">UBS Switzerland</SelectItem>
                      <SelectItem value="hsbc">HSBC London</SelectItem>
                      <SelectItem value="deutsche">Deutsche Bank AG</SelectItem>
                      <SelectItem value="barclays">Barclays Bank</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid gap-2">
                  <Label>Purpose</Label>
                  <Select value={purpose} onValueChange={setPurpose}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select purpose" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="trade">Trade Finance</SelectItem>
                      <SelectItem value="investment">Investment</SelectItem>
                      <SelectItem value="commodity">Commodity Trading</SelectItem>
                      <SelectItem value="performance">
                        Performance Guarantee
                      </SelectItem>
                      <SelectItem value="ppp">PPP/Yield Program</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex items-start gap-2 rounded-lg border border-primary/20 bg-primary/5 p-3">
                  <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                  <p className="text-xs text-muted-foreground text-pretty">
                    All bank instrument requests require mandatory Administrator approval.
                    Submitting this form creates a pending request — the instrument is only issued
                    once an Administrator approves it.
                  </p>
                </div>
                {formError && (
                  <p className="text-sm text-destructive" role="alert">
                    {formError}
                  </p>
                )}
              </div>
              <DialogFooter>
                <Button
                  variant="outline"
                  onClick={() => {
                    setIsNewInstrumentOpen(false)
                    resetForm()
                  }}
                >
                  Cancel
                </Button>
                <Button onClick={handleSubmitRequest}>
                  <ShieldCheck className="mr-2 h-4 w-4" />
                  Submit for Approval
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* Stats */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {stats.map((stat) => (
          <Card key={stat.title} className="bg-card border-border">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-muted-foreground">{stat.title}</p>
                  <p className="text-2xl font-bold text-foreground mt-1">
                    {stat.value}
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    {stat.subtext}
                  </p>
                </div>
                <div className="rounded-lg bg-secondary p-3">
                  <stat.icon className={cn("h-5 w-5", stat.color)} />
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Pricing Info */}
      <Card className="bg-gradient-to-r from-primary/10 to-primary/5 border-primary/20">
        <CardContent className="p-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h3 className="font-semibold text-foreground">
                Instrument Pricing (AAA+ Rated)
              </h3>
              <p className="text-sm text-muted-foreground mt-1">
                Competitive rates through our bank partners
              </p>
            </div>
            <div className="flex flex-wrap gap-4">
              <div className="text-center">
                <p className="text-xs text-muted-foreground">Assignee</p>
                <p className="text-lg font-bold text-primary">0.2%</p>
              </div>
              <div className="text-center">
                <p className="text-xs text-muted-foreground">Lease</p>
                <p className="text-lg font-bold text-primary">4%</p>
              </div>
              <div className="text-center">
                <p className="text-xs text-muted-foreground">Purchase</p>
                <p className="text-lg font-bold text-primary">23%</p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Dedicated Banking Details */}
      <Card className="bg-card border-border">
        <CardHeader>
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-start gap-3">
              <div className="rounded-lg bg-secondary p-2.5">
                <Landmark className="h-5 w-5 text-primary" />
              </div>
              <div>
                <CardTitle className="text-lg font-semibold">
                  Dedicated Banking Details for Bank Instrument Transactions
                </CardTitle>
                <p className="mt-1 text-sm text-muted-foreground text-pretty">
                  This bank account is exclusively designated for the receipt and processing of
                  funds related to bank instrument trading activities.
                </p>
              </div>
            </div>
            <Button
              variant="outline"
              size="sm"
              className="shrink-0"
              onClick={handleCopyBankingDetails}
            >
              <Copy className="mr-2 h-4 w-4" />
              Copy
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-px overflow-hidden rounded-lg border border-border bg-border sm:grid-cols-2">
            {BANKING_DETAILS.map((row) => (
              <div key={row.label} className="bg-card p-3">
                <p className="text-xs text-muted-foreground">{row.label}</p>
                <p className="mt-0.5 font-medium text-foreground break-words">{row.value}</p>
              </div>
            ))}
          </div>
          <div className="flex items-start gap-2 rounded-lg border border-primary/20 bg-primary/5 p-3">
            <Shield className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
            <p className="text-xs text-muted-foreground text-pretty">
              This account is strictly reserved for transactions associated with bank instruments
              and related financial operations.
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Instruments List */}
      <Card className="bg-card border-border">
        <CardHeader>
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
            <CardTitle className="text-lg font-semibold">
              My Instruments
            </CardTitle>
            <div className="flex flex-col sm:flex-row gap-2">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  placeholder="Search instruments..."
                  className="pl-9 w-full sm:w-[250px]"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
              </div>
              <Select value={filterType} onValueChange={setFilterType}>
                <SelectTrigger className="w-full sm:w-[130px]">
                  <SelectValue placeholder="Type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Types</SelectItem>
                  <SelectItem value="SBLC">SBLC</SelectItem>
                  <SelectItem value="MTN">MTN</SelectItem>
                  <SelectItem value="BG">BG</SelectItem>
                </SelectContent>
              </Select>
              <Select value={filterStatus} onValueChange={setFilterStatus}>
                <SelectTrigger className="w-full sm:w-[130px]">
                  <Filter className="mr-2 h-4 w-4" />
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Status</SelectItem>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="pending">Pending</SelectItem>
                  <SelectItem value="rejected">Rejected</SelectItem>
                  <SelectItem value="expired">Expired</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue="grid" className="w-full">
            <TabsList className="mb-4">
              <TabsTrigger value="grid">Grid View</TabsTrigger>
              <TabsTrigger value="list">List View</TabsTrigger>
            </TabsList>
            <TabsContent value="grid">
              {filteredInstruments.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 text-center">
                  <div className="flex h-12 w-12 items-center justify-center rounded-full bg-secondary mb-3">
                    <FileText className="h-5 w-5 text-muted-foreground" />
                  </div>
                  <p className="text-sm font-medium text-foreground">No instruments yet</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    Start a new trade to add SBLC, MTN, or Bank Guarantees
                  </p>
                </div>
              ) : (
                <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                {filteredInstruments.map((instrument) => {
                  const status =
                    statusConfig[instrument.status as keyof typeof statusConfig]
                  const StatusIcon = status.icon
                  const progressPercent = Math.min(
                    100,
                    (instrument.daysRemaining / 365) * 100
                  )

                  return (
                    <div
                      key={instrument.id}
                      className="rounded-lg border border-border bg-secondary/30 p-4"
                    >
                      <div className="flex items-start justify-between mb-4">
                        <div className="flex items-center gap-3">
                          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                            <FileText className="h-5 w-5 text-primary" />
                          </div>
                          <div>
                            <div className="flex items-center gap-2">
                              <Badge
                                variant="outline"
                                className={cn(
                                  "text-xs font-medium",
                                  typeColors[
                                    instrument.type as keyof typeof typeColors
                                  ]
                                )}
                              >
                                {instrument.type}
                              </Badge>
                              <code className="text-xs text-muted-foreground">
                                {instrument.id}
                              </code>
                            </div>
                            <p className="text-xs text-muted-foreground mt-1">
                              {instrument.typeFull}
                            </p>
                          </div>
                        </div>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-8 w-8">
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => viewInstrument(instrument)}>
                              <ExternalLink className="mr-2 h-4 w-4" />
                              View Details
                            </DropdownMenuItem>
                            {instrument.status === "active" && instrument.assignable && (
                              <DropdownMenuItem
                                onClick={() => requestInstrumentAction(instrument, "Assign/Transfer")}
                              >
                                <ArrowRight className="mr-2 h-4 w-4" />
                                Assign/Transfer
                              </DropdownMenuItem>
                            )}
                            {instrument.status === "active" && instrument.monetizable && (
                              <DropdownMenuItem
                                onClick={() => requestInstrumentAction(instrument, "Monetize")}
                              >
                                <TrendingUp className="mr-2 h-4 w-4" />
                                Monetize
                              </DropdownMenuItem>
                            )}
                            <DropdownMenuItem onClick={() => downloadCertificate(instrument)}>
                              <Download className="mr-2 h-4 w-4" />
                              Download Certificate
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            {instrument.status !== "cancelled" && (
                              <DropdownMenuItem
                                onClick={() => handleCancelOrder(instrument)}
                              >
                                <XCircle className="mr-2 h-4 w-4" />
                                Cancel Order
                              </DropdownMenuItem>
                            )}
                            <DropdownMenuItem
                              onClick={() => handleDeleteOrder(instrument)}
                              className="text-red-500 focus:text-red-500"
                            >
                              <Trash2 className="mr-2 h-4 w-4" />
                              Delete Order
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>

                      <div className="space-y-3">
                        <div className="flex items-center justify-between">
                          <span className="text-xs text-muted-foreground">
                            Face Value
                          </span>
                          <span className="text-lg font-bold text-foreground">
                            {formatCurrency(
                              instrument.faceValue,
                              instrument.currency
                            )}
                          </span>
                        </div>

                        <div className="flex items-center justify-between">
                          <span className="text-xs text-muted-foreground">
                            Issuer
                          </span>
                          <div className="flex items-center gap-1">
                            <Building2 className="h-3 w-3 text-muted-foreground" />
                            <span className="text-xs text-foreground">
                              {instrument.issuer}
                            </span>
                          </div>
                        </div>

                        <div className="flex items-center justify-between">
                          <span className="text-xs text-muted-foreground">
                            Rating
                          </span>
                          <Badge
                            variant="outline"
                            className="bg-primary/10 text-primary border-primary/20 text-[10px]"
                          >
                            <Shield className="mr-1 h-3 w-3" />
                            {instrument.rating}
                          </Badge>
                        </div>

                        <div className="flex items-center justify-between">
                          <span className="text-xs text-muted-foreground">
                            Status
                          </span>
                          <div className="flex items-center gap-1">
                            <StatusIcon className={cn("h-3 w-3", status.color)} />
                            <span
                              className={cn("text-xs capitalize", status.color)}
                            >
                              {instrument.status}
                            </span>
                          </div>
                        </div>

                        <div className="pt-3 border-t border-border">
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-[10px] text-muted-foreground">
                              Expires: {instrument.expiryDate}
                            </span>
                            <span className="text-[10px] text-muted-foreground">
                              {instrument.daysRemaining} days
                            </span>
                          </div>
                          <Progress
                            value={progressPercent}
                            className="h-1"
                          />
                        </div>

                        <div className="flex gap-2 pt-2">
                          {instrument.assignable && (
                            <Badge
                              variant="outline"
                              className="text-[10px] bg-blue-500/10 text-blue-400 border-blue-500/20"
                            >
                              Assignable
                            </Badge>
                          )}
                          {instrument.monetizable && (
                            <Badge
                              variant="outline"
                              className="text-[10px] bg-green-500/10 text-green-400 border-green-500/20"
                            >
                              Monetizable
                            </Badge>
                          )}
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
              )}
            </TabsContent>
            <TabsContent value="list">
              {filteredInstruments.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 text-center">
                  <div className="flex h-12 w-12 items-center justify-center rounded-full bg-secondary mb-3">
                    <FileText className="h-5 w-5 text-muted-foreground" />
                  </div>
                  <p className="text-sm font-medium text-foreground">No instruments yet</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    Start a new trade to add SBLC, MTN, or Bank Guarantees
                  </p>
                </div>
              ) : (
                <div className="space-y-2">
                {filteredInstruments.map((instrument) => {
                  const status =
                    statusConfig[instrument.status as keyof typeof statusConfig]
                  const StatusIcon = status.icon

                  return (
                    <div
                      key={instrument.id}
                      className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 rounded-lg border border-border bg-secondary/30"
                    >
                      <div className="flex items-center gap-4">
                        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                          <FileText className="h-5 w-5 text-primary" />
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <Badge
                              variant="outline"
                              className={cn(
                                "text-xs",
                                typeColors[
                                  instrument.type as keyof typeof typeColors
                                ]
                              )}
                            >
                              {instrument.type}
                            </Badge>
                            <span className="font-medium text-foreground">
                              {instrument.id}
                            </span>
                          </div>
                          <p className="text-xs text-muted-foreground">
                            {instrument.issuer} • {instrument.purpose}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-6">
                        <div className="text-right">
                          <p className="text-lg font-bold text-foreground">
                            {formatCurrency(
                              instrument.faceValue,
                              instrument.currency
                            )}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            Expires {instrument.expiryDate}
                          </p>
                        </div>
                        <Badge
                          variant="outline"
                          className={cn(
                            "text-xs capitalize",
                            status.color,
                            status.bg
                          )}
                        >
                          <StatusIcon className="mr-1 h-3 w-3" />
                          {instrument.status}
                        </Badge>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="sm">
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => viewInstrument(instrument)}>
                              <ExternalLink className="mr-2 h-4 w-4" />
                              View Details
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            {instrument.status !== "cancelled" && (
                              <DropdownMenuItem
                                onClick={() => handleCancelOrder(instrument)}
                              >
                                <XCircle className="mr-2 h-4 w-4" />
                                Cancel Order
                              </DropdownMenuItem>
                            )}
                            <DropdownMenuItem
                              onClick={() => handleDeleteOrder(instrument)}
                              className="text-red-500 focus:text-red-500"
                            >
                              <Trash2 className="mr-2 h-4 w-4" />
                              Delete Order
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    </div>
                  )
                })}
              </div>
              )}
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>

      {/* View Details dialog */}
      <Dialog open={!!viewTarget} onOpenChange={(open) => !open && setViewTarget(null)}>
        <DialogContent className="sm:max-w-lg">
          {viewTarget && (
            <>
              <DialogHeader>
                <div className="flex items-center gap-2">
                  <Badge
                    variant="outline"
                    className={cn(
                      "text-[10px]",
                      typeColors[viewTarget.type as keyof typeof typeColors],
                    )}
                  >
                    {viewTarget.type}
                  </Badge>
                  <DialogTitle>{viewTarget.id}</DialogTitle>
                </div>
                <DialogDescription>{viewTarget.typeFull}</DialogDescription>
              </DialogHeader>
              <div className="rounded-lg border border-border bg-secondary/30 p-4 text-center">
                <p className="text-xs text-muted-foreground">Face Value</p>
                <p className="mt-1 text-2xl font-bold text-foreground">
                  {formatCurrency(viewTarget.faceValue, viewTarget.currency)}
                </p>
              </div>
              <div className="grid gap-px overflow-hidden rounded-lg border border-border bg-border sm:grid-cols-2">
                {[
                  ["Issuing Bank", viewTarget.issuer],
                  ["Credit Rating", viewTarget.rating],
                  ["Purpose", viewTarget.purpose],
                  ["Status", viewTarget.status.charAt(0).toUpperCase() + viewTarget.status.slice(1)],
                  ["Issued Date", viewTarget.issuedDate],
                  ["Expiry Date", viewTarget.expiryDate],
                  ["Days Remaining", `${viewTarget.daysRemaining} days`],
                  ["Assignable", viewTarget.assignable ? "Yes" : "No"],
                  ["Monetizable", viewTarget.monetizable ? "Yes" : "No"],
                ].map(([label, value]) => (
                  <div key={label} className="bg-card p-3">
                    <p className="text-xs text-muted-foreground">{label}</p>
                    <p className="mt-0.5 text-sm font-medium text-foreground break-words">{value}</p>
                  </div>
                ))}
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setViewTarget(null)}>
                  Close
                </Button>
                <Button
                  onClick={() => {
                    const target = viewTarget
                    setViewTarget(null)
                    downloadCertificate(target)
                  }}
                >
                  <Download className="mr-2 h-4 w-4" />
                  Download Certificate
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* Assign/Transfer & Monetize dialog */}
      <Dialog open={!!actionTarget} onOpenChange={(open) => !open && setActionTarget(null)}>
        <DialogContent className="sm:max-w-md">
          {actionTarget && (
            <>
              <DialogHeader>
                <DialogTitle>
                  {actionTarget.action === "Monetize" ? "Monetize Instrument" : "Assign / Transfer Instrument"}
                </DialogTitle>
                <DialogDescription>
                  {actionTarget.action === "Monetize"
                    ? `Submit a monetization request for ${actionTarget.instrument.id}. Our instruments desk will review and respond.`
                    : `Submit an assignment or transfer request for ${actionTarget.instrument.id}. Our instruments desk will review and respond.`}
                </DialogDescription>
              </DialogHeader>
              <div className="rounded-lg border border-border bg-secondary/30 p-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">{actionTarget.instrument.typeFull}</span>
                  <span className="text-sm font-semibold text-foreground">
                    {formatCurrency(actionTarget.instrument.faceValue, actionTarget.instrument.currency)}
                  </span>
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="action-destination">
                  {actionTarget.action === "Monetize"
                    ? "Monetization platform / program (optional)"
                    : "Transfer to (beneficiary or bank, optional)"}
                </Label>
                <Input
                  id="action-destination"
                  value={actionDestination}
                  onChange={(e) => setActionDestination(e.target.value)}
                  placeholder={
                    actionTarget.action === "Monetize"
                      ? "e.g. PPP / Yield Program"
                      : "e.g. Beneficiary name or receiving bank"
                  }
                />
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setActionTarget(null)}>
                  Cancel
                </Button>
                <Button onClick={confirmInstrumentAction}>Submit Request</Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
