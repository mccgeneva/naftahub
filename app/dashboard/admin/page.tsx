"use client"

import { useEffect, useMemo, useState } from "react"
import {
  ShieldCheck,
  Lock,
  Check,
  X,
  Clock,
  ArrowUpRight,
  Building2,
  Globe,
  LogOut,
  AlertTriangle,
  FileText,
  TrendingUp,
  Trash2,
  Layers,
  Landmark,
  Ship,
  Package,
  Banknote,
  Gauge,
  Power,
} from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
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
import { cn } from "@/lib/utils"
import { parseSwiftMessage } from "@/lib/swift-mt"
import { useActivityLog } from "@/components/activity-tracker"
import { useLedger } from "@/lib/ledger-store"
import { usePaymentRequests, type PaymentRequest } from "@/lib/payment-requests-store"
import { useInstrumentRequests, type Instrument } from "@/lib/instrument-requests-store"
import {
  useMonetizationRequests,
  type MonetizationRequest,
} from "@/lib/monetization-requests-store"
import { usePPPRequests, type PPPRequest } from "@/lib/ppp-requests-store"
import { useDOFRequests, type DOFRequest } from "@/lib/dof-requests-store"
import { useDTCRequests, type DTCRequest } from "@/lib/dtc-requests-store"
import { useEuroclearRequests, type EuroclearRequest } from "@/lib/euroclear-requests-store"
import {
  useCommodityDeals,
  DEAL_STAGES,
  type CommodityDeal,
  type DealDocument,
} from "@/lib/commodity-deals-store"
import { useLeverageRequests, accruedInterest, type LeverageRequest } from "@/lib/leverage-requests-store"
import { ADMIN_PASSCODE, ADMIN_SESSION_KEY } from "@/lib/admin-config"
import { resetAccountData } from "@/lib/reset-account"
import { AdminGatewaySection } from "@/components/dashboard/admin-gateway-section"
import { AdminReconciliationSection } from "@/components/dashboard/admin-reconciliation-section"
import { TreasuryManager } from "@/components/admin/treasury-manager"
import { toast } from "sonner"

const MASTER_ACCOUNT_CURRENCY = "EUR"

const formatCurrency = (value: number, currency: string) =>
  `${currency} ${value.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`

const formatTimestamp = (iso?: string) => {
  if (!iso) return "—"
  const d = new Date(iso)
  return `${d.toLocaleDateString("en-GB")} ${d.toLocaleTimeString("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
  })}`
}

