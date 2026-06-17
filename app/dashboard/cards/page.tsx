"use client"

import { useState, useEffect } from "react"
import { toast } from "sonner"
import { Snowflake, Settings, Eye, EyeOff, ShieldCheck, Plus, Lock, Smartphone, Globe } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Progress } from "@/components/ui/progress"
import { Switch } from "@/components/ui/switch"
import { CardVisual, useCards } from "@/components/dashboard/bank-cards"
import { useActivityLog } from "@/components/activity-tracker"

const cardControls = [
  { id: "online", label: "Online payments", icon: Globe, enabled: true },
  { id: "contactless", label: "Contactless", icon: Smartphone, enabled: true },
  { id: "atm", label: "ATM withdrawals", icon: Lock, enabled: false },
]

export default function CardsPage() {
  const log = useActivityLog()
  const initialCards = useCards()
  const [cardList, setCardList] = useState(initialCards)
  const [activeId, setActiveId] = useState(initialCards[0].id)
  const activeCard = cardList.find((c) => c.id === activeId) ?? cardList[0]

  // Re-sync card holder names once the signed-in user resolves on the client.
  useEffect(() => {
    setCardList((prev) =>
      prev.map((c) => {
        const fresh = initialCards.find((ic) => ic.id === c.id)
        return fresh ? { ...c, holder: fresh.holder } : c
      }),
    )
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialCards[0]?.holder])

  const [detailsVisible, setDetailsVisible] = useState(false)

  const requestNewCard = () => {
    log({
      action: "Requested a new MCC Capital card",
      category: "Cards",
      details: {
        summary: "Client requested the issuance of a new MCC Capital card.",
        requestedAt: new Date().toLocaleString("en-GB"),
      },
    })
    toast.success("Card request submitted", {
      description: "Your new card request is being processed.",
    })
  }

  const toggleDetails = () => {
    setDetailsVisible((v) => !v)
    log({
      action: `${detailsVisible ? "Hid" : "Revealed"} card details for ${activeCard.label} ending ${activeCard.last4}`,
      category: "Cards",
      details: {
        summary: `Client ${detailsVisible ? "hid" : "revealed"} the sensitive details for card "${activeCard.label}" (•••• ${activeCard.last4}).`,
        card: activeCard.label,
        last4: activeCard.last4,
      },
    })
  }

  const openCardSettings = () => {
    log({
      action: `Opened settings for ${activeCard.label} ending ${activeCard.last4}`,
      category: "Cards",
      details: {
        summary: `Client opened the settings panel for card "${activeCard.label}" (•••• ${activeCard.last4}).`,
        card: activeCard.label,
        last4: activeCard.last4,
      },
    })
    toast.info(`${activeCard.label} settings`, {
      description: "Card settings are managed by your relationship manager.",
    })
  }

  const adjustLimit = () => {
    log({
      action: "Requested a monthly spending limit adjustment",
      category: "Cards",
      details: {
        summary: `Client requested an adjustment to the monthly spending limit for card "${activeCard.label}" (•••• ${activeCard.last4}).`,
        card: activeCard.label,
        currentLimit: "€50,000",
        requestedAt: new Date().toLocaleString("en-GB"),
      },
    })
    toast.success("Limit adjustment requested", {
      description: "Your relationship manager will review the request shortly.",
    })
  }

  const toggleFreeze = (id: string) => {
    setCardList((prev) =>
      prev.map((c) => (c.id === id ? { ...c, frozen: !c.frozen } : c)),
    )
    const card = cardList.find((c) => c.id === id)
    const willFreeze = !card?.frozen
    log({
      action: `${willFreeze ? "Froze" : "Unfroze"} card ${card?.label ?? id} ending ${card?.last4 ?? "****"}`,
      category: "Cards",
      details: {
        summary: `Client ${willFreeze ? "froze" : "unfroze"} the card "${card?.label ?? id}" (•••• ${card?.last4 ?? "****"}). The card is now ${willFreeze ? "frozen and cannot be used" : "active and ready for use"}.`,
        card: card?.label ?? id,
        last4: card?.last4 ?? "",
        newState: willFreeze ? "Frozen" : "Active",
      },
    })
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Cards</h1>
          <p className="text-sm text-muted-foreground">
            Manage your physical and virtual MCC Capital cards
          </p>
        </div>
        <Button size="sm" onClick={requestNewCard}>
          <Plus className="mr-2 h-4 w-4" />
          Request New Card
        </Button>
      </div>

      {/* Card carousel */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {cardList.map((card) => (
          <button
            key={card.id}
            onClick={() => setActiveId(card.id)}
            className="text-left focus:outline-none"
            aria-label={`Select ${card.label}`}
          >
            <CardVisual
              card={card}
              className={
                activeId === card.id ? "ring-2 ring-primary ring-offset-2 ring-offset-background" : ""
              }
            />
          </button>
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Card controls */}
        <Card className="bg-card border-border lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-lg font-semibold">
              {activeCard.label} •••• {activeCard.last4}
            </CardTitle>
            <p className="text-xs text-muted-foreground">Card settings and security controls</p>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-wrap gap-2">
              <Button
                variant={activeCard.frozen ? "default" : "outline"}
                size="sm"
                onClick={() => toggleFreeze(activeCard.id)}
              >
                <Snowflake className="mr-2 h-4 w-4" />
                {activeCard.frozen ? "Unfreeze Card" : "Freeze Card"}
              </Button>
              <Button variant="outline" size="sm" onClick={toggleDetails}>
                {detailsVisible ? (
                  <EyeOff className="mr-2 h-4 w-4" />
                ) : (
                  <Eye className="mr-2 h-4 w-4" />
                )}
                {detailsVisible ? "Hide Details" : "Show Details"}
              </Button>
              <Button variant="outline" size="sm" onClick={openCardSettings}>
                <Settings className="mr-2 h-4 w-4" />
                Settings
              </Button>
            </div>

            {detailsVisible && (
              <div className="grid grid-cols-2 gap-3 rounded-lg border border-border bg-secondary/30 p-4 sm:grid-cols-3">
                <div className="col-span-2 sm:col-span-3">
                  <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
                    Card Number
                  </p>
                  <p className="font-mono text-sm text-foreground">
                    {`4929 8841 0073 ${activeCard.last4}`}
                  </p>
                </div>
                <div>
                  <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
                    Expires
                  </p>
                  <p className="font-mono text-sm text-foreground">{activeCard.expiry}</p>
                </div>
                <div>
                  <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
                    CVV
                  </p>
                  <p className="font-mono text-sm text-foreground">•••</p>
                </div>
                <div>
                  <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
                    Network
                  </p>
                  <p className="font-mono text-sm text-foreground">{activeCard.network}</p>
                </div>
              </div>
            )}

            <div className="space-y-3 pt-2">
              {cardControls.map((control) => (
                <div
                  key={control.id}
                  className="flex items-center justify-between rounded-lg border border-border bg-secondary/30 p-3"
                >
                  <div className="flex items-center gap-3">
                    <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10">
                      <control.icon className="h-4 w-4 text-primary" />
                    </div>
                    <span className="text-sm text-foreground">{control.label}</span>
                  </div>
                  <Switch defaultChecked={control.enabled} />
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Spending limit */}
        <Card className="bg-card border-border">
          <CardHeader>
            <CardTitle className="text-lg font-semibold">Monthly Spending</CardTitle>
            <p className="text-xs text-muted-foreground">Limit resets on the 1st</p>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <div className="flex items-end justify-between">
                <span className="text-2xl font-bold text-foreground">€0</span>
                <span className="text-sm text-muted-foreground">of €50,000</span>
              </div>
              <Progress value={0} className="mt-2" />
              <p className="mt-1 text-xs text-muted-foreground">0% of monthly limit used</p>
            </div>
            <div className="rounded-lg border border-primary/20 bg-primary/5 p-3">
              <div className="flex items-center gap-2">
                <ShieldCheck className="h-4 w-4 text-primary" />
                <span className="text-sm font-medium text-foreground">3-D Secure enabled</span>
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                All online transactions require biometric approval.
              </p>
            </div>
            <Button variant="outline" size="sm" className="w-full" onClick={adjustLimit}>
              Adjust Limit
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
