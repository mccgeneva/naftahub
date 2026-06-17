"use client"

import { toast } from "sonner"
import {
  Wallet,
  ShieldCheck,
  ScanSearch,
  ArrowLeftRight,
  Sparkles,
  CheckCircle2,
  Clock,
} from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { useActivityLog } from "@/components/activity-tracker"

const services = [
  {
    icon: Wallet,
    name: "PayMaster",
    description:
      "Centralised mass-payment engine for payroll, supplier settlements and bulk SWIFT disbursements.",
    status: "Active",
    active: true,
  },
  {
    icon: ShieldCheck,
    name: "PPI — Payment Protection Insurance",
    description:
      "Transaction insurance covering settlement risk and counterparty default on high-value transfers.",
    status: "Active",
    active: true,
  },
  {
    icon: ScanSearch,
    name: "AML Screening",
    description:
      "Real-time anti-money-laundering and sanctions screening on every inbound and outbound payment.",
    status: "Active",
    active: true,
  },
  {
    icon: ArrowLeftRight,
    name: "FX Active Account",
    description:
      "Live interbank FX rates with automated hedging across 38 currency pairs.",
    status: "Active",
    active: true,
  },
  {
    icon: Sparkles,
    name: "AI Trading Forecasts",
    description:
      "Machine-learning yield and market forecasts informing PPP and instrument strategies.",
    status: "Beta",
    active: false,
  },
]

const compliance = [
  { label: "FINMA Supervision", value: "Compliant" },
  { label: "KYC / KYB Verification", value: "Verified" },
  { label: "AML / CFT Framework", value: "Active" },
  { label: "GDPR Data Protection", value: "Compliant" },
  { label: "ISO 27001 Security", value: "Certified" },
  { label: "PSD2 Open Banking", value: "Enabled" },
]

export default function ServicesPage() {
  const log = useActivityLog()

  const handleService = (name: string, active: boolean) => {
    log({
      action: active ? `Opened management for ${name}` : `Requested beta access to ${name}`,
      category: "Services & Compliance",
      details: {
        summary: active
          ? `Client opened the management panel for the "${name}" service.`
          : `Client requested beta enrollment for the "${name}" service.`,
        service: name,
        requestedAt: new Date().toLocaleString("en-GB"),
      },
    })
    toast.success(
      active ? `Opening ${name} management` : `Beta access requested for ${name}`,
      {
        description: active
          ? "Your relationship manager will assist with any changes."
          : "We'll notify you once you're enrolled in the beta program.",
      },
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-foreground">Services &amp; Compliance</h1>
        <p className="text-sm text-muted-foreground">
          Value-added banking services and regulatory compliance status
        </p>
      </div>

      {/* Services */}
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {services.map((service) => (
          <Card key={service.name} className="bg-card border-border">
            <CardContent className="p-5">
              <div className="flex items-start justify-between">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                  <service.icon className="h-5 w-5 text-primary" />
                </div>
                <Badge
                  variant="outline"
                  className={
                    service.active
                      ? "bg-green-500/10 text-green-500 border-green-500/20 text-[10px]"
                      : "bg-yellow-500/10 text-yellow-500 border-yellow-500/20 text-[10px]"
                  }
                >
                  {service.active ? (
                    <CheckCircle2 className="mr-1 h-3 w-3" />
                  ) : (
                    <Clock className="mr-1 h-3 w-3" />
                  )}
                  {service.status}
                </Badge>
              </div>
              <h3 className="mt-3 text-sm font-semibold text-foreground">{service.name}</h3>
              <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                {service.description}
              </p>
              <Button
                variant="outline"
                size="sm"
                className="mt-4 w-full"
                onClick={() => handleService(service.name, service.active)}
              >
                {service.active ? "Manage" : "Join Beta"}
              </Button>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Compliance status */}
      <Card className="bg-card border-border">
        <CardHeader>
          <CardTitle className="text-lg font-semibold">Regulatory Compliance</CardTitle>
          <p className="text-xs text-muted-foreground">
            MCC Capital operates under full Swiss and EU regulatory frameworks
          </p>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {compliance.map((item) => (
              <div
                key={item.label}
                className="flex items-center justify-between rounded-lg border border-border bg-secondary/30 p-3"
              >
                <span className="text-sm text-foreground">{item.label}</span>
                <Badge variant="outline" className="bg-primary/10 text-primary border-primary/20 text-[10px]">
                  <ShieldCheck className="mr-1 h-3 w-3" />
                  {item.value}
                </Badge>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
