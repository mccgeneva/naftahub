"use client"

import useSWR from "swr"
import { FileText, ShieldAlert } from "lucide-react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { downloadFile } from "@/lib/download-file"
import type { ClientComplianceNotice } from "@/lib/aml-cases-db"

const fetcher = (url: string) =>
  fetch(url, { cache: "no-store" })
    .then((r) => r.json())
    .then((d) => (Array.isArray(d?.notices) ? (d.notices as ClientComplianceNotice[]) : []))
    .catch(() => [] as ClientComplianceNotice[])

function fmtDate(iso: string | null) {
  if (!iso) return ""
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })
}

export function ComplianceNotices() {
  const { data: notices = [] } = useSWR("/api/compliance/notices", fetcher, {
    refreshInterval: 60000,
    revalidateOnFocus: true,
  })
  if (!notices.length) return null

  return (
    <Card id="compliance-notices" className="scroll-mt-24 border-amber-500/40">
      <CardHeader className="flex flex-row items-start gap-3 space-y-0">
        <ShieldAlert className="mt-0.5 size-5 shrink-0 text-amber-500" aria-hidden="true" />
        <div className="flex min-w-0 flex-col gap-1">
          <CardTitle className="text-base text-balance">Compliance notices</CardTitle>
          <CardDescription className="text-pretty">
            Messages from the MCC compliance office about your account.
          </CardDescription>
        </div>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {notices.map((n) => (
          <article key={n.id} className="flex flex-col gap-3 rounded-lg border border-border p-4">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <h3 className="min-w-0 flex-1 font-medium leading-snug text-pretty">{n.subject}</h3>
              <Badge variant="outline">{n.closed ? "Closed" : "Open"}</Badge>
            </div>
            {n.sharedAt && <p className="text-xs text-muted-foreground">Sent {fmtDate(n.sharedAt)}</p>}
            <p className="whitespace-pre-wrap text-sm leading-relaxed">{n.message}</p>
            {n.documents.length > 0 && (
              <div className="flex flex-col gap-2">
                {n.documents.map((d) => (
                  <Button
                    key={d.pathname}
                    variant="outline"
                    className="min-h-11 justify-start"
                    onClick={() =>
                      downloadFile(`/api/compliance/notices/file?pathname=${encodeURIComponent(d.pathname)}`, d.name)
                    }
                  >
                    <FileText className="size-4" aria-hidden="true" />
                    <span className="truncate">{d.name}</span>
                  </Button>
                ))}
              </div>
            )}
          </article>
        ))}
      </CardContent>
    </Card>
  )
}
