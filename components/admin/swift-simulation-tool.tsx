"use client"

import { useEffect, useState } from "react"
import { AlertTriangle, ClipboardPaste, FileText, FlaskConical, Loader2 } from "lucide-react"
import { toast } from "sonner"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { MoneyInput } from "@/components/ui/money-input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { usePdfViewer } from "@/lib/pdf-viewer"
import { ADMIN_PASSCODE } from "@/lib/admin-config"
import {
  EMPTY_SIM_INPUT,
  SIMULATION_DISCLAIMER,
  SIM_CHARGE_OPTIONS,
  parsePaymentNote,
  type SimChargeOption,
  type SwiftSimulationInput,
  type SwiftSimulationRecord,
} from "@/lib/swift-simulation"
import { generateSwiftSimulationPdf } from "@/lib/swift-simulation-pdf"
import { generateSwiftSimulationAdmin, listSwiftSimulationsAdmin } from "@/app/actions/swift-simulation"

export function SwiftSimulationTool() {
  const { show } = usePdfViewer()
  const [input, setInput] = useState<SwiftSimulationInput>(EMPTY_SIM_INPUT)
  const [note, setNote] = useState("")
  const [busy, setBusy] = useState(false)
  const [history, setHistory] = useState<SwiftSimulationRecord[]>([])
  const [lastWarnings, setLastWarnings] = useState<string[]>([])

  const loadHistory = async () => {
    const res = await listSwiftSimulationsAdmin(ADMIN_PASSCODE)
    if (res.ok) setHistory(res.records)
  }

  useEffect(() => {
    void loadHistory()
  }, [])

  const set = (key: keyof SwiftSimulationInput) => (value: string) =>
    setInput((prev) => ({ ...prev, [key]: value }))

  const importNote = () => {
    const parsed = parsePaymentNote(note)
    const count = Object.keys(parsed).length
    if (!count) {
      toast.error("No fields recognised. Use lines like “Beneficiary: Acme Ltd”.")
      return
    }
    setInput((prev) => ({ ...prev, ...parsed }))
    toast.success(`Imported ${count} field${count === 1 ? "" : "s"} from the payment note.`)
  }

  const generate = async () => {
    setBusy(true)
    try {
      const res = await generateSwiftSimulationAdmin(ADMIN_PASSCODE, input)
      if (!res.ok) {
        toast.error(res.error)
        return
      }
      setLastWarnings(res.record.warnings)
      show(generateSwiftSimulationPdf(res.record))
      toast.success(`Simulation ${res.record.id} generated and logged.`)
      void loadHistory()
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FlaskConical className="size-5 text-primary" aria-hidden />
            SWIFT MT103 simulation (training)
          </CardTitle>
          <CardDescription className="leading-relaxed">
            Turns payment-note data into an MT103-style training worksheet. Bank codes and account numbers are always
            replaced with fictitious placeholders, and every page carries a permanent simulation watermark.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-5">
          <div className="flex items-start gap-3 rounded-md border border-destructive/40 bg-destructive/10 p-3">
            <AlertTriangle className="mt-0.5 size-4 shrink-0 text-destructive" aria-hidden />
            <p className="text-sm font-medium leading-relaxed text-destructive">{SIMULATION_DISCLAIMER}</p>
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="sim-note">Import from a payment note (optional)</Label>
            <Textarea
              id="sim-note"
              rows={4}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder={"Sender: Acme Trading Ltd\nBeneficiary: Global Imports SA\nAmount: EUR 25000\nReference: INV-1042"}
              className="text-base"
            />
            <Button type="button" variant="outline" onClick={importNote} className="min-h-11 w-full sm:w-auto">
              <ClipboardPaste className="size-4" aria-hidden />
              Fill fields from note
            </Button>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field id="sim-sender" label="Ordering customer" value={input.senderName} onChange={set("senderName")} />
            <Field id="sim-sender-addr" label="Ordering customer address" value={input.senderAddress} onChange={set("senderAddress")} />
            <Field id="sim-ben" label="Beneficiary" value={input.beneficiaryName} onChange={set("beneficiaryName")} />
            <Field id="sim-ben-addr" label="Beneficiary address" value={input.beneficiaryAddress} onChange={set("beneficiaryAddress")} />
            <div className="flex flex-col gap-2">
              <Label htmlFor="sim-amount">Amount</Label>
              <MoneyInput id="sim-amount" value={input.amount} onValueChange={set("amount")} placeholder="0.00" />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="sim-ccy">Currency</Label>
              <Input
                id="sim-ccy"
                value={input.currency}
                maxLength={3}
                onChange={(e) => set("currency")(e.target.value.toUpperCase())}
                className="text-base uppercase"
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="sim-date">Value date</Label>
              <Input id="sim-date" type="date" value={input.valueDate} onChange={(e) => set("valueDate")(e.target.value)} className="text-base" />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="sim-charges">Charges</Label>
              <Select value={input.charges} onValueChange={(v) => setInput((p) => ({ ...p, charges: v as SimChargeOption }))}>
                <SelectTrigger id="sim-charges" className="min-h-11">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {SIM_CHARGE_OPTIONS.map((c) => (
                    <SelectItem key={c} value={c}>
                      {c}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Field id="sim-ref" label="Reference" value={input.reference} onChange={set("reference")} />
            <Field id="sim-rem" label="Remittance information" value={input.remittanceInfo} onChange={set("remittanceInfo")} />
          </div>

          <p className="text-sm leading-relaxed text-muted-foreground">
            Bank names, IBANs and long account numbers are not allowed. Bank names are rejected; IBANs and long numbers are
            removed automatically.
          </p>

          {lastWarnings.length > 0 && (
            <ul className="flex flex-col gap-1 rounded-md border border-border bg-muted p-3 text-sm text-muted-foreground">
              {lastWarnings.map((w) => (
                <li key={w}>{w}</li>
              ))}
            </ul>
          )}

          <Button onClick={generate} disabled={busy} className="min-h-11 w-full sm:w-auto">
            {busy ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <FileText className="size-4" aria-hidden />}
            Generate simulation
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Generation log</CardTitle>
          <CardDescription>Every simulation, who made it and when. Tap one to reopen it.</CardDescription>
        </CardHeader>
        <CardContent>
          {history.length === 0 ? (
            <p className="text-sm text-muted-foreground">No simulations generated yet.</p>
          ) : (
            <ul className="flex flex-col divide-y divide-border">
              {history.map((r) => (
                <li key={r.id}>
                  <button
                    type="button"
                    onClick={() => show(generateSwiftSimulationPdf(r))}
                    className="flex min-h-11 w-full flex-col gap-0.5 py-3 text-left"
                  >
                    <span className="font-mono text-sm text-foreground">{r.id}</span>
                    <span className="text-sm text-muted-foreground">
                      {r.input.currency} {Number(r.input.amount).toLocaleString("en-US", { minimumFractionDigits: 2 })} ·{" "}
                      {r.input.senderName} → {r.input.beneficiaryName}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {new Date(r.createdAt).toLocaleString()} · {r.createdBy}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

function Field({
  id,
  label,
  value,
  onChange,
}: {
  id: string
  label: string
  value: string
  onChange: (v: string) => void
}) {
  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor={id}>{label}</Label>
      <Input id={id} value={value} onChange={(e) => onChange(e.target.value)} className="text-base" />
    </div>
  )
}
