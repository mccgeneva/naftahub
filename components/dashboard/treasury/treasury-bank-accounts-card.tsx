"use client"

import useSWR from "swr"
import { useState } from "react"
import { Landmark, Copy, Check, Loader2 } from "lucide-react"
import { toast } from "sonner"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"

type TreasuryBankAccount = {
  id: string
  label: string
  beneficiaryName: string
  bankName: string
  bankAddress: string
  swift: string
  iban: string
  currency: string
  paymentDetails: string
}

const fetcher = (url: string) => fetch(url, { cache: "no-store" }).then((r) => r.json())

function groupIban(iban: string) {
  return iban.replace(/(.{4})/g, "$1 ").trim()
}

function Row({ label, value, copy }: { label: string; value: string; copy?: string }) {
  const [copied, setCopied] = useState(false)
  if (!value) return null
  return (
    <div className="flex items-start justify-between gap-3 border-b border-border py-2.5 last:border-0">
      <div className="min-w-0 flex-1">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="break-words text-sm font-medium text-foreground">{value}</p>
      </div>
      {copy && (
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-11 w-11 shrink-0"
          aria-label={`Copy ${label}`}
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(copy)
              setCopied(true)
              toast.success(`${label} copied`)
              setTimeout(() => setCopied(false), 1500)
            } catch {
              toast.error("Could not copy")
            }
          }}
        >
          {copied ? <Check className="h-4 w-4 text-primary" /> : <Copy className="h-4 w-4" />}
        </Button>
      )}
    </div>
  )
}

export function TreasuryBankAccountsCard() {
  const { data, isLoading } = useSWR<{ ok: boolean; accounts?: TreasuryBankAccount[] }>(
    "/api/treasury-bank-accounts",
    fetcher,
    { refreshInterval: 60000 },
  )
  const accounts = data?.accounts ?? []

  return (
    <Card className="min-w-0 border-border bg-card">
      <CardHeader>
        <div className="flex items-center gap-2">
          <Landmark className="h-5 w-5 text-primary" />
          <CardTitle className="text-balance">Treasury bank accounts</CardTitle>
        </div>
        <CardDescription className="text-pretty leading-relaxed">
          Use these coordinates to fund your treasury. Always quote the payment details as the transfer reference.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {isLoading && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading accounts…
          </div>
        )}
        {!isLoading && accounts.length === 0 && (
          <p className="text-sm text-muted-foreground">No treasury accounts are published yet.</p>
        )}
        {accounts.map((a) => (
          <div key={a.id} className="rounded-lg border border-border bg-background px-4 py-2">
            <div className="flex items-center justify-between gap-2 py-2">
              <p className="font-semibold text-foreground">{a.label}</p>
              <Badge variant="secondary">{a.currency}</Badge>
            </div>
            <Row label="Beneficiary name" value={a.beneficiaryName} copy={a.beneficiaryName} />
            <Row label="Beneficiary bank name" value={a.bankName} />
            <Row label="Bank address" value={a.bankAddress} />
            <Row label="SWIFT / BIC" value={a.swift} copy={a.swift} />
            <Row label="IBAN" value={groupIban(a.iban)} copy={a.iban} />
            <Row label="Currency" value={a.currency} />
            <Row label="Payment details (reference)" value={a.paymentDetails} copy={a.paymentDetails} />
          </div>
        ))}
      </CardContent>
    </Card>
  )
}
