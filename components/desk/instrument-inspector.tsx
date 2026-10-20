"use client"

import Link from "next/link"
import useSWR from "swr"
import { AlertTriangle, Download, Loader2, ShieldCheck, X } from "lucide-react"
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { usePdfViewer } from "@/lib/pdf-viewer"
import { generateInstrumentReferencePdf } from "@/lib/instrument-reference-pdf"
import type { InstrumentInspection } from "@/lib/instrument-inspection"
import type { DeskLog } from "@/components/desk/desk-panels"

const fetcher = (url: string) => fetch(url, { cache: "no-store" }).then((r) => r.json())

function fmtDate(iso: string | null) {
  if (!iso) return "—"
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })
}

function fmtMoney(v: number, ccy: string) {
  try {
    return new Intl.NumberFormat("en-US", { style: "currency", currency: ccy, maximumFractionDigits: 0 }).format(v)
  } catch {
    return `${ccy} ${v.toLocaleString("en-US")}`
  }
}

function Block({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="border-b border-border">
      <h3 className="bg-muted px-4 py-1.5 text-[11px] font-semibold uppercase tracking-wider text-primary">{title}</h3>
      <dl className="divide-y divide-border">{children}</dl>
    </section>
  )
}

function Row({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 px-4 py-2 text-sm">
      <dt className="shrink-0 text-muted-foreground">{k}</dt>
      <dd className="min-w-0 text-right font-mono tabular-nums break-words text-foreground">{v || "—"}</dd>
    </div>
  )
}

