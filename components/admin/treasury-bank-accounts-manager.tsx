"use client"

import { useEffect, useState } from "react"
import { Landmark, Plus, Trash2, Save, Loader2 } from "lucide-react"
import { toast } from "sonner"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"

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

const FIELDS: { key: keyof TreasuryBankAccount; label: string; multiline?: boolean }[] = [
  { key: "label", label: "Title" },
  { key: "beneficiaryName", label: "Beneficiary name" },
  { key: "bankName", label: "Beneficiary bank name" },
  { key: "bankAddress", label: "Bank address", multiline: true },
  { key: "swift", label: "SWIFT / BIC" },
  { key: "iban", label: "IBAN" },
  { key: "currency", label: "Currency" },
  { key: "paymentDetails", label: "Payment details (reference)" },
]

export function TreasuryBankAccountsManager({ passcode }: { passcode: string }) {
  const [accounts, setAccounts] = useState<TreasuryBankAccount[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    let alive = true
    fetch("/api/admin/treasury-bank-accounts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ op: "load", pin: passcode }),
    })
      .then((r) => r.json())
      .then((d) => {
        if (!alive) return
        if (d.ok) setAccounts(d.accounts)
        else toast.error(d.error ?? "Could not load treasury accounts")
      })
      .catch(() => toast.error("Could not load treasury accounts"))
      .finally(() => alive && setLoading(false))
    return () => {
      alive = false
    }
  }, [passcode])

  const update = (id: string, key: keyof TreasuryBankAccount, value: string) =>
    setAccounts((prev) => prev.map((a) => (a.id === id ? { ...a, [key]: value } : a)))

  const add = () =>
    setAccounts((prev) => [
      ...prev,
      {
        id: `treasury-${Date.now()}`,
        label: `Treasury n. ${prev.length + 1}`,
        beneficiaryName: "",
        bankName: "",
        bankAddress: "",
        swift: "",
        iban: "",
        currency: "EUR",
        paymentDetails: "",
      },
    ])

  const save = async () => {
    setSaving(true)
    try {
      const res = await fetch("/api/admin/treasury-bank-accounts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ op: "save", pin: passcode, accounts }),
      })
      const d = await res.json()
      if (d.ok) {
        setAccounts(d.accounts)
        toast.success("Treasury accounts saved — every customer now sees the update")
      } else {
        toast.error(d.error ?? "Could not save")
      }
    } catch {
      toast.error("Could not save")
    } finally {
      setSaving(false)
    }
  }

  return (
    <Card className="min-w-0 border-border bg-card">
      <CardHeader>
        <div className="flex items-center gap-2">
          <Landmark className="h-5 w-5 text-primary" />
          <CardTitle>Treasury Bank Accounts</CardTitle>
        </div>
        <CardDescription className="leading-relaxed">
          The bank coordinates every customer sees under Treasury Services. Changes apply immediately after saving.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {loading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading…
          </div>
        ) : (
          <>
            {accounts.map((a) => (
              <div key={a.id} className="flex flex-col gap-3 rounded-lg border border-border bg-background p-4">
                <div className="flex items-center justify-between gap-2">
                  <p className="font-semibold text-foreground">{a.label || "Untitled account"}</p>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-11 text-destructive"
                    onClick={() => setAccounts((prev) => prev.filter((x) => x.id !== a.id))}
                  >
                    <Trash2 className="mr-1 h-4 w-4" /> Remove
                  </Button>
                </div>
                {FIELDS.map((f) => (
                  <div key={f.key} className="flex flex-col gap-1.5">
                    <Label htmlFor={`${a.id}-${f.key}`}>{f.label}</Label>
                    {f.multiline ? (
                      <Textarea
                        id={`${a.id}-${f.key}`}
                        value={a[f.key]}
                        onChange={(e) => update(a.id, f.key, e.target.value)}
                        className="text-base"
                        rows={2}
                      />
                    ) : (
                      <Input
                        id={`${a.id}-${f.key}`}
                        value={a[f.key]}
                        onChange={(e) => update(a.id, f.key, e.target.value)}
                        className="text-base"
                        autoCapitalize={f.key === "iban" || f.key === "swift" || f.key === "currency" ? "characters" : undefined}
                        autoComplete="off"
                      />
                    )}
                  </div>
                ))}
              </div>
            ))}
            <div className="flex flex-col gap-2 sm:flex-row">
              <Button type="button" variant="outline" className="h-11" onClick={add}>
                <Plus className="mr-1 h-4 w-4" /> Add account
              </Button>
              <Button type="button" className="h-11" onClick={save} disabled={saving}>
                {saving ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Save className="mr-1 h-4 w-4" />}
                Save changes
              </Button>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  )
}
