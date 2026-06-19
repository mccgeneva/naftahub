"use client"

import { BookOpen, Download, FileText, ChevronRight } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { useActivityLog } from "@/components/activity-tracker"
import { generateHandbookPdf } from "@/lib/handbook-pdf"
import { usePdfViewer } from "@/lib/pdf-viewer"
import { HANDBOOK_META, HANDBOOK_SECTIONS } from "@/lib/handbook-content"

export default function HandbookPage() {
  const logActivity = useActivityLog()
  const { show } = usePdfViewer()

  const handleDownload = () => {
    show(generateHandbookPdf())
    logActivity({
      action: "Downloaded the MCC Capital Client Handbook (PDF)",
      category: "Platform",
      details: {
        summary: "Client downloaded the full MCC Capital Client Handbook as a PDF.",
        document: HANDBOOK_META.title,
        version: HANDBOOK_META.version,
        format: "PDF",
      },
    })
  }

  return (
    <div className="space-y-6 max-w-4xl">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-start gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary/10">
            <BookOpen className="h-6 w-6 text-primary" />
          </div>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-2xl font-bold text-foreground">{HANDBOOK_META.title}</h1>
              <Badge variant="outline" className="border-primary/30 bg-primary/10 text-primary text-[10px]">
                {HANDBOOK_META.version}
              </Badge>
            </div>
            <p className="mt-1 text-sm text-muted-foreground text-pretty">
              {HANDBOOK_META.subtitle}
            </p>
          </div>
        </div>
      </div>

      {/* Download banner */}
      <Card className="border-primary/20 bg-gradient-to-br from-primary/10 to-primary/5">
        <CardContent className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between sm:p-6">
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/15">
              <FileText className="h-5 w-5 text-primary" />
            </div>
            <div>
              <p className="text-sm font-semibold text-foreground">Download the full handbook</p>
              <p className="mt-0.5 text-xs text-muted-foreground text-pretty">
                A professionally formatted PDF covering every feature of your platform — ideal for
                offline reference and onboarding your team.
              </p>
            </div>
          </div>
          <Button size="lg" className="shrink-0" onClick={handleDownload}>
            <Download className="mr-2 h-4 w-4" />
            Download PDF
          </Button>
        </CardContent>
      </Card>

      {/* Table of contents */}
      <Card className="bg-card border-border">
        <CardHeader className="pb-3">
          <CardTitle className="text-lg font-semibold">Contents</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-2 sm:grid-cols-2">
          {HANDBOOK_SECTIONS.map((section) => (
            <a
              key={section.id}
              href={`#${section.id}`}
              className="group flex items-center gap-3 rounded-lg border border-border bg-secondary/30 p-3 transition-colors hover:bg-secondary/60"
            >
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-primary/15 text-xs font-bold text-primary">
                {section.number}
              </span>
              <span className="flex-1 text-sm font-medium text-foreground">{section.title}</span>
              <ChevronRight className="h-4 w-4 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
            </a>
          ))}
        </CardContent>
      </Card>

      {/* Sections */}
      <div className="space-y-6">
        {HANDBOOK_SECTIONS.map((section) => (
          <Card key={section.id} id={section.id} className="bg-card border-border scroll-mt-20">
            <CardHeader>
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold uppercase tracking-wider text-primary">
                  Section {section.number}
                </span>
              </div>
              <CardTitle className="text-xl font-bold text-foreground text-balance">
                {section.title}
              </CardTitle>
              {section.intro && (
                <p className="text-sm text-muted-foreground text-pretty">{section.intro}</p>
              )}
            </CardHeader>
            <CardContent className="space-y-5">
              {section.subsections.map((sub) => (
                <div key={sub.heading}>
                  <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold text-foreground">
                    <span className="h-3 w-0.5 rounded-full bg-primary" aria-hidden />
                    {sub.heading}
                  </h3>
                  {sub.paragraphs?.map((p, i) => (
                    <p key={i} className="mb-2 text-sm leading-relaxed text-muted-foreground text-pretty">
                      {p}
                    </p>
                  ))}
                  {sub.bullets && (
                    <ul className="mt-2 space-y-1.5">
                      {sub.bullets.map((b, i) => (
                        <li key={i} className="flex items-start gap-2 text-sm text-muted-foreground">
                          <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" aria-hidden />
                          <span className="text-pretty">{b}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              ))}
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Footer download */}
      <Card className="bg-card border-border">
        <CardContent className="flex flex-col items-center gap-3 p-6 text-center">
          <p className="text-sm text-muted-foreground text-pretty">
            Keep a copy of this handbook for your records.
          </p>
          <Button onClick={handleDownload}>
            <Download className="mr-2 h-4 w-4" />
            Download PDF
          </Button>
        </CardContent>
      </Card>
    </div>
  )
}
