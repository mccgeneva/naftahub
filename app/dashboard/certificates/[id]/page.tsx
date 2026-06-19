"use client"

import { useMemo } from "react"
import Link from "next/link"
import { useParams, useRouter } from "next/navigation"
import {
  ArrowLeft,
  Award,
  BadgeCheck,
  ShieldCheck,
  Wallet,
  Download,
  Clock,
  Check,
  X,
  Hash,
  Tag,
  Building2,
  CalendarDays,
  FileText,
  History,
} from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"
import { toast } from "sonner"
import { useActivityLog } from "@/components/activity-tracker"
import {
  useCertificateRequests,
  CERTIFICATE_TYPE_LABELS,
  CERTIFICATE_TYPE_DESCRIPTIONS,
  type CertificateType,
  type CertificateRequest,
} from "@/lib/certificates-store"
import { generateAccountCertificate } from "@/lib/certificate-pdf"
import { usePdfViewer } from "@/lib/pdf-viewer"
import { CertificateDocument } from "@/components/dashboard/certificate-document"

const TYPE_ICONS: Record<CertificateType, typeof Award> = {
  "good-standing": BadgeCheck,
  endorsement: Award,
  "proof-of-funds": Wallet,
  ownership: ShieldCheck,
}

const statusStyles: Record<CertificateRequest["status"], string> = {
  pending: "border-amber-500/20 bg-amber-500/10 text-amber-400",
  approved: "border-emerald-500/20 bg-emerald-500/10 text-emerald-400",
  rejected: "border-red-500/20 bg-red-500/10 text-red-400",
}

const statusLabel: Record<CertificateRequest["status"], string> = {
  pending: "Pending approval",
  approved: "Issued",
  rejected: "Declined",
}

const currencySymbols: Record<string, string> = {
  EUR: "€",
  USD: "$",
  GBP: "£",
  CHF: "CHF ",
}

