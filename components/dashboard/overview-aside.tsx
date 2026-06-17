"use client"

import { useState } from "react"
import Link from "next/link"
import { Send, ChevronRight } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { CardVisual, useCards } from "@/components/dashboard/bank-cards"
import { useActivityLog } from "@/components/activity-tracker"
import { useCurrentUser } from "@/lib/use-current-user"

export function OverviewAside() {
  const log = useActivityLog()
  const user = useCurrentUser()
  const cards = useCards()
  const payees = [
    { id: "p1", name: "APPLE.COM/BILL" },
    { id: "p2", name: user.company },
    { id: "p3", name: "Banking Circle GmbH" },
  ]
  const [payee, setPayee] = useState("p1")
  const [amount, setAmount] = useState("")

  const handleTransfer = () => {
    const selected = payees.find((p) => p.id === payee)
    const formattedAmount = amount
      ? `€${Number.parseFloat(amount).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
      : "—"
    log({
      action: `Quick transfer of ${formattedAmount} to ${selected?.name ?? payee}`,
      category: "Payments",
      details: {
        summary: `Client initiated a quick transfer of ${formattedAmount} to saved payee "${selected?.name ?? payee}" from the dashboard widget.`,
        payee: selected?.name ?? payee,
        amount: formattedAmount,
        source: "Dashboard quick transfer widget",
        submittedAt: new Date().toLocaleString("en-GB"),
      },
    })
    setAmount("")
  }

  return (
    <div className="space-y-6">
      {/* Cards widget */}
      <Card className="bg-card border-border">
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-lg font-semibold">Your Cards</CardTitle>
          <Button asChild variant="ghost" size="sm" className="text-xs">
            <Link href="/dashboard/cards">
              View all
              <ChevronRight className="ml-1 h-3 w-3" />
            </Link>
          </Button>
        </CardHeader>
        <CardContent>
          <CardVisual card={cards[0]} />
        </CardContent>
      </Card>

      {/* Quick transfer */}
      <Card className="bg-card border-border">
        <CardHeader>
          <CardTitle className="text-lg font-semibold">Quick Transfer</CardTitle>
          <p className="text-xs text-muted-foreground">Send funds to a saved payee</p>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid gap-2">
            <Label className="text-xs">Payee</Label>
            <Select value={payee} onValueChange={setPayee}>
              <SelectTrigger>
                <SelectValue placeholder="Select payee" />
              </SelectTrigger>
              <SelectContent>
                {payees.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-2">
            <Label className="text-xs">Amount (EUR)</Label>
            <Input
              type="number"
              inputMode="decimal"
              placeholder="0.00"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
            />
          </div>
          <Button className="w-full" onClick={handleTransfer} disabled={!amount}>
            <Send className="mr-2 h-4 w-4" />
            Send Transfer
          </Button>
        </CardContent>
      </Card>
    </div>
  )
}
