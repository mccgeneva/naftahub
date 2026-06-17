"use client"

import { toast } from "sonner"
import {
  Landmark,
  ShieldCheck,
  Lock,
  Eye,
  Building,
  FileText,
} from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { useActivityLog } from "@/components/activity-tracker"

const principles = [
  {
    icon: Lock,
    title: "Asset Protection",
    description:
      "Assets are held in the name of the fiduciary, shielding the beneficial owner from direct exposure.",
  },
  {
    icon: Eye,
    title: "Confidentiality",
    description:
      "Swiss banking secrecy and fiduciary duty keep your holdings private and discreet at all times.",
  },
  {
    icon: ShieldCheck,
    title: "Regulated Custody",
    description:
      "All fiduciary mandates are governed under FINMA supervision and segregated custody rules.",
  },
]

type Holding = {
  icon: typeof Building
  name: string
  detail: string
  value: string
  change: string
}

// No assets are held under custody until a fiduciary mandate is funded.
// Holdings are populated from real custody records, never placeholder figures.
const holdings: Holding[] = []

export default function FiduciaryPage() {
  const log = useActivityLog()

  // Total under custody is summed from real holdings; €0.00 when none are held.
  const totalCustody = holdings.reduce((sum, h) => {
    const numeric = Number.parseFloat(h.value.replace(/[^0-9.]/g, "")) || 0
    return sum + numeric
  }, 0)

  const requestStatement = () => {
    log({
      action: "Requested a fiduciary asset statement",
      category: "Fiduciary & Assets",
      details: {
        summary:
          "Client requested an official statement for fiduciary mandate FID-2024-0917.",
        mandate: "FID-2024-0917",
        requestedAt: new Date().toLocaleString("en-GB"),
      },
    })
    toast.success("Statement requested", {
      description: "Your fiduciary statement will be delivered to your secure inbox.",
    })
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Fiduciary &amp; Assets</h1>
          <p className="text-sm text-muted-foreground">
            Confidential asset management and fiduciary custody services
          </p>
        </div>
        <Button size="sm" variant="outline" onClick={requestStatement}>
          <FileText className="mr-2 h-4 w-4" />
          Request Statement
        </Button>
      </div>

      {/* Total holdings banner */}
      <Card className="bg-gradient-to-r from-primary/15 to-primary/5 border-primary/20">
        <CardContent className="flex flex-col gap-4 p-6 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/20">
              <Landmark className="h-6 w-6 text-primary" />
            </div>
            <div>
              <p className="text-xs uppercase tracking-wider text-muted-foreground">
                Total Assets Under Custody
              </p>
              <p className="text-3xl font-bold text-foreground">
                €{totalCustody.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </p>
            </div>
          </div>
          <Badge variant="outline" className="w-fit bg-secondary text-muted-foreground border-border">
            <ShieldCheck className="mr-1 h-3 w-3" />
            {holdings.length > 0 ? `${holdings.length} holdings` : "No assets under custody"}
          </Badge>
        </CardContent>
      </Card>

      {/* Privacy principles */}
      <div className="grid gap-4 md:grid-cols-3">
        {principles.map((p) => (
          <Card key={p.title} className="bg-card border-border">
            <CardContent className="p-5">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                <p.icon className="h-5 w-5 text-primary" />
              </div>
              <h3 className="mt-3 text-sm font-semibold text-foreground">{p.title}</h3>
              <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{p.description}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Holdings */}
      <Card className="bg-card border-border">
        <CardHeader>
          <CardTitle className="text-lg font-semibold">Asset Holdings</CardTitle>
          <p className="text-xs text-muted-foreground">Held under fiduciary mandate FID-2024-0917</p>
        </CardHeader>
        <CardContent className="space-y-3">
          {holdings.length === 0 && (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-secondary">
                <Landmark className="h-5 w-5 text-muted-foreground" />
              </div>
              <p className="text-sm font-medium text-foreground">No assets under custody</p>
              <p className="mt-1 text-xs text-muted-foreground">
                Assets held under your fiduciary mandate will appear here once funded.
              </p>
            </div>
          )}
          {holdings.map((h) => {
            const positive = !h.change.startsWith("-")
            return (
              <div
                key={h.name}
                className="flex items-center justify-between rounded-lg border border-border bg-secondary/30 p-4"
              >
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                    <h.icon className="h-5 w-5 text-primary" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-foreground">{h.name}</p>
                    <p className="text-xs text-muted-foreground">{h.detail}</p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-base font-bold text-foreground">{h.value}</p>
                  <span
                    className={
                      positive
                        ? "text-xs font-medium text-green-500"
                        : "text-xs font-medium text-red-500"
                    }
                  >
                    {h.change}
                  </span>
                </div>
              </div>
            )
          })}
        </CardContent>
      </Card>
    </div>
  )
}