export default function AdminPage() {
  const [unlocked, setUnlocked] = useState(false)
  const [passcode, setPasscode] = useState("")
  const [gateError, setGateError] = useState<string | null>(null)

  const { requests, approveRequest, rejectRequest } = usePaymentRequests()
  const {
    instruments,
    approveInstrument,
    rejectInstrument,
  } = useInstrumentRequests()
  const {
    requests: monetizationRequests,
    approveRequest: approveMonetization,
    rejectRequest: rejectMonetization,
  } = useMonetizationRequests()
  const {
    requests: pppRequests,
    approveRequest: approvePPP,
    rejectRequest: rejectPPP,
  } = usePPPRequests()
  const {
    requests: dofRequests,
    approveRequest: approveDOF,
    rejectRequest: rejectDOF,
  } = useDOFRequests()
  const {
    requests: dtcRequests,
    approveRequest: approveDTC,
    rejectRequest: rejectDTC,
  } = useDTCRequests()
  const {
    requests: euroclearRequests,
    approveRequest: approveEuroclear,
    rejectRequest: rejectEuroclear,
  } = useEuroclearRequests()
  const {
    deals: commodityDeals,
    approveDeal,
    rejectDeal,
    verifyDocument,
    rejectDocument,
  } = useCommodityDeals()
  const {
    requests: leverageRequests,
    approveRequest: approveLeverage,
    rejectRequest: rejectLeverage,
    approveSwitchOff: approveLeverageSwitchOff,
    rejectSwitchOff: rejectLeverageSwitchOff,
  } = useLeverageRequests()
  const { addReceipt, addDebit, balanceFor } = useLedger()
  const logActivity = useActivityLog()

  const [rejectTarget, setRejectTarget] = useState<PaymentRequest | null>(null)
  const [rejectReason, setRejectReason] = useState("")
  const [rejectInstrumentTarget, setRejectInstrumentTarget] = useState<Instrument | null>(null)
  const [rejectInstrumentReason, setRejectInstrumentReason] = useState("")
  const [rejectPPPTarget, setRejectPPPTarget] = useState<PPPRequest | null>(null)
  const [rejectPPPReason, setRejectPPPReason] = useState("")
  const [rejectDOFTarget, setRejectDOFTarget] = useState<DOFRequest | null>(null)
  const [rejectDOFReason, setRejectDOFReason] = useState("")
  const [rejectMonetizationTarget, setRejectMonetizationTarget] =
    useState<MonetizationRequest | null>(null)
  const [rejectMonetizationReason, setRejectMonetizationReason] = useState("")
  const [swiftViewTarget, setSwiftViewTarget] = useState<MonetizationRequest | null>(null)
  const [rejectDTCTarget, setRejectDTCTarget] = useState<DTCRequest | null>(null)
  const [rejectDTCReason, setRejectDTCReason] = useState("")
  const [rejectEuroclearTarget, setRejectEuroclearTarget] = useState<EuroclearRequest | null>(null)
  const [rejectEuroclearReason, setRejectEuroclearReason] = useState("")
  const [rejectDealTarget, setRejectDealTarget] = useState<CommodityDeal | null>(null)
  const [rejectDealReason, setRejectDealReason] = useState("")
  const [rejectDocTarget, setRejectDocTarget] = useState<{ deal: CommodityDeal; doc: DealDocument } | null>(
    null,
  )
  const [rejectDocReason, setRejectDocReason] = useState("")
  const [rejectLeverageTarget, setRejectLeverageTarget] = useState<LeverageRequest | null>(null)
  const [rejectLeverageReason, setRejectLeverageReason] = useState("")
  const [rejectSwitchOffTarget, setRejectSwitchOffTarget] = useState<LeverageRequest | null>(null)
  const [rejectSwitchOffReason, setRejectSwitchOffReason] = useState("")
  const [resetDialogOpen, setResetDialogOpen] = useState(false)
  const [resetConfirm, setResetConfirm] = useState("")
  const [resetting, setResetting] = useState(false)

  // Restore unlock state for the current tab session.
  useEffect(() => {
    try {
      if (window.sessionStorage.getItem(ADMIN_SESSION_KEY) === "true") {
        setUnlocked(true)
      }
    } catch {
      // ignore
    }
  }, [])

  const handleUnlock = () => {
    if (passcode.trim() === ADMIN_PASSCODE) {
      setUnlocked(true)
      setGateError(null)
      setPasscode("")
      try {
        window.sessionStorage.setItem(ADMIN_SESSION_KEY, "true")
      } catch {
        // ignore
      }
    } else {
      setGateError("Incorrect administrator passcode. Please try again.")
    }
  }

  const handleLock = () => {
    setUnlocked(false)
    try {
      window.sessionStorage.removeItem(ADMIN_SESSION_KEY)
    } catch {
      // ignore
    }
  }

  const masterBalance = balanceFor(MASTER_ACCOUNT_CURRENCY)

  const pending = useMemo(
    () =>
      requests
        .filter((r) => r.status === "pending")
        .sort((a, b) => new Date(b.submittedAt).getTime() - new Date(a.submittedAt).getTime()),
    [requests],
  )
  const decided = useMemo(
    () =>
      requests
        .filter((r) => r.status !== "pending")
        .sort(
          (a, b) =>
            new Date(b.decidedAt || b.submittedAt).getTime() -
            new Date(a.decidedAt || a.submittedAt).getTime(),
        ),
    [requests],
  )

  const pendingInstruments = useMemo(
    () =>
      instruments
        .filter((i) => i.status === "pending")
        .sort(
          (a, b) =>
            new Date(b.submittedAt || 0).getTime() - new Date(a.submittedAt || 0).getTime(),
        ),
    [instruments],
  )
  const decidedInstruments = useMemo(
    () =>
      instruments
        .filter((i) => i.status === "active" || i.status === "rejected")
        .sort(
          (a, b) =>
            new Date(b.decidedAt || b.submittedAt || 0).getTime() -
            new Date(a.decidedAt || a.submittedAt || 0).getTime(),
        ),
    [instruments],
  )

  const formatFace = (instrument: Instrument) =>
    `${instrument.currency} ${instrument.faceValue.toLocaleString()}`

  const handleApproveInstrument = (instrument: Instrument) => {
    const approved = approveInstrument(instrument.id)
    if (!approved) return
    toast.success("Instrument approved", {
      description: `${instrument.type} ${instrument.id} (${formatFace(instrument)}) has been issued and is now active.`,
    })
    logActivity({
      action: `Administrator approved ${instrument.type} ${instrument.id} (${formatFace(instrument)})`,
      category: "Administration",
      details: {
        summary: `Administrator approved the ${instrument.typeFull} (${instrument.type}) request ${instrument.id} with a face value of ${formatFace(instrument)}, issued by ${instrument.issuer}. The instrument is now active.`,
        referenceId: instrument.id,
        instrumentType: `${instrument.type} — ${instrument.typeFull}`,
        faceValue: formatFace(instrument),
        issuingBank: instrument.issuer,
        decision: "Approved",
      },
    })
  }

  const confirmRejectInstrument = () => {
    if (!rejectInstrumentTarget) return
    const instrument = rejectInstrumentTarget
    rejectInstrument(instrument.id, rejectInstrumentReason)
    toast.success("Instrument rejected", {
      description: `The ${instrument.type} request ${instrument.id} (${formatFace(instrument)}) was rejected.`,
    })
    logActivity({
      action: `Administrator rejected ${instrument.type} ${instrument.id} (${formatFace(instrument)})`,
      category: "Administration",
      details: {
        summary: `Administrator rejected the ${instrument.typeFull} (${instrument.type}) request ${instrument.id} with a face value of ${formatFace(instrument)}, issued by ${instrument.issuer}. The instrument was not issued.${rejectInstrumentReason.trim() ? ` Reason: ${rejectInstrumentReason.trim()}` : ""}`,
        referenceId: instrument.id,
        instrumentType: `${instrument.type} — ${instrument.typeFull}`,
        faceValue: formatFace(instrument),
        issuingBank: instrument.issuer,
        decision: "Rejected",
        reason: rejectInstrumentReason.trim() || "(none)",
      },
    })
    setRejectInstrumentTarget(null)
    setRejectInstrumentReason("")
  }

  const pendingPPP = useMemo(
    () =>
      pppRequests
        .filter((r) => r.status === "pending")
        .sort((a, b) => new Date(b.submittedAt).getTime() - new Date(a.submittedAt).getTime()),
    [pppRequests],
  )
  const decidedPPP = useMemo(
    () =>
      pppRequests
        .filter((r) => r.status !== "pending")
        .sort(
          (a, b) =>
            new Date(b.decidedAt || b.submittedAt).getTime() -
            new Date(a.decidedAt || a.submittedAt).getTime(),
        ),
    [pppRequests],
  )

  const formatPPPAmount = (r: PPPRequest) => `${r.currency} ${r.amount.toLocaleString()}`

  const handleApprovePPP = (request: PPPRequest) => {
    const approved = approvePPP(request.id)
    if (!approved) return
    toast.success("PPP application approved", {
      description: `${request.programName} application ${request.id} (${formatPPPAmount(request)}) has been approved and activated.`,
    })
    logActivity({
      action: `Administrator approved PPP application ${request.id} for ${request.programName} (${formatPPPAmount(request)})`,
      category: "Administration",
      details: {
        summary: `Administrator approved the "${request.programName}" application ${request.id} with an investment of ${formatPPPAmount(request)}. The program is now active.`,
        referenceId: request.id,
        program: request.programName,
        investmentAmount: formatPPPAmount(request),
        sourceOfFunds: request.sourceOfFunds,
        payoutAccount: request.payoutAccount,
        decision: "Approved",
      },
    })
  }

  const confirmRejectPPP = () => {
    if (!rejectPPPTarget) return
    const request = rejectPPPTarget
    rejectPPP(request.id, rejectPPPReason)
    toast.success("PPP application rejected", {
      description: `The ${request.programName} application ${request.id} (${formatPPPAmount(request)}) was rejected.`,
    })
    logActivity({
      action: `Administrator rejected PPP application ${request.id} for ${request.programName} (${formatPPPAmount(request)})`,
      category: "Administration",
      details: {
        summary: `Administrator rejected the "${request.programName}" application ${request.id} with an investment of ${formatPPPAmount(request)}. The program was not executed.${rejectPPPReason.trim() ? ` Reason: ${rejectPPPReason.trim()}` : ""}`,
        referenceId: request.id,
        program: request.programName,
        investmentAmount: formatPPPAmount(request),
        decision: "Rejected",
        reason: rejectPPPReason.trim() || "(none)",
      },
    })
    setRejectPPPTarget(null)
    setRejectPPPReason("")
  }

  const pendingLeverage = useMemo(
    () =>
      leverageRequests
        .filter((r) => r.status === "pending")
        .sort((a, b) => new Date(b.submittedAt).getTime() - new Date(a.submittedAt).getTime()),
    [leverageRequests],
  )
  // Active lines for which the client has requested a switch-off.
  const pendingSwitchOff = useMemo(
    () =>
      leverageRequests
        .filter((r) => r.status === "switchoff_pending")
        .sort(
          (a, b) =>
            new Date(b.switchOffRequestedAt || b.submittedAt).getTime() -
            new Date(a.switchOffRequestedAt || a.submittedAt).getTime(),
        ),
    [leverageRequests],
  )
  // History excludes lines that are still active or awaiting a switch-off decision.
  const decidedLeverage = useMemo(
    () =>
      leverageRequests
        .filter((r) => r.status === "rejected" || r.status === "closed" || r.status === "approved")
        .sort(
          (a, b) =>
            new Date(b.closedAt || b.decidedAt || b.submittedAt).getTime() -
            new Date(a.closedAt || a.decidedAt || a.submittedAt).getTime(),
        ),
    [leverageRequests],
  )

  const formatLeverageMoney = (r: LeverageRequest, value: number) =>
    `${r.currency} ${value.toLocaleString("en-US", { maximumFractionDigits: 0 })}`
  const formatLeverageMoney2 = (r: LeverageRequest, value: number) =>
    `${r.currency} ${value.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

  const handleApproveLeverage = (request: LeverageRequest) => {
    // Credit the borrowed (leveraged) funds to the client's balance.
    const creditRef = `LEV-CR-${Date.now().toString().slice(-8)}`
    const entry = addReceipt({
      id: creditRef,
      amount: request.borrowedAmount,
      currency: request.currency,
      status: "completed",
      date: new Date().toISOString(),
      counterparty: "MCC Leverage Desk",
      reference: request.id,
      category: "Leverage Credit",
      comment: `Borrowed funds credited on activation of 1:${request.leverageRatio} leverage line ${request.id} (${request.accountLabel}). Debit interest ${(request.interestRate * 100).toFixed(1)}% per year.`,
    })
    const approved = approveLeverage(request.id, entry.id)
    if (!approved) return
    toast.success("Leverage line activated", {
      description: `${formatLeverageMoney(request, request.borrowedAmount)} credited. ${request.id} is live at 1:${request.leverageRatio} (buying power ${formatLeverageMoney(request, request.buyingPower)}).`,
    })
    logActivity({
      action: `Administrator activated leverage line ${request.id} (${request.accountLabel}, 1:${request.leverageRatio})`,
      category: "Administration",
      details: {
        summary: `Administrator approved and activated a 1:${request.leverageRatio} leverage line ${request.id} on the ${request.accountLabel}. ${formatLeverageMoney(request, request.borrowedAmount)} of borrowed funds was credited to the client's balance (equity ${formatLeverageMoney(request, request.equity)}, buying power ${formatLeverageMoney(request, request.buyingPower)}) to trade ${request.instrumentType}. Debit interest of ${(request.interestRate * 100).toFixed(1)}% per year now accrues on the borrowed amount.`,
        referenceId: request.id,
        fundingAccount: request.accountLabel,
        equityAllocated: formatLeverageMoney(request, request.equity),
        leverage: `1:${request.leverageRatio}`,
        borrowedFundsCredited: formatLeverageMoney(request, request.borrowedAmount),
        buyingPower: formatLeverageMoney(request, request.buyingPower),
        debitInterestRate: `${(request.interestRate * 100).toFixed(1)}% per year`,
        ledgerReference: creditRef,
        instrumentType: request.instrumentType,
        decision: "Approved",
      },
    })
  }

  // Approve a switch-off: settle accrued interest and repay the borrowed
  // principal from the client's balance, then close the line.
  const handleApproveSwitchOff = (request: LeverageRequest) => {
    const interest = accruedInterest(request, Date.now())
    const now = new Date().toISOString()
    const repayRef = `LEV-RP-${Date.now().toString().slice(-8)}`
    const repayEntry = addDebit({
      id: repayRef,
      amount: request.borrowedAmount,
      currency: request.currency,
      status: "completed",
      date: now,
      counterparty: "MCC Leverage Desk",
      reference: request.id,
      category: "Leverage Principal Repaid",
      comment: `Repayment of borrowed funds on switch-off of 1:${request.leverageRatio} leverage line ${request.id} (${request.accountLabel}).`,
    })
    let interestRef: string | undefined
    if (interest > 0) {
      interestRef = `LEV-IN-${Date.now().toString().slice(-7)}`
      addDebit({
        id: interestRef,
        amount: interest,
        currency: request.currency,
        status: "completed",
        date: now,
        counterparty: "MCC Leverage Desk",
        reference: request.id,
        category: "Leverage Debit Interest",
        comment: `Accrued debit interest (${(request.interestRate * 100).toFixed(1)}% per year) settled on switch-off of leverage line ${request.id}.`,
      })
    }
    const closed = approveLeverageSwitchOff(request.id, {
      settledInterest: interest,
      repayEntryId: repayEntry.id,
      interestEntryId: interestRef,
    })
    if (!closed) return
    toast.success("Leverage switched off", {
      description: `${request.id} closed. ${formatLeverageMoney(request, request.borrowedAmount)} principal repaid and ${formatLeverageMoney2(request, interest)} interest settled.`,
    })
    logActivity({
      action: `Administrator switched off leverage line ${request.id} (${request.accountLabel}, 1:${request.leverageRatio})`,
      category: "Administration",
      details: {
        summary: `Administrator approved the switch-off of leverage line ${request.id} on the ${request.accountLabel}. Accrued debit interest of ${formatLeverageMoney2(request, interest)} was settled and the borrowed principal of ${formatLeverageMoney(request, request.borrowedAmount)} was repaid from the client's balance. The leverage multiplier was removed and the interest cleared.`,
        referenceId: request.id,
        fundingAccount: request.accountLabel,
        leverage: `1:${request.leverageRatio}`,
        principalRepaid: formatLeverageMoney(request, request.borrowedAmount),
        interestSettled: formatLeverageMoney2(request, interest),
        principalLedgerReference: repayRef,
        interestLedgerReference: interestRef || "(none)",
        decision: "Switched Off",
      },
    })
  }

  const confirmRejectSwitchOff = () => {
    if (!rejectSwitchOffTarget) return
    const request = rejectSwitchOffTarget
    rejectLeverageSwitchOff(request.id, rejectSwitchOffReason)
    toast.success("Switch-off request rejected", {
      description: `The switch-off of ${request.id} was declined. The line remains active.`,
    })
    logActivity({
      action: `Administrator rejected the switch-off request for leverage line ${request.id} (${request.accountLabel})`,
      category: "Administration",
      details: {
        summary: `Administrator rejected the client's request to switch off leverage line ${request.id} on the ${request.accountLabel}. The line remains active and debit interest continues to accrue.${rejectSwitchOffReason.trim() ? ` Reason: ${rejectSwitchOffReason.trim()}` : ""}`,
        referenceId: request.id,
        fundingAccount: request.accountLabel,
        leverage: `1:${request.leverageRatio}`,
        decision: "Switch-Off Rejected",
        reason: rejectSwitchOffReason.trim() || "(none)",
      },
    })
    setRejectSwitchOffTarget(null)
    setRejectSwitchOffReason("")
  }

  const confirmRejectLeverage = () => {
    if (!rejectLeverageTarget) return
    const request = rejectLeverageTarget
    rejectLeverage(request.id, rejectLeverageReason)
    toast.success("Leverage request rejected", {
      description: `The ${request.accountLabel} 1:${request.leverageRatio} line ${request.id} was rejected. No trading line was opened.`,
    })
    logActivity({
      action: `Administrator rejected leverage request ${request.id} (${request.accountLabel}, 1:${request.leverageRatio})`,
      category: "Administration",
      details: {
        summary: `Administrator rejected the 1:${request.leverageRatio} leverage request ${request.id} on the ${request.accountLabel} (${formatLeverageMoney(request, request.equity)} equity, ${formatLeverageMoney(request, request.buyingPower)} buying power). No trading line was opened.${rejectLeverageReason.trim() ? ` Reason: ${rejectLeverageReason.trim()}` : ""}`,
        referenceId: request.id,
        fundingAccount: request.accountLabel,
        equityAllocated: formatLeverageMoney(request, request.equity),
        leverage: `1:${request.leverageRatio}`,
        instrumentType: request.instrumentType,
        decision: "Rejected",
        reason: rejectLeverageReason.trim() || "(none)",
      },
    })
    setRejectLeverageTarget(null)
    setRejectLeverageReason("")
  }

  const pendingDOF = useMemo(
    () =>
      dofRequests
        .filter((r) => r.status === "pending")
        .sort((a, b) => new Date(b.submittedAt).getTime() - new Date(a.submittedAt).getTime()),
    [dofRequests],
  )
  const decidedDOF = useMemo(
    () =>
      dofRequests
        .filter((r) => r.status !== "pending")
        .sort(
          (a, b) =>
            new Date(b.decidedAt || b.submittedAt).getTime() -
            new Date(a.decidedAt || a.submittedAt).getTime(),
        ),
    [dofRequests],
  )

  const formatDOFAmount = (r: DOFRequest) => formatCurrency(r.amount, r.currency)

  const handleApproveDOF = (request: DOFRequest) => {
    // Credit the institutional funds into the master ledger at approval time.
    const credited = addReceipt({
      id: request.id,
      amount: request.amount,
      currency: request.currency,
      status: "completed",
      date: new Date().toISOString(),
      counterparty: request.originatorName,
      account: request.originatorAccount || undefined,
      bank: request.originatorBank
        ? `${request.originatorBank}${request.originatorBankBic ? ` (${request.originatorBankBic})` : ""}`
        : undefined,
      reference: request.mt103Ref || request.id,
      comment: `Institutional Download of Funds from ${request.originatorName} via ${request.originatorBank} (${request.originatorBankBic}). Settlement: ${request.settlementMethod}. UETR ${request.uetr}.${request.mt202Ref ? ` MT202 ${request.mt202Ref}.` : ""}`,
      category: "Download of Funds",
    })

    const approved = approveDOF(request.id, credited.id)
    if (!approved) return

    toast.success("Download of Funds authorized", {
      description: `${formatDOFAmount(request)} from ${request.originatorName} has been credited to the master account.`,
    })
    logActivity({
      action: `Administrator authorized Download of Funds ${request.id} of ${formatDOFAmount(request)}`,
      category: "Administration",
      details: {
        summary: `Administrator authorized institutional Download of Funds ${request.id}. Credited ${formatDOFAmount(request)} from ${request.originatorName} via ${request.originatorBank} (${request.originatorBankBic}) into the master account. Settlement method ${request.settlementMethod}, value date ${request.valueDate}. UETR ${request.uetr}.`,
        referenceId: request.id,
        uetr: request.uetr,
        amountCredited: formatDOFAmount(request),
        originator: request.originatorName,
        sendingBank: `${request.originatorBank} (${request.originatorBankBic})`,
        settlementMethod: request.settlementMethod,
        mt103: request.mt103Ref || "(none)",
        mt202: request.mt202Ref || "(none)",
        decision: "Approved",
      },
    })
  }

  const confirmRejectDOF = () => {
    if (!rejectDOFTarget) return
    const request = rejectDOFTarget
    rejectDOF(request.id, rejectDOFReason)
    toast.success("Download of Funds rejected", {
      description: `The request ${request.id} for ${formatDOFAmount(request)} was rejected. No funds were credited.`,
    })
    logActivity({
      action: `Administrator rejected Download of Funds ${request.id} of ${formatDOFAmount(request)}`,
      category: "Administration",
      details: {
        summary: `Administrator rejected institutional Download of Funds ${request.id} for ${formatDOFAmount(request)} from ${request.originatorName}. No funds were credited.${rejectDOFReason.trim() ? ` Reason: ${rejectDOFReason.trim()}` : ""}`,
        referenceId: request.id,
        uetr: request.uetr,
        amount: formatDOFAmount(request),
        originator: request.originatorName,
        decision: "Rejected",
        reason: rejectDOFReason.trim() || "(none)",
      },
    })
    setRejectDOFTarget(null)
    setRejectDOFReason("")
  }

  const pendingMonetization = useMemo(
    () =>
      monetizationRequests
        .filter((r) => r.status === "pending")
        .sort((a, b) => new Date(b.submittedAt).getTime() - new Date(a.submittedAt).getTime()),
    [monetizationRequests],
  )
  const decidedMonetization = useMemo(
    () =>
      monetizationRequests
        .filter((r) => r.status !== "pending")
        .sort(
          (a, b) =>
            new Date(b.decidedAt || b.submittedAt).getTime() -
            new Date(a.decidedAt || a.submittedAt).getTime(),
        ),
    [monetizationRequests],
  )

  const MONETIZATION_STRUCTURE_LABELS: Record<MonetizationRequest["structure"], string> = {
    CreditLine: "Non-recourse credit line",
    Discounting: "Discounting / purchase",
    CollateralTransfer: "Collateral transfer (MT760)",
  }
  const formatMonetizationProceeds = (r: MonetizationRequest) =>
    formatCurrency(r.grossProceeds, r.proceedsCurrency)

  const handleApproveMonetization = (request: MonetizationRequest) => {
    // Credit the monetization proceeds into the master ledger at approval time.
    const credited = addReceipt({
      id: request.id,
      amount: request.grossProceeds,
      currency: request.proceedsCurrency,
      status: "completed",
      date: new Date().toISOString(),
      counterparty: request.monetizationPlatform || request.issuer,
      bank: request.receivingBank
        ? `${request.receivingBank}${request.receivingBankBic ? ` (${request.receivingBankBic})` : ""}`
        : undefined,
      reference: request.mt760Ref || request.id,
      comment: `Monetization of ${request.instrumentTypeFull} (${request.instrumentType}) ${request.instrumentId} issued by ${request.issuer}. Structure: ${MONETIZATION_STRUCTURE_LABELS[request.structure]} at ${request.advanceRatePercent}% LTV on ${formatCurrency(request.faceValue, request.currency)} face value. UETR ${request.uetr}.${request.mt760Ref ? ` MT760 ${request.mt760Ref}.` : ""}`,
      category: "Instrument Monetization",
    })

    const approved = approveMonetization(request.id, credited.id)
    if (!approved) return

    toast.success("Monetization authorized", {
      description: `${formatMonetizationProceeds(request)} of proceeds for ${request.instrumentId} has been credited to the master account.`,
    })
    logActivity({
      action: `Administrator authorized monetization ${request.id} of ${formatMonetizationProceeds(request)}`,
      category: "Administration",
      details: {
        summary: `Administrator authorized monetization ${request.id} of the ${request.instrumentTypeFull} (${request.instrumentType}) ${request.instrumentId} issued by ${request.issuer}. Credited ${formatMonetizationProceeds(request)} (${MONETIZATION_STRUCTURE_LABELS[request.structure]}, ${request.advanceRatePercent}% LTV on ${formatCurrency(request.faceValue, request.currency)}) into the master account. UETR ${request.uetr}.`,
        referenceId: request.id,
        uetr: request.uetr,
        instrumentRef: request.instrumentId,
        instrument: `${request.instrumentType} — ${request.instrumentTypeFull}`,
        structure: MONETIZATION_STRUCTURE_LABELS[request.structure],
        advanceRate: `${request.advanceRatePercent}%`,
        proceedsCredited: formatMonetizationProceeds(request),
        mt760: request.mt760Ref || "(none)",
        decision: "Approved",
      },
    })
  }

  const confirmRejectMonetization = () => {
    if (!rejectMonetizationTarget) return
    const request = rejectMonetizationTarget
    rejectMonetization(request.id, rejectMonetizationReason)
    toast.success("Monetization rejected", {
      description: `The request ${request.id} for ${request.instrumentId} was rejected. No proceeds were credited.`,
    })
    logActivity({
      action: `Administrator rejected monetization ${request.id} of ${formatMonetizationProceeds(request)}`,
      category: "Administration",
      details: {
        summary: `Administrator rejected monetization ${request.id} of the ${request.instrumentTypeFull} (${request.instrumentType}) ${request.instrumentId}. No proceeds were credited.${rejectMonetizationReason.trim() ? ` Reason: ${rejectMonetizationReason.trim()}` : ""}`,
        referenceId: request.id,
        uetr: request.uetr,
        instrumentRef: request.instrumentId,
        proceeds: formatMonetizationProceeds(request),
        decision: "Rejected",
        reason: rejectMonetizationReason.trim() || "(none)",
      },
    })
    setRejectMonetizationTarget(null)
    setRejectMonetizationReason("")
  }

  const pendingDTC = useMemo(
    () =>
      dtcRequests
        .filter((r) => r.status === "pending")
        .sort((a, b) => new Date(b.submittedAt).getTime() - new Date(a.submittedAt).getTime()),
    [dtcRequests],
  )
  const decidedDTC = useMemo(
    () =>
      dtcRequests
        .filter((r) => r.status !== "pending")
        .sort(
          (a, b) =>
            new Date(b.decidedAt || b.submittedAt).getTime() -
            new Date(a.decidedAt || a.submittedAt).getTime(),
        ),
    [dtcRequests],
  )

  const formatDTCCash = (r: DTCRequest) =>
    r.settlementBasis === "DVP" ? formatCurrency(r.cashAmount, r.currency) : "Free of Payment"

  const handleApproveDTC = (request: DTCRequest) => {
    // For DVP trades the cash leg moves at settlement: a delivery credits the
    // proceeds, a receipt debits the cost. FOP trades move no cash.
    if (request.settlementBasis === "DVP" && request.direction === "receive") {
      if (request.currency === MASTER_ACCOUNT_CURRENCY && request.cashAmount > masterBalance) {
        toast.error("Insufficient funds to settle", {
          description: `This receipt needs ${formatCurrency(request.cashAmount, request.currency)} but only ${formatCurrency(masterBalance, MASTER_ACCOUNT_CURRENCY)} is available.`,
        })
        return
      }
    }

    let settledEntryId: string | undefined
    if (request.settlementBasis === "DVP" && request.cashAmount > 0) {
      const common = {
        amount: request.cashAmount,
        currency: request.currency,
        status: "completed" as const,
        date: new Date().toISOString(),
        counterparty: request.counterpartyName,
        bank: request.agentBank
          ? `${request.agentBank}${request.agentBankBic ? ` (${request.agentBankBic})` : ""}`
          : undefined,
        reference: request.mt54xRef || request.id,
      }
      if (request.direction === "deliver") {
        const credited = addReceipt({
          ...common,
          id: request.id,
          comment: `DVP cash proceeds from delivery of ${request.securityName} (ISIN ${request.isin}) via ${request.depository}. Counterparty ${request.counterpartyName}. UETR ${request.uetr}.`,
          category: "Securities Settlement",
        })
        settledEntryId = credited.id
      } else {
        const debited = addDebit({
          ...common,
          id: request.id,
          comment: `DVP cash payment for receipt of ${request.securityName} (ISIN ${request.isin}) via ${request.depository}. Counterparty ${request.counterpartyName}. UETR ${request.uetr}.`,
          category: "Securities Settlement",
        })
        settledEntryId = debited.id
      }
    }

    const approved = approveDTC(request.id, settledEntryId)
    if (!approved) return

    toast.success("Securities settlement authorized", {
      description: `${request.depository} ${request.direction === "deliver" ? "delivery" : "receipt"} of ${request.securityName} has settled (${formatDTCCash(request)}).`,
    })
    logActivity({
      action: `Administrator authorized ${request.depository} settlement ${request.id} (${formatDTCCash(request)})`,
      category: "Administration",
      details: {
        summary: `Administrator authorized ${request.depository} ${request.settlementBasis} settlement ${request.id}: ${request.direction === "deliver" ? "delivered" : "received"} ${request.quantity.toLocaleString()} of ${request.securityName} (ISIN ${request.isin}) against ${formatDTCCash(request)}. Counterparty ${request.counterpartyName}. UETR ${request.uetr}.`,
        referenceId: request.id,
        uetr: request.uetr,
        depository: request.depository,
        settlementBasis: request.settlementBasis,
        direction: request.direction,
        security: `${request.securityName} (${request.isin})`,
        cashLeg: formatDTCCash(request),
        counterparty: request.counterpartyName,
        decision: "Approved",
      },
    })
  }

  const confirmRejectDTC = () => {
    if (!rejectDTCTarget) return
    const request = rejectDTCTarget
    rejectDTC(request.id, rejectDTCReason)
    toast.success("Securities settlement rejected", {
      description: `Instruction ${request.id} for ${request.securityName} was rejected. Nothing settled.`,
    })
    logActivity({
      action: `Administrator rejected ${request.depository} settlement ${request.id} (${formatDTCCash(request)})`,
      category: "Administration",
      details: {
        summary: `Administrator rejected ${request.depository} ${request.settlementBasis} settlement ${request.id} for ${request.securityName} (ISIN ${request.isin}). No securities settled and no cash moved.${rejectDTCReason.trim() ? ` Reason: ${rejectDTCReason.trim()}` : ""}`,
        referenceId: request.id,
        uetr: request.uetr,
        depository: request.depository,
        security: `${request.securityName} (${request.isin})`,
        cashLeg: formatDTCCash(request),
        counterparty: request.counterpartyName,
        decision: "Rejected",
        reason: rejectDTCReason.trim() || "(none)",
      },
    })
    setRejectDTCTarget(null)
    setRejectDTCReason("")
  }

  // --- Euroclear Settlement (MT540-543 securities instructions) ---------
  const pendingEuroclear = useMemo(
    () =>
      euroclearRequests
        .filter((r) => r.status === "pending")
        .sort((a, b) => new Date(b.submittedAt).getTime() - new Date(a.submittedAt).getTime()),
    [euroclearRequests],
  )
  const decidedEuroclear = useMemo(
    () =>
      euroclearRequests
        .filter((r) => r.status !== "pending")
        .sort(
          (a, b) =>
            new Date(b.decidedAt || b.submittedAt).getTime() -
            new Date(a.decidedAt || a.submittedAt).getTime(),
        ),
    [euroclearRequests],
  )

  const formatEuroclearCash = (r: EuroclearRequest) =>
    r.settlementBasis === "DVP" ? formatCurrency(r.cashAmount, r.currency) : "Free of Payment"

  const handleApproveEuroclear = (request: EuroclearRequest) => {
    // For DVP trades the cash leg moves at settlement: a delivery credits the
    // proceeds, a receipt debits the cost. FOP trades move no cash.
    if (request.settlementBasis === "DVP" && request.direction === "receive") {
      if (request.currency === MASTER_ACCOUNT_CURRENCY && request.cashAmount > masterBalance) {
        toast.error("Insufficient funds to settle", {
          description: `This receipt needs ${formatCurrency(request.cashAmount, request.currency)} but only ${formatCurrency(masterBalance, MASTER_ACCOUNT_CURRENCY)} is available.`,
        })
        return
      }
    }

    let settledEntryId: string | undefined
    if (request.settlementBasis === "DVP" && request.cashAmount > 0) {
      const common = {
        amount: request.cashAmount,
        currency: request.currency,
        status: "completed" as const,
        date: new Date().toISOString(),
        counterparty: request.counterpartyName,
        bank: request.custodianBank
          ? `${request.custodianBank}${request.custodianBic ? ` (${request.custodianBic})` : ""}`
          : undefined,
        reference: request.mt54xRef || request.id,
      }
      if (request.direction === "deliver") {
        const credited = addReceipt({
          ...common,
          id: request.id,
          comment: `DVP cash proceeds from delivery of ${request.securityName} (ISIN ${request.isin}) via Euroclear. Counterparty ${request.counterpartyName}. UETR ${request.uetr}.`,
          category: "Securities Settlement",
        })
        settledEntryId = credited.id
      } else {
        const debited = addDebit({
          ...common,
          id: request.id,
          comment: `DVP cash payment for receipt of ${request.securityName} (ISIN ${request.isin}) via Euroclear. Counterparty ${request.counterpartyName}. UETR ${request.uetr}.`,
          category: "Securities Settlement",
        })
        settledEntryId = debited.id
      }
    }

    const approved = approveEuroclear(request.id, settledEntryId)
    if (!approved) return

    toast.success("Euroclear settlement authorized", {
      description: `Euroclear ${request.direction === "deliver" ? "delivery" : "receipt"} of ${request.securityName} has settled (${formatEuroclearCash(request)}).`,
    })
    logActivity({
      action: `Administrator authorized Euroclear settlement ${request.id} (${formatEuroclearCash(request)})`,
      category: "Administration",
      details: {
        summary: `Administrator authorized Euroclear ${request.settlementBasis} settlement ${request.id}: ${request.direction === "deliver" ? "delivered" : "received"} ${request.quantity.toLocaleString()} of ${request.securityName} (ISIN ${request.isin}) against ${formatEuroclearCash(request)}. Counterparty ${request.counterpartyName}. UETR ${request.uetr}.`,
        referenceId: request.id,
        uetr: request.uetr,
        depository: "Euroclear",
        settlementBasis: request.settlementBasis,
        direction: request.direction,
        security: `${request.securityName} (${request.isin})`,
        cashLeg: formatEuroclearCash(request),
        counterparty: request.counterpartyName,
        decision: "Approved",
      },
    })
  }

  const confirmRejectEuroclear = () => {
    if (!rejectEuroclearTarget) return
    const request = rejectEuroclearTarget
    rejectEuroclear(request.id, rejectEuroclearReason)
    toast.success("Euroclear settlement rejected", {
      description: `Instruction ${request.id} for ${request.securityName} was rejected. Nothing settled.`,
    })
    logActivity({
      action: `Administrator rejected Euroclear settlement ${request.id} (${formatEuroclearCash(request)})`,
      category: "Administration",
      details: {
        summary: `Administrator rejected Euroclear ${request.settlementBasis} settlement ${request.id} for ${request.securityName} (ISIN ${request.isin}). No securities settled and no cash moved.${rejectEuroclearReason.trim() ? ` Reason: ${rejectEuroclearReason.trim()}` : ""}`,
        referenceId: request.id,
        uetr: request.uetr,
        depository: "Euroclear",
        security: `${request.securityName} (${request.isin})`,
        cashLeg: formatEuroclearCash(request),
        counterparty: request.counterpartyName,
        decision: "Rejected",
        reason: rejectEuroclearReason.trim() || "(none)",
      },
    })
    setRejectEuroclearTarget(null)
    setRejectEuroclearReason("")
  }

  // --- Commodity Trading (deals + POP/POF documents) -------------------
  const pendingDeals = useMemo(
    () =>
      commodityDeals
        .filter((d) => d.status === "pending")
        .sort((a, b) => new Date(b.submittedAt).getTime() - new Date(a.submittedAt).getTime()),
    [commodityDeals],
  )
  const decidedDeals = useMemo(
    () =>
      commodityDeals
        .filter((d) => d.status !== "pending")
        .sort(
          (a, b) =>
            new Date(b.decidedAt || b.submittedAt).getTime() -
            new Date(a.decidedAt || a.submittedAt).getTime(),
        ),
    [commodityDeals],
  )

  const handleVerifyDoc = (deal: CommodityDeal, doc: DealDocument) => {
    verifyDocument(deal.id, doc.id)
    toast.success("Document verified", {
      description: `${doc.docType} on ${deal.id} marked as verified.`,
    })
    logActivity({
      action: `Administrator verified ${doc.module} document (${doc.docType}) for deal ${deal.id}`,
      category: "Administration",
      details: {
        summary: `Administrator verified ${doc.module} document "${doc.docType}" (v${doc.currentVersion}) on commodity deal ${deal.id} "${deal.title}".`,
        referenceId: deal.id,
        uetr: deal.uetr,
        module: doc.module,
        docType: doc.docType,
        decision: "Verified",
      },
    })
  }

  const confirmRejectDoc = () => {
    if (!rejectDocTarget) return
    const { deal, doc } = rejectDocTarget
    rejectDocument(deal.id, doc.id, rejectDocReason)
    toast.success("Document rejected", {
      description: `${doc.docType} on ${deal.id} was rejected. The client can submit a new version.`,
    })
    logActivity({
      action: `Administrator rejected ${doc.module} document (${doc.docType}) for deal ${deal.id}`,
      category: "Administration",
      details: {
        summary: `Administrator rejected ${doc.module} document "${doc.docType}" (v${doc.currentVersion}) on commodity deal ${deal.id} "${deal.title}".${rejectDocReason.trim() ? ` Reason: ${rejectDocReason.trim()}` : ""}`,
        referenceId: deal.id,
        uetr: deal.uetr,
        module: doc.module,
        docType: doc.docType,
        decision: "Rejected",
        reason: rejectDocReason.trim() || "(none)",
      },
    })
    setRejectDocTarget(null)
    setRejectDocReason("")
  }

  const handleApproveDeal = (deal: CommodityDeal) => {
    const unverified = deal.documents.filter((d) => d.status !== "verified")
    if (deal.documents.length === 0) {
      toast.error("No documents to review", {
        description: "This deal has no POP/POF documents. Confirm with the client before authorizing.",
      })
    } else if (unverified.length > 0) {
      toast.warning("Some documents are not verified", {
        description: `${unverified.length} document(s) remain unverified. You can still authorize, but review them first.`,
      })
    }
    // Credit the deal proceeds into the master ledger so balances and the
    // Transactions section reflect the executed commodity trade. Mirrors the
    // DOF / DTC / monetization settlement pattern.
    let settledEntryId: string | undefined
    if (deal.approxValue > 0) {
      const swiftRef =
        deal.mt103Ref || deal.mt202Ref || deal.mt799Ref || deal.uetr
      const credited = addReceipt({
        id: deal.id,
        amount: deal.approxValue,
        currency: deal.currency,
        status: "completed",
        date: new Date().toISOString(),
        counterparty: deal.buyerName || deal.sellerName || "Commodity counterparty",
        bank: deal.receivingBank
          ? `${deal.receivingBank}${deal.receivingBankBic ? ` (${deal.receivingBankBic})` : ""}`
          : deal.sendingBank || undefined,
        reference: swiftRef,
        category: "Commodity Settlement",
        comment: `Proceeds from authorized commodity deal ${deal.id} "${deal.title}" (${deal.category}${deal.commodity ? `, ${deal.commodity}` : ""}${deal.quantity ? ` ${deal.quantity}` : ""}). Buyer ${deal.buyerName}, Seller ${deal.sellerName}. Routed ${deal.sendingBankBic || deal.sendingBank || "—"} → ${deal.receivingBankBic || deal.receivingBank || "—"}. UETR ${deal.uetr}.`,
      })
      settledEntryId = credited.id
    }
    const approved = approveDeal(deal.id, undefined, settledEntryId)
    if (!approved) return
    toast.success("Deal authorized for execution", {
      description: `${deal.id} "${deal.title}" moved to the Execution stage${settledEntryId ? ` and ${formatCurrency(deal.approxValue, deal.currency)} credited to the master account.` : "."}`,
    })
    logActivity({
      action: `Administrator authorized commodity deal ${deal.id} (${formatCurrency(deal.approxValue, deal.currency)})`,
      category: "Administration",
      details: {
        summary: `Administrator authorized commodity deal ${deal.id} "${deal.title}" (${deal.category}, ${deal.commodity || "—"} ${deal.quantity ? `${deal.quantity}` : ""}) valued ~${formatCurrency(deal.approxValue, deal.currency)}. Buyer ${deal.buyerName}, Seller ${deal.sellerName}. Advanced to Execution.${settledEntryId ? ` ${formatCurrency(deal.approxValue, deal.currency)} credited to the master account (ref ${settledEntryId}).` : ""} UETR ${deal.uetr}.`,
        referenceId: deal.id,
        uetr: deal.uetr,
        category: deal.category,
        value: formatCurrency(deal.approxValue, deal.currency),
        settledEntryId,
        decision: "Approved",
      },
    })
  }

  const confirmRejectDeal = () => {
    if (!rejectDealTarget) return
    const deal = rejectDealTarget
    rejectDeal(deal.id, rejectDealReason)
    toast.success("Deal rejected", {
      description: `${deal.id} "${deal.title}" was rejected. Nothing executes.`,
    })
    logActivity({
      action: `Administrator rejected commodity deal ${deal.id} (${formatCurrency(deal.approxValue, deal.currency)})`,
      category: "Administration",
      details: {
        summary: `Administrator rejected commodity deal ${deal.id} "${deal.title}" (${deal.category}). No execution proceeds.${rejectDealReason.trim() ? ` Reason: ${rejectDealReason.trim()}` : ""}`,
        referenceId: deal.id,
        uetr: deal.uetr,
        category: deal.category,
        value: formatCurrency(deal.approxValue, deal.currency),
        decision: "Rejected",
        reason: rejectDealReason.trim() || "(none)",
      },
    })
    setRejectDealTarget(null)
    setRejectDealReason("")
  }

  const handleResetAccount = () => {
    setResetting(true)
    logActivity({
      action: "Administrator reset all account data to a brand-new state",
      category: "Administration",
      details: {
        summary:
          "Administrator performed a full account reset. All balances were set to 0.00 and every transaction, payment request, bank instrument, Yield/PPP application, and beneficiary was permanently deleted. The account was restored to the state of a newly created platform account.",
        decision: "Account Reset",
        scope: "Balances, transactions, payment requests, instruments, Yield/PPP applications, beneficiaries",
      },
    })
    resetAccountData()
    toast.success("Account reset to brand-new state", {
      description: "All balances, transactions, requests, and beneficiaries have been cleared.",
    })
    // Reload so every in-memory store re-hydrates from its empty defaults.
    setTimeout(() => {
      window.location.reload()
    }, 600)
  }

  const handleApprove = (request: PaymentRequest) => {
    // Funds only move now, at approval time. Guard against insufficient balance
    // in case the available balance changed since submission.
    if (request.currency === MASTER_ACCOUNT_CURRENCY && request.total > masterBalance) {
      toast.error("Insufficient funds to approve", {
        description: `This payment needs ${formatCurrency(request.total, request.currency)} but only ${formatCurrency(masterBalance, MASTER_ACCOUNT_CURRENCY)} is available.`,
      })
      return
    }

    const approved = approveRequest(request.id)
    if (!approved) return

    // Debit the principal as the outgoing payment.
    addDebit({
      id: request.id,
      amount: request.amount,
      currency: request.currency,
      status: "completed",
      date: new Date().toISOString(),
      counterparty: request.beneficiary,
      account: request.iban,
      bank: request.swiftCode,
      reference: request.reference,
      comment: `Outgoing SWIFT payment to ${request.beneficiary} (${request.beneficiaryCountry}), approved by Administrator.`,
      category: "Outgoing Transfer",
    })
    // Debit the 2% platform fee as a separate entry.
    if (request.fee > 0) {
      addDebit({
        id: `${request.id}-FEE`,
        amount: request.fee,
        currency: request.currency,
        status: "completed",
        date: new Date().toISOString(),
        counterparty: "MCC Platform Fee (2%)",
        reference: `${request.reference} — fee`,
        category: "Payment Fee",
      })
    }

    toast.success("Payment approved", {
      description: `${formatCurrency(request.amount, request.currency)} to ${request.beneficiary} has been approved and debited.`,
    })
    logActivity({
      action: `Administrator approved payment ${request.id} of ${formatCurrency(request.amount, request.currency)} to ${request.beneficiary}`,
      category: "Administration",
      details: {
        summary: `Administrator approved outgoing payment ${request.id} to ${request.beneficiary} (${request.beneficiaryCountry}). Debited ${formatCurrency(request.amount, request.currency)} plus a ${formatCurrency(request.fee, request.currency)} platform fee (2%) for a total of ${formatCurrency(request.total, request.currency)}. IBAN ${request.iban}, SWIFT ${request.swiftCode}.`,
        paymentId: request.id,
        beneficiary: request.beneficiary,
        amount: formatCurrency(request.amount, request.currency),
        platformFee: formatCurrency(request.fee, request.currency),
        totalDebited: formatCurrency(request.total, request.currency),
        decision: "Approved",
      },
    })
  }

  const confirmReject = () => {
    if (!rejectTarget) return
    const request = rejectTarget
    rejectRequest(request.id, rejectReason)
    toast.success("Payment rejected", {
      description: `The request for ${formatCurrency(request.amount, request.currency)} to ${request.beneficiary} was rejected. No funds were moved.`,
    })
    logActivity({
      action: `Administrator rejected payment ${request.id} of ${formatCurrency(request.amount, request.currency)} to ${request.beneficiary}`,
      category: "Administration",
      details: {
        summary: `Administrator rejected outgoing payment ${request.id} to ${request.beneficiary} (${request.beneficiaryCountry}) for ${formatCurrency(request.amount, request.currency)}. No funds were debited.${rejectReason.trim() ? ` Reason: ${rejectReason.trim()}` : ""}`,
        paymentId: request.id,
        beneficiary: request.beneficiary,
        amount: formatCurrency(request.amount, request.currency),
        decision: "Rejected",
        reason: rejectReason.trim() || "(none)",
      },
    })
    setRejectTarget(null)
    setRejectReason("")
  }

  // Passcode gate
  if (!unlocked) {
    return (
      <div className="mx-auto flex max-w-md flex-col items-center justify-center py-16">
        <Card className="w-full bg-card border-border">
          <CardHeader className="items-center text-center">
            <div className="mb-2 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
              <Lock className="h-6 w-6 text-primary" />
            </div>
            <CardTitle className="text-xl font-semibold">Administrator Area</CardTitle>
            <p className="text-sm text-muted-foreground text-pretty">
              This area is restricted. Enter the Administrator passcode to review and approve
              outgoing payments, bank instrument requests, and Yield/PPP applications.
            </p>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="admin-passcode">Administrator Passcode</Label>
              <Input
                id="admin-passcode"
                type="password"
                value={passcode}
                onChange={(e) => {
                  setPasscode(e.target.value)
                  setGateError(null)
                }}
                onKeyDown={(e) => e.key === "Enter" && handleUnlock()}
                placeholder="Enter passcode"
                autoComplete="off"
              />
              {gateError && (
                <p className="text-sm text-destructive" role="alert">
                  {gateError}
                </p>
              )}
            </div>
            <Button className="w-full" onClick={handleUnlock}>
              <ShieldCheck className="mr-2 h-4 w-4" />
              Unlock Administrator Panel
            </Button>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary/10">
            <ShieldCheck className="h-6 w-6 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-foreground">Administrator Panel</h1>
            <p className="text-sm text-muted-foreground text-pretty">
              Review and authorize outgoing payments, bank instrument requests, and Yield/PPP
              applications. Operations are only executed on approval.
            </p>
          </div>
        </div>
        <Button variant="outline" size="sm" onClick={handleLock}>
          <LogOut className="mr-2 h-4 w-4" />
          Lock Panel
        </Button>
      </div>

      {/* Stats */}
      <div className="grid gap-4 sm:grid-cols-3">
        <Card className="bg-card border-border">
          <CardContent className="flex items-center justify-between p-4">
            <div>
              <p className="text-xs text-muted-foreground">Pending Approval</p>
              <p className="mt-1 text-2xl font-bold text-foreground">
                {pending.length +
                  pendingInstruments.length +
                  pendingPPP.length +
                  pendingDOF.length +
                  pendingMonetization.length +
                  pendingLeverage.length +
                  pendingSwitchOff.length}
              </p>
              <p className="mt-1 text-[11px] text-muted-foreground">
                {pending.length} payments · {pendingInstruments.length} instruments ·{" "}
                {pendingPPP.length} PPP · {pendingDOF.length} DOF · {pendingMonetization.length}{" "}
                monetization · {pendingLeverage.length} leverage · {pendingSwitchOff.length}{" "}
                switch-off
              </p>
            </div>
            <div className="rounded-lg bg-secondary p-3">
              <Clock className="h-5 w-5 text-yellow-400" />
            </div>
          </CardContent>
        </Card>
        <Card className="bg-card border-border">
          <CardContent className="flex items-center justify-between p-4">
            <div>
              <p className="text-xs text-muted-foreground">Awaiting Total</p>
              <p className="mt-1 text-2xl font-bold text-foreground">
                {formatCurrency(
                  pending
                    .filter((r) => r.currency === MASTER_ACCOUNT_CURRENCY)
                    .reduce((s, r) => s + r.total, 0),
                  MASTER_ACCOUNT_CURRENCY,
                )}
              </p>
            </div>
            <div className="rounded-lg bg-secondary p-3">
              <ArrowUpRight className="h-5 w-5 text-red-400" />
            </div>
          </CardContent>
        </Card>
        <Card className="bg-card border-border">
          <CardContent className="flex items-center justify-between p-4">
            <div>
              <p className="text-xs text-muted-foreground">Available Balance</p>
              <p className="mt-1 text-2xl font-bold text-foreground">
                {formatCurrency(masterBalance, MASTER_ACCOUNT_CURRENCY)}
              </p>
            </div>
            <div className="rounded-lg bg-secondary p-3">
              <Building2 className="h-5 w-5 text-blue-400" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Pending requests */}
      <Card className="bg-card border-border">
        <CardHeader>
          <CardTitle className="text-lg font-semibold">Pending Payment Requests</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {pending.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-2 py-10 text-center">
              <Check className="h-8 w-8 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">
                No pending requests. All outgoing payments have been reviewed.
              </p>
            </div>
          ) : (
            pending.map((r) => (
              <div
                key={r.id}
                className="rounded-lg border border-border bg-secondary/30 p-4"
              >
                <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                  <div className="space-y-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge
                        variant="outline"
                        className="border-yellow-500/20 bg-yellow-500/10 text-yellow-500 text-[10px]"
                      >
                        <Clock className="mr-1 h-3 w-3" />
                        Pending
                      </Badge>
                      <span className="font-medium text-foreground">{r.id}</span>
                      <span className="text-xs text-muted-foreground">
                        Submitted {formatTimestamp(r.submittedAt)}
                      </span>
                    </div>
                    <div className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
                      <div className="flex items-center gap-2">
                        <ArrowUpRight className="h-4 w-4 text-muted-foreground" />
                        <span className="text-muted-foreground">To:</span>
                        <span className="font-medium text-foreground">{r.beneficiary}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <Globe className="h-4 w-4 text-muted-foreground" />
                        <span className="text-muted-foreground">Country:</span>
                        <span className="text-foreground">{r.beneficiaryCountry}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-muted-foreground">IBAN:</span>
                        <span className="break-all font-mono text-xs text-foreground">{r.iban}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-muted-foreground">SWIFT:</span>
                        <span className="font-mono text-xs text-foreground">{r.swiftCode}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-muted-foreground">Reference:</span>
                        <span className="text-foreground">{r.reference}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-muted-foreground">Source:</span>
                        <span className="text-foreground">{r.payeeSource}</span>
                      </div>
                    </div>
                    {r.notes && (
                      <p className="text-xs text-muted-foreground text-pretty">
                        <span className="font-medium">Notes:</span> {r.notes}
                      </p>
                    )}
                  </div>

                  <div className="flex flex-col items-stretch gap-3 lg:w-56 lg:shrink-0">
                    <div className="rounded-lg border border-border bg-card p-3 text-sm">
                      <div className="flex items-center justify-between">
                        <span className="text-muted-foreground">Amount</span>
                        <span className="font-medium text-foreground">
                          {formatCurrency(r.amount, r.currency)}
                        </span>
                      </div>
                      <div className="mt-1 flex items-center justify-between">
                        <span className="text-muted-foreground">Fee (2%)</span>
                        <span className="text-foreground">{formatCurrency(r.fee, r.currency)}</span>
                      </div>
                      <div className="mt-2 flex items-center justify-between border-t border-border pt-2 font-semibold">
                        <span className="text-foreground">Total</span>
                        <span className="text-foreground">{formatCurrency(r.total, r.currency)}</span>
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <Button className="flex-1" size="sm" onClick={() => handleApprove(r)}>
                        <Check className="mr-1 h-4 w-4" />
                        Approve
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        className="flex-1 border-destructive/30 text-destructive hover:bg-destructive/10 hover:text-destructive"
                        onClick={() => {
                          setRejectReason("")
                          setRejectTarget(r)
                        }}
                      >
                        <X className="mr-1 h-4 w-4" />
                        Reject
                      </Button>
                    </div>
                  </div>
                </div>
              </div>
            ))
          )}
        </CardContent>
      </Card>

      {/* Decision history */}
      <Card className="bg-card border-border">
        <CardHeader>
          <CardTitle className="text-lg font-semibold">Decision History</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {decided.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              No decisions yet. Approved and rejected requests will appear here.
            </p>
          ) : (
            decided.map((r) => (
              <div
                key={r.id}
                className="flex flex-col gap-2 rounded-lg border border-border p-3 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="flex items-center gap-3">
                  <Badge
                    variant="outline"
                    className={cn(
                      "text-[10px]",
                      r.status === "approved"
                        ? "border-green-500/20 bg-green-500/10 text-green-500"
                        : "border-red-500/20 bg-red-500/10 text-red-500",
                    )}
                  >
                    {r.status === "approved" ? (
                      <Check className="mr-1 h-3 w-3" />
                    ) : (
                      <X className="mr-1 h-3 w-3" />
                    )}
                    {r.status === "approved" ? "Approved" : "Rejected"}
                  </Badge>
                  <div>
                    <p className="text-sm font-medium text-foreground">
                      {r.beneficiary} · {formatCurrency(r.amount, r.currency)}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {r.id} · {formatTimestamp(r.decidedAt)}
                      {r.decisionNote ? ` · ${r.decisionNote}` : ""}
                    </p>
                  </div>
                </div>
                <span className="text-sm font-medium text-foreground">
                  {formatCurrency(r.total, r.currency)}
                </span>
              </div>
            ))
          )}
        </CardContent>
      </Card>

      {/* Pending instrument requests */}
      <Card className="bg-card border-border">
        <CardHeader>
          <CardTitle className="text-lg font-semibold">Pending Instrument Requests</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {pendingInstruments.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-2 py-10 text-center">
              <Check className="h-8 w-8 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">
                No pending instrument requests. All bank instruments have been reviewed.
              </p>
            </div>
          ) : (
            pendingInstruments.map((i) => (
              <div key={i.id} className="rounded-lg border border-border bg-secondary/30 p-4">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                  <div className="space-y-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge
                        variant="outline"
                        className="border-yellow-500/20 bg-yellow-500/10 text-yellow-500 text-[10px]"
                      >
                        <Clock className="mr-1 h-3 w-3" />
                        Pending
                      </Badge>
                      <Badge variant="outline" className="text-[10px]">
                        {i.type}
                      </Badge>
                      <span className="font-medium text-foreground">{i.id}</span>
                      <span className="text-xs text-muted-foreground">
                        Submitted {formatTimestamp(i.submittedAt)}
                      </span>
                    </div>
                    <div className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
                      <div className="flex items-center gap-2">
                        <FileText className="h-4 w-4 text-muted-foreground" />
                        <span className="text-muted-foreground">Instrument:</span>
                        <span className="font-medium text-foreground">{i.typeFull}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <Building2 className="h-4 w-4 text-muted-foreground" />
                        <span className="text-muted-foreground">Issuer:</span>
                        <span className="text-foreground">{i.issuer}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-muted-foreground">Purpose:</span>
                        <span className="text-foreground">{i.purpose}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-muted-foreground">Rating:</span>
                        <span className="text-foreground">{i.rating}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-muted-foreground">Issued:</span>
                        <span className="text-foreground">{i.issuedDate}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-muted-foreground">Expiry:</span>
                        <span className="text-foreground">{i.expiryDate}</span>
                      </div>
                    </div>
                  </div>

                  <div className="flex flex-col items-stretch gap-3 lg:w-56 lg:shrink-0">
                    <div className="rounded-lg border border-border bg-card p-3 text-sm">
                      <div className="flex items-center justify-between">
                        <span className="text-muted-foreground">Face Value</span>
                        <span className="font-semibold text-foreground">{formatFace(i)}</span>
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <Button
                        className="flex-1"
                        size="sm"
                        onClick={() => handleApproveInstrument(i)}
                      >
                        <Check className="mr-1 h-4 w-4" />
                        Approve
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        className="flex-1 border-destructive/30 text-destructive hover:bg-destructive/10 hover:text-destructive"
                        onClick={() => {
                          setRejectInstrumentReason("")
                          setRejectInstrumentTarget(i)
                        }}
                      >
                        <X className="mr-1 h-4 w-4" />
                        Reject
                      </Button>
                    </div>
                  </div>
                </div>
              </div>
            ))
          )}
        </CardContent>
      </Card>

      {/* Instrument decision history */}
      <Card className="bg-card border-border">
        <CardHeader>
          <CardTitle className="text-lg font-semibold">Instrument Decision History</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {decidedInstruments.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              No decisions yet. Approved and rejected instruments will appear here.
            </p>
          ) : (
            decidedInstruments.map((i) => (
              <div
                key={i.id}
                className="flex flex-col gap-2 rounded-lg border border-border p-3 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="flex items-center gap-3">
                  <Badge
                    variant="outline"
                    className={cn(
                      "text-[10px]",
                      i.status === "active"
                        ? "border-green-500/20 bg-green-500/10 text-green-500"
                        : "border-red-500/20 bg-red-500/10 text-red-500",
                    )}
                  >
                    {i.status === "active" ? (
                      <Check className="mr-1 h-3 w-3" />
                    ) : (
                      <X className="mr-1 h-3 w-3" />
                    )}
                    {i.status === "active" ? "Approved" : "Rejected"}
                  </Badge>
                  <div>
                    <p className="text-sm font-medium text-foreground">
                      {i.type} · {i.typeFull}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {i.id} · {formatTimestamp(i.decidedAt)}
                      {i.decisionNote ? ` · ${i.decisionNote}` : ""}
                    </p>
                  </div>
                </div>
                <span className="text-sm font-medium text-foreground">{formatFace(i)}</span>
              </div>
            ))
          )}
        </CardContent>
      </Card>

      {/* Pending PPP applications */}
      <Card className="bg-card border-border">
        <CardHeader>
          <CardTitle className="text-lg font-semibold">Pending Yield/PPP Applications</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {pendingPPP.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-2 py-10 text-center">
              <Check className="h-8 w-8 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">
                No pending Yield/PPP applications. All applications have been reviewed.
              </p>
            </div>
          ) : (
            pendingPPP.map((r) => (
              <div key={r.id} className="rounded-lg border border-border bg-secondary/30 p-4">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                  <div className="space-y-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge
                        variant="outline"
                        className="border-yellow-500/20 bg-yellow-500/10 text-yellow-500 text-[10px]"
                      >
                        <Clock className="mr-1 h-3 w-3" />
                        Pending
                      </Badge>
                      <span className="font-medium text-foreground">{r.programName}</span>
                      <span className="text-xs text-muted-foreground">{r.id}</span>
                      <span className="text-xs text-muted-foreground">
                        Submitted {formatTimestamp(r.submittedAt)}
                      </span>
                    </div>
                    <div className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
                      <div className="flex items-center gap-2">
                        <TrendingUp className="h-4 w-4 text-muted-foreground" />
                        <span className="text-muted-foreground">Expected Return:</span>
                        <span className="font-medium text-foreground">{r.expectedReturn}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <Clock className="h-4 w-4 text-muted-foreground" />
                        <span className="text-muted-foreground">Duration:</span>
                        <span className="text-foreground">{r.duration}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <FileText className="h-4 w-4 text-muted-foreground" />
                        <span className="text-muted-foreground">Source:</span>
                        <span className="text-foreground">{r.sourceOfFunds}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <Building2 className="h-4 w-4 text-muted-foreground" />
                        <span className="text-muted-foreground">Payout:</span>
                        <span className="text-foreground">{r.payoutAccount}</span>
                      </div>
                    </div>
                  </div>

                  <div className="flex flex-col items-stretch gap-3 lg:w-56 lg:shrink-0">
                    <div className="rounded-lg border border-border bg-card p-3 text-sm">
                      <div className="flex items-center justify-between">
                        <span className="text-muted-foreground">Investment</span>
                        <span className="font-semibold text-foreground">
                          {formatPPPAmount(r)}
                        </span>
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <Button className="flex-1" size="sm" onClick={() => handleApprovePPP(r)}>
                        <Check className="mr-1 h-4 w-4" />
                        Approve
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        className="flex-1 border-destructive/30 text-destructive hover:bg-destructive/10 hover:text-destructive"
                        onClick={() => {
                          setRejectPPPReason("")
                          setRejectPPPTarget(r)
                        }}
                      >
                        <X className="mr-1 h-4 w-4" />
                        Reject
                      </Button>
                    </div>
                  </div>
                </div>
              </div>
            ))
          )}
        </CardContent>
      </Card>

      {/* PPP decision history */}
      <Card className="bg-card border-border">
        <CardHeader>
          <CardTitle className="text-lg font-semibold">Yield/PPP Decision History</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {decidedPPP.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              No decisions yet. Approved and rejected applications will appear here.
            </p>
          ) : (
            decidedPPP.map((r) => (
              <div
                key={r.id}
                className="flex flex-col gap-2 rounded-lg border border-border p-3 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="flex items-center gap-3">
                  <Badge
                    variant="outline"
                    className={cn(
                      "text-[10px]",
                      r.status === "approved"
                        ? "border-green-500/20 bg-green-500/10 text-green-500"
                        : "border-red-500/20 bg-red-500/10 text-red-500",
                    )}
                  >
                    {r.status === "approved" ? (
                      <Check className="mr-1 h-3 w-3" />
                    ) : (
                      <X className="mr-1 h-3 w-3" />
                    )}
                    {r.status === "approved" ? "Approved" : "Rejected"}
                  </Badge>
                  <div>
                    <p className="text-sm font-medium text-foreground">{r.programName}</p>
                    <p className="text-xs text-muted-foreground">
                      {r.id} · {formatTimestamp(r.decidedAt)}
                      {r.decisionNote ? ` · ${r.decisionNote}` : ""}
                    </p>
                  </div>
                </div>
                <span className="text-sm font-medium text-foreground">{formatPPPAmount(r)}</span>
              </div>
            ))
          )}
        </CardContent>
      </Card>

      {/* Pending leverage requests */}
      <Card className="bg-card border-border">
        <CardHeader>
          <CardTitle className="text-lg font-semibold">Pending Leverage Requests</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {pendingLeverage.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-2 py-10 text-center">
              <Check className="h-8 w-8 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">
                No pending leverage requests. All trading lines have been reviewed.
              </p>
            </div>
          ) : (
            pendingLeverage.map((r) => (
              <div key={r.id} className="rounded-lg border border-border bg-secondary/30 p-4">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                  <div className="space-y-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge
                        variant="outline"
                        className="border-yellow-500/20 bg-yellow-500/10 text-yellow-500 text-[10px]"
                      >
                        <Clock className="mr-1 h-3 w-3" />
                        Pending
                      </Badge>
                      <span className="font-medium text-foreground">
                        {r.accountLabel} · 1:{r.leverageRatio}
                      </span>
                      <span className="text-xs text-muted-foreground">{r.id}</span>
                      <span className="text-xs text-muted-foreground">
                        Submitted {formatTimestamp(r.submittedAt)}
                      </span>
                    </div>
                    <div className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
                      <div className="flex items-center gap-2">
                        <Banknote className="h-4 w-4 text-muted-foreground" />
                        <span className="text-muted-foreground">Equity:</span>
                        <span className="font-medium text-foreground">
                          {formatLeverageMoney(r, r.equity)}
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <Gauge className="h-4 w-4 text-muted-foreground" />
                        <span className="text-muted-foreground">Leverage:</span>
                        <span className="text-foreground">1:{r.leverageRatio}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <TrendingUp className="h-4 w-4 text-muted-foreground" />
                        <span className="text-muted-foreground">Instrument:</span>
                        <span className="text-foreground">{r.instrumentType}</span>
                      </div>
                      {r.notes && (
                        <div className="flex items-center gap-2">
                          <FileText className="h-4 w-4 text-muted-foreground" />
                          <span className="text-muted-foreground">Notes:</span>
                          <span className="text-foreground">{r.notes}</span>
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="flex flex-col items-stretch gap-3 lg:w-64 lg:shrink-0">
                    <div className="space-y-1.5 rounded-lg border border-border bg-card p-3 text-sm">
                      <div className="flex items-center justify-between">
                        <span className="text-muted-foreground">Borrowed (credit on approve)</span>
                        <span className="font-semibold text-green-500">
                          +{formatLeverageMoney(r, r.borrowedAmount)}
                        </span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-muted-foreground">Buying Power</span>
                        <span className="font-semibold text-foreground">
                          {formatLeverageMoney(r, r.buyingPower)}
                        </span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-muted-foreground">Debit Interest</span>
                        <span className="text-foreground">{(r.interestRate * 100).toFixed(1)}% / yr</span>
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <Button className="flex-1" size="sm" onClick={() => handleApproveLeverage(r)}>
                        <Check className="mr-1 h-4 w-4" />
                        Approve
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        className="flex-1 border-destructive/30 text-destructive hover:bg-destructive/10 hover:text-destructive"
                        onClick={() => {
                          setRejectLeverageReason("")
                          setRejectLeverageTarget(r)
                        }}
                      >
                        <X className="mr-1 h-4 w-4" />
                        Reject
                      </Button>
                    </div>
                  </div>
                </div>
              </div>
            ))
          )}
        </CardContent>
      </Card>

      {/* Pending leverage switch-off requests */}
      <Card className="bg-card border-border">
        <CardHeader>
          <CardTitle className="text-lg font-semibold">Pending Leverage Switch-Off</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {pendingSwitchOff.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-2 py-10 text-center">
              <Check className="h-8 w-8 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">
                No pending switch-off requests. Active lines awaiting closure will appear here.
              </p>
            </div>
          ) : (
            pendingSwitchOff.map((r) => {
              const interest = accruedInterest(r, Date.now())
              const total = r.borrowedAmount + interest
              return (
                <div key={r.id} className="rounded-lg border border-border bg-secondary/30 p-4">
                  <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                    <div className="space-y-3">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge
                          variant="outline"
                          className="border-orange-500/20 bg-orange-500/10 text-orange-400 text-[10px]"
                        >
                          <Power className="mr-1 h-3 w-3" />
                          Switch-Off Requested
                        </Badge>
                        <span className="font-medium text-foreground">
                          {r.accountLabel} · 1:{r.leverageRatio}
                        </span>
                        <span className="text-xs text-muted-foreground">{r.id}</span>
                        <span className="text-xs text-muted-foreground">
                          Requested {formatTimestamp(r.switchOffRequestedAt)}
                        </span>
                      </div>
                      <div className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
                        <div className="flex items-center gap-2">
                          <Banknote className="h-4 w-4 text-muted-foreground" />
                          <span className="text-muted-foreground">Equity:</span>
                          <span className="font-medium text-foreground">
                            {formatLeverageMoney(r, r.equity)}
                          </span>
                        </div>
                        <div className="flex items-center gap-2">
                          <Gauge className="h-4 w-4 text-muted-foreground" />
                          <span className="text-muted-foreground">Activated:</span>
                          <span className="text-foreground">{formatTimestamp(r.activatedAt)}</span>
                        </div>
                      </div>
                    </div>

                    <div className="flex flex-col items-stretch gap-3 lg:w-64 lg:shrink-0">
                      <div className="space-y-1.5 rounded-lg border border-border bg-card p-3 text-sm">
                        <div className="flex items-center justify-between">
                          <span className="text-muted-foreground">Principal to repay</span>
                          <span className="font-semibold text-foreground">
                            {formatLeverageMoney(r, r.borrowedAmount)}
                          </span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="text-muted-foreground">Accrued interest</span>
                          <span className="font-semibold text-orange-400">
                            {formatLeverageMoney2(r, interest)}
                          </span>
                        </div>
                        <div className="flex items-center justify-between border-t border-border pt-1.5">
                          <span className="font-medium text-foreground">Total deducted</span>
                          <span className="font-bold text-foreground">
                            {formatLeverageMoney2(r, total)}
                          </span>
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <Button className="flex-1" size="sm" onClick={() => handleApproveSwitchOff(r)}>
                          <Power className="mr-1 h-4 w-4" />
                          Approve &amp; Settle
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          className="flex-1 border-destructive/30 text-destructive hover:bg-destructive/10 hover:text-destructive"
                          onClick={() => {
                            setRejectSwitchOffReason("")
                            setRejectSwitchOffTarget(r)
                          }}
                        >
                          <X className="mr-1 h-4 w-4" />
                          Reject
                        </Button>
                      </div>
                    </div>
                  </div>
                </div>
              )
            })
          )}
        </CardContent>
      </Card>

      {/* Leverage decision history */}
      <Card className="bg-card border-border">
        <CardHeader>
          <CardTitle className="text-lg font-semibold">Leverage Decision History</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {decidedLeverage.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              No decisions yet. Activated, closed and rejected leverage lines will appear here.
            </p>
          ) : (
            decidedLeverage.map((r) => {
              const badge =
                r.status === "approved"
                  ? { cls: "border-green-500/20 bg-green-500/10 text-green-500", icon: Check, label: "Activated" }
                  : r.status === "closed"
                    ? { cls: "border-border bg-secondary text-muted-foreground", icon: Power, label: "Closed" }
                    : { cls: "border-red-500/20 bg-red-500/10 text-red-500", icon: X, label: "Rejected" }
              const BadgeIcon = badge.icon
              return (
                <div
                  key={r.id}
                  className="flex flex-col gap-2 rounded-lg border border-border p-3 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="flex items-center gap-3">
                    <Badge variant="outline" className={cn("text-[10px]", badge.cls)}>
                      <BadgeIcon className="mr-1 h-3 w-3" />
                      {badge.label}
                    </Badge>
                    <div>
                      <p className="text-sm font-medium text-foreground">
                        {r.accountLabel} · 1:{r.leverageRatio}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {r.id} · {formatTimestamp(r.closedAt || r.decidedAt)}
                        {r.status === "closed"
                          ? ` · interest settled ${formatLeverageMoney2(r, r.settledInterest ?? 0)}`
                          : r.decisionNote
                            ? ` · ${r.decisionNote}`
                            : ""}
                      </p>
                    </div>
                  </div>
                  <span className="text-sm font-medium text-foreground">
                    {r.status === "closed"
                      ? formatLeverageMoney(r, r.borrowedAmount)
                      : formatLeverageMoney(r, r.buyingPower)}
                  </span>
                </div>
              )
            })
          )}
        </CardContent>
      </Card>

      {/* Pending Download of Funds */}
      <Card className="bg-card border-border">
        <CardHeader>
          <CardTitle className="text-lg font-semibold">
            Pending Download of Funds (Institutional)
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {pendingDOF.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-2 py-10 text-center">
              <Check className="h-8 w-8 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">
                No pending Download of Funds requests. All requests have been reviewed.
              </p>
            </div>
          ) : (
            pendingDOF.map((r) => (
              <div key={r.id} className="rounded-lg border border-border bg-secondary/30 p-4">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                  <div className="space-y-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge
                        variant="outline"
                        className="border-yellow-500/20 bg-yellow-500/10 text-yellow-500 text-[10px]"
                      >
                        <Clock className="mr-1 h-3 w-3" />
                        Pending
                      </Badge>
                      <Badge variant="outline" className="text-[10px]">
                        {r.settlementMethod}
                      </Badge>
                      <span className="font-medium text-foreground">{r.originatorName}</span>
                      <span className="text-xs text-muted-foreground">{r.id}</span>
                      <span className="text-xs text-muted-foreground">
                        Submitted {formatTimestamp(r.submittedAt)}
                      </span>
                    </div>
                    <div className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
                      <div className="flex items-center gap-2">
                        <Building2 className="h-4 w-4 text-muted-foreground" />
                        <span className="text-muted-foreground">Sending Bank:</span>
                        <span className="text-foreground">
                          {r.originatorBank} ({r.originatorBankBic})
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <Globe className="h-4 w-4 text-muted-foreground" />
                        <span className="text-muted-foreground">Correspondent:</span>
                        <span className="text-foreground">{r.correspondentBank}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <FileText className="h-4 w-4 text-muted-foreground" />
                        <span className="text-muted-foreground">MT103:</span>
                        <span className="text-foreground">{r.mt103Ref || "—"}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <FileText className="h-4 w-4 text-muted-foreground" />
                        <span className="text-muted-foreground">MT202:</span>
                        <span className="text-foreground">{r.mt202Ref || "—"}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <ShieldCheck className="h-4 w-4 text-muted-foreground" />
                        <span className="text-muted-foreground">POF / BCL:</span>
                        <span className="text-foreground">
                          {r.pofReference || "—"} / {r.bclReference || "—"}
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <Clock className="h-4 w-4 text-muted-foreground" />
                        <span className="text-muted-foreground">Value Date:</span>
                        <span className="text-foreground">{r.valueDate}</span>
                      </div>
                      {(r.isin || r.cusip) && (
                        <div className="flex items-center gap-2 sm:col-span-2">
                          <FileText className="h-4 w-4 text-muted-foreground" />
                          <span className="text-muted-foreground">Securities:</span>
                          <span className="text-foreground">
                            {r.isin ? `ISIN ${r.isin}` : ""}
                            {r.isin && r.cusip ? " · " : ""}
                            {r.cusip ? `CUSIP ${r.cusip}` : ""}
                          </span>
                        </div>
                      )}
                    </div>
                    <p className="font-mono text-xs text-muted-foreground break-all">
                      UETR {r.uetr}
                    </p>
                  </div>

                  <div className="flex flex-col items-stretch gap-3 lg:w-56 lg:shrink-0">
                    <div className="rounded-lg border border-border bg-card p-3 text-sm">
                      <div className="flex items-center justify-between">
                        <span className="text-muted-foreground">Amount</span>
                        <span className="font-semibold text-foreground">{formatDOFAmount(r)}</span>
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <Button className="flex-1" size="sm" onClick={() => handleApproveDOF(r)}>
                        <Check className="mr-1 h-4 w-4" />
                        Authorize
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        className="flex-1 border-destructive/30 text-destructive hover:bg-destructive/10 hover:text-destructive"
                        onClick={() => {
                          setRejectDOFReason("")
                          setRejectDOFTarget(r)
                        }}
                      >
                        <X className="mr-1 h-4 w-4" />
                        Reject
                      </Button>
                    </div>
                  </div>
                </div>
              </div>
            ))
          )}
        </CardContent>
      </Card>

      {/* Download of Funds decision history */}
      <Card className="bg-card border-border">
        <CardHeader>
          <CardTitle className="text-lg font-semibold">
            Download of Funds Decision History
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {decidedDOF.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              No decisions yet. Authorized and rejected requests will appear here.
            </p>
          ) : (
            decidedDOF.map((r) => (
              <div
                key={r.id}
                className="flex flex-col gap-2 rounded-lg border border-border p-3 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="flex items-center gap-3">
                  <Badge
                    variant="outline"
                    className={cn(
                      "text-[10px]",
                      r.status === "approved"
                        ? "border-green-500/20 bg-green-500/10 text-green-500"
                        : "border-red-500/20 bg-red-500/10 text-red-500",
                    )}
                  >
                    {r.status === "approved" ? (
                      <Check className="mr-1 h-3 w-3" />
                    ) : (
                      <X className="mr-1 h-3 w-3" />
                    )}
                    {r.status === "approved" ? "Authorized" : "Rejected"}
                  </Badge>
                  <div>
                    <p className="text-sm font-medium text-foreground">{r.originatorName}</p>
                    <p className="text-xs text-muted-foreground">
                      {r.id} · {formatTimestamp(r.decidedAt)}
                      {r.decisionNote ? ` · ${r.decisionNote}` : ""}
                    </p>
                  </div>
                </div>
                <span className="text-sm font-medium text-foreground">{formatDOFAmount(r)}</span>
              </div>
            ))
          )}
        </CardContent>
      </Card>

      {/* Pending Bank Instrument Monetization */}
      <Card className="bg-card border-border">
        <CardHeader>
          <CardTitle className="text-lg font-semibold">
            Pending Bank Instrument Monetization
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {pendingMonetization.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-2 py-10 text-center">
              <Check className="h-8 w-8 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">
                No pending monetization requests. All requests have been reviewed.
              </p>
            </div>
          ) : (
            pendingMonetization.map((r) => (
              <div key={r.id} className="rounded-lg border border-border bg-secondary/30 p-4">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                  <div className="space-y-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge
                        variant="outline"
                        className="border-yellow-500/20 bg-yellow-500/10 text-yellow-500 text-[10px]"
                      >
                        <Clock className="mr-1 h-3 w-3" />
                        Pending
                      </Badge>
                      <Badge variant="outline" className="text-[10px]">
                        {r.instrumentType}
                      </Badge>
                      <Badge variant="outline" className="text-[10px]">
                        {MONETIZATION_STRUCTURE_LABELS[r.structure]}
                      </Badge>
                      <span className="font-medium text-foreground">{r.instrumentId}</span>
                      <span className="text-xs text-muted-foreground">{r.id}</span>
                      <span className="text-xs text-muted-foreground">
                        Submitted {formatTimestamp(r.submittedAt)}
                      </span>
                    </div>
                    <div className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
                      <div className="flex items-center gap-2">
                        <Building2 className="h-4 w-4 text-muted-foreground" />
                        <span className="text-muted-foreground">Issuer:</span>
                        <span className="text-foreground">{r.issuer}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <FileText className="h-4 w-4 text-muted-foreground" />
                        <span className="text-muted-foreground">Face Value:</span>
                        <span className="text-foreground">
                          {formatCurrency(r.faceValue, r.currency)}
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <FileText className="h-4 w-4 text-muted-foreground" />
                        <span className="text-muted-foreground">Advance Rate:</span>
                        <span className="text-foreground">{r.advanceRatePercent}% LTV</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <Globe className="h-4 w-4 text-muted-foreground" />
                        <span className="text-muted-foreground">Monetizer:</span>
                        <span className="text-foreground">{r.monetizationPlatform || "—"}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <FileText className="h-4 w-4 text-muted-foreground" />
                        <span className="text-muted-foreground">MT760 / MT799:</span>
                        <span className="text-foreground">
                          {r.mt760Ref || "—"} / {r.mt799Ref || "—"}
                        </span>
                        {(r.mt760Raw || r.mt799Raw) && (
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="h-6 px-2 text-xs"
                            onClick={() => setSwiftViewTarget(r)}
                          >
                            Inspect FIN
                          </Button>
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        <ShieldCheck className="h-4 w-4 text-muted-foreground" />
                        <span className="text-muted-foreground">POF / BCL:</span>
                        <span className="text-foreground">
                          {r.pofReference || "—"} / {r.bclReference || "—"}
                        </span>
                      </div>
                    </div>
                    <p className="font-mono text-xs text-muted-foreground break-all">
                      UETR {r.uetr}
                    </p>
                  </div>

                  <div className="flex flex-col items-stretch gap-3 lg:w-56 lg:shrink-0">
                    <div className="rounded-lg border border-border bg-card p-3 text-sm">
                      <div className="flex items-center justify-between">
                        <span className="text-muted-foreground">Proceeds</span>
                        <span className="font-semibold text-foreground">
                          {formatMonetizationProceeds(r)}
                        </span>
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <Button
                        className="flex-1"
                        size="sm"
                        onClick={() => handleApproveMonetization(r)}
                      >
                        <Check className="mr-1 h-4 w-4" />
                        Authorize
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        className="flex-1 border-destructive/30 text-destructive hover:bg-destructive/10 hover:text-destructive"
                        onClick={() => {
                          setRejectMonetizationReason("")
                          setRejectMonetizationTarget(r)
                        }}
                      >
                        <X className="mr-1 h-4 w-4" />
                        Reject
                      </Button>
                    </div>
                  </div>
                </div>
              </div>
            ))
          )}
        </CardContent>
      </Card>

      {/* Monetization decision history */}
      <Card className="bg-card border-border">
        <CardHeader>
          <CardTitle className="text-lg font-semibold">
            Monetization Decision History
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {decidedMonetization.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              No decisions yet. Authorized and rejected requests will appear here.
            </p>
          ) : (
            decidedMonetization.map((r) => (
              <div
                key={r.id}
                className="flex flex-col gap-2 rounded-lg border border-border p-3 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="flex items-center gap-3">
                  <Badge
                    variant="outline"
                    className={cn(
                      "text-[10px]",
                      r.status === "approved"
                        ? "border-green-500/20 bg-green-500/10 text-green-500"
                        : "border-red-500/20 bg-red-500/10 text-red-500",
                    )}
                  >
                    {r.status === "approved" ? (
                      <Check className="mr-1 h-3 w-3" />
                    ) : (
                      <X className="mr-1 h-3 w-3" />
                    )}
                    {r.status === "approved" ? "Authorized" : "Rejected"}
                  </Badge>
                  <div>
                    <p className="text-sm font-medium text-foreground">{r.instrumentId}</p>
                    <p className="text-xs text-muted-foreground">
                      {r.id} · {formatTimestamp(r.decidedAt)}
                      {r.decisionNote ? ` · ${r.decisionNote}` : ""}
                    </p>
                  </div>
                </div>
                <span className="text-sm font-medium text-foreground">
                  {formatMonetizationProceeds(r)}
                </span>
              </div>
            ))
          )}
        </CardContent>
      </Card>

      {/* Pending Securities Settlement (DTC / Euroclear) */}
      <Card className="bg-card border-border">
        <CardHeader>
          <CardTitle className="text-lg font-semibold">
            Pending Securities Settlement (DTC / Euroclear)
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {pendingDTC.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-2 py-10 text-center">
              <Check className="h-8 w-8 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">
                No pending securities settlement instructions. All have been reviewed.
              </p>
            </div>
          ) : (
            pendingDTC.map((r) => (
              <div key={r.id} className="rounded-lg border border-border bg-secondary/30 p-4">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                  <div className="space-y-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge
                        variant="outline"
                        className="border-yellow-500/20 bg-yellow-500/10 text-yellow-500 text-[10px]"
                      >
                        <Clock className="mr-1 h-3 w-3" />
                        Pending
                      </Badge>
                      <Badge variant="outline" className="text-[10px]">
                        {r.depository}
                      </Badge>
                      <Badge variant="outline" className="text-[10px]">
                        {r.direction === "deliver" ? "Deliver" : "Receive"} · {r.settlementBasis}
                      </Badge>
                      <span className="font-medium text-foreground">{r.securityName}</span>
                      <span className="text-xs text-muted-foreground">{r.id}</span>
                      <span className="text-xs text-muted-foreground">
                        Submitted {formatTimestamp(r.submittedAt)}
                      </span>
                    </div>
                    <div className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
                      <div className="flex items-center gap-2">
                        <FileText className="h-4 w-4 text-muted-foreground" />
                        <span className="text-muted-foreground">ISIN:</span>
                        <span className="text-foreground">{r.isin}</span>
                      </div>
                      {r.cusip && (
                        <div className="flex items-center gap-2">
                          <FileText className="h-4 w-4 text-muted-foreground" />
                          <span className="text-muted-foreground">CUSIP:</span>
                          <span className="text-foreground">{r.cusip}</span>
                        </div>
                      )}
                      <div className="flex items-center gap-2">
                        <Layers className="h-4 w-4 text-muted-foreground" />
                        <span className="text-muted-foreground">Quantity:</span>
                        <span className="text-foreground">{r.quantity.toLocaleString()}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <Building2 className="h-4 w-4 text-muted-foreground" />
                        <span className="text-muted-foreground">Counterparty:</span>
                        <span className="text-foreground">{r.counterpartyName}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <Building2 className="h-4 w-4 text-muted-foreground" />
                        <span className="text-muted-foreground">
                          {r.depository === "DTC" ? "Participant #" : "Euroclear Acct"}:
                        </span>
                        <span className="text-foreground">{r.participantNumber}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <Clock className="h-4 w-4 text-muted-foreground" />
                        <span className="text-muted-foreground">Settlement Date:</span>
                        <span className="text-foreground">{r.valueDate}</span>
                      </div>
                      {r.mt54xRef && (
                        <div className="flex items-center gap-2">
                          <FileText className="h-4 w-4 text-muted-foreground" />
                          <span className="text-muted-foreground">MT540–543:</span>
                          <span className="text-foreground">{r.mt54xRef}</span>
                        </div>
                      )}
                    </div>
                    <p className="font-mono text-xs text-muted-foreground break-all">
                      UETR {r.uetr}
                    </p>
                  </div>

                  <div className="flex flex-col items-stretch gap-3 lg:w-56 lg:shrink-0">
                    <div className="rounded-lg border border-border bg-card p-3 text-sm">
                      <div className="flex items-center justify-between">
                        <span className="text-muted-foreground">Cash Leg</span>
                        <span className="font-semibold text-foreground">{formatDTCCash(r)}</span>
                      </div>
                      {r.settlementBasis === "DVP" && (
                        <p className="mt-1 text-xs text-muted-foreground">
                          {r.direction === "deliver"
                            ? "Will credit master account"
                            : "Will debit master account"}
                        </p>
                      )}
                    </div>
                    <div className="flex gap-2">
                      <Button className="flex-1" size="sm" onClick={() => handleApproveDTC(r)}>
                        <Check className="mr-1 h-4 w-4" />
                        Authorize
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        className="flex-1 border-destructive/30 text-destructive hover:bg-destructive/10 hover:text-destructive"
                        onClick={() => {
                          setRejectDTCReason("")
                          setRejectDTCTarget(r)
                        }}
                      >
                        <X className="mr-1 h-4 w-4" />
                        Reject
                      </Button>
                    </div>
                  </div>
                </div>
              </div>
            ))
          )}
        </CardContent>
      </Card>

      {/* Securities Settlement decision history */}
      <Card className="bg-card border-border">
        <CardHeader>
          <CardTitle className="text-lg font-semibold">
            Securities Settlement Decision History
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {decidedDTC.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              No decisions yet. Settled and rejected instructions will appear here.
            </p>
          ) : (
            decidedDTC.map((r) => (
              <div
                key={r.id}
                className="flex flex-col gap-2 rounded-lg border border-border p-3 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="flex items-center gap-3">
                  <Badge
                    variant="outline"
                    className={cn(
                      "text-[10px]",
                      r.status === "approved"
                        ? "border-green-500/20 bg-green-500/10 text-green-500"
                        : "border-red-500/20 bg-red-500/10 text-red-500",
                    )}
                  >
                    {r.status === "approved" ? (
                      <Check className="mr-1 h-3 w-3" />
                    ) : (
                      <X className="mr-1 h-3 w-3" />
                    )}
                    {r.status === "approved" ? "Settled" : "Rejected"}
                  </Badge>
                  <div>
                    <p className="text-sm font-medium text-foreground">
                      {r.securityName}{" "}
                      <span className="text-xs text-muted-foreground">({r.depository})</span>
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {r.id} · {formatTimestamp(r.decidedAt)}
                      {r.decisionNote ? ` · ${r.decisionNote}` : ""}
                    </p>
                  </div>
                </div>
                <span className="text-sm font-medium text-foreground">{formatDTCCash(r)}</span>
              </div>
            ))
          )}
        </CardContent>
      </Card>

      {/* Pending Euroclear Settlement (MT540-543) */}
      <Card className="bg-card border-border">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg font-semibold">
            <Landmark className="h-5 w-5 text-primary" />
            Pending Euroclear Settlement
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {pendingEuroclear.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-2 py-10 text-center">
              <Check className="h-8 w-8 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">
                No pending Euroclear settlement instructions. All have been reviewed.
              </p>
            </div>
          ) : (
            pendingEuroclear.map((r) => {
              const mt =
                r.direction === "deliver"
                  ? r.settlementBasis === "DVP"
                    ? "543"
                    : "542"
                  : r.settlementBasis === "DVP"
                    ? "541"
                    : "540"
              return (
                <div key={r.id} className="rounded-lg border border-border bg-secondary/30 p-4">
                  <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                    <div className="space-y-3">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge
                          variant="outline"
                          className="border-yellow-500/20 bg-yellow-500/10 text-yellow-500 text-[10px]"
                        >
                          <Clock className="mr-1 h-3 w-3" />
                          Pending
                        </Badge>
                        <Badge variant="outline" className="text-[10px]">
                          Euroclear
                        </Badge>
                        <Badge variant="outline" className="text-[10px]">
                          MT{mt}
                        </Badge>
                        <Badge variant="outline" className="text-[10px]">
                          {r.direction === "deliver" ? "Deliver" : "Receive"} · {r.settlementBasis}
                        </Badge>
                        <span className="font-medium text-foreground">{r.securityName}</span>
                        <span className="text-xs text-muted-foreground">{r.id}</span>
                        <span className="text-xs text-muted-foreground">
                          Submitted {formatTimestamp(r.submittedAt)}
                        </span>
                      </div>
                      <div className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
                        <div className="flex items-center gap-2">
                          <FileText className="h-4 w-4 text-muted-foreground" />
                          <span className="text-muted-foreground">ISIN:</span>
                          <span className="text-foreground">{r.isin}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <Layers className="h-4 w-4 text-muted-foreground" />
                          <span className="text-muted-foreground">Quantity:</span>
                          <span className="text-foreground">{r.quantity.toLocaleString()}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <Building2 className="h-4 w-4 text-muted-foreground" />
                          <span className="text-muted-foreground">Counterparty:</span>
                          <span className="text-foreground">{r.counterpartyName}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <Building2 className="h-4 w-4 text-muted-foreground" />
                          <span className="text-muted-foreground">Euroclear Acct:</span>
                          <span className="text-foreground">{r.euroclearAccount}</span>
                        </div>
                        {r.custodianBank && (
                          <div className="flex items-center gap-2">
                            <Building2 className="h-4 w-4 text-muted-foreground" />
                            <span className="text-muted-foreground">Custodian:</span>
                            <span className="text-foreground">{r.custodianBank}</span>
                          </div>
                        )}
                        <div className="flex items-center gap-2">
                          <Clock className="h-4 w-4 text-muted-foreground" />
                          <span className="text-muted-foreground">Settlement Date:</span>
                          <span className="text-foreground">{r.valueDate}</span>
                        </div>
                        {r.mt54xRef && (
                          <div className="flex items-center gap-2">
                            <FileText className="h-4 w-4 text-muted-foreground" />
                            <span className="text-muted-foreground">MT54x Ref:</span>
                            <span className="text-foreground">{r.mt54xRef}</span>
                          </div>
                        )}
                      </div>
                      <p className="font-mono text-xs text-muted-foreground break-all">
                        UETR {r.uetr}
                      </p>
                    </div>

                    <div className="flex flex-col items-stretch gap-3 lg:w-56 lg:shrink-0">
                      <div className="rounded-lg border border-border bg-card p-3 text-sm">
                        <div className="flex items-center justify-between">
                          <span className="text-muted-foreground">Cash Leg</span>
                          <span className="font-semibold text-foreground">
                            {formatEuroclearCash(r)}
                          </span>
                        </div>
                        {r.settlementBasis === "DVP" && (
                          <p className="mt-1 text-xs text-muted-foreground">
                            {r.direction === "deliver"
                              ? "Will credit master account"
                              : "Will debit master account"}
                          </p>
                        )}
                      </div>
                      <div className="flex gap-2">
                        <Button
                          className="flex-1"
                          size="sm"
                          onClick={() => handleApproveEuroclear(r)}
                        >
                          <Check className="mr-1 h-4 w-4" />
                          Authorize
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          className="flex-1 border-destructive/30 text-destructive hover:bg-destructive/10 hover:text-destructive"
                          onClick={() => {
                            setRejectEuroclearReason("")
                            setRejectEuroclearTarget(r)
                          }}
                        >
                          <X className="mr-1 h-4 w-4" />
                          Reject
                        </Button>
                      </div>
                    </div>
                  </div>
                </div>
              )
            })
          )}
        </CardContent>
      </Card>

      {/* Euroclear Settlement decision history */}
      <Card className="bg-card border-border">
        <CardHeader>
          <CardTitle className="text-lg font-semibold">
            Euroclear Settlement Decision History
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {decidedEuroclear.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              No decisions yet. Settled and rejected instructions will appear here.
            </p>
          ) : (
            decidedEuroclear.map((r) => (
              <div
                key={r.id}
                className="flex flex-col gap-2 rounded-lg border border-border p-3 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="flex items-center gap-3">
                  <Badge
                    variant="outline"
                    className={cn(
                      "text-[10px]",
                      r.status === "approved"
                        ? "border-green-500/20 bg-green-500/10 text-green-500"
                        : "border-red-500/20 bg-red-500/10 text-red-500",
                    )}
                  >
                    {r.status === "approved" ? (
                      <Check className="mr-1 h-3 w-3" />
                    ) : (
                      <X className="mr-1 h-3 w-3" />
                    )}
                    {r.status === "approved" ? "Settled" : "Rejected"}
                  </Badge>
                  <div>
                    <p className="text-sm font-medium text-foreground">
                      {r.securityName}{" "}
                      <span className="text-xs text-muted-foreground">(Euroclear · {r.isin})</span>
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {r.id} · {formatTimestamp(r.decidedAt)}
                      {r.decisionNote ? ` · ${r.decisionNote}` : ""}
                    </p>
                  </div>
                </div>
                <span className="text-sm font-medium text-foreground">
                  {formatEuroclearCash(r)}
                </span>
              </div>
            ))
          )}
        </CardContent>
      </Card>

      {/* Pending Commodity Deals (POP / POF review + execution authorization) */}
      <Card className="bg-card border-border">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg font-semibold">
            <Ship className="h-5 w-5 text-primary" />
            Pending Commodity Deals
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {pendingDeals.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-2 py-10 text-center">
              <Check className="h-8 w-8 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">
                No pending commodity deals. All have been reviewed.
              </p>
            </div>
          ) : (
            pendingDeals.map((deal) => {
              const popDocs = deal.documents.filter((d) => d.module === "POP")
              const pofDocs = deal.documents.filter((d) => d.module === "POF")
              const renderDoc = (doc: DealDocument) => {
                const latest = doc.versions[doc.versions.length - 1]
                return (
                  <div
                    key={doc.id}
                    className="flex flex-col gap-2 rounded-md border border-border bg-card p-3 sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div className="space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge
                          variant="outline"
                          className={cn(
                            "text-[10px]",
                            doc.status === "verified"
                              ? "border-green-500/20 bg-green-500/10 text-green-500"
                              : doc.status === "rejected"
                                ? "border-red-500/20 bg-red-500/10 text-red-500"
                                : "border-blue-500/20 bg-blue-500/10 text-blue-500",
                          )}
                        >
                          {doc.status === "verified"
                            ? "Verified"
                            : doc.status === "rejected"
                              ? "Rejected"
                              : "Submitted"}
                        </Badge>
                        <span className="text-sm font-medium text-foreground">{doc.docType}</span>
                        <Badge variant="outline" className="text-[10px]">
                          v{doc.currentVersion}
                        </Badge>
                        {doc.swiftRef && (
                          <Badge variant="outline" className="text-[10px]">
                            SWIFT {doc.swiftRef}
                          </Badge>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {latest?.fileName}
                        {latest?.reference ? ` · ${latest.reference}` : ""}
                        {latest?.issuedBy ? ` · ${latest.issuedBy}` : ""}
                        {latest?.issueDate ? ` · ${latest.issueDate}` : ""}
                      </p>
                    </div>
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-8 border-green-500/30 text-green-600 hover:bg-green-500/10"
                        disabled={doc.status === "verified"}
                        onClick={() => handleVerifyDoc(deal, doc)}
                      >
                        <Check className="mr-1 h-3.5 w-3.5" />
                        Verify
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-8 border-destructive/30 text-destructive hover:bg-destructive/10 hover:text-destructive"
                        disabled={doc.status === "rejected"}
                        onClick={() => {
                          setRejectDocReason("")
                          setRejectDocTarget({ deal, doc })
                        }}
                      >
                        <X className="mr-1 h-3.5 w-3.5" />
                        Reject
                      </Button>
                    </div>
                  </div>
                )
              }
              return (
                <div key={deal.id} className="rounded-lg border border-border bg-secondary/30 p-4">
                  <div className="flex flex-col gap-4">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge
                        variant="outline"
                        className="border-yellow-500/20 bg-yellow-500/10 text-yellow-500 text-[10px]"
                      >
                        <Clock className="mr-1 h-3 w-3" />
                        Pending
                      </Badge>
                      <Badge variant="outline" className="text-[10px]">
                        {deal.category}
                      </Badge>
                      <Badge variant="outline" className="text-[10px]">
                        {deal.tradeStructure} · {deal.instrumentType}
                      </Badge>
                      <Badge variant="outline" className="text-[10px]">
                        Stage: {DEAL_STAGES.find((s) => s.key === deal.stage)?.label}
                      </Badge>
                      <span className="font-medium text-foreground">{deal.title}</span>
                      <span className="text-xs text-muted-foreground">{deal.id}</span>
                      <span className="text-xs text-muted-foreground">
                        Submitted {formatTimestamp(deal.submittedAt)}
                      </span>
                    </div>

                    <div className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2 lg:grid-cols-3">
                      <div className="flex items-center gap-2">
                        <Banknote className="h-4 w-4 text-muted-foreground" />
                        <span className="text-muted-foreground">Value:</span>
                        <span className="text-foreground">
                          {formatCurrency(deal.approxValue, deal.currency)}
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <Package className="h-4 w-4 text-muted-foreground" />
                        <span className="text-muted-foreground">Commodity:</span>
                        <span className="text-foreground">
                          {deal.commodity || "—"} {deal.quantity ? `(${deal.quantity})` : ""}
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <Globe className="h-4 w-4 text-muted-foreground" />
                        <span className="text-muted-foreground">Route:</span>
                        <span className="text-foreground">
                          {deal.originCountry || "—"} → {deal.destinationCountry || "—"}
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <Building2 className="h-4 w-4 text-muted-foreground" />
                        <span className="text-muted-foreground">Buyer:</span>
                        <span className="text-foreground">{deal.buyerName}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <Building2 className="h-4 w-4 text-muted-foreground" />
                        <span className="text-muted-foreground">Seller:</span>
                        <span className="text-foreground">{deal.sellerName}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <Globe className="h-4 w-4 text-muted-foreground" />
                        <span className="text-muted-foreground">Banks:</span>
                        <span className="text-foreground">
                          {deal.sendingBankBic || deal.sendingBank || "—"} →{" "}
                          {deal.receivingBankBic || deal.receivingBank || "—"}
                        </span>
                      </div>
                    </div>

                    {(deal.mt103Ref || deal.mt202Ref || deal.mt799Ref) && (
                      <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
                        {deal.mt103Ref && <span>MT103: {deal.mt103Ref}</span>}
                        {deal.mt202Ref && <span>· MT202: {deal.mt202Ref}</span>}
                        {deal.mt799Ref && <span>· MT799: {deal.mt799Ref}</span>}
                      </div>
                    )}

                    {deal.notes && (
                      <p className="rounded-md border border-border bg-card p-2 text-xs text-muted-foreground text-pretty">
                        {deal.notes}
                      </p>
                    )}

                    <p className="font-mono text-xs text-muted-foreground break-all">UETR {deal.uetr}</p>

                    {/* POP documents */}
                    <div className="space-y-2">
                      <p className="flex items-center gap-1.5 text-sm font-medium text-foreground">
                        <Package className="h-4 w-4 text-primary" />
                        Proof of Product ({popDocs.length})
                      </p>
                      {popDocs.length === 0 ? (
                        <p className="text-xs text-muted-foreground">No POP documents submitted.</p>
                      ) : (
                        <div className="space-y-2">{popDocs.map(renderDoc)}</div>
                      )}
                    </div>

                    {/* POF documents */}
                    <div className="space-y-2">
                      <p className="flex items-center gap-1.5 text-sm font-medium text-foreground">
                        <Banknote className="h-4 w-4 text-primary" />
                        Proof of Funds ({pofDocs.length})
                      </p>
                      {pofDocs.length === 0 ? (
                        <p className="text-xs text-muted-foreground">No POF documents submitted.</p>
                      ) : (
                        <div className="space-y-2">{pofDocs.map(renderDoc)}</div>
                      )}
                    </div>

                    <div className="flex flex-wrap gap-2 border-t border-border pt-3">
                      <Button size="sm" onClick={() => handleApproveDeal(deal)}>
                        <Check className="mr-1 h-4 w-4" />
                        Authorize Execution
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        className="border-destructive/30 text-destructive hover:bg-destructive/10 hover:text-destructive"
                        onClick={() => {
                          setRejectDealReason("")
                          setRejectDealTarget(deal)
                        }}
                      >
                        <X className="mr-1 h-4 w-4" />
                        Reject Deal
                      </Button>
                    </div>
                  </div>
                </div>
              )
            })
          )}
        </CardContent>
      </Card>

      {/* Commodity deal decision history */}
      <Card className="bg-card border-border">
        <CardHeader>
          <CardTitle className="text-lg font-semibold">Commodity Deal Decision History</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {decidedDeals.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              No decisions yet. Authorized and rejected deals will appear here.
            </p>
          ) : (
            decidedDeals.map((deal) => (
              <div
                key={deal.id}
                className="flex flex-col gap-2 rounded-lg border border-border p-3 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="flex items-center gap-3">
                  <Badge
                    variant="outline"
                    className={cn(
                      "text-[10px]",
                      deal.status === "approved"
                        ? "border-green-500/20 bg-green-500/10 text-green-500"
                        : "border-red-500/20 bg-red-500/10 text-red-500",
                    )}
                  >
                    {deal.status === "approved" ? (
                      <Check className="mr-1 h-3 w-3" />
                    ) : (
                      <X className="mr-1 h-3 w-3" />
                    )}
                    {deal.status === "approved" ? "Authorized" : "Rejected"}
                  </Badge>
                  <div>
                    <p className="text-sm font-medium text-foreground">
                      {deal.title}{" "}
                      <span className="text-xs text-muted-foreground">({deal.category})</span>
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {deal.id} · {formatTimestamp(deal.decidedAt)}
                      {deal.decisionNote ? ` · ${deal.decisionNote}` : ""}
                    </p>
                  </div>
                </div>
                <span className="text-sm font-medium text-foreground">
                  {formatCurrency(deal.approxValue, deal.currency)}
                </span>
              </div>
            ))
          )}
        </CardContent>
      </Card>

      {/* Payment Gateway administration */}
      <AdminGatewaySection />

      {/* Automated payment reconciliation engine */}
      <AdminReconciliationSection />

      {/* Treasury Services: security deposits & approved 1:10 leverage */}
      <TreasuryManager />

      {/* Danger zone: reset account data */}
      <Card className="border-destructive/30 bg-destructive/5">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg font-semibold text-destructive">
            <AlertTriangle className="h-5 w-5" />
            Danger Zone
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="space-y-1">
              <p className="text-sm font-medium text-foreground">Reset Account Data</p>
              <p className="text-sm text-muted-foreground text-pretty">
                Permanently restore this account to a brand-new state: all balances set to 0.00 and
                every transaction, payment request, bank instrument, Yield/PPP application, and
                beneficiary deleted. This cannot be undone.
              </p>
            </div>
            <Button
              variant="destructive"
              className="shrink-0"
              onClick={() => {
                setResetConfirm("")
                setResetDialogOpen(true)
              }}
            >
              <Trash2 className="mr-2 h-4 w-4" />
              Reset Account
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Reset confirmation dialog */}
      <Dialog
        open={resetDialogOpen}
        onOpenChange={(open) => {
          if (!resetting) setResetDialogOpen(open)
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Reset account to brand-new state?</DialogTitle>
            <DialogDescription>
              This permanently deletes all balances, transactions, payment requests, bank
              instruments, Yield/PPP applications, and beneficiaries. The account will behave exactly
              like a newly created platform account.
            </DialogDescription>
          </DialogHeader>
          <div className="flex items-start gap-2 rounded-lg border border-destructive/20 bg-destructive/5 p-3">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
            <p className="text-xs text-muted-foreground text-pretty">
              This action cannot be undone. Type <span className="font-semibold text-foreground">RESET</span>{" "}
              below to confirm.
            </p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="reset-confirm">Confirmation</Label>
            <Input
              id="reset-confirm"
              value={resetConfirm}
              onChange={(e) => setResetConfirm(e.target.value)}
              placeholder="Type RESET to confirm"
              autoComplete="off"
            />
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setResetDialogOpen(false)}
              disabled={resetting}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleResetAccount}
              disabled={resetConfirm.trim().toUpperCase() !== "RESET" || resetting}
            >
              <Trash2 className="mr-2 h-4 w-4" />
              {resetting ? "Resetting…" : "Reset Account"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Reject dialog */}
      <Dialog open={!!rejectTarget} onOpenChange={(open) => !open && setRejectTarget(null)}>
        <DialogContent className="sm:max-w-md">
          {rejectTarget && (
            <>
              <DialogHeader>
                <DialogTitle>Reject Payment Request</DialogTitle>
                <DialogDescription>
                  Reject the payment of {formatCurrency(rejectTarget.amount, rejectTarget.currency)} to{" "}
                  {rejectTarget.beneficiary}. No funds will be moved.
                </DialogDescription>
              </DialogHeader>
              <div className="flex items-start gap-2 rounded-lg border border-destructive/20 bg-destructive/5 p-3">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
                <p className="text-xs text-muted-foreground text-pretty">
                  This action cannot be undone. The customer will see the request marked as rejected.
                </p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="reject-reason">Reason (optional)</Label>
                <Textarea
                  id="reject-reason"
                  value={rejectReason}
                  onChange={(e) => setRejectReason(e.target.value)}
                  placeholder="e.g. Beneficiary details could not be verified."
                  rows={3}
                />
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setRejectTarget(null)}>
                  Cancel
                </Button>
                <Button variant="destructive" onClick={confirmReject}>
                  Reject Payment
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* Reject instrument dialog */}
      <Dialog
        open={!!rejectInstrumentTarget}
        onOpenChange={(open) => !open && setRejectInstrumentTarget(null)}
      >
        <DialogContent className="sm:max-w-md">
          {rejectInstrumentTarget && (
            <>
              <DialogHeader>
                <DialogTitle>Reject Instrument Request</DialogTitle>
                <DialogDescription>
                  Reject the {rejectInstrumentTarget.type} request {rejectInstrumentTarget.id} (
                  {formatFace(rejectInstrumentTarget)}). The instrument will not be issued.
                </DialogDescription>
              </DialogHeader>
              <div className="flex items-start gap-2 rounded-lg border border-destructive/20 bg-destructive/5 p-3">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
                <p className="text-xs text-muted-foreground text-pretty">
                  This action cannot be undone. The customer will see the request marked as rejected.
                </p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="reject-instrument-reason">Reason (optional)</Label>
                <Textarea
                  id="reject-instrument-reason"
                  value={rejectInstrumentReason}
                  onChange={(e) => setRejectInstrumentReason(e.target.value)}
                  placeholder="e.g. Instrument details could not be verified."
                  rows={3}
                />
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setRejectInstrumentTarget(null)}>
                  Cancel
                </Button>
                <Button variant="destructive" onClick={confirmRejectInstrument}>
                  Reject Instrument
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* Reject PPP dialog */}
      <Dialog open={!!rejectPPPTarget} onOpenChange={(open) => !open && setRejectPPPTarget(null)}>
        <DialogContent className="sm:max-w-md">
          {rejectPPPTarget && (
            <>
              <DialogHeader>
                <DialogTitle>Reject Yield/PPP Application</DialogTitle>
                <DialogDescription>
                  Reject the {rejectPPPTarget.programName} application {rejectPPPTarget.id} (
                  {formatPPPAmount(rejectPPPTarget)}). The program will not be executed.
                </DialogDescription>
              </DialogHeader>
              <div className="flex items-start gap-2 rounded-lg border border-destructive/20 bg-destructive/5 p-3">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
                <p className="text-xs text-muted-foreground text-pretty">
                  This action cannot be undone. The customer will see the application marked as
                  rejected.
                </p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="reject-ppp-reason">Reason (optional)</Label>
                <Textarea
                  id="reject-ppp-reason"
                  value={rejectPPPReason}
                  onChange={(e) => setRejectPPPReason(e.target.value)}
                  placeholder="e.g. Source of funds could not be verified."
                  rows={3}
                />
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setRejectPPPTarget(null)}>
                  Cancel
                </Button>
                <Button variant="destructive" onClick={confirmRejectPPP}>
                  Reject Application
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* Reject leverage switch-off dialog */}
      <Dialog
        open={!!rejectSwitchOffTarget}
        onOpenChange={(open) => !open && setRejectSwitchOffTarget(null)}
      >
        <DialogContent className="sm:max-w-md">
          {rejectSwitchOffTarget && (
            <>
              <DialogHeader>
                <DialogTitle>Reject Switch-Off Request</DialogTitle>
                <DialogDescription>
                  Decline the switch-off of line {rejectSwitchOffTarget.id} (
                  {rejectSwitchOffTarget.accountLabel} 1:{rejectSwitchOffTarget.leverageRatio}). The line
                  stays active and debit interest keeps accruing.
                </DialogDescription>
              </DialogHeader>
              <div className="flex items-start gap-2 rounded-lg border border-destructive/20 bg-destructive/5 p-3">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
                <p className="text-xs text-muted-foreground text-pretty">
                  No funds will be moved. The customer will see the line return to active status.
                </p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="reject-switchoff-reason">Reason (optional)</Label>
                <Textarea
                  id="reject-switchoff-reason"
                  value={rejectSwitchOffReason}
                  onChange={(e) => setRejectSwitchOffReason(e.target.value)}
                  placeholder="e.g. Outstanding positions must be closed before the line can be unwound."
                  rows={3}
                />
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setRejectSwitchOffTarget(null)}>
                  Cancel
                </Button>
                <Button variant="destructive" onClick={confirmRejectSwitchOff}>
                  Reject Switch-Off
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* Reject leverage dialog */}
      <Dialog
        open={!!rejectLeverageTarget}
        onOpenChange={(open) => !open && setRejectLeverageTarget(null)}
      >
        <DialogContent className="sm:max-w-md">
          {rejectLeverageTarget && (
            <>
              <DialogHeader>
                <DialogTitle>Reject Leverage Request</DialogTitle>
                <DialogDescription>
                  Reject the {rejectLeverageTarget.accountLabel} 1:{rejectLeverageTarget.leverageRatio}{" "}
                  line {rejectLeverageTarget.id} (
                  {formatLeverageMoney(rejectLeverageTarget, rejectLeverageTarget.buyingPower)} buying
                  power). No trading line will be opened.
                </DialogDescription>
              </DialogHeader>
              <div className="flex items-start gap-2 rounded-lg border border-destructive/20 bg-destructive/5 p-3">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
                <p className="text-xs text-muted-foreground text-pretty">
                  This action cannot be undone. The customer will see the request marked as rejected.
                </p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="reject-leverage-reason">Reason (optional)</Label>
                <Textarea
                  id="reject-leverage-reason"
                  value={rejectLeverageReason}
                  onChange={(e) => setRejectLeverageReason(e.target.value)}
                  placeholder="e.g. Requested leverage exceeds suitability profile."
                  rows={3}
                />
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setRejectLeverageTarget(null)}>
                  Cancel
                </Button>
                <Button variant="destructive" onClick={confirmRejectLeverage}>
                  Reject Request
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* Reject leverage switch-off dialog */}
      <Dialog
        open={!!rejectSwitchOffTarget}
        onOpenChange={(open) => !open && setRejectSwitchOffTarget(null)}
      >
        <DialogContent className="sm:max-w-md">
          {rejectSwitchOffTarget && (
            <>
              <DialogHeader>
                <DialogTitle>Reject Switch-Off Request</DialogTitle>
                <DialogDescription>
                  Decline the switch-off of line {rejectSwitchOffTarget.id} (
                  {rejectSwitchOffTarget.accountLabel} �� 1:{rejectSwitchOffTarget.leverageRatio}). The line
                  stays active and debit interest keeps accruing.
                </DialogDescription>
              </DialogHeader>
              <div className="flex items-start gap-2 rounded-lg border border-destructive/20 bg-destructive/5 p-3">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
                <p className="text-xs text-muted-foreground text-pretty">
                  No funds will be settled. The borrowed {formatLeverageMoney(rejectSwitchOffTarget, rejectSwitchOffTarget.borrowedAmount)}{" "}
                  remains on the balance and continues to accrue interest.
                </p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="reject-switchoff-reason">Reason (optional)</Label>
                <Textarea
                  id="reject-switchoff-reason"
                  value={rejectSwitchOffReason}
                  onChange={(e) => setRejectSwitchOffReason(e.target.value)}
                  placeholder="e.g. Outstanding positions must be closed before the line can be unwound."
                  rows={3}
                />
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setRejectSwitchOffTarget(null)}>
                  Cancel
                </Button>
                <Button variant="destructive" onClick={confirmRejectSwitchOff}>
                  Reject Switch-Off
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* Reject Download of Funds dialog */}
      <Dialog open={!!rejectDOFTarget} onOpenChange={(open) => !open && setRejectDOFTarget(null)}>
        <DialogContent className="sm:max-w-md">
          {rejectDOFTarget && (
            <>
              <DialogHeader>
                <DialogTitle>Reject Download of Funds</DialogTitle>
                <DialogDescription>
                  Reject request {rejectDOFTarget.id} for {formatDOFAmount(rejectDOFTarget)} from{" "}
                  {rejectDOFTarget.originatorName}. No funds will be credited.
                </DialogDescription>
              </DialogHeader>
              <div className="flex items-start gap-2 rounded-lg border border-destructive/20 bg-destructive/5 p-3">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
                <p className="text-xs text-muted-foreground text-pretty">
                  This action cannot be undone. The client will see the request marked as rejected.
                </p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="reject-dof-reason">Reason (optional)</Label>
                <Textarea
                  id="reject-dof-reason"
                  value={rejectDOFReason}
                  onChange={(e) => setRejectDOFReason(e.target.value)}
                  placeholder="e.g. MT103 could not be verified with the sending bank."
                  rows={3}
                />
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setRejectDOFTarget(null)}>
                  Cancel
                </Button>
                <Button variant="destructive" onClick={confirmRejectDOF}>
                  Reject Request
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* SWIFT FIN inspector dialog (read-only verification of generated MT760/MT799) */}
      <Dialog open={!!swiftViewTarget} onOpenChange={(open) => !open && setSwiftViewTarget(null)}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>SWIFT messages</DialogTitle>
            <DialogDescription>
              {swiftViewTarget
                ? `Generated FIN for the monetization of ${swiftViewTarget.instrumentType} ${swiftViewTarget.instrumentId}. Verify before authorizing.`
                : ""}
            </DialogDescription>
          </DialogHeader>
          <div className="max-h-[60vh] space-y-4 overflow-auto">
            {(
              [
                { label: "MT760 — Guarantee / collateral transfer", raw: swiftViewTarget?.mt760Raw },
                { label: "MT799 — RWA pre-advice", raw: swiftViewTarget?.mt799Raw },
              ] as const
            )
              .filter((m) => !!m.raw)
              .map((m) => {
                const parsed = parseSwiftMessage(m.raw as string)
                return (
                  <div key={m.label} className="space-y-2 rounded-lg border border-border bg-muted/30 p-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-medium text-foreground">{m.label}</span>
                      <Badge variant={parsed.valid ? "default" : "destructive"}>
                        {parsed.valid ? "Valid" : "Invalid"}
                      </Badge>
                      {parsed.uetr && (
                        <Badge variant="outline" className="font-mono text-[10px]">
                          UETR {parsed.uetr.slice(0, 8)}…
                        </Badge>
                      )}
                    </div>
                    {parsed.errors.length > 0 && (
                      <ul className="list-inside list-disc text-xs text-destructive">
                        {parsed.errors.map((e, i) => (
                          <li key={i}>{e}</li>
                        ))}
                      </ul>
                    )}
                    <pre className="max-h-44 overflow-auto whitespace-pre-wrap break-all rounded bg-background p-2 font-mono text-[11px] leading-relaxed text-foreground">
                      {m.raw}
                    </pre>
                  </div>
                )
              })}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSwiftViewTarget(null)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Reject Monetization dialog */}
      <Dialog
        open={!!rejectMonetizationTarget}
        onOpenChange={(open) => !open && setRejectMonetizationTarget(null)}
      >
        <DialogContent className="sm:max-w-md">
          {rejectMonetizationTarget && (
            <>
              <DialogHeader>
                <DialogTitle>Reject Monetization</DialogTitle>
                <DialogDescription>
                  Reject request {rejectMonetizationTarget.id} to monetize{" "}
                  {rejectMonetizationTarget.instrumentId} for{" "}
                  {formatMonetizationProceeds(rejectMonetizationTarget)}. No proceeds will be
                  credited.
                </DialogDescription>
              </DialogHeader>
              <div className="flex items-start gap-2 rounded-lg border border-destructive/20 bg-destructive/5 p-3">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
                <p className="text-xs text-muted-foreground text-pretty">
                  This action cannot be undone. The client will see the request marked as rejected.
                </p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="reject-monetization-reason">Reason (optional)</Label>
                <Textarea
                  id="reject-monetization-reason"
                  value={rejectMonetizationReason}
                  onChange={(e) => setRejectMonetizationReason(e.target.value)}
                  placeholder="e.g. MT760 could not be verified with the issuing bank."
                  rows={3}
                />
              </div>
              <DialogFooter>
                <Button
                  variant="outline"
                  onClick={() => setRejectMonetizationTarget(null)}
                >
                  Cancel
                </Button>
                <Button variant="destructive" onClick={confirmRejectMonetization}>
                  Reject Request
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* Reject Securities Settlement dialog */}
      <Dialog open={!!rejectDTCTarget} onOpenChange={(open) => !open && setRejectDTCTarget(null)}>
        <DialogContent className="sm:max-w-md">
          {rejectDTCTarget && (
            <>
              <DialogHeader>
                <DialogTitle>Reject Securities Settlement</DialogTitle>
                <DialogDescription>
                  Reject instruction {rejectDTCTarget.id} for {rejectDTCTarget.securityName} (
                  {rejectDTCTarget.depository}). No securities will settle and no cash will move.
                </DialogDescription>
              </DialogHeader>
              <div className="flex items-start gap-2 rounded-lg border border-destructive/20 bg-destructive/5 p-3">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
                <p className="text-xs text-muted-foreground text-pretty">
                  This action cannot be undone. The client will see the instruction marked as
                  rejected.
                </p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="reject-dtc-reason">Reason (optional)</Label>
                <Textarea
                  id="reject-dtc-reason"
                  value={rejectDTCReason}
                  onChange={(e) => setRejectDTCReason(e.target.value)}
                  placeholder="e.g. Settlement instructions could not be matched with the counterparty."
                  rows={3}
                />
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setRejectDTCTarget(null)}>
                  Cancel
                </Button>
                <Button variant="destructive" onClick={confirmRejectDTC}>
                  Reject Instruction
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* Reject Euroclear Settlement dialog */}
      <Dialog
        open={!!rejectEuroclearTarget}
        onOpenChange={(open) => !open && setRejectEuroclearTarget(null)}
      >
        <DialogContent className="sm:max-w-md">
          {rejectEuroclearTarget && (
            <>
              <DialogHeader>
                <DialogTitle>Reject Euroclear Settlement</DialogTitle>
                <DialogDescription>
                  Reject instruction {rejectEuroclearTarget.id} for{" "}
                  {rejectEuroclearTarget.securityName} (Euroclear). No securities will settle and no
                  cash will move.
                </DialogDescription>
              </DialogHeader>
              <div className="flex items-start gap-2 rounded-lg border border-destructive/20 bg-destructive/5 p-3">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
                <p className="text-xs text-muted-foreground text-pretty">
                  This action cannot be undone. The client will see the instruction marked as
                  rejected.
                </p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="reject-euroclear-reason">Reason (optional)</Label>
                <Textarea
                  id="reject-euroclear-reason"
                  value={rejectEuroclearReason}
                  onChange={(e) => setRejectEuroclearReason(e.target.value)}
                  placeholder="e.g. Settlement instructions could not be matched with the counterparty."
                  rows={3}
                />
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setRejectEuroclearTarget(null)}>
                  Cancel
                </Button>
                <Button variant="destructive" onClick={confirmRejectEuroclear}>
                  Reject Instruction
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* Reject Commodity Deal dialog */}
      <Dialog open={!!rejectDealTarget} onOpenChange={(open) => !open && setRejectDealTarget(null)}>
        <DialogContent className="sm:max-w-md">
          {rejectDealTarget && (
            <>
              <DialogHeader>
                <DialogTitle>Reject Commodity Deal</DialogTitle>
                <DialogDescription>
                  Reject deal {rejectDealTarget.id} "{rejectDealTarget.title}". The deal will not be
                  authorized and nothing executes.
                </DialogDescription>
              </DialogHeader>
              <div className="flex items-start gap-2 rounded-lg border border-destructive/20 bg-destructive/5 p-3">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
                <p className="text-xs text-muted-foreground text-pretty">
                  This action cannot be undone. The client will see the deal marked as rejected.
                </p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="reject-deal-reason">Reason (optional)</Label>
                <Textarea
                  id="reject-deal-reason"
                  value={rejectDealReason}
                  onChange={(e) => setRejectDealReason(e.target.value)}
                  placeholder="e.g. Proof of Funds could not be validated with the issuing bank."
                  rows={3}
                />
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setRejectDealTarget(null)}>
                  Cancel
                </Button>
                <Button variant="destructive" onClick={confirmRejectDeal}>
                  Reject Deal
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* Reject Document dialog */}
      <Dialog open={!!rejectDocTarget} onOpenChange={(open) => !open && setRejectDocTarget(null)}>
        <DialogContent className="sm:max-w-md">
          {rejectDocTarget && (
            <>
              <DialogHeader>
                <DialogTitle>Reject {rejectDocTarget.doc.module} Document</DialogTitle>
                <DialogDescription>
                  Reject "{rejectDocTarget.doc.docType}" on deal {rejectDocTarget.deal.id}. The client
                  can submit a corrected version.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-2">
                <Label htmlFor="reject-doc-reason">Reason (optional)</Label>
                <Textarea
                  id="reject-doc-reason"
                  value={rejectDocReason}
                  onChange={(e) => setRejectDocReason(e.target.value)}
                  placeholder="e.g. The Bill of Lading reference does not match the SGS report."
                  rows={3}
                />
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setRejectDocTarget(null)}>
                  Cancel
                </Button>
                <Button variant="destructive" onClick={confirmRejectDoc}>
                  Reject Document
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