export function InstrumentInspector({
  isin,
  holderName,
  onClose,
  onLoad,
  log,
}: {
  isin: string | null
  holderName?: string
  onClose: () => void
  onLoad: (symbol: string) => void
  log: DeskLog
}) {
  const { show } = usePdfViewer()
  const { data, isLoading } = useSWR<{ ok: boolean; inspection?: InstrumentInspection; error?: string }>(
    isin ? `/api/desk/inspect?isin=${encodeURIComponent(isin)}` : null,
    fetcher,
    { revalidateOnFocus: false },
  )
  const ins = data?.inspection
  const primary = ins?.registry.matches[0]

  const download = () => {
    if (!ins) return
    show(generateInstrumentReferencePdf(ins, holderName))
    log("Desk instrument reference certificate downloaded", { isin: ins.isin })
  }

  return (
    <Dialog open={!!isin} onOpenChange={(o) => !o && onClose()}>
      <DialogContent
        showCloseButton={false}
        className="terminal-desk flex h-[100dvh] max-h-[100dvh] w-full max-w-full flex-col gap-0 overflow-hidden rounded-none border-0 bg-background p-0 text-foreground sm:h-[90dvh] sm:max-w-2xl sm:rounded-md sm:border"
      >
        <header className="flex shrink-0 items-start gap-3 border-b border-border px-4 pb-3 pt-[max(0.75rem,env(safe-area-inset-top))]">
          <div className="min-w-0 flex-1">
            <p className="font-mono text-[11px] uppercase tracking-wider text-muted-foreground">Instrument inspector</p>
            <DialogTitle className="font-mono text-lg font-semibold text-primary">{isin}</DialogTitle>
            <DialogDescription className="text-pretty text-sm text-foreground">
              {primary?.name ?? ins?.platform?.typeFull ?? (isLoading ? "Loading…" : "Reference data")}
            </DialogDescription>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close inspector"
            className="flex size-11 shrink-0 items-center justify-center rounded-sm border border-border text-foreground"
          >
            <X className="size-5" aria-hidden />
          </button>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto">
          {isLoading && (
            <div className="flex items-center justify-center gap-2 py-12 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" aria-hidden /> Checking registries…
            </div>
          )}
          {data && !data.ok && <p className="px-4 py-8 text-center text-sm text-red-500">{data.error}</p>}

          {ins && (
            <>
              <div className="flex items-start gap-2 border-b border-border px-4 py-3 text-sm">
                {ins.registry.listed ? (
                  <>
                    <ShieldCheck className="mt-0.5 size-4 shrink-0 text-emerald-500" aria-hidden />
                    <p className="leading-relaxed">
                      Found in the OpenFIGI registry with {ins.registry.matches.length} listing
                      {ins.registry.matches.length === 1 ? "" : "s"}.
                    </p>
                  </>
                ) : (
                  <>
                    <AlertTriangle className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
                    <p className="leading-relaxed text-muted-foreground">
                      {ins.registry.available
                        ? "Not exchange-listed. Normal for SBLCs, BGs and most private MTNs — verify with the issuing bank."
                        : "The identifier registry is temporarily unavailable."}
                    </p>
                  </>
                )}
              </div>

              <Block title="Identifier">
                <Row k="ISIN" v={ins.isin} />
                <Row k="National number" v={ins.nsin} />
                <Row
                  k="Check digit"
                  v={
                    <span className={ins.checkDigitValid ? "text-emerald-500" : "text-red-500"}>
                      {ins.checkDigitValid ? "Valid" : "Invalid"}
                    </span>
                  }
                />
                <Row k="Issuing code" v={`${ins.issuingCountryCode} · ${ins.issuingCountry}`} />
                <Row k="CUSIP" v={ins.cusip} />
              </Block>

              {primary && (
                <Block title="Security">
                  <Row k="Name" v={primary.name} />
                  <Row k="Ticker" v={primary.ticker} />
                  <Row k="Type" v={[primary.securityType, primary.securityType2].filter(Boolean).join(" · ")} />
                  <Row k="Sector" v={primary.marketSector} />
                  <Row k="Coupon" v={ins.terms.coupon != null ? `${ins.terms.coupon}%` : null} />
                  <Row k="Maturity" v={ins.terms.maturity ? fmtDate(ins.terms.maturity) : null} />
                  <Row k="FIGI" v={primary.figi} />
                </Block>
              )}

              {ins.registry.matches.length > 0 && (
                <Block title={`Listings · ${ins.registry.matches.length}`}>
                  {ins.registry.matches.map((r) => (
                    <div key={r.figi} className="flex items-center gap-3 px-4 py-2">
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-mono text-sm text-foreground">{r.ticker ?? r.figi}</span>
                        <span className="block truncate font-mono text-[11px] text-muted-foreground">
                          {r.figi}
                          {r.exchCode ? ` · ${r.exchCode}` : ""}
                        </span>
                      </span>
                    </div>
                  ))}
                </Block>
              )}

              {ins.platform && (
                <Block title="Platform listing">
                  <Row k="Instrument" v={`${ins.platform.type} · ${ins.platform.typeFull}`} />
                  <Row k="Issuing bank" v={ins.platform.bankName} />
                  <Row k="BIC" v={ins.platform.bankBic} />
                  <Row k="Face value" v={fmtMoney(ins.platform.faceValue, ins.platform.currency)} />
                  <Row k="Rating" v={ins.platform.rating} />
                  <Row k="Tenor" v={ins.platform.tenorMonths ? `${ins.platform.tenorMonths} months` : null} />
                  <Row k="Issue date" v={fmtDate(ins.platform.issueDate)} />
                  <Row k="Maturity date" v={fmtDate(ins.platform.maturityDate)} />
                  <Row k="Verification" v={ins.platform.verifiedSource ?? "Not verified"} />
                  <Row k="Status" v={ins.platform.available ? "Available" : "Not available"} />
                </Block>
              )}

              <p className="px-4 py-4 text-xs leading-relaxed text-muted-foreground">
                Reference data from OpenFIGI and the platform catalogue, checked {fmtDate(ins.checkedAt)}. It is not
                proof of ownership, custody or value.
              </p>
            </>
          )}
        </div>

        <footer className="flex shrink-0 flex-col gap-2 border-t border-border px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3 sm:flex-row">
          <Button onClick={download} disabled={!ins} className="min-h-11 flex-1 rounded-sm">
            <Download className="size-4" aria-hidden /> Download certificate
          </Button>
          {ins?.platform?.available && (
            <Button asChild variant="outline" className="min-h-11 flex-1 rounded-sm">
              <Link href="/dashboard/instruments">Acquire on platform</Link>
            </Button>
          )}
          {primary?.ticker && !ins?.platform && (
            <Button
              variant="outline"
              className="min-h-11 flex-1 rounded-sm"
              onClick={() => {
                onLoad(primary.ticker!.split(" ")[0])
                onClose()
              }}
            >
              Load issuer chart
            </Button>
          )}
        </footer>
      </DialogContent>
    </Dialog>
  )
}
