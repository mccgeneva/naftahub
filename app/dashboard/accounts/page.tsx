"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import {
  Building2,
  Plus,
  Search,
  Filter,
  Copy,
  Check,
  Eye,
  Edit2,
  MoreHorizontal,
  TrendingUp,
  TrendingDown,
  Globe,
  Shield,
  Star,
  CreditCard,
  Landmark,
  ArrowUpRight,
  ArrowDownLeft,
  RefreshCw,
  Download,
  ChevronDown,
  Mail,
  FileText,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { useActivityLog } from "@/components/activity-tracker"
import { useCurrentUser } from "@/lib/use-current-user"
import { useLedger } from "@/lib/ledger-store"
import { exportToCsv } from "@/lib/export-utils"
import { VerifiedBankField } from "@/components/verified-bank-field"
import { CountryCombobox } from "@/components/country-combobox"
import { getCountryByCode } from "@/lib/countries"
import { validateIban, validateBic } from "@/lib/iban-swift"
import { Input } from "@/components/ui/input"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Badge } from "@/components/ui/badge"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Textarea } from "@/components/ui/textarea"

// Realistic multi-bank account database with AAA-rated banks worldwide.
// Balances here are baseline defaults; the live balance for the master account
// is overlaid from the ledger store inside the component.
type BankAccount = {
  id: string
  bankName: string
  bankLogo: string
  country: string
  countryCode: string
  rating: string
  accountName: string
  accountNumber: string
  iban: string
  swift: string
  currency: string
  balance: number
  availableBalance: number
  reservedBalance: number
  accountType: string
  status: string
  openDate: string
  lastActivity: string
  dailyLimit: number
  monthlyVolume: number
  relationship: string
  contactPerson: string
  contactEmail: string
  branchAddress: string
  beneficiaryAddress: string
  // Optional, region-specific coordinates shown when present.
  sortCode?: string
  routingNumber?: string
  bsb?: string
  branchCode?: string
  escrowDetails?: string
}

const baseBankAccounts: BankAccount[] = [
  {
    id: "ACC-001",
    bankName: "Banking Circle - German Branch",
    bankLogo: "BC",
    country: "Germany",
    countryCode: "DE",
    rating: "A",
    accountName: "MCC Capital",
    accountNumber: "0029 2908 19",
    iban: "DE73 2022 0800 0029 2908 19",
    swift: "SXPYDEHHXXX",
    currency: "EUR",
    balance: 0.0,
    availableBalance: 0.0,
    reservedBalance: 0.0,
    accountType: "MCC Capital Bank Account",
    status: "active",
    openDate: "2026-04-24",
    lastActivity: "2026-04-24T18:20:00Z",
    dailyLimit: 0,
    monthlyVolume: 0,
    relationship: "Business Banking",
    contactPerson: "MCC Client Services",
    contactEmail: "admin@mccgva.ch",
    branchAddress: "80333 München, Germany",
    beneficiaryAddress: "Rue du Rhone 14, 1204 Geneva, Switzerland",
  },
]

// Per-currency settlement account metadata. When the client holds a balance in
// one of these currencies (e.g. after a currency exchange), a matching account
// card is shown automatically with the live ledger balance.
const currencyAccountMeta: Record<
  string,
  {
    bankName: string
    bankLogo: string
    country: string
    countryCode: string
    swift: string
    accountType: string
  }
> = {
  USD: {
    bankName: "Banking Circle - US Branch",
    bankLogo: "BC",
    country: "United States",
    countryCode: "US",
    swift: "SXPYUS33XXX",
    accountType: "USD Settlement Account",
  },
  GBP: {
    bankName: "Banking Circle - UK Branch",
    bankLogo: "BC",
    country: "United Kingdom",
    countryCode: "GB",
    swift: "SXPYGB2LXXX",
    accountType: "GBP Settlement Account",
  },
  CHF: {
    bankName: "Banking Circle - Swiss Branch",
    bankLogo: "BC",
    country: "Switzerland",
    countryCode: "CH",
    swift: "SXPYCHGGXXX",
    accountType: "CHF Settlement Account",
  },
  JPY: {
    bankName: "Banking Circle - Japan Branch",
    bankLogo: "BC",
    country: "Japan",
    countryCode: "JP",
    swift: "SXPYJPJTXXX",
    accountType: "JPY Settlement Account",
  },
  AUD: {
    bankName: "Banking Circle - Australia Branch",
    bankLogo: "BC",
    country: "Australia",
    countryCode: "AU",
    swift: "SXPYAU2SXXX",
    accountType: "AUD Settlement Account",
  },
  CAD: {
    bankName: "Banking Circle - Canada Branch",
    bankLogo: "BC",
    country: "Canada",
    countryCode: "CA",
    swift: "SXPYCATTXXX",
    accountType: "CAD Settlement Account",
  },
  SGD: {
    bankName: "Banking Circle - Singapore Branch",
    bankLogo: "BC",
    country: "Singapore",
    countryCode: "SG",
    swift: "SXPYSGSGXXX",
    accountType: "SGD Settlement Account",
  },
}

