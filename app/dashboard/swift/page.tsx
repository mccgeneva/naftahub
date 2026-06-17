"use client"

import { useState } from "react"
import { toast } from "sonner"
import { useActivityLog } from "@/components/activity-tracker"
import { exportToCsv } from "@/lib/export-utils"
import { VerifiedBankField } from "@/components/verified-bank-field"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Textarea } from "@/components/ui/textarea"
import {
  Globe,
  Send,
  FileText,
  Clock,
  CheckCircle2,
  AlertCircle,
  Search,
  Filter,
  Download,
  Plus,
  ArrowUpRight,
  ArrowDownLeft,
  Building2,
  Copy,
  Eye,
  Inbox,
  SendHorizontal,
  RefreshCw,
  FileCode,
  Banknote,
  ScrollText,
  Shield,
  MessageSquare,
} from "lucide-react"

// SWIFT Message Types per EuroSwift 6.0
const messageTypes = [
  {
    code: "MT101",
    name: "Request for Transfer",
    description: "Used to request the receiver to execute one or more transfers by debiting the account(s) of the ordering customer",
    category: "Payments",
    icon: SendHorizontal,
    color: "text-blue-400",
    bgColor: "bg-blue-500/10",
  },
  {
    code: "MT103",
    name: "Single Customer Credit Transfer",
    description: "Standard payment message for cross-border single customer credit transfers",
    category: "Payments",
    icon: Banknote,
    color: "text-emerald-400",
    bgColor: "bg-emerald-500/10",
  },
  {
    code: "MT199",
    name: "Free Format Message (Customer)",
    description: "Free format message for customer-related matters between financial institutions",
    category: "Common",
    icon: MessageSquare,
    color: "text-purple-400",
    bgColor: "bg-purple-500/10",
  },
  {
    code: "MT542",
    name: "Deliver Free",
    description: "Securities settlement instruction to deliver securities free of payment",
    category: "Securities",
    icon: ScrollText,
    color: "text-amber-400",
    bgColor: "bg-amber-500/10",
  },
  {
    code: "MT760",
    name: "Guarantee / SBLC",
    description: "Issuance of a demand guarantee or standby letter of credit (SBLC)",
    category: "Guarantees",
    icon: Shield,
    color: "text-cyan-400",
    bgColor: "bg-cyan-500/10",
  },
  {
    code: "MT799",
    name: "Free Format Message (Bank)",
    description: "Free format bank-to-bank message for pre-advice, RWA, POF, and other communications",
    category: "Common",
    icon: FileCode,
    color: "text-rose-400",
    bgColor: "bg-rose-500/10",
  },
]

// Sample SWIFT messages
const swiftMessages: {
  id: string
  type: string
  direction: string
  status: string
  sender: string
  receiver: string
  amount: string
  currency: string
  beneficiary: string
  beneficiaryAccount: string
  orderingCustomer: string
  date: string
  time: string
  reference: string
  valueDate: string
  ack: string
}[] = []

const correspondentBanks = [
  { bic: "NWBKGB2L", name: "NatWest Bank", country: "United Kingdom", city: "London" },
  { bic: "CHASUS33", name: "JP Morgan Chase", country: "United States", city: "New York" },
  { bic: "UBSWCHZH", name: "UBS Switzerland", country: "Switzerland", city: "Zurich" },
  { bic: "HABORUMM", name: "HSBC Abu Dhabi", country: "UAE", city: "Abu Dhabi" },
  { bic: "DEUTDEFF", name: "Deutsche Bank", country: "Germany", city: "Frankfurt" },
  { bic: "BNPAFRPP", name: "BNP Paribas", country: "France", city: "Paris" },
  { bic: "CITIUS33", name: "Citibank", country: "United States", city: "New York" },
  { bic: "COBADEFF", name: "Commerzbank", country: "Germany", city: "Frankfurt" },
]

// Self-managed verified BIC field for the (otherwise presentational) compose forms.
function ComposeBicField({ id, label, placeholder }: { id: string; label: string; placeholder?: string }) {
  const [value, setValue] = useState("")
  return (
    <VerifiedBankField
      id={id}
      label={label}
      kind="bic"
      maxLength={11}
      placeholder={placeholder}
      value={value}
      onChange={setValue}
      inputClassName="bg-background border-border text-foreground"
    />
  )
}

