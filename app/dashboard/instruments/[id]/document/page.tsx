"use client"

import { useMemo } from "react"
import Link from "next/link"
import { useParams } from "next/navigation"
import { ArrowLeft, Download, FileText, ShieldCheck } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { useInstrumentRequests } from "@/lib/instrument-requests-store"
import { useCurrentUser } from "@/lib/use-current-user"
import { usePdfViewer } from "@/lib/pdf-viewer"
import { buildInstrumentDocument, generateInstrumentDocumentPdf } from "@/lib/instrument-document"

export default function InstrumentDocumentPage() {
  const params = useParams<{ id: string }>()
  const { instruments, hydrated } = useInstrumentRequests()
  const user = useCurrentUser()
  const { show } = usePdfViewer()

  const id = decodeURIComponent(params.id)
  const instrument = useMemo(() => instruments.find((i) => i.id === id), [instruments, id])

  const content = useMemo(() => {
    if (!instrument) return null
    return buildInstrumentDocument(instrument, {
      name: user.fullName,
      company: user.company,
      country: user.passportMeta?.country,
    })
  }, [instrument, user])

  if (hydrated && !instrument) {
    return (
      <div className="mx-auto max-w-2xl">
        <Button variant="ghost" size="sm" asChild className="mb-4">
          <Link href="/dashboard/instruments">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to Instruments
          </Link>
        </Button>
        <Card className="bg-card border-border">
          <CardContent className="flex flex-col items-center justify-center py-16 text-center">
            <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-secondary">
              <FileText className="h-5 w-5 text-muted-foreground" />
            </div>
            <p className="text-sm font-medium text-foreground">Instrument not found</p>
            <p className="mt-1 text-xs text-muted-foreground">
              No instrument matches <code className="text-foreground">{id}</code>.
            </p>
          </CardContent>
        </Card>
      </div>
    )
  }

  if (!instrument || !content) {
    return (
      <div className="mx-auto max-w-3xl">
        <div className="h-9 w-40 animate-pulse rounded-md bg-secondary" />
        <div className="mt-4 h-[600px] animate-pulse rounded-xl bg-secondary" />
      </div>
    )
  }

  const handleDownload = () => {
    show(generateInstrumentDocumentPdf(content))
  }

  return (
    <div className="mx-auto max-w-3xl pb-12">
      {/* Toolbar */}
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <Button variant="ghost" size="sm" asChild>
          <Link href={`/dashboard/instruments/${encodeURIComponent(instrument.id)}`}>
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to Instrument
          </Link>
        </Button>
        <Button onClick={handleDownload} className="min-h-11">
          <Download className="mr-2 h-4 w-4" />
          Download Hard Copy (PDF)
        </Button>
      </div>

      {/* Paper document */}
      <article className="relative overflow-hidden rounded-lg border-2 border-[#172546] bg-[#fcfcfa] p-6 text-[#111111] shadow-xl ring-1 ring-[#b08426]/30 sm:p-10">
        {/* Watermark */}
        <span
          aria-hidden
          className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 -rotate-[28deg] select-none text-[120px] font-black leading-none tracking-tight text-black/[0.04] sm:text-[180px]"
        >
          {content.kind}
        </span>

        <div className="relative">
          {/* Letterhead */}
          <header className="text-center">
            <h1 className="text-pretty text-xl font-bold tracking-tight text-[#172546] sm:text-2xl">
              {content.issuerName}
            </h1>
            <p className="mt-1 text-xs text-[#6e7480]">
              {[content.issuerAddress, content.issuerCountry].filter(Boolean).join(", ")}
            </p>
            <p className="text-xs text-[#6e7480]">SWIFT/BIC: {content.issuerBic}</p>
            <div className="mx-auto mt-4 h-px w-3/4 bg-[#b08426]" />
          </header>

          {/* Title */}
          <div className="mt-6 text-center">
            <h2 className="text-balance text-lg font-bold uppercase tracking-wide sm:text-xl">{content.title}</h2>
            <p className="mx-auto mt-1 max-w-xl text-pretty text-[11px] leading-relaxed text-[#6e7480]">
              {content.subtitle}
            </p>
            <p className="mt-3 text-sm font-semibold">{content.placeAndDate}</p>
          </div>

          {/* Parties */}
          <Section title="Parties">
            <div className="grid gap-4 sm:grid-cols-2">
              {content.parties.map((party) => (
                <div key={party.role} className="rounded-md border border-[#e1e3e7] bg-white/60 p-3">
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-[#6e7480]">{party.role}</p>
                  <p className="mt-1 text-sm font-bold leading-snug">{party.name}</p>
                  {party.lines.map((line) => (
                    <p key={line} className="text-xs leading-relaxed text-[#33373f]">
                      {line}
                    </p>
                  ))}
                  {party.bic && <p className="mt-0.5 text-xs text-[#33373f]">SWIFT/BIC: {party.bic}</p>}
                </div>
              ))}
            </div>
          </Section>

          {/* Key terms */}
          <Section title="Key Terms">
            <dl className="overflow-hidden rounded-md border border-[#e1e3e7]">
              {content.keyTerms.map((term, i) => (
                <div
                  key={term.label}
                  className={`flex items-start justify-between gap-4 px-3 py-2 text-xs ${
                    i % 2 === 0 ? "bg-[#f8f9fb]" : "bg-white"
                  }`}
                >
                  <dt className="text-[#6e7480]">{term.label}</dt>
                  <dd className="text-right font-semibold">{term.value}</dd>
                </div>
              ))}
            </dl>
          </Section>

          {/* Operative text */}
          <Section title="Operative Text">
            <p className="text-pretty text-[13px] leading-relaxed">{content.preamble}</p>
            <div className="mt-4 space-y-3">
              {content.clauses.map((clause) => (
                <div key={clause.heading}>
                  <h4 className="text-[13px] font-bold">{clause.heading}</h4>
                  <p className="text-pretty text-[13px] leading-relaxed text-[#1f2229]">{clause.text}</p>
                </div>
              ))}
            </div>
          </Section>

          {/* Rules */}
          <Section title="Applicable Rules">
            <p className="text-pretty text-[12px] leading-relaxed">{content.rulesClause}</p>
            <p className="mt-2 text-[12px] font-semibold">Governing Law: {content.governingLaw}.</p>
            <p className="mt-2 flex items-start gap-1.5 text-[11px] italic leading-relaxed text-[#6e7480]">
              <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[#b08426]" />
              {content.deliveryNote}
            </p>
          </Section>

          {/* Signatures */}
          <div className="mt-8 grid gap-8 border-t border-[#e1e3e7] pt-6 sm:grid-cols-2">
            {content.signatories.map((sig, i) => (
              <div key={i}>
                <div className="h-10 border-b border-[#111111]" />
                <p className="mt-1 text-sm font-bold">{sig.name}</p>
                <p className="text-xs text-[#6e7480]">{sig.title}</p>
              </div>
            ))}
          </div>

          <p className="mt-6 text-pretty text-[10px] leading-relaxed text-[#6e7480]">
            This document is generated electronically by MCC Capital — MCC Banking &amp; Trade Platform and is valid as
            an operative instrument copy. Verify authenticity by quoting reference {content.reference} to your
            relationship manager.
          </p>
        </div>
      </article>
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-6">
      <h3 className="mb-2 text-xs font-bold uppercase tracking-wider text-[#172546]">{title}</h3>
      {children}
    </section>
  )
}
