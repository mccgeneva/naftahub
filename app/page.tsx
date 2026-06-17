"use client"

import Link from "next/link"
import {
  ArrowRight,
  Shield,
  Globe,
  TrendingUp,
  Building2,
  CheckCircle2,
  Lock,
  Zap,
  Users,
  FileText,
  CreditCard,
  DollarSign,
  ChevronRight,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"

const features = [
  {
    icon: Globe,
    title: "Global Payments",
    description:
      "Send and receive payments globally through our network of AAA+ rated banks including NatWest, JP Morgan, HSBC, and UBS.",
  },
  {
    icon: FileText,
    title: "Bank Instruments",
    description:
      "Trade SBLC, MTN, and Bank Guarantees with competitive pricing. Purchase at 23%, lease at 4%, or assign at 0.2%.",
  },
  {
    icon: TrendingUp,
    title: "PPP/Yield Programs",
    description:
      "Access exclusive Private Placement Programs with returns of 20-100% through secure arbitrage trading.",
  },
  {
    icon: DollarSign,
    title: "FX Trading",
    description:
      "Trade 330+ forex pairs with live rates, ultra-fast execution, and competitive spreads from 0.0 pips.",
  },
  {
    icon: Shield,
    title: "AML Compliance",
    description:
      "Full Anti-Money Laundering compliance with comprehensive KYC and source of funds verification.",
  },
  {
    icon: Lock,
    title: "Swiss Fiduciary",
    description:
      "Operate under the Swiss fiduciary umbrella of MCC Holding SA for maximum privacy and tax efficiency.",
  },
]

const bankPartners = [
  "NatWest",
  "JP Morgan Chase",
  "HSBC",
  "UBS",
  "Barclays",
  "Deutsche Bank",
  "Lloyds",
  "Credit Suisse",
  "DBS Singapore",
  "Citibank",
]

const plans = [
  {
    name: "PRO",
    price: "€25,000",
    subtitle: "€500,000 security deposit — or €50,000 with approved 1:10 leverage",
    description: "Full platform access for serious traders",
    features: [
      "Live rates dashboard & transaction execution",
      "Payment management & transaction history",
      "Extended bank network: HSBC, UBS, JP Morgan",
      "Fiduciary asset management",
      "Unlimited bank instruments trading",
      "Unlimited trading volume",
      "Mass payments in/out",
      "Preferential PPP access",
      "EY certification included",
      "Features & commodities trading",
      "Custom EuroClear/EuroSwift system",
    ],
    limitations: ["6 month minimum commitment", "2% transaction fees"],
    popular: true,
    cta: "Upgrade to PRO",
  },
  {
    name: "Avant-Garde",
    price: "€120,000",
    subtitle: "€1,000,000 security deposit — or €100,000 with approved 1:10 leverage",
    description: "Enterprise-grade platform for institutions",
    features: [
      "Everything in PRO, plus:",
      "Hong Kong structure with Swiss backing",
      "Full tax exemptions",
      "Maximum confidentiality",
      "Dedicated trading team 24/7",
      "AI-powered trading forecasts",
      "Bloomberg, LSEG, Moody&apos;s data",
      "Priority bank partner access",
      "Barclays, Citibank, ClearBank UK access",
    ],
    limitations: ["2 year minimum commitment", "0.2% instrument fees"],
    popular: false,
    cta: "Contact Sales",
  },
]

const stats = [
  { value: "€50B+", label: "Transaction Volume" },
  { value: "15+", label: "Bank Partners" },
  { value: "45+", label: "Countries Served" },
  { value: "24/7", label: "Trading Support" },
]

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-background">
      {/* Navigation */}
      <nav className="sticky top-0 z-50 border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="flex h-16 items-center justify-between">
            <Link href="/" className="flex items-center gap-2">
              <img
                src="/images/mcc-logo.png"
                alt="MCC Capital logo"
                className="h-9 w-9 rounded-full object-cover"
              />
              <span className="text-lg font-semibold text-foreground">
                MCC Capital
              </span>
            </Link>
            <div className="hidden md:flex items-center gap-6">
              <Link
                href="#features"
                className="text-sm text-muted-foreground hover:text-foreground transition-colors"
              >
                Features
              </Link>
              <Link
                href="#pricing"
                className="text-sm text-muted-foreground hover:text-foreground transition-colors"
              >
                Pricing
              </Link>
              <Link
                href="#partners"
                className="text-sm text-muted-foreground hover:text-foreground transition-colors"
              >
                Partners
              </Link>
              <Button variant="outline" size="sm" asChild>
                <Link href="/login">Sign In</Link>
              </Button>
              <Button size="sm" asChild>
                <Link href="/dashboard">
                  Request Access
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Link>
              </Button>
            </div>
            <Button variant="ghost" size="sm" className="md:hidden" asChild>
              <Link href="/login">Sign In</Link>
            </Button>
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="relative overflow-hidden py-20 sm:py-32">
        <div className="absolute inset-0 bg-gradient-to-b from-primary/5 to-transparent" />
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 relative">
          <div className="text-center max-w-3xl mx-auto">
            <Badge
              variant="outline"
              className="mb-6 bg-primary/10 text-primary border-primary/20"
            >
              <Shield className="mr-1 h-3 w-3" />
              Swiss Financial Institution
            </Badge>
            <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold text-foreground tracking-tight text-balance">
              Financial Trading Platform for Global Business
            </h1>
            <p className="mt-6 text-lg text-muted-foreground max-w-2xl mx-auto text-pretty">
              MCC Pure Risk Management Solutions provides comprehensive banking
              services including payments, bank instruments trading, and
              high-yield investment programs backed by NatWest and JP Morgan
              Chase.
            </p>
            <div className="mt-10 flex flex-col sm:flex-row gap-4 justify-center">
              <Button size="lg" asChild>
                <Link href="/dashboard">
                  Access Platform
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Link>
              </Button>
              <Button size="lg" variant="outline" asChild>
                <Link href="#pricing">View Pricing</Link>
              </Button>
            </div>
          </div>

          {/* Stats */}
          <div className="mt-20 grid grid-cols-2 gap-4 sm:grid-cols-4">
            {stats.map((stat) => (
              <div
                key={stat.label}
                className="rounded-lg border border-border bg-card p-6 text-center"
              >
                <p className="text-3xl font-bold text-primary">{stat.value}</p>
                <p className="mt-1 text-sm text-muted-foreground">{stat.label}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section id="features" className="py-20 sm:py-32 bg-secondary/30">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="text-center max-w-2xl mx-auto mb-16">
            <h2 className="text-3xl sm:text-4xl font-bold text-foreground">
              Complete Banking Solution
            </h2>
            <p className="mt-4 text-muted-foreground">
              Everything you need for international trading and financial
              management
            </p>
          </div>

          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {features.map((feature) => (
              <Card key={feature.title} className="bg-card border-border">
                <CardHeader>
                  <div className="flex items-center gap-4">
                    <div className="rounded-lg bg-primary/10 p-3">
                      <feature.icon className="h-6 w-6 text-primary" />
                    </div>
                    <CardTitle className="text-lg">{feature.title}</CardTitle>
                  </div>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground">
                    {feature.description}
                  </p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* Bank Partners */}
      <section id="partners" className="py-20 sm:py-32">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="text-center max-w-2xl mx-auto mb-16">
            <h2 className="text-3xl sm:text-4xl font-bold text-foreground">
              Trusted Bank Partners
            </h2>
            <p className="mt-4 text-muted-foreground">
              Access accounts with the world&apos;s leading financial institutions
            </p>
          </div>

          <div className="flex flex-wrap justify-center gap-4">
            {bankPartners.map((bank) => (
              <div
                key={bank}
                className="flex items-center gap-2 rounded-lg border border-border bg-card px-6 py-3"
              >
                <Building2 className="h-4 w-4 text-primary" />
                <span className="text-sm font-medium text-foreground">{bank}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Pricing Section */}
      <section id="pricing" className="py-20 sm:py-32 bg-secondary/30">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="text-center max-w-2xl mx-auto mb-16">
            <h2 className="text-3xl sm:text-4xl font-bold text-foreground">
              Platform Plans
            </h2>
            <p className="mt-4 text-muted-foreground">
              Choose the plan that fits your trading requirements
            </p>
          </div>

          <div className="grid gap-8 md:grid-cols-2 max-w-4xl mx-auto">
            {plans.map((plan) => (
              <Card
                key={plan.name}
                className={cn(
                  "bg-card border-border relative",
                  plan.popular && "border-primary shadow-lg shadow-primary/10"
                )}
              >
                {plan.popular && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                    <Badge className="bg-primary text-primary-foreground">
                      Most Popular
                    </Badge>
                  </div>
                )}
                <CardHeader className="text-center pb-2">
                  <CardTitle className="text-2xl">{plan.name}</CardTitle>
                  <div className="mt-4">
                    <span className="text-4xl font-bold text-foreground">
                      {plan.price}
                    </span>
                    <span className="text-muted-foreground"> / year</span>
                  </div>
                  {plan.subtitle && (
                    <p className="text-sm text-primary mt-1">{plan.subtitle}</p>
                  )}
                  <p className="text-sm text-muted-foreground mt-2">
                    {plan.description}
                  </p>
                </CardHeader>
                <CardContent className="space-y-6">
                  <ul className="space-y-3">
                    {plan.features.map((feature, idx) => (
                      <li key={idx} className="flex items-start gap-2">
                        <CheckCircle2 className="h-4 w-4 text-primary mt-0.5 shrink-0" />
                        <span className="text-sm text-foreground">{feature}</span>
                      </li>
                    ))}
                  </ul>

                  <div className="pt-4 border-t border-border">
                    <p className="text-xs text-muted-foreground mb-2">
                      Requirements:
                    </p>
                    <ul className="space-y-1">
                      {plan.limitations.map((limit, idx) => (
                        <li
                          key={idx}
                          className="text-xs text-muted-foreground flex items-center gap-1"
                        >
                          <ChevronRight className="h-3 w-3" />
                          {limit}
                        </li>
                      ))}
                    </ul>
                  </div>

                  <Button
                    className="w-full"
                    variant={plan.popular ? "default" : "outline"}
                    asChild
                  >
                    <Link href="/dashboard">
                      {plan.cta}
                      <ArrowRight className="ml-2 h-4 w-4" />
                    </Link>
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-20 sm:py-32">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <Card className="bg-gradient-to-r from-primary/20 to-primary/5 border-primary/20">
            <CardContent className="py-16 text-center">
              <h2 className="text-3xl sm:text-4xl font-bold text-foreground">
                Ready to Get Started?
              </h2>
              <p className="mt-4 text-muted-foreground max-w-xl mx-auto">
                Contact our team for a personalized consultation and learn how
                MCC Platform can streamline your international banking needs.
              </p>
              <div className="mt-8 flex flex-col sm:flex-row gap-4 justify-center">
                <Button size="lg" asChild>
                  <Link href="/dashboard">
                    Access Platform
                    <ArrowRight className="ml-2 h-4 w-4" />
                  </Link>
                </Button>
                <Button size="lg" variant="outline" asChild>
                  <a href="mailto:admin@mccgva.ch?subject=Consultation%20Request%20%E2%80%94%20MCC%20Platform">
                    Schedule Consultation
                  </a>
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-border py-12">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-2">
              <img
                src="/images/mcc-logo.png"
                alt="MCC Capital logo"
                className="h-9 w-9 rounded-full object-cover"
              />
              <div>
                <span className="text-sm font-semibold text-foreground">
                  MCC Holding SA
                </span>
                <p className="text-xs text-muted-foreground">
                  Rue du Rhône 14, Geneva, Switzerland
                </p>
              </div>
            </div>
            <div className="flex items-center gap-6 text-xs text-muted-foreground">
              <span>CHE-110.027.662</span>
              <span>FCA Regulated Partners</span>
              <span>AML Compliant</span>
            </div>
          </div>
          <div className="mt-8 pt-8 border-t border-border text-center text-xs text-muted-foreground">
            © 2024 MCC Holding SA. All rights reserved. This platform is for
            qualified investors only.
          </div>
        </div>
      </footer>
    </div>
  )
}