export default function SwiftPage() {
  const [searchQuery, setSearchQuery] = useState("")
  const [selectedType, setSelectedType] = useState("all")
  const [selectedDirection, setSelectedDirection] = useState("all")
  const [isComposeOpen, setIsComposeOpen] = useState(false)
  const [composeType, setComposeType] = useState<string | null>(null)
  const [selectedMessage, setSelectedMessage] = useState<typeof swiftMessages[0] | null>(null)
  const [activeTab, setActiveTab] = useState("inbox")

  const filteredMessages = swiftMessages.filter((msg) => {
    const matchesSearch =
      msg.id.toLowerCase().includes(searchQuery.toLowerCase()) ||
      msg.beneficiary.toLowerCase().includes(searchQuery.toLowerCase()) ||
      msg.reference.toLowerCase().includes(searchQuery.toLowerCase()) ||
      msg.sender.toLowerCase().includes(searchQuery.toLowerCase()) ||
      msg.receiver.toLowerCase().includes(searchQuery.toLowerCase())
    const matchesType = selectedType === "all" || msg.type === selectedType
    const matchesDirection = selectedDirection === "all" || msg.direction === selectedDirection
    return matchesSearch && matchesType && matchesDirection
  })

  const inboxMessages = filteredMessages.filter(m => m.direction === "incoming")
  const outboxMessages = filteredMessages.filter(m => m.direction === "outgoing")

  const getStatusColor = (status: string) => {
    switch (status) {
      case "delivered":
      case "received":
        return "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
      case "pending":
        return "bg-amber-500/10 text-amber-400 border-amber-500/20"
      case "processing":
        return "bg-blue-500/10 text-blue-400 border-blue-500/20"
      case "failed":
      case "nack":
        return "bg-red-500/10 text-red-400 border-red-500/20"
      default:
        return "bg-muted text-muted-foreground"
    }
  }

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "delivered":
      case "received":
        return <CheckCircle2 className="h-3 w-3" />
      case "pending":
        return <Clock className="h-3 w-3" />
      case "processing":
        return <RefreshCw className="h-3 w-3 animate-spin" />
      case "failed":
      case "nack":
        return <AlertCircle className="h-3 w-3" />
      default:
        return null
    }
  }

  const logActivity = useActivityLog()

  const handleExport = () => {
    const count = exportToCsv("swift-messages", filteredMessages, [
      { key: "id", label: "Message ID" },
      { key: "type", label: "MT Type" },
      { key: "direction", label: "Direction" },
      { key: "status", label: "Status" },
      { key: "sender", label: "Sender BIC" },
      { key: "receiver", label: "Receiver BIC" },
      { key: "amount", label: "Amount" },
      { key: "currency", label: "Currency" },
      { key: "beneficiary", label: "Beneficiary" },
      { key: "reference", label: "Reference" },
      { key: "date", label: "Date" },
      { key: "valueDate", label: "Value Date" },
    ])
    logActivity({
      action: `Exported ${count} SWIFT message${count === 1 ? "" : "s"} to CSV`,
      category: "SWIFT Messaging",
      details: {
        summary: `Client exported ${count} SWIFT message record${count === 1 ? "" : "s"} (current filters applied) to a CSV file.`,
        recordCount: `${count}`,
        format: "CSV",
      },
    })
  }

  const openComposeDialog = (type: string) => {
    setComposeType(type)
    setIsComposeOpen(true)
  }

  const [isRefreshing, setIsRefreshing] = useState(false)

  const handleRefresh = () => {
    setIsRefreshing(true)
    setTimeout(() => setIsRefreshing(false), 600)
    logActivity({
      action: "Refreshed the SWIFT message queue",
      category: "SWIFT Messaging",
      details: {
        summary: "Client refreshed the SWIFT inbox and outbox queues.",
        refreshedAt: new Date().toLocaleString("en-GB"),
      },
    })
    toast.success("Message queue refreshed")
  }

  const handleSaveDraft = () => {
    const mt = messageTypes.find((m) => m.code === composeType)
    logActivity({
      action: `Saved SWIFT ${composeType || "message"} as draft`,
      category: "SWIFT Messaging",
      details: {
        summary: `Client saved a SWIFT ${composeType || "message"}${mt ? ` (${mt.name})` : ""} as a draft.`,
        messageType: composeType || "(unknown)",
      },
    })
    setIsComposeOpen(false)
    toast.success("Draft saved", {
      description: "You can finish and send this message later.",
    })
  }

  const copyMessage = (message: typeof swiftMessages[0]) => {
    navigator.clipboard?.writeText(JSON.stringify(message, null, 2))
    toast.success(`Copied ${message.id}`)
  }

  const downloadMessage = (message: typeof swiftMessages[0]) => {
    exportToCsv(`swift-${message.id}`, [message])
    logActivity({
      action: `Downloaded SWIFT message ${message.id}`,
      category: "SWIFT Messaging",
      details: {
        summary: `Client downloaded the SWIFT message ${message.id} (${message.type}).`,
        messageId: message.id,
        messageType: message.type,
      },
    })
  }

  const handleSendSwift = () => {
    const mt = messageTypes.find((m) => m.code === composeType)
    logActivity({
      action: `Sent SWIFT ${composeType || "message"}${mt ? ` — ${mt.name}` : ""}`,
      category: "SWIFT Messaging",
      details: {
        summary: `Client composed and sent a SWIFT ${composeType || "message"}${
          mt ? ` (${mt.name})` : ""
        } from MCC Capital (BIC MCCBCHZZ).${mt ? ` Purpose: ${mt.description}.` : ""}`,
        messageType: composeType || "(unknown)",
        messageName: mt?.name ?? "(unknown)",
        messageCategory: mt?.category ?? "(unknown)",
        senderBic: "MCCBCHZZ",
        description: mt?.description ?? "(none)",
      },
    })
    setIsComposeOpen(false)
  }

  const renderComposeForm = () => {
    switch (composeType) {
      case "MT103":
        return (
          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="text-foreground">Sender BIC</Label>
                <Input value="MCCBCHZZ" disabled className="bg-muted border-border text-foreground" />
              </div>
              <div className="space-y-2">
                <Label className="text-foreground">Receiver BIC</Label>
                <Select>
                  <SelectTrigger className="bg-background border-border text-foreground">
                    <SelectValue placeholder="Select correspondent bank" />
                  </SelectTrigger>
                  <SelectContent className="bg-card border-border">
                    {correspondentBanks.map((bank) => (
                      <SelectItem key={bank.bic} value={bank.bic}>
                        {bank.bic} - {bank.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="text-foreground">Value Date (Field 32A)</Label>
                <Input type="date" className="bg-background border-border text-foreground" />
              </div>
              <div className="space-y-2">
                <Label className="text-foreground">Currency</Label>
                <Select>
                  <SelectTrigger className="bg-background border-border text-foreground">
                    <SelectValue placeholder="Select currency" />
                  </SelectTrigger>
                  <SelectContent className="bg-card border-border">
                    <SelectItem value="EUR">EUR - Euro</SelectItem>
                    <SelectItem value="USD">USD - US Dollar</SelectItem>
                    <SelectItem value="GBP">GBP - British Pound</SelectItem>
                    <SelectItem value="CHF">CHF - Swiss Franc</SelectItem>
                    <SelectItem value="AED">AED - UAE Dirham</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-2">
              <Label className="text-foreground">Amount (Field 32A)</Label>
              <Input type="text" placeholder="0.00" className="bg-background border-border text-foreground" />
            </div>
            <div className="space-y-2">
              <Label className="text-foreground">Ordering Customer (Field 50K)</Label>
              <Textarea placeholder="Name and address of ordering customer" rows={3} className="bg-background border-border text-foreground resize-none" />
            </div>
            <div className="space-y-2">
              <Label className="text-foreground">Beneficiary (Field 59)</Label>
              <Textarea placeholder="Beneficiary name, account, and address" rows={3} className="bg-background border-border text-foreground resize-none" />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <ComposeBicField id="mt103-benbank-bic" label="Beneficiary's Bank (Field 57A)" placeholder="BIC code" />
              <div className="space-y-2">
                <Label className="text-foreground">Sender Reference (Field 20)</Label>
                <Input type="text" placeholder="Your reference" className="bg-background border-border text-foreground" />
              </div>
            </div>
            <div className="space-y-2">
              <Label className="text-foreground">Details of Charges (Field 71A)</Label>
              <Select>
                <SelectTrigger className="bg-background border-border text-foreground">
                  <SelectValue placeholder="Select charge type" />
                </SelectTrigger>
                <SelectContent className="bg-card border-border">
                  <SelectItem value="OUR">OUR - All charges paid by sender</SelectItem>
                  <SelectItem value="BEN">BEN - All charges paid by beneficiary</SelectItem>
                  <SelectItem value="SHA">SHA - Shared charges</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label className="text-foreground">Remittance Information (Field 70)</Label>
              <Textarea placeholder="Payment details / invoice references" rows={2} className="bg-background border-border text-foreground resize-none" />
            </div>
          </div>
        )

      case "MT101":
        return (
          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="text-foreground">Sender BIC</Label>
                <Input value="MCCBCHZZ" disabled className="bg-muted border-border text-foreground" />
              </div>
              <div className="space-y-2">
                <Label className="text-foreground">Receiver BIC (Account Servicing Institution)</Label>
                <Select>
                  <SelectTrigger className="bg-background border-border text-foreground">
                    <SelectValue placeholder="Select bank" />
                  </SelectTrigger>
                  <SelectContent className="bg-card border-border">
                    {correspondentBanks.map((bank) => (
                      <SelectItem key={bank.bic} value={bank.bic}>
                        {bank.bic} - {bank.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-2">
              <Label className="text-foreground">Sender Reference (Field 20)</Label>
              <Input type="text" placeholder="Your reference" className="bg-background border-border text-foreground" />
            </div>
            <div className="space-y-2">
              <Label className="text-foreground">Ordering Customer (Field 50H)</Label>
              <Textarea placeholder="Name, account, and address of ordering customer" rows={3} className="bg-background border-border text-foreground resize-none" />
            </div>
            <div className="space-y-2">
              <Label className="text-foreground">Requested Execution Date (Field 30)</Label>
              <Input type="date" className="bg-background border-border text-foreground" />
            </div>
            <Card className="bg-background border-border">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm text-foreground">Transaction 1</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Label className="text-xs text-foreground">Currency & Amount</Label>
                    <Input placeholder="EUR 100,000.00" className="bg-background border-border text-foreground" />
                  </div>
                  <ComposeBicField id="mt101-ben-bic" label="Beneficiary BIC" placeholder="BNPAFRPP" />
                </div>
                <div className="space-y-2">
                  <Label className="text-xs text-foreground">Beneficiary Details</Label>
                  <Input placeholder="Beneficiary name and account" className="bg-background border-border text-foreground" />
                </div>
              </CardContent>
            </Card>
            <Button
              variant="outline"
              className="w-full border-dashed"
              onClick={() =>
                toast.info("Transaction added", {
                  description: "An additional transaction block was added to this MT101.",
                })
              }
            >
              <Plus className="mr-2 h-4 w-4" />
              Add Another Transaction
            </Button>
          </div>
        )

      case "MT199":
        return (
          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="text-foreground">Sender BIC</Label>
                <Input value="MCCBCHZZ" disabled className="bg-muted border-border text-foreground" />
              </div>
              <div className="space-y-2">
                <Label className="text-foreground">Receiver BIC</Label>
                <Select>
                  <SelectTrigger className="bg-background border-border text-foreground">
                    <SelectValue placeholder="Select correspondent bank" />
                  </SelectTrigger>
                  <SelectContent className="bg-card border-border">
                    {correspondentBanks.map((bank) => (
                      <SelectItem key={bank.bic} value={bank.bic}>
                        {bank.bic} - {bank.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-2">
              <Label className="text-foreground">Transaction Reference (Field 20)</Label>
              <Input type="text" placeholder="Your reference" className="bg-background border-border text-foreground" />
            </div>
            <div className="space-y-2">
              <Label className="text-foreground">Related Reference (Field 21)</Label>
              <Input type="text" placeholder="Reference to related message" className="bg-background border-border text-foreground" />
            </div>
            <div className="space-y-2">
              <Label className="text-foreground">Narrative (Field 79)</Label>
              <Textarea placeholder="Enter your free format message content..." rows={8} className="bg-background border-border font-mono text-sm text-foreground resize-none" />
            </div>
          </div>
        )

      case "MT542":
        return (
          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="text-foreground">Sender BIC</Label>
                <Input value="MCCBCHZZ" disabled className="bg-muted border-border text-foreground" />
              </div>
              <div className="space-y-2">
                <Label className="text-foreground">Receiver BIC (Depository)</Label>
                <Select>
                  <SelectTrigger className="bg-background border-border text-foreground">
                    <SelectValue placeholder="Select depository" />
                  </SelectTrigger>
                  <SelectContent className="bg-card border-border">
                    {correspondentBanks.map((bank) => (
                      <SelectItem key={bank.bic} value={bank.bic}>
                        {bank.bic} - {bank.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="text-foreground">{"Sender's Reference"}</Label>
                <Input type="text" placeholder="Your reference" className="bg-background border-border text-foreground" />
              </div>
              <div className="space-y-2">
                <Label className="text-foreground">Settlement Date</Label>
                <Input type="date" className="bg-background border-border text-foreground" />
              </div>
            </div>
            <div className="space-y-2">
              <Label className="text-foreground">ISIN Code</Label>
              <Input type="text" placeholder="e.g., US0378331005" className="bg-background border-border text-foreground" />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="text-foreground">Quantity of Securities</Label>
                <Input type="text" placeholder="Number of units" className="bg-background border-border text-foreground" />
              </div>
              <div className="space-y-2">
                <Label className="text-foreground">Security Description</Label>
                <Input type="text" placeholder="Security name" className="bg-background border-border text-foreground" />
              </div>
            </div>
            <div className="space-y-2">
              <Label className="text-foreground">Delivering Agent</Label>
              <Textarea placeholder="Details of the delivering agent" rows={2} className="bg-background border-border text-foreground resize-none" />
            </div>
            <div className="space-y-2">
              <Label className="text-foreground">Safekeeping Account</Label>
              <Input type="text" placeholder="Account number" className="bg-background border-border text-foreground" />
            </div>
          </div>
        )

      case "MT760":
        return (
          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="text-foreground">Sender BIC (Issuing Bank)</Label>
                <Input value="MCCBCHZZ" disabled className="bg-muted border-border text-foreground" />
              </div>
              <div className="space-y-2">
                <Label className="text-foreground">Receiver BIC (Advising Bank)</Label>
                <Select>
                  <SelectTrigger className="bg-background border-border text-foreground">
                    <SelectValue placeholder="Select advising bank" />
                  </SelectTrigger>
                  <SelectContent className="bg-card border-border">
                    {correspondentBanks.map((bank) => (
                      <SelectItem key={bank.bic} value={bank.bic}>
                        {bank.bic} - {bank.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-2">
              <Label className="text-foreground">Form of Undertaking (Field 22A)</Label>
              <Select>
                <SelectTrigger className="bg-background border-border text-foreground">
                  <SelectValue placeholder="Select form" />
                </SelectTrigger>
                <SelectContent className="bg-card border-border">
                  <SelectItem value="DGAR">DGAR - Demand Guarantee</SelectItem>
                  <SelectItem value="STBY">STBY - Standby Letter of Credit</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="text-foreground">Undertaking Number</Label>
                <Input type="text" placeholder="Your reference number" className="bg-background border-border text-foreground" />
              </div>
              <div className="space-y-2">
                <Label className="text-foreground">Date of Issue</Label>
                <Input type="date" className="bg-background border-border text-foreground" />
              </div>
            </div>
            <div className="space-y-2">
              <Label className="text-foreground">Applicant (Field 50)</Label>
              <Textarea placeholder="Name and address of applicant" rows={3} className="bg-background border-border text-foreground resize-none" />
            </div>
            <div className="space-y-2">
              <Label className="text-foreground">Beneficiary (Field 59)</Label>
              <Textarea placeholder="Name and address of beneficiary" rows={3} className="bg-background border-border text-foreground resize-none" />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="text-foreground">Currency & Amount (Field 32B)</Label>
                <Input type="text" placeholder="USD 5,000,000.00" className="bg-background border-border text-foreground" />
              </div>
              <div className="space-y-2">
                <Label className="text-foreground">Expiry Date (Field 31E)</Label>
                <Input type="date" className="bg-background border-border text-foreground" />
              </div>
            </div>
            <div className="space-y-2">
              <Label className="text-foreground">Terms & Conditions (Field 77C)</Label>
              <Textarea placeholder="Details of guarantee/SBLC terms and conditions" rows={4} className="bg-background border-border font-mono text-sm text-foreground resize-none" />
            </div>
          </div>
        )

      case "MT799":
        return (
          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="text-foreground">Sender BIC</Label>
                <Input value="MCCBCHZZ" disabled className="bg-muted border-border text-foreground" />
              </div>
              <div className="space-y-2">
                <Label className="text-foreground">Receiver BIC</Label>
                <Select>
                  <SelectTrigger className="bg-background border-border text-foreground">
                    <SelectValue placeholder="Select correspondent bank" />
                  </SelectTrigger>
                  <SelectContent className="bg-card border-border">
                    {correspondentBanks.map((bank) => (
                      <SelectItem key={bank.bic} value={bank.bic}>
                        {bank.bic} - {bank.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-2">
              <Label className="text-foreground">Message Purpose</Label>
              <Select>
                <SelectTrigger className="bg-background border-border text-foreground">
                  <SelectValue placeholder="Select purpose" />
                </SelectTrigger>
                <SelectContent className="bg-card border-border">
                  <SelectItem value="RWA">RWA - Ready, Willing and Able</SelectItem>
                  <SelectItem value="POF">POF - Proof of Funds</SelectItem>
                  <SelectItem value="BCL">BCL - Bank Comfort Letter</SelectItem>
                  <SelectItem value="PREADVICE">Pre-Advice</SelectItem>
                  <SelectItem value="INQUIRY">General Inquiry</SelectItem>
                  <SelectItem value="CONFIRM">Confirmation</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label className="text-foreground">Transaction Reference (Field 20)</Label>
              <Input type="text" placeholder="Your reference" className="bg-background border-border text-foreground" />
            </div>
            <div className="space-y-2">
              <Label className="text-foreground">Related Reference (Field 21)</Label>
              <Input type="text" placeholder="Reference to related transaction" className="bg-background border-border text-foreground" />
            </div>
            <div className="space-y-2">
              <Label className="text-foreground">Narrative (Field 79)</Label>
              <Textarea placeholder="WE HEREBY CONFIRM THAT OUR CLIENT..." rows={10} className="bg-background border-border font-mono text-sm text-foreground resize-none" />
              <p className="text-xs text-muted-foreground">
                Standard bank-to-bank format. Include all relevant details such as client information, amounts, purpose, and authenticity statements.
              </p>
            </div>
          </div>
        )

      default:
        return null
    }
  }

  const MessagesTable = ({ messages }: { messages: typeof swiftMessages }) => (
    <Table>
      <TableHeader>
        <TableRow className="border-border hover:bg-transparent">
          <TableHead className="text-muted-foreground">Message ID</TableHead>
          <TableHead className="text-muted-foreground">Type</TableHead>
          <TableHead className="text-muted-foreground">Counterparty</TableHead>
          <TableHead className="text-muted-foreground">Amount</TableHead>
          <TableHead className="text-muted-foreground">Date/Time</TableHead>
          <TableHead className="text-muted-foreground">ACK</TableHead>
          <TableHead className="text-muted-foreground">Status</TableHead>
          <TableHead className="text-muted-foreground text-right">Actions</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {messages.length === 0 ? (
          <TableRow>
            <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">
              No messages found
            </TableCell>
          </TableRow>
        ) : (
          messages.map((message) => (
            <TableRow key={message.id} className="border-border">
              <TableCell>
                <code className="text-xs bg-muted px-1.5 py-0.5 rounded text-foreground">
                  {message.id}
                </code>
              </TableCell>
              <TableCell>
                <Badge variant="outline" className="border-primary/30 text-primary">
                  {message.type}
                </Badge>
              </TableCell>
              <TableCell>
                <div>
                  <p className="text-sm font-medium text-foreground">{message.beneficiary}</p>
                  <p className="text-xs text-muted-foreground">
                    {message.direction === "outgoing" ? message.receiver : message.sender}
                  </p>
                </div>
              </TableCell>
              <TableCell>
                {message.amount !== "N/A" ? (
                  <span className="font-medium text-foreground">{message.currency} {message.amount}</span>
                ) : (
                  <span className="text-muted-foreground">-</span>
                )}
              </TableCell>
              <TableCell>
                <div>
                  <p className="text-sm text-foreground">{message.date}</p>
                  <p className="text-xs text-muted-foreground">{message.time}</p>
                </div>
              </TableCell>
              <TableCell>
                <Badge className={message.ack === "ACK" ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20" : "bg-amber-500/10 text-amber-400 border-amber-500/20"}>
                  {message.ack}
                </Badge>
              </TableCell>
              <TableCell>
                <Badge className={`${getStatusColor(message.status)} flex w-fit items-center gap-1`}>
                  {getStatusIcon(message.status)}
                  <span className="capitalize">{message.status}</span>
                </Badge>
              </TableCell>
              <TableCell className="text-right">
                <div className="flex items-center justify-end gap-1">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8"
                    onClick={() => setSelectedMessage(message)}
                  >
                    <Eye className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8"
                    onClick={() => copyMessage(message)}
                  >
                    <Copy className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8"
                    onClick={() => downloadMessage(message)}
                  >
                    <Download className="h-4 w-4" />
                  </Button>
                </div>
              </TableCell>
            </TableRow>
          ))
        )}
      </TableBody>
    </Table>
  )

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
              <Globe className="h-5 w-5 text-primary" />
            </div>
            <div>
              <h1 className="text-2xl font-semibold text-foreground">EuroSwift 6.0</h1>
              <p className="text-sm text-muted-foreground">
                SWIFT Messaging System - Send &amp; Receive MT Messages
              </p>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={handleRefresh} disabled={isRefreshing}>
            <RefreshCw className={`mr-2 h-4 w-4 ${isRefreshing ? "animate-spin" : ""}`} />
            Refresh
          </Button>
          <Button variant="outline" size="sm" onClick={handleExport}>
            <Download className="mr-2 h-4 w-4" />
            Export
          </Button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <Card className="bg-card border-border">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-muted-foreground uppercase tracking-wide">Total Messages</p>
                <p className="text-2xl font-semibold text-foreground">0</p>
              </div>
              <div className="rounded-lg bg-primary/10 p-2">
                <FileText className="h-4 w-4 text-primary" />
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-card border-border">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-muted-foreground uppercase tracking-wide">Sent Today</p>
                <p className="text-2xl font-semibold text-foreground">0</p>
              </div>
              <div className="rounded-lg bg-blue-500/10 p-2">
                <ArrowUpRight className="h-4 w-4 text-blue-400" />
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-card border-border">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-muted-foreground uppercase tracking-wide">Received Today</p>
                <p className="text-2xl font-semibold text-foreground">0</p>
              </div>
              <div className="rounded-lg bg-emerald-500/10 p-2">
                <ArrowDownLeft className="h-4 w-4 text-emerald-400" />
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-card border-border">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-muted-foreground uppercase tracking-wide">Pending ACK</p>
                <p className="text-2xl font-semibold text-foreground">0</p>
              </div>
              <div className="rounded-lg bg-amber-500/10 p-2">
                <Clock className="h-4 w-4 text-amber-400" />
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-card border-border">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-muted-foreground uppercase tracking-wide">NACK/Failed</p>
                <p className="text-2xl font-semibold text-foreground">0</p>
              </div>
              <div className="rounded-lg bg-red-500/10 p-2">
                <AlertCircle className="h-4 w-4 text-red-400" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Message Types - Quick Compose */}
      <Card className="bg-card border-border">
        <CardHeader className="pb-3">
          <CardTitle className="text-foreground text-lg">Compose New Message</CardTitle>
          <CardDescription>Select a SWIFT message type to compose</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
            {messageTypes.map((type) => (
              <button
                key={type.code}
                onClick={() => openComposeDialog(type.code)}
                className="flex flex-col items-center gap-2 rounded-lg border border-border bg-background p-4 text-center transition-all hover:border-primary/50 hover:bg-primary/5"
              >
                <div className={`rounded-lg ${type.bgColor} p-2.5`}>
                  <type.icon className={`h-5 w-5 ${type.color}`} />
                </div>
                <div>
                  <p className="font-semibold text-foreground">{type.code}</p>
                  <p className="text-xs text-muted-foreground line-clamp-1">{type.name}</p>
                </div>
              </button>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Main Content */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <TabsList className="bg-card border border-border">
            <TabsTrigger value="inbox" className="gap-2">
              <Inbox className="h-4 w-4" />
              Inbox ({inboxMessages.length})
            </TabsTrigger>
            <TabsTrigger value="outbox" className="gap-2">
              <Send className="h-4 w-4" />
              Sent ({outboxMessages.length})
            </TabsTrigger>
            <TabsTrigger value="all" className="gap-2">
              <FileText className="h-4 w-4" />
              All Messages
            </TabsTrigger>
            <TabsTrigger value="correspondents" className="gap-2">
              <Building2 className="h-4 w-4" />
              Banks
            </TabsTrigger>
          </TabsList>
        </div>

        {/* Filters - shown for message tabs */}
        {(activeTab === "inbox" || activeTab === "outbox" || activeTab === "all") && (
          <Card className="bg-card border-border">
            <CardContent className="p-4">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    placeholder="Search by ID, beneficiary, reference, or BIC..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="bg-background border-border pl-9 text-foreground"
                  />
                </div>
                <div className="flex gap-2">
                  <Select value={selectedType} onValueChange={setSelectedType}>
                    <SelectTrigger className="w-[130px] bg-background border-border text-foreground">
                      <Filter className="mr-2 h-4 w-4" />
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="bg-card border-border">
                      <SelectItem value="all">All Types</SelectItem>
                      <SelectItem value="MT101">MT101</SelectItem>
                      <SelectItem value="MT103">MT103</SelectItem>
                      <SelectItem value="MT199">MT199</SelectItem>
                      <SelectItem value="MT542">MT542</SelectItem>
                      <SelectItem value="MT760">MT760</SelectItem>
                      <SelectItem value="MT799">MT799</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        <TabsContent value="inbox" className="space-y-4">
          <Card className="bg-card border-border">
            <CardContent className="p-0">
              <MessagesTable messages={inboxMessages} />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="outbox" className="space-y-4">
          <Card className="bg-card border-border">
            <CardContent className="p-0">
              <MessagesTable messages={outboxMessages} />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="all" className="space-y-4">
          <Card className="bg-card border-border">
            <CardContent className="p-0">
              <MessagesTable messages={filteredMessages} />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="correspondents" className="space-y-4">
          <Card className="bg-card border-border">
            <CardHeader>
              <CardTitle className="text-foreground">Correspondent Banks</CardTitle>
              <CardDescription>Partner banks configured for SWIFT messaging</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                {correspondentBanks.map((bank) => (
                  <div
                    key={bank.bic}
                    className="flex items-start gap-4 rounded-lg border border-border bg-background p-4"
                  >
                    <div className="rounded-lg bg-primary/10 p-2.5">
                      <Building2 className="h-5 w-5 text-primary" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-foreground">{bank.name}</p>
                      <code className="text-xs text-primary bg-primary/10 px-1.5 py-0.5 rounded">
                        {bank.bic}
                      </code>
                      <p className="text-xs text-muted-foreground mt-1">
                        {bank.city}, {bank.country}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Compose Dialog */}
      <Dialog open={isComposeOpen} onOpenChange={setIsComposeOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto bg-card border-border">
          <DialogHeader>
            <DialogTitle className="text-foreground flex items-center gap-2">
              <Send className="h-5 w-5 text-primary" />
              Compose {composeType} Message
            </DialogTitle>
            <DialogDescription>
              {messageTypes.find(t => t.code === composeType)?.description}
            </DialogDescription>
          </DialogHeader>
          {renderComposeForm()}
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsComposeOpen(false)}>
              Cancel
            </Button>
            <Button variant="outline" onClick={handleSaveDraft}>
              <FileText className="mr-2 h-4 w-4" />
              Save Draft
            </Button>
            <Button className="bg-primary hover:bg-primary/90 text-primary-foreground" onClick={handleSendSwift}>
              <Send className="mr-2 h-4 w-4" />
              Send Message
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Message Detail Dialog */}
      <Dialog open={!!selectedMessage} onOpenChange={() => setSelectedMessage(null)}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto bg-card border-border">
          <DialogHeader>
            <div className="flex items-center justify-between">
              <DialogTitle className="text-foreground flex items-center gap-2">
                <Badge variant="outline" className="border-primary/30 text-primary">
                  {selectedMessage?.type}
                </Badge>
                {selectedMessage?.id}
              </DialogTitle>
              <Badge className={selectedMessage ? getStatusColor(selectedMessage.status) : ""}>
                {selectedMessage?.status}
              </Badge>
            </div>
            <DialogDescription>
              {selectedMessage?.direction === "outgoing" ? "Sent" : "Received"} on {selectedMessage?.date} at {selectedMessage?.time}
            </DialogDescription>
          </DialogHeader>
          {selectedMessage && (
            <div className="space-y-4">
              <div className="rounded-lg bg-background border border-border p-4 font-mono text-sm">
                <div className="grid gap-2">
                  <div className="flex justify-between border-b border-border pb-2">
                    <span className="text-muted-foreground">Sender:</span>
                    <span className="text-foreground">{selectedMessage.sender}</span>
                  </div>
                  <div className="flex justify-between border-b border-border pb-2">
                    <span className="text-muted-foreground">Receiver:</span>
                    <span className="text-foreground">{selectedMessage.receiver}</span>
                  </div>
                  <div className="flex justify-between border-b border-border pb-2">
                    <span className="text-muted-foreground">Reference:</span>
                    <span className="text-foreground">{selectedMessage.reference}</span>
                  </div>
                  {selectedMessage.amount !== "N/A" && (
                    <>
                      <div className="flex justify-between border-b border-border pb-2">
                        <span className="text-muted-foreground">Currency:</span>
                        <span className="text-foreground">{selectedMessage.currency}</span>
                      </div>
                      <div className="flex justify-between border-b border-border pb-2">
                        <span className="text-muted-foreground">Amount:</span>
                        <span className="text-foreground font-semibold">{selectedMessage.amount}</span>
                      </div>
                    </>
                  )}
                  <div className="flex justify-between border-b border-border pb-2">
                    <span className="text-muted-foreground">Value Date:</span>
                    <span className="text-foreground">{selectedMessage.valueDate}</span>
                  </div>
                  <div className="flex justify-between border-b border-border pb-2">
                    <span className="text-muted-foreground">Beneficiary:</span>
                    <span className="text-foreground">{selectedMessage.beneficiary}</span>
                  </div>
                  <div className="flex justify-between border-b border-border pb-2">
                    <span className="text-muted-foreground">Beneficiary Account:</span>
                    <span className="text-foreground">{selectedMessage.beneficiaryAccount}</span>
                  </div>
                  <div className="flex justify-between border-b border-border pb-2">
                    <span className="text-muted-foreground">Ordering Customer:</span>
                    <span className="text-foreground">{selectedMessage.orderingCustomer}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">ACK Status:</span>
                    <Badge className={selectedMessage.ack === "ACK" ? "bg-emerald-500/10 text-emerald-400" : "bg-amber-500/10 text-amber-400"}>
                      {selectedMessage.ack}
                    </Badge>
                  </div>
                </div>
              </div>

              <div className="rounded-lg bg-muted/50 border border-border p-4">
                <p className="text-xs text-muted-foreground mb-2 uppercase tracking-wide">Raw Message Preview</p>
                <pre className="text-xs font-mono text-foreground whitespace-pre-wrap">
{`{1:F01${selectedMessage.sender}0000000000}
{2:I${selectedMessage.type}${selectedMessage.receiver}N}
{4:
:20:${selectedMessage.reference}
:23B:CRED
:32A:${selectedMessage.valueDate.replace(/-/g, '')}${selectedMessage.currency}${selectedMessage.amount}
:50K:/${selectedMessage.orderingCustomer}
:59:/${selectedMessage.beneficiaryAccount}
${selectedMessage.beneficiary}
:71A:SHA
-}`}
                </pre>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setSelectedMessage(null)}>
              Close
            </Button>
            <Button
              variant="outline"
              onClick={() => {
                if (selectedMessage)
                  navigator.clipboard?.writeText(JSON.stringify(selectedMessage, null, 2))
              }}
            >
              <Copy className="mr-2 h-4 w-4" />
              Copy
            </Button>
            <Button
              variant="outline"
              onClick={() => {
                if (!selectedMessage) return
                exportToCsv("swift-message", [selectedMessage])
                logActivity({
                  action: `Exported SWIFT message ${selectedMessage.id} to CSV`,
                  category: "SWIFT Messaging",
                  details: {
                    summary: `Client exported the individual SWIFT message ${selectedMessage.id} (${selectedMessage.type}) to a CSV file.`,
                    messageId: selectedMessage.id,
                    messageType: selectedMessage.type,
                  },
                })
              }}
            >
              <Download className="mr-2 h-4 w-4" />
              Export
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