const currencySymbols: Record<string, string> = {
  CHF: "CHF",
  EUR: "€",
  USD: "$",
  GBP: "£",
  SGD: "S$",
  JPY: "¥",
  AUD: "A$",
  HKD: "HK$",
  AED: "AED",
}

function formatCurrency(amount: number, currency: string): string {
  const symbol = currencySymbols[currency] || currency
  if (currency === "JPY") {
    return `${symbol}${amount.toLocaleString("en-US", { maximumFractionDigits: 0 })}`
  }
  return `${symbol}${amount.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

function getRatingColor(rating: string): string {
  if (rating.startsWith("AAA")) return "bg-emerald-500/20 text-emerald-400 border-emerald-500/30"
  if (rating.startsWith("AA")) return "bg-green-500/20 text-green-400 border-green-500/30"
  if (rating.startsWith("A")) return "bg-amber-500/20 text-amber-400 border-amber-500/30"
  return "bg-zinc-500/20 text-zinc-400 border-zinc-500/30"
}

function getStatusColor(status: string): string {
  switch (status) {
    case "active":
      return "bg-emerald-500/20 text-emerald-400 border-emerald-500/30"
    case "restricted":
      return "bg-amber-500/20 text-amber-400 border-amber-500/30"
    case "dormant":
      return "bg-zinc-500/20 text-zinc-400 border-zinc-500/30"
    case "closed":
      return "bg-red-500/20 text-red-400 border-red-500/30"
    default:
      return "bg-zinc-500/20 text-zinc-400 border-zinc-500/30"
  }
}

function getFlagEmoji(countryCode: string): string {
  const flags: Record<string, string> = {
    CH: "🇨🇭",
    DE: "🇩🇪",
    US: "🇺🇸",
    GB: "🇬🇧",
    FR: "🇫🇷",
    SG: "🇸🇬",
    JP: "🇯🇵",
    AU: "🇦🇺",
    HK: "🇭🇰",
    AE: "🇦🇪",
  }
  return flags[countryCode] || "🏳️"
}

export default function BankAccountsPage() {
  const [searchQuery, setSearchQuery] = useState("")
  const [currencyFilter, setCurrencyFilter] = useState("all")
  const [statusFilter, setStatusFilter] = useState("all")
  const [countryFilter, setCountryFilter] = useState("all")
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid")
  const [copiedField, setCopiedField] = useState<string | null>(null)
  const [selectedAccount, setSelectedAccount] = useState<typeof baseBankAccounts[0] | null>(null)
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false)
  const [isDetailDialogOpen, setIsDetailDialogOpen] = useState(false)
  const [newIban, setNewIban] = useState("")
  const [newSwift, setNewSwift] = useState("")
  const [newCountry, setNewCountry] = useState("")
  const [addError, setAddError] = useState<string | null>(null)
  const logActivity = useActivityLog()
  const user = useCurrentUser()
  const { balanceFor, currencies } = useLedger()

  // Overlay the live ledger balance onto the master MCC Capital account so that
  // recorded incoming payments are reflected here automatically.
  const liveBaseAccounts = baseBankAccounts.map((account) =>
    account.id === "ACC-001"
      ? {
          ...account,
          balance: balanceFor(account.currency),
          availableBalance: balanceFor(account.currency) - account.reservedBalance,
        }
      : account,
  )

  // For every non-EUR currency the client holds (e.g. proceeds from a currency
  // exchange), surface a dedicated settlement account with its live balance.
  const baseCurrencies = new Set(baseBankAccounts.map((a) => a.currency))
  const extraCurrencyAccounts = currencies
    .filter((cur) => !baseCurrencies.has(cur) && currencyAccountMeta[cur])
    .map((cur) => {
      const meta = currencyAccountMeta[cur]
      const bal = balanceFor(cur)
      return {
        id: `ACC-${cur}`,
        bankName: meta.bankName,
        bankLogo: meta.bankLogo,
        country: meta.country,
        countryCode: meta.countryCode,
        rating: "A",
        accountName: "MCC Capital",
        accountNumber: `${cur}-2908 19`,
        iban: "—",
        swift: meta.swift,
        currency: cur,
        balance: bal,
        availableBalance: bal,
        reservedBalance: 0,
        accountType: meta.accountType,
        status: "active",
        openDate: "2026-04-24",
        lastActivity: new Date().toISOString(),
        dailyLimit: 0,
        monthlyVolume: 0,
        relationship: "Business Banking",
        contactPerson: "MCC Client Services",
        contactEmail: "admin@mccgva.ch",
        branchAddress: meta.country,
        beneficiaryAddress: "Rue du Rhone 14, 1204 Geneva, Switzerland",
      }
    })

  const bankAccounts = [...liveBaseAccounts, ...extraCurrencyAccounts]
  const router = useRouter()

  const handleAddAccount = () => {
    const ibanCheck = validateIban(newIban)
    if (!ibanCheck.valid) {
      setAddError(`IBAN: ${ibanCheck.error}`)
      return
    }
    const bicCheck = validateBic(newSwift)
    if (!bicCheck.valid) {
      setAddError(`SWIFT/BIC: ${bicCheck.error}`)
      return
    }
    setAddError(null)
    logActivity({
      action: "Submitted a new bank account registration",
      category: "Bank Accounts",
      details: {
        summary:
          "Client submitted a request to register a new bank account on the platform.",
        country: newCountry ? getCountryByCode(newCountry)?.name ?? newCountry : "Not specified",
        submittedAt: new Date().toLocaleString("en-GB"),
      },
    })
    setIsAddDialogOpen(false)
    setNewIban("")
    setNewSwift("")
    setNewCountry("")
    toast.success("Account submitted for review", {
      description: "Our onboarding team will verify and activate the account.",
    })
  }

  const handleSendPayment = () => {
    if (selectedAccount) {
      logActivity({
        action: `Started a payment from ${selectedAccount.accountName ?? selectedAccount.bankName}`,
        category: "Payments",
        details: {
          summary: `Client initiated a payment from "${selectedAccount.accountName ?? selectedAccount.bankName}".`,
          account: selectedAccount.accountName ?? selectedAccount.bankName ?? "—",
        },
      })
    }
    setIsDetailDialogOpen(false)
    router.push("/dashboard/payments")
  }

  const handleContactViaMcc = () => {
    if (!selectedAccount) return
    const accountLabel = selectedAccount.accountName ?? selectedAccount.bankName ?? "my account"
    // All partner communication is routed exclusively through MCC admin — never
    // to the partner bank directly.
    const subject = encodeURIComponent(`Account enquiry: ${accountLabel}`)
    const body = encodeURIComponent(
      `Hello MCC Client Services,\n\nI would like to make an enquiry regarding my account "${accountLabel}".\n\n[Please describe your request here]\n\nKind regards,`,
    )
    logActivity({
      action: `Contacted MCC about ${accountLabel}`,
      category: "Bank Accounts",
      details: {
        summary: `Client request routed to MCC admin (admin@mccgva.ch) regarding "${accountLabel}". Direct partner-bank contact is disabled.`,
        routedTo: "admin@mccgva.ch",
        account: accountLabel,
      },
    })
    window.location.href = `mailto:admin@mccgva.ch?subject=${subject}&body=${body}`
    toast.success("Request routed to MCC", {
      description: "Your enquiry is handled by MCC and sent to admin@mccgva.ch.",
    })
  }

  const handleEditAccount = () => {
    if (!selectedAccount) return
    logActivity({
      action: `Requested edits to ${selectedAccount.accountName ?? selectedAccount.bankName}`,
      category: "Bank Accounts",
      details: {
        summary: `Client requested changes to the account "${selectedAccount.accountName ?? selectedAccount.bankName}".`,
        account: selectedAccount.accountName ?? selectedAccount.bankName ?? "—",
        requestedAt: new Date().toLocaleString("en-GB"),
      },
    })
    toast.info("Edit request submitted", {
      description: "Account changes require verification by your relationship manager.",
    })
  }

  const handleExportAccount = () => {
    if (!selectedAccount) return
    exportToCsv(`account-${selectedAccount.accountNumber ?? "details"}`, [selectedAccount])
    logActivity({
      action: `Exported account details for ${selectedAccount.bankName ?? selectedAccount.accountName ?? "account"}`,
      category: "Bank Accounts",
      details: {
        summary: `Client exported the full account details for "${selectedAccount.accountName ?? selectedAccount.bankName}" to a CSV file.`,
        account: selectedAccount.accountName ?? selectedAccount.bankName ?? "—",
        currency: selectedAccount.currency,
      },
    })
  }

  const copyToClipboard = (text: string, field: string) => {
    navigator.clipboard.writeText(text)
    setCopiedField(field)
    setTimeout(() => setCopiedField(null), 2000)
  }

  const filteredAccounts = bankAccounts.filter((account) => {
    const matchesSearch =
      account.bankName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      account.accountName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      account.iban.toLowerCase().includes(searchQuery.toLowerCase()) ||
      account.swift.toLowerCase().includes(searchQuery.toLowerCase())
    const matchesCurrency = currencyFilter === "all" || account.currency === currencyFilter
    const matchesStatus = statusFilter === "all" || account.status === statusFilter
    const matchesCountry = countryFilter === "all" || account.countryCode === countryFilter
    return matchesSearch && matchesCurrency && matchesStatus && matchesCountry
  })

  // Calculate totals by currency
  const totalsByCurrency = bankAccounts.reduce((acc, account) => {
    if (!acc[account.currency]) {
      acc[account.currency] = { total: 0, available: 0, reserved: 0, count: 0 }
    }
    acc[account.currency].total += account.balance
    acc[account.currency].available += account.availableBalance
    acc[account.currency].reserved += account.reservedBalance
    acc[account.currency].count += 1
    return acc
  }, {} as Record<string, { total: number; available: number; reserved: number; count: number }>)

  const uniqueCurrencies = [...new Set(bankAccounts.map((a) => a.currency))]
  const uniqueCountries = [...new Set(bankAccounts.map((a) => a.countryCode))]

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Bank Accounts</h1>
          <p className="text-sm text-muted-foreground">
            {user.company} — business account management
          </p>
        </div>
        <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
          <DialogTrigger asChild>
            <Button className="gap-2 bg-amber-500 hover:bg-amber-600 text-zinc-900">
              <Plus className="h-4 w-4" />
              Add Bank Account
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl bg-zinc-900 border-zinc-800">
            <DialogHeader>
              <DialogTitle className="text-foreground">Add New Bank Account</DialogTitle>
              <DialogDescription className="text-muted-foreground">
                Register a new bank account to the platform
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-4 max-h-[60vh] overflow-y-auto">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label className="text-zinc-300">Bank Name</Label>
                  <Input placeholder="e.g., UBS AG" className="bg-zinc-800 border-zinc-700" />
                </div>
                <div className="space-y-2">
                  <Label className="text-zinc-300" htmlFor="new-account-country">
                    Country
                  </Label>
                  <CountryCombobox
                    id="new-account-country"
                    value={newCountry}
                    onChange={setNewCountry}
                    placeholder="Search and select country"
                    triggerClassName="bg-zinc-800 border-zinc-700 text-zinc-100 hover:bg-zinc-800 hover:text-zinc-100"
                    contentClassName="bg-zinc-900 border-zinc-800"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label className="text-zinc-300">Account Name</Label>
                  <Input placeholder="e.g., MCC Primary Operations" className="bg-zinc-800 border-zinc-700" />
                </div>
                <div className="space-y-2">
                  <Label className="text-zinc-300">Account Type</Label>
                  <Select>
                    <SelectTrigger className="bg-zinc-800 border-zinc-700">
                      <SelectValue placeholder="Select type" />
                    </SelectTrigger>
                    <SelectContent className="bg-zinc-800 border-zinc-700">
                      <SelectItem value="corporate">Corporate Current</SelectItem>
                      <SelectItem value="treasury">Treasury Account</SelectItem>
                      <SelectItem value="trading">Trading Account</SelectItem>
                      <SelectItem value="escrow">Escrow Account</SelectItem>
                      <SelectItem value="trade-finance">Trade Finance</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <VerifiedBankField
                  id="new-account-iban"
                  label="IBAN"
                  kind="iban"
                  placeholder="e.g., CH93 0027 3273 0786 5420 0"
                  value={newIban}
                  onChange={setNewIban}
                  inputClassName="bg-zinc-800 border-zinc-700"
                />
                <VerifiedBankField
                  id="new-account-swift"
                  label="SWIFT/BIC"
                  kind="bic"
                  maxLength={11}
                  placeholder="e.g., UBSWCHZH80A"
                  value={newSwift}
                  onChange={setNewSwift}
                  inputClassName="bg-zinc-800 border-zinc-700"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label className="text-zinc-300">Currency</Label>
                  <Select>
                    <SelectTrigger className="bg-zinc-800 border-zinc-700">
                      <SelectValue placeholder="Select currency" />
                    </SelectTrigger>
                    <SelectContent className="bg-zinc-800 border-zinc-700">
                      <SelectItem value="CHF">CHF - Swiss Franc</SelectItem>
                      <SelectItem value="EUR">EUR - Euro</SelectItem>
                      <SelectItem value="USD">USD - US Dollar</SelectItem>
                      <SelectItem value="GBP">GBP - British Pound</SelectItem>
                      <SelectItem value="SGD">SGD - Singapore Dollar</SelectItem>
                      <SelectItem value="JPY">JPY - Japanese Yen</SelectItem>
                      <SelectItem value="AUD">AUD - Australian Dollar</SelectItem>
                      <SelectItem value="HKD">HKD - Hong Kong Dollar</SelectItem>
                      <SelectItem value="AED">AED - UAE Dirham</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label className="text-zinc-300">Account Number</Label>
                  <Input placeholder="Account number" className="bg-zinc-800 border-zinc-700" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label className="text-zinc-300">Daily Limit</Label>
                  <Input type="number" placeholder="50000000" className="bg-zinc-800 border-zinc-700" />
                </div>
                <div className="space-y-2">
                  <Label className="text-zinc-300">Bank Rating</Label>
                  <Select>
                    <SelectTrigger className="bg-zinc-800 border-zinc-700">
                      <SelectValue placeholder="Select rating" />
                    </SelectTrigger>
                    <SelectContent className="bg-zinc-800 border-zinc-700">
                      <SelectItem value="AAA">AAA</SelectItem>
                      <SelectItem value="AA+">AA+</SelectItem>
                      <SelectItem value="AA">AA</SelectItem>
                      <SelectItem value="AA-">AA-</SelectItem>
                      <SelectItem value="A+">A+</SelectItem>
                      <SelectItem value="A">A</SelectItem>
                      <SelectItem value="A-">A-</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="space-y-2">
                <Label className="text-zinc-300">Branch Address</Label>
                <Textarea placeholder="Full branch address" className="bg-zinc-800 border-zinc-700" />
              </div>
              <div className="flex items-start gap-3 p-3 rounded-lg bg-amber-500/10 border border-amber-500/20">
                <Shield className="h-4 w-4 mt-0.5 shrink-0 text-amber-400" />
                <p className="text-xs text-amber-300/90 leading-relaxed">
                  Clients do not contact partner banks directly. All communication for this
                  account is handled by MCC Client Services and routed through{" "}
                  <span className="font-medium">admin@mccgva.ch</span>.
                </p>
              </div>
            </div>
            {addError && (
              <p className="text-sm text-destructive" role="alert">
                {addError}
              </p>
            )}
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsAddDialogOpen(false)} className="border-zinc-700">
                Cancel
              </Button>
              <Button
                className="bg-amber-500 hover:bg-amber-600 text-zinc-900"
                onClick={handleAddAccount}
              >
                Add Account
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {/* Summary Cards by Currency */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
        {Object.entries(totalsByCurrency)
          .sort((a, b) => b[1].total - a[1].total)
          .slice(0, 5)
          .map(([currency, data]) => (
            <Card key={currency} className="bg-zinc-900/50 border-zinc-800">
              <CardContent className="p-4">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-medium text-muted-foreground">{currency}</span>
                  <Badge variant="outline" className="text-[10px] border-zinc-700">
                    {data.count} accounts
                  </Badge>
                </div>
                <p className="text-lg font-bold text-foreground">
                  {formatCurrency(data.total, currency)}
                </p>
                <p className="text-xs text-emerald-400 mt-1">
                  {formatCurrency(data.available, currency)} available
                </p>
              </CardContent>
            </Card>
          ))}
      </div>

      {/* Filters */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search by bank, account, IBAN, or SWIFT..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10 bg-zinc-900/50 border-zinc-800"
          />
        </div>
        <div className="flex flex-wrap gap-2">
          <Select value={currencyFilter} onValueChange={setCurrencyFilter}>
            <SelectTrigger className="w-[120px] bg-zinc-900/50 border-zinc-800">
              <SelectValue placeholder="Currency" />
            </SelectTrigger>
            <SelectContent className="bg-zinc-900 border-zinc-800">
              <SelectItem value="all">All Currencies</SelectItem>
              {uniqueCurrencies.map((currency) => (
                <SelectItem key={currency} value={currency}>
                  {currency}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={countryFilter} onValueChange={setCountryFilter}>
            <SelectTrigger className="w-[120px] bg-zinc-900/50 border-zinc-800">
              <SelectValue placeholder="Country" />
            </SelectTrigger>
            <SelectContent className="bg-zinc-900 border-zinc-800">
              <SelectItem value="all">All Countries</SelectItem>
              {uniqueCountries.map((country) => (
                <SelectItem key={country} value={country}>
                  {getFlagEmoji(country)} {country}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-[120px] bg-zinc-900/50 border-zinc-800">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent className="bg-zinc-900 border-zinc-800">
              <SelectItem value="all">All Status</SelectItem>
              <SelectItem value="active">Active</SelectItem>
              <SelectItem value="restricted">Restricted</SelectItem>
              <SelectItem value="dormant">Dormant</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Account Cards Grid */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {filteredAccounts.map((account) => (
          <Card
            key={account.id}
            className="bg-zinc-900/50 border-zinc-800 hover:border-zinc-700 transition-colors cursor-pointer"
            onClick={() => {
              setSelectedAccount(account)
              setIsDetailDialogOpen(true)
            }}
          >
            <CardHeader className="pb-3">
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-zinc-800 text-xs font-bold text-amber-400">
                    {account.bankLogo}
                  </div>
                  <div>
                    <CardTitle className="text-sm font-medium text-foreground">
                      {account.bankName}
                    </CardTitle>
                    <CardDescription className="text-xs">
                      {getFlagEmoji(account.countryCode)} {account.country}
                    </CardDescription>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className={getRatingColor(account.rating)}>
                    {account.rating}
                  </Badge>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <p className="text-xs text-muted-foreground mb-1">{account.accountName}</p>
                <p className="text-xs text-muted-foreground">{account.accountType}</p>
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">Balance</span>
                  <span className="text-sm font-semibold text-foreground">
                    {formatCurrency(account.balance, account.currency)}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">Available</span>
                  <span className="text-sm text-emerald-400">
                    {formatCurrency(account.availableBalance, account.currency)}
                  </span>
                </div>
                {account.reservedBalance > 0 && (
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-muted-foreground">Reserved</span>
                    <span className="text-sm text-amber-400">
                      {formatCurrency(account.reservedBalance, account.currency)}
                    </span>
                  </div>
                )}
              </div>

              <div className="pt-2 border-t border-zinc-800 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">IBAN</span>
                  <div className="flex items-center gap-1">
                    <span className="text-xs font-mono text-zinc-400 truncate max-w-[140px]">
                      {account.iban}
                    </span>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-5 w-5"
                      onClick={(e) => {
                        e.stopPropagation()
                        copyToClipboard(account.iban, `iban-${account.id}`)
                      }}
                    >
                      {copiedField === `iban-${account.id}` ? (
                        <Check className="h-3 w-3 text-emerald-400" />
                      ) : (
                        <Copy className="h-3 w-3 text-muted-foreground" />
                      )}
                    </Button>
                  </div>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">SWIFT</span>
                  <div className="flex items-center gap-1">
                    <span className="text-xs font-mono text-zinc-400">{account.swift}</span>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-5 w-5"
                      onClick={(e) => {
                        e.stopPropagation()
                        copyToClipboard(account.swift, `swift-${account.id}`)
                      }}
                    >
                      {copiedField === `swift-${account.id}` ? (
                        <Check className="h-3 w-3 text-emerald-400" />
                      ) : (
                        <Copy className="h-3 w-3 text-muted-foreground" />
                      )}
                    </Button>
                  </div>
                </div>
              </div>

              <div className="flex items-center justify-between pt-2">
                <Badge variant="outline" className={getStatusColor(account.status)}>
                  {account.status}
                </Badge>
                <span className="text-[10px] text-muted-foreground">
                  Daily Limit: {formatCurrency(account.dailyLimit, account.currency)}
                </span>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Account Detail Dialog */}
      <Dialog open={isDetailDialogOpen} onOpenChange={setIsDetailDialogOpen}>
        <DialogContent className="max-w-3xl bg-zinc-900 border-zinc-800 max-h-[90vh] overflow-y-auto">
          {selectedAccount && (
            <>
              <DialogHeader>
                <div className="flex items-center gap-4">
                  <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-zinc-800 text-lg font-bold text-amber-400">
                    {selectedAccount.bankLogo}
                  </div>
                  <div>
                    <DialogTitle className="text-xl text-foreground">
                      {selectedAccount.bankName}
                    </DialogTitle>
                    <DialogDescription className="flex items-center gap-2">
                      {getFlagEmoji(selectedAccount.countryCode)} {selectedAccount.country}
                      <Badge variant="outline" className={getRatingColor(selectedAccount.rating)}>
                        {selectedAccount.rating}
                      </Badge>
                      <Badge variant="outline" className={getStatusColor(selectedAccount.status)}>
                        {selectedAccount.status}
                      </Badge>
                    </DialogDescription>
                  </div>
                </div>
              </DialogHeader>

              <Tabs defaultValue="details" className="mt-4">
                <TabsList className="bg-zinc-800/50">
                  <TabsTrigger value="details">Account Details</TabsTrigger>
                  <TabsTrigger value="banking">Banking Info</TabsTrigger>
                  <TabsTrigger value="limits">Limits & Volume</TabsTrigger>
                  <TabsTrigger value="contact">Contact</TabsTrigger>
                </TabsList>

                <TabsContent value="details" className="mt-4 space-y-4">
                  <Card className="bg-zinc-800/50 border-zinc-700">
                    <CardContent className="p-4 space-y-4">
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <p className="text-xs text-muted-foreground">Account Name</p>
                          <p className="text-sm font-medium text-foreground">{selectedAccount.accountName}</p>
                        </div>
                        <div>
                          <p className="text-xs text-muted-foreground">Account Type</p>
                          <p className="text-sm font-medium text-foreground">{selectedAccount.accountType}</p>
                        </div>
                        <div>
                          <p className="text-xs text-muted-foreground">Account Number</p>
                          <div className="flex items-center gap-2">
                            <p className="text-sm font-mono text-foreground">{selectedAccount.accountNumber}</p>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-5 w-5"
                              onClick={() => copyToClipboard(selectedAccount.accountNumber, "acc-num")}
                            >
                              {copiedField === "acc-num" ? (
                                <Check className="h-3 w-3 text-emerald-400" />
                              ) : (
                                <Copy className="h-3 w-3" />
                              )}
                            </Button>
                          </div>
                        </div>
                        <div>
                          <p className="text-xs text-muted-foreground">Currency</p>
                          <p className="text-sm font-medium text-foreground">{selectedAccount.currency}</p>
                        </div>
                      </div>

                      <div className="border-t border-zinc-700 pt-4">
                        <div className="grid grid-cols-3 gap-4">
                          <div className="text-center p-3 rounded-lg bg-zinc-800">
                            <p className="text-xs text-muted-foreground mb-1">Total Balance</p>
                            <p className="text-lg font-bold text-foreground">
                              {formatCurrency(selectedAccount.balance, selectedAccount.currency)}
                            </p>
                          </div>
                          <div className="text-center p-3 rounded-lg bg-zinc-800">
                            <p className="text-xs text-muted-foreground mb-1">Available</p>
                            <p className="text-lg font-bold text-emerald-400">
                              {formatCurrency(selectedAccount.availableBalance, selectedAccount.currency)}
                            </p>
                          </div>
                          <div className="text-center p-3 rounded-lg bg-zinc-800">
                            <p className="text-xs text-muted-foreground mb-1">Reserved</p>
                            <p className="text-lg font-bold text-amber-400">
                              {formatCurrency(selectedAccount.reservedBalance, selectedAccount.currency)}
                            </p>
                          </div>
                        </div>
                      </div>

                      <div className="border-t border-zinc-700 pt-4">
                        <div className="grid grid-cols-2 gap-4">
                          <div>
                            <p className="text-xs text-muted-foreground">Opened</p>
                            <p className="text-sm text-foreground">
                              {new Date(selectedAccount.openDate).toLocaleDateString("en-US", {
                                year: "numeric",
                                month: "long",
                                day: "numeric",
                              })}
                            </p>
                          </div>
                          <div>
                            <p className="text-xs text-muted-foreground">Last Activity</p>
                            <p className="text-sm text-foreground">
                              {new Date(selectedAccount.lastActivity).toLocaleString()}
                            </p>
                          </div>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </TabsContent>

                <TabsContent value="banking" className="mt-4 space-y-4">
                  <Card className="bg-zinc-800/50 border-zinc-700">
                    <CardContent className="p-4 space-y-4">
                      <div>
                        <p className="text-xs text-muted-foreground mb-1">IBAN</p>
                        <div className="flex items-center gap-2 p-3 rounded-lg bg-zinc-800 font-mono">
                          <span className="text-foreground">{selectedAccount.iban}</span>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6 ml-auto"
                            onClick={() => copyToClipboard(selectedAccount.iban, "detail-iban")}
                          >
                            {copiedField === "detail-iban" ? (
                              <Check className="h-4 w-4 text-emerald-400" />
                            ) : (
                              <Copy className="h-4 w-4" />
                            )}
                          </Button>
                        </div>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground mb-1">SWIFT/BIC</p>
                        <div className="flex items-center gap-2 p-3 rounded-lg bg-zinc-800 font-mono">
                          <span className="text-foreground">{selectedAccount.swift}</span>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6 ml-auto"
                            onClick={() => copyToClipboard(selectedAccount.swift, "detail-swift")}
                          >
                            {copiedField === "detail-swift" ? (
                              <Check className="h-4 w-4 text-emerald-400" />
                            ) : (
                              <Copy className="h-4 w-4" />
                            )}
                          </Button>
                        </div>
                      </div>
                      {selectedAccount.sortCode && (
                        <div>
                          <p className="text-xs text-muted-foreground mb-1">Sort Code</p>
                          <div className="flex items-center gap-2 p-3 rounded-lg bg-zinc-800 font-mono">
                            <span className="text-foreground">{selectedAccount.sortCode}</span>
                          </div>
                        </div>
                      )}
                      {selectedAccount.routingNumber && (
                        <div>
                          <p className="text-xs text-muted-foreground mb-1">Routing Number (ABA)</p>
                          <div className="flex items-center gap-2 p-3 rounded-lg bg-zinc-800 font-mono">
                            <span className="text-foreground">{selectedAccount.routingNumber}</span>
                          </div>
                        </div>
                      )}
                      {selectedAccount.bsb && (
                        <div>
                          <p className="text-xs text-muted-foreground mb-1">BSB</p>
                          <div className="flex items-center gap-2 p-3 rounded-lg bg-zinc-800 font-mono">
                            <span className="text-foreground">{selectedAccount.bsb}</span>
                          </div>
                        </div>
                      )}
                      {selectedAccount.branchCode && (
                        <div>
                          <p className="text-xs text-muted-foreground mb-1">Branch Code</p>
                          <div className="flex items-center gap-2 p-3 rounded-lg bg-zinc-800 font-mono">
                            <span className="text-foreground">{selectedAccount.branchCode}</span>
                          </div>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                </TabsContent>

                <TabsContent value="limits" className="mt-4 space-y-4">
                  <Card className="bg-zinc-800/50 border-zinc-700">
                    <CardContent className="p-4 space-y-4">
                      <div className="grid grid-cols-2 gap-4">
                        <div className="p-4 rounded-lg bg-zinc-800">
                          <p className="text-xs text-muted-foreground mb-1">Daily Limit</p>
                          <p className="text-xl font-bold text-foreground">
                            {formatCurrency(selectedAccount.dailyLimit, selectedAccount.currency)}
                          </p>
                        </div>
                        <div className="p-4 rounded-lg bg-zinc-800">
                          <p className="text-xs text-muted-foreground mb-1">Monthly Volume</p>
                          <p className="text-xl font-bold text-foreground">
                            {formatCurrency(selectedAccount.monthlyVolume, selectedAccount.currency)}
                          </p>
                        </div>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground mb-1">Relationship Tier</p>
                        <Badge className="bg-amber-500/20 text-amber-400 border-amber-500/30">
                          {selectedAccount.relationship}
                        </Badge>
                      </div>
                      {selectedAccount.escrowDetails && (
                        <div className="p-4 rounded-lg bg-amber-500/10 border border-amber-500/20">
                          <p className="text-xs text-amber-400 font-medium mb-1">Escrow Notice</p>
                          <p className="text-sm text-amber-300">{selectedAccount.escrowDetails}</p>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                </TabsContent>

                <TabsContent value="contact" className="mt-4 space-y-4">
                  <Card className="bg-zinc-800/50 border-zinc-700">
                    <CardContent className="p-4 space-y-4">
                      <div className="flex items-start gap-3 p-4 rounded-lg bg-amber-500/10 border border-amber-500/20">
                        <Shield className="h-4 w-4 mt-0.5 shrink-0 text-amber-400" />
                        <div className="space-y-1">
                          <p className="text-sm font-medium text-amber-300">
                            Communication handled by MCC
                          </p>
                          <p className="text-xs text-amber-300/80 leading-relaxed">
                            For your security and compliance, clients do not contact partner banks
                            directly. All requests relating to this account are managed by your MCC
                            relationship team and routed through{" "}
                            <span className="font-medium">admin@mccgva.ch</span>.
                          </p>
                        </div>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground mb-1">Managed by</p>
                        <p className="text-sm font-medium text-foreground">MCC Client Services</p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground mb-1">Branch Address</p>
                        <p className="text-sm text-foreground">{selectedAccount.branchAddress}</p>
                      </div>
                      <Button
                        className="w-full bg-amber-500 hover:bg-amber-600 text-zinc-900 gap-2"
                        onClick={handleContactViaMcc}
                      >
                        <Mail className="h-4 w-4" />
                        Contact MCC about this account
                      </Button>
                    </CardContent>
                  </Card>
                </TabsContent>
              </Tabs>

              <DialogFooter className="mt-6">
                <Button
                  variant="outline"
                  className="border-zinc-700 gap-2"
                  onClick={() => {
                    const scope = selectedAccount?.id === "ACC-001" ? "master" : `cur:${selectedAccount?.currency}`
                    setIsDetailDialogOpen(false)
                    router.push(`/dashboard/statements?account=${encodeURIComponent(scope)}`)
                  }}
                >
                  <FileText className="h-4 w-4" />
                  View Statement
                </Button>
                <Button variant="outline" className="border-zinc-700 gap-2" onClick={handleExportAccount}>
                  <Download className="h-4 w-4" />
                  Export Details
                </Button>
                <Button variant="outline" className="border-zinc-700 gap-2" onClick={handleSendPayment}>
                  <ArrowUpRight className="h-4 w-4" />
                  Send Payment
                </Button>
                <Button
                  className="bg-amber-500 hover:bg-amber-600 text-zinc-900 gap-2"
                  onClick={handleEditAccount}
                >
                  <Edit2 className="h-4 w-4" />
                  Edit Account
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* Empty State */}
      {filteredAccounts.length === 0 && (
        <Card className="bg-zinc-900/50 border-zinc-800">
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Building2 className="h-12 w-12 text-muted-foreground mb-4" />
            <p className="text-lg font-medium text-foreground mb-2">No accounts found</p>
            <p className="text-sm text-muted-foreground mb-4">
              Try adjusting your search or filter criteria
            </p>
            <Button
              variant="outline"
              className="border-zinc-700"
              onClick={() => {
                setSearchQuery("")
                setCurrencyFilter("all")
                setStatusFilter("all")
                setCountryFilter("all")
              }}
            >
              Clear Filters
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
