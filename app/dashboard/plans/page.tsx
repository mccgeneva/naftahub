"use client"

import { Check, Crown, Star, Building2, Lock } from "lucide-react"
import { Card, CardContent, CardHeader } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"
import { useActivityLog } from "@/components/activity-tracker"

const plans = [
  {
    id: "pro",
    name: "PRO",
    icon: Star,
    price: "€25,000",
    period: "/ year",
    deposit: "€500,000",
    description: "For active private investors and SMEs",
    highlighted: false,
    features: [
      "Multi-currency IBAN accounts",
      "SWIFT MT103 & MT760 transfers",
      "Up to €5M trading volume / month",
      "Standard bank instruments access",
      "Dedicated account manager",
      "Email & phone support",
    ],
  },
  {
    id: "avantgarde",
    name: "AVANTGARDE",
    icon: Crown,
    price: "€122,000",
    period: "/ year",
    deposit: "€1,000,000",
    description: "For institutions and high-net-worth clients",
    highlighted: true,
    features: [
      "Everything in PRO, plus:",
      "Unlimited trading volume",
      "Priority SBLC / MTN / BG issuance",
      "Fiduciary & asset custody mandate",
      "PPP / yield program enrollment",
      "24/7 dedicated relationship manager",
      "Bespoke compliance & legal desk",
    ],
  },
]

const bankPartners = [
  "JP Morgan Chase",
  "UBS Switzerland",
  "HSBC London",
  "Deutsche Bank AG",
  "Barclays Bank",
  "NatWest Bank PLC",
  "BNP Paribas",
  "Citibank N.A.",
  "Credit Suisse",
  "Standard Chartered",
  "Société Générale",
  "Santander",
  "Banking Circle",
  "Goldman Sachs",
  "Morgan Stanley",
  "BlackRock",
]

export default function PlansPage() {
  const log = useActivityLog()

  const selectPlan = (planName: string, price?: string, deposit?: string) => {
    log({
      action: `Requested to upgrade/select the ${planName} plan`,
      category: "Plans & Pricing",
      details: {
        summary: `Client requested the "${planName}" membership plan${price ? ` priced at ${price} / year` : ""}${deposit ? `, with a ${deposit} refundable security deposit blocked in our treasury bank` : ""}. The relationship manager should follow up to confirm activation.`,
        plan: planName,
        price: price ? `${price} / year` : "(see plan details)",
        securityDeposit: deposit ? `${deposit} (blocked in treasury bank)` : "(see plan details)",
        requestedAt: new Date().toLocaleString("en-GB"),
      },
    })
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="text-center">
        <h1 className="text-2xl font-bold text-foreground">Plans &amp; Pricing</h1>
        <p className="mx-auto mt-1 max-w-xl text-sm text-muted-foreground text-pretty">
          Choose the membership that matches your trading ambitions. All plans include
          AAA+ rated banking partners and Swiss-grade security.
        </p>
      </div>

      {/* Plans */}
      <div className="mx-auto grid max-w-4xl gap-6 md:grid-cols-2">
        {plans.map((plan) => (
          <Card
            key={plan.id}
            className={cn(
              "relative border-border bg-card",
              plan.highlighted && "border-primary shadow-lg shadow-primary/10",
            )}
          >
            {plan.highlighted && (
              <Badge className="absolute -top-3 left-1/2 -translate-x-1/2 bg-primary text-primary-foreground">
                Most Popular
              </Badge>
            )}
            <CardHeader className="space-y-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10">
                <plan.icon className="h-6 w-6 text-primary" />
              </div>
              <div>
                <h2 className="text-xl font-bold text-foreground">{plan.name}</h2>
                <p className="text-xs text-muted-foreground">{plan.description}</p>
              </div>
              <div className="flex items-end gap-1">
                <span className="text-3xl font-bold text-foreground">{plan.price}</span>
                <span className="pb-1 text-sm text-muted-foreground">{plan.period}</span>
              </div>
              <div className="flex items-start gap-2 rounded-lg border border-primary/20 bg-primary/5 px-3 py-2">
                <Lock className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                <div>
                  <p className="text-sm font-semibold text-foreground">
                    {plan.deposit} security deposit
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Refundable, blocked in our treasury bank
                  </p>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <ul className="space-y-2">
                {plan.features.map((feature) => (
                  <li key={feature} className="flex items-start gap-2">
                    <Check className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                    <span className="text-sm text-foreground">{feature}</span>
                  </li>
                ))}
              </ul>
              <Button
                className="w-full"
                variant={plan.highlighted ? "default" : "outline"}
                onClick={() => selectPlan(plan.name, plan.price, plan.deposit)}
              >
                {plan.highlighted ? "Upgrade to AVANTGARDE" : "Select PRO"}
              </Button>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Bank partners */}
      <Card className="bg-card border-border">
        <CardHeader>
          <div className="flex items-center gap-2">
            <Building2 className="h-5 w-5 text-primary" />
            <h2 className="text-lg font-semibold text-foreground">AAA+ Banking Partners</h2>
          </div>
          <p className="text-xs text-muted-foreground">
            Instruments issued and confirmed through top-rated global institutions
          </p>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {bankPartners.map((bank) => (
              <div
                key={bank}
                className="flex items-center gap-2 rounded-lg border border-border bg-secondary/30 px-3 py-2"
              >
                <Building2 className="h-4 w-4 shrink-0 text-muted-foreground" />
                <span className="text-xs font-medium text-foreground">{bank}</span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