function money(amount: number, currency: string): string {
  const symbol = currencySymbols[currency] || `${currency} `
  return `${symbol}${amount.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

function formatTimestamp(iso?: string): string {
  if (!iso) return "—"
  const d = new Date(iso)
  return Number.isNaN(d.getTime())
    ? iso
    : `${d.toLocaleDateString("en-GB", { day: "2-digit", month: "long", year: "numeric" })} · ${d.toLocaleTimeString(
        "en-GB",
        { hour: "2-digit", minute: "2-digit" },
      )}`
}

export default function CertificateDetailPage() {
  const params = useParams<{ id: string }>()
  const router = useRouter()
  const { requests, hydrated, recordDownload } = useCertificateRequests()
  const logActivity = useActivityLog()
  const { show } = usePdfViewer()

  const id = decodeURIComponent(params.id)
  const req = useMemo(() => requests.find((r) => r.id === id), [requests, id])

  if (hydrated && !req) {
    return (
      <div className="mx-auto max-w-3xl">
        <Button variant="ghost" size="sm" asChild className="mb-4">
          <Link href="/dashboard/certificates">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to Certificates
          </Link>
        </Button>
        <Card className="bg-card border-border">
          <CardContent className="flex flex-col items-center justify-center py-16 text-center">
            <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-secondary">
              <FileText className="h-5 w-5 text-muted-foreground" />
            </div>
            <p className="text-sm font-medium text-foreground">Certificate not found</p>
            <p className="mt-1 text-xs text-muted-foreground">
              We couldn&apos;t find a certificate with reference <code className="text-foreground">{id}</code>.
            </p>
          </CardContent>
        </Card>
      </div>
    )
  }

  if (!req) {
    return (
      <div className="mx-auto max-w-3xl">
        <div className="h-9 w-40 animate-pulse rounded-md bg-secondary" />
        <div className="mt-4 h-64 animate-pulse rounded-xl bg-secondary" />
      </div>
    )
  }

  const Icon = TYPE_ICONS[req.type]
  const isApproved = req.status === "approved"

  const download = () => {
    if (req.status !== "approved") {
      toast.info("Awaiting approval", {
        description: "This certificate must be approved by the Compliance Office before it can be downloaded.",
      })
      return
    }
    show(generateAccountCertificate({
      type: req.type,
      reference: req.reference,
      verificationCode: req.verificationCode,
      issuedDate: req.issuedAt ?? req.decidedAt ?? new Date().toISOString(),
      version: req.version,
      accountLabel: req.accountLabel,
      purpose: req.purpose,
      addressee: req.addressee,
      holderName: req.holderName,
      holderCompany: req.holderCompany,
      bankName: req.bankName,
      bankAddress: req.bankAddress,
      beneficiaryAddress: req.beneficiaryAddress,
      iban: req.iban,
      bic: req.bic,
      accountEmail: req.accountEmail,
      balances: req.balances,
      totalEur: req.totalEur,
      displayCurrency: req.displayCurrency,
    }))
    recordDownload(req.id)
    logActivity({
      action: `Downloaded ${CERTIFICATE_TYPE_LABELS[req.type]}`,
      category: "Certificates",
      details: {
        summary: `Client downloaded the issued ${CERTIFICATE_TYPE_LABELS[req.type]} (${req.reference}).`,
        reference: req.reference,
        version: `Revision ${req.version}`,
      },
    })
  }

  const detailRows: { label: string; value?: string; icon?: typeof Hash }[] = [
    { label: "Reference", value: req.reference, icon: Hash },
    { label: "Verification code", value: req.verificationCode, icon: ShieldCheck },
    { label: "Account", value: req.accountLabel, icon: Building2 },
    { label: "Addressee", value: req.addressee, icon: Building2 },
    { label: "Account holder", value: req.holderCompany || req.holderName, icon: Tag },
    { label: "Bank", value: req.bankName, icon: Building2 },
    { label: "IBAN", value: req.iban, icon: Hash },
    { label: "BIC / SWIFT", value: req.bic, icon: Hash },
    { label: "Requested", value: formatTimestamp(req.submittedAt), icon: CalendarDays },
    {
      label: isApproved ? "Issued" : req.status === "rejected" ? "Declined" : "Decision",
      value: req.status === "pending" ? "Awaiting compliance review" : formatTimestamp(req.decidedAt),
      icon: CalendarDays,
    },
  ]

  return (
    <div className="mx-auto max-w-3xl">
      <div className="mb-4 flex items-center justify-between gap-2">
        <Button variant="ghost" size="sm" onClick={() => router.back()}>
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back
        </Button>
        <Button
          size="sm"
          disabled={!isApproved}
          onClick={download}
          className="bg-amber-500 text-zinc-900 hover:bg-amber-600 disabled:opacity-50"
        >
          <Download className="mr-2 h-4 w-4" />
          Download PDF
        </Button>
      </div>

      <Card className="overflow-hidden border-border bg-card">
        <CardHeader className="border-b border-border bg-secondary/30">
          <div className="flex items-start gap-4">
            <div className="rounded-lg bg-primary/10 p-2.5">
              <Icon className="h-6 w-6 text-primary" />
            </div>
            <div className="min-w-0 flex-1">
              <CardTitle className="text-xl font-bold text-foreground">
                {CERTIFICATE_TYPE_LABELS[req.type]}
              </CardTitle>
              <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                {CERTIFICATE_TYPE_DESCRIPTIONS[req.type]}
              </p>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <Badge variant="secondary" className={cn("shrink-0", statusStyles[req.status])}>
                  {req.status === "pending" && <Clock className="mr-1 h-3 w-3" />}
                  {req.status === "approved" && <Check className="mr-1 h-3 w-3" />}
                  {req.status === "rejected" && <X className="mr-1 h-3 w-3" />}
                  {statusLabel[req.status]}
                </Badge>
                {isApproved && (
                  <span className="text-xs text-muted-foreground">Revision {req.version}</span>
                )}
              </div>
            </div>
          </div>
        </CardHeader>

        <CardContent className="p-0">
          {req.purpose && (
            <p className="mx-5 my-4 rounded-lg bg-secondary/40 p-3 text-xs leading-relaxed text-muted-foreground">
              <span className="font-medium text-foreground">Purpose: </span>
              {req.purpose}
            </p>
          )}

          <dl className="divide-y divide-border border-t border-border">
            {detailRows
              .filter((r) => r.value)
              .map((r) => {
                const RowIcon = r.icon
                return (
                  <div key={r.label} className="flex items-start justify-between gap-4 px-5 py-3.5">
                    <dt className="flex items-center gap-2 text-xs text-muted-foreground">
                      {RowIcon && <RowIcon className="h-3.5 w-3.5" />}
                      {r.label}
                    </dt>
                    <dd className="break-all text-right text-sm font-medium text-foreground">{r.value}</dd>
                  </div>
                )
              })}
          </dl>

          {req.status === "rejected" && req.decisionNote && (
            <p className="mx-5 my-4 rounded-lg border border-red-500/20 bg-red-500/10 p-3 text-xs text-red-400">
              {req.decisionNote}
            </p>
          )}
        </CardContent>
      </Card>

      {/* Balance snapshot */}
      {req.balances.length > 0 && (
        <Card className="mt-6 border-border bg-card">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base font-semibold text-foreground">
              <Wallet className="h-4 w-4 text-primary" />
              Verified Balance Snapshot
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid gap-3 sm:grid-cols-2">
              {req.balances.map((b) => (
                <div
                  key={b.currency}
                  className="flex items-center justify-between rounded-lg border border-border bg-secondary/30 px-4 py-3"
                >
                  <span className="text-xs font-medium text-muted-foreground">{b.currency}</span>
                  <span className="text-sm font-semibold text-foreground">{money(b.amount, b.currency)}</span>
                </div>
              ))}
            </div>
            <div className="mt-3 flex items-center justify-between border-t border-border pt-3">
              <span className="text-xs text-muted-foreground">Total (EUR equivalent)</span>
              <span className="text-sm font-bold text-foreground">{money(req.totalEur, "EUR")}</span>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Audit trail */}
      <Card className="mt-6 border-border bg-card">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base font-semibold text-foreground">
            <History className="h-4 w-4 text-primary" />
            Audit Trail
          </CardTitle>
        </CardHeader>
        <CardContent>
          <ol className="space-y-3">
            {req.events.map((ev, i) => (
              <li key={`${ev.at}-${i}`} className="flex items-start gap-3">
                <div className="mt-1 h-2 w-2 shrink-0 rounded-full bg-primary" />
                <div className="min-w-0">
                  <p className="text-sm font-medium text-foreground">
                    {ev.action} <span className="font-normal text-muted-foreground">· {ev.actor}</span>
                  </p>
                  <p className="text-[11px] text-muted-foreground">{formatTimestamp(ev.at)}</p>
                  {ev.note && <p className="mt-0.5 text-xs text-muted-foreground">{ev.note}</p>}
                </div>
              </li>
            ))}
          </ol>
        </CardContent>
      </Card>

      {/* Document preview */}
      <div className="mt-6">
        <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-foreground">
          <FileText className="h-4 w-4 text-primary" />
          Document Preview
        </h2>
        <div className="overflow-x-auto rounded-lg border border-border bg-white p-2">
          <CertificateDocument
            type={req.type}
            reference={req.reference}
            verificationCode={req.verificationCode}
            issuedDate={req.issuedAt ?? req.decidedAt}
            version={req.version || 1}
            status={req.status}
            accountLabel={req.accountLabel}
            purpose={req.purpose}
            addressee={req.addressee}
            holderName={req.holderName}
            holderCompany={req.holderCompany}
            bankName={req.bankName}
            bankAddress={req.bankAddress}
            iban={req.iban}
            bic={req.bic}
            balances={req.balances}
            totalEur={req.totalEur}
            displayCurrency={req.displayCurrency}
          />
        </div>
      </div>
    </div>
  )
}
