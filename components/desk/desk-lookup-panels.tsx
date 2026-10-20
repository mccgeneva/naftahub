"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import useSWR from "swr"
import { ExternalLink, Loader2, Search, ShieldCheck } from "lucide-react"
import type { DeskLog } from "@/components/desk/desk-panels"
import { cn } from "@/lib/utils"

const getJson = (url: string) => fetch(url, { cache: "no-store" }).then((r) => r.json())
const postJson = ([url, body]: [string, unknown]) =>
  fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }).then((r) => r.json())

function useDebounced(value: string, ms = 400) {
  const [v, setV] = useState(value)
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms)
    return () => clearTimeout(t)
  }, [value, ms])
  return v
}

function SearchBox({
  value,
  onChange,
  placeholder,
  label,
}: {
  value: string
  onChange: (v: string) => void
  placeholder: string
  label: string
}) {
  return (
    <label className="flex items-center gap-2 border-b border-border px-3 py-2">
      <Search className="size-4 shrink-0 text-muted-foreground" aria-hidden />
      <span className="sr-only">{label}</span>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        autoComplete="off"
        autoCorrect="off"
        autoCapitalize="characters"
        spellCheck={false}
        enterKeyHint="search"
        data-1p-ignore
        data-lpignore="true"
        className="min-h-11 w-full bg-transparent font-mono text-base uppercase outline-none placeholder:normal-case placeholder:text-muted-foreground"
      />
    </label>
  )
}

function Hint({ children }: { children: React.ReactNode }) {
  return <p className="px-3 py-6 text-center text-xs leading-relaxed text-muted-foreground">{children}</p>
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h3 className="sticky top-0 z-10 border-b border-border bg-card px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wider text-primary">
        {title}
      </h3>
      {children}
    </section>
  )
}

// ── F9 Companies: listed securities (exchange search) + FIGI identifiers ─────
type ListedResult = { symbol: string; name: string; category: string; type?: string; exchange: string }
type FigiRecord = {
  figi: string
  name?: string
  ticker?: string
  exchCode?: string
  securityType?: string
  marketSector?: string
}

export function CompanySearchPanel({
  onLoad,
  log,
  initialQuery = "",
}: {
  onLoad: (s: string) => void
  log: DeskLog
  initialQuery?: string
}) {
  const [term, setTerm] = useState(initialQuery)
  const q = useDebounced(term.trim())
  const ready = q.length >= 2

  const listed = useSWR<{ results: ListedResult[] }>(
    ready ? `/api/market/search?q=${encodeURIComponent(q)}` : null,
    getJson,
    { revalidateOnFocus: false },
  )
  const figi = useSWR<{ ok: boolean; matches?: FigiRecord[]; reason?: string }>(
    ready ? (["/api/openfigi", { query: q }] as [string, unknown]) : null,
    postJson,
    { revalidateOnFocus: false },
  )

  const load = (symbol: string, name: string) => {
    onLoad(symbol)
    log("Desk security loaded from company search", { symbol, name })
  }

  const loading = ready && (listed.isLoading || figi.isLoading)
  const listedRows = listed.data?.results ?? []
  const figiRows = (figi.data?.matches ?? []).slice(0, 15)

  return (
    <div className="flex h-full min-h-0 flex-col">
      <SearchBox value={term} onChange={setTerm} placeholder="Company, ticker or bank name" label="Search companies" />
      <div className="min-h-0 flex-1 overflow-y-auto">
        {!ready && (
          <Hint>
            Search any listed company, bank, ETF, index or commodity future worldwide. Tap a result to load it into
            the chart, news and ticket.
          </Hint>
        )}
        {loading && (
          <div className="flex items-center justify-center gap-2 py-6 text-xs text-muted-foreground">
            <Loader2 className="size-4 animate-spin" aria-hidden /> Searching…
          </div>
        )}
        {ready && !loading && listedRows.length === 0 && figiRows.length === 0 && (
          <Hint>No listed security matches “{q}”.</Hint>
        )}

        {listedRows.length > 0 && (
          <Section title={`Listed securities · ${listedRows.length}`}>
            <ul className="divide-y divide-border">
              {listedRows.map((r) => (
                <li key={r.symbol}>
                  <button
                    type="button"
                    onClick={() => load(r.symbol, r.name)}
                    className="flex min-h-12 w-full items-center gap-3 px-3 py-2 text-left hover:bg-muted/50"
                  >
                    <span className="w-20 shrink-0 truncate font-mono text-sm font-semibold text-primary">
                      {r.symbol}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm">{r.name}</span>
                      <span className="block truncate text-[11px] uppercase text-muted-foreground">
                        {r.category}
                        {r.exchange ? ` · ${r.exchange}` : ""}
                      </span>
                    </span>
                    <span className="shrink-0 text-[11px] font-semibold uppercase text-primary">Load ›</span>
                  </button>
                </li>
              ))}
            </ul>
          </Section>
        )}

        {figiRows.length > 0 && (
          <Section title={`FIGI identifiers · ${figiRows.length}`}>
            <ul className="divide-y divide-border">
              {figiRows.map((r) => (
                <li key={r.figi} className="flex items-center gap-3 px-3 py-2">
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm">{r.name ?? r.ticker ?? r.figi}</span>
                    <span className="block truncate font-mono text-[11px] text-muted-foreground">
                      {r.figi}
                      {r.ticker ? ` · ${r.ticker}` : ""}
                      {r.exchCode ? ` ${r.exchCode}` : ""}
                      {r.securityType ? ` · ${r.securityType}` : ""}
                    </span>
                  </span>
                  {r.ticker && (
                    <button
                      type="button"
                      onClick={() => load(r.ticker!, r.name ?? r.ticker!)}
                      className="min-h-11 shrink-0 rounded-sm px-2 text-[11px] font-semibold uppercase text-primary hover:bg-muted/50"
                    >
                      Load ›
                    </button>
                  )}
                </li>
              ))}
            </ul>
          </Section>
        )}
        {ready && !loading && figi.data && !figi.data.ok && (
          <Hint>FIGI lookup is temporarily unavailable — listed results above are unaffected.</Hint>
        )}
      </div>
    </div>
  )
}

// ── F10 Instruments: platform bank-instrument catalogue + ISIN verification ──
type DeskBankInstrument = {
  id: string
  isin: string
  bankName: string
  bankBic: string
  bankCountry: string
  type: string
  typeFull: string
  faceValue: number
  currency: string
  tenorMonths: number
  rating: string
  assignable: boolean
  monetizable: boolean
  verifiedSource: string | null
  maturityDate: string | null
}

const ISIN_RE = /^[A-Z]{2}[A-Z0-9]{9}\d$/

function compactMoney(v: number, ccy: string) {
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: ccy,
      notation: "compact",
      maximumFractionDigits: 1,
    }).format(v)
  } catch {
    return `${ccy} ${v.toLocaleString("en-US")}`
  }
}

export function BankInstrumentsPanel({ log }: { log: DeskLog }) {
  const [term, setTerm] = useState("")
  const q = useDebounced(term.trim())
  const upper = q.toUpperCase()
  const isIsin = ISIN_RE.test(upper)

  const catalogue = useSWR<{ results: DeskBankInstrument[] }>(
    `/api/desk/instruments?q=${encodeURIComponent(q)}`,
    getJson,
    { revalidateOnFocus: false },
  )
  const isinCheck = useSWR<{ ok: boolean; listed?: boolean; matches?: FigiRecord[]; reason?: string }>(
    isIsin ? (["/api/openfigi", { isin: upper }] as [string, unknown]) : null,
    postJson,
    { revalidateOnFocus: false },
  )

  const rows = catalogue.data?.results ?? []

  return (
    <div className="flex h-full min-h-0 flex-col">
      <SearchBox value={term} onChange={setTerm} placeholder="ISIN, bank, SBLC, BG, MTN…" label="Search bank instruments" />
      <div className="min-h-0 flex-1 overflow-y-auto">
        {isIsin && (
          <Section title={`ISIN check · ${upper}`}>
            <div className="px-3 py-2 text-sm">
              {isinCheck.isLoading ? (
                <span className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Loader2 className="size-4 animate-spin" aria-hidden /> Checking identifier registries…
                </span>
              ) : isinCheck.data?.ok && isinCheck.data.listed ? (
                <div className="flex items-start gap-2">
                  <ShieldCheck className="mt-0.5 size-4 shrink-0 text-emerald-500" aria-hidden />
                  <p className="leading-relaxed">
                    Exchange-listed:{" "}
                    <span className="font-semibold">
                      {isinCheck.data.matches?.[0]?.name ?? isinCheck.data.matches?.[0]?.ticker ?? "match found"}
                    </span>
                    <span className="block font-mono text-[11px] text-muted-foreground">
                      FIGI {isinCheck.data.matches?.[0]?.figi}
                      {isinCheck.data.matches?.[0]?.securityType ? ` · ${isinCheck.data.matches[0].securityType}` : ""}
                    </span>
                  </p>
                </div>
              ) : isinCheck.data?.ok ? (
                <p className="text-xs leading-relaxed text-muted-foreground">
                  Valid format but not exchange-listed. That is normal for bilateral instruments such as SBLCs, BGs and
                  most private MTNs — verify them with the issuing bank.
                </p>
              ) : (
                <p className="text-xs text-muted-foreground">Identifier registry lookup is temporarily unavailable.</p>
              )}
            </div>
          </Section>
        )}

        <Section title={`Platform catalogue · ${rows.length}`}>
          {catalogue.isLoading ? (
            <div className="flex items-center justify-center gap-2 py-6 text-xs text-muted-foreground">
              <Loader2 className="size-4 animate-spin" aria-hidden /> Loading instruments…
            </div>
          ) : rows.length === 0 ? (
            <Hint>{q ? `No available instrument matches “${q}”.` : "No instruments are currently available."}</Hint>
          ) : (
            <ul className="divide-y divide-border">
              {rows.map((r) => (
                <li key={r.id} className="px-3 py-2">
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="truncate text-sm font-semibold">
                      {r.type} · {r.bankName}
                    </span>
                    <span className="shrink-0 font-mono text-sm tabular-nums text-primary">
                      {compactMoney(r.faceValue, r.currency)}
                    </span>
                  </div>
                  <p className="truncate font-mono text-[11px] text-muted-foreground">
                    {r.isin}
                    {r.bankBic ? ` · ${r.bankBic}` : ""}
                    {r.rating ? ` · ${r.rating}` : ""}
                    {r.tenorMonths ? ` · ${r.tenorMonths}M` : ""}
                    {r.maturityDate ? ` · mat. ${r.maturityDate}` : ""}
                  </p>
                  <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[10px] uppercase">
                    {r.verifiedSource && (
                      <span className="rounded-sm border border-emerald-500/40 px-1.5 py-0.5 text-emerald-500">
                        Verified · {r.verifiedSource}
                      </span>
                    )}
                    {r.assignable && <span className="rounded-sm border border-border px-1.5 py-0.5">Assignable</span>}
                    {r.monetizable && <span className="rounded-sm border border-border px-1.5 py-0.5">Monetizable</span>}
                    <Link
                      href="/dashboard/instruments"
                      onClick={() => log("Desk opened bank instrument", { isin: r.isin, type: r.type })}
                      className="ml-auto inline-flex min-h-9 items-center px-1 font-semibold text-primary"
                    >
                      Acquire ›
                    </Link>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Section>
      </div>
    </div>
  )
}

// ── F11 Headlines: keyword news search ──────────────────────────────────────
type Headline = {
  id: string
  title: string
  publisher: string
  link: string
  publishedAt: string | null
  tickers: string[]
}

function ago(iso: string | null) {
  if (!iso) return ""
  const mins = Math.max(1, Math.round((Date.now() - new Date(iso).getTime()) / 60000))
  if (mins < 60) return `${mins}m`
  const h = Math.round(mins / 60)
  return h < 48 ? `${h}h` : `${Math.round(h / 24)}d`
}

export function HeadlinesPanel({
  symbol,
  onLoad,
  log,
  initialQuery = "",
}: {
  symbol: string
  onLoad: (s: string) => void
  log: DeskLog
  initialQuery?: string
}) {
  const [term, setTerm] = useState(initialQuery)
  const typed = useDebounced(term.trim())
  const q = typed.length >= 2 ? typed : symbol.replace("/", "")

  const { data, isLoading } = useSWR<{ results: Headline[] }>(
    `/api/desk/news?q=${encodeURIComponent(q)}`,
    getJson,
    { revalidateOnFocus: false, refreshInterval: 120000 },
  )
  const rows = data?.results ?? []

  return (
    <div className="flex h-full min-h-0 flex-col">
      <SearchBox value={term} onChange={setTerm} placeholder={`Keyword (default: ${symbol})`} label="Search headlines" />
      <div className="min-h-0 flex-1 overflow-y-auto">
        <Section title={`Headlines · ${q}`}>
          {isLoading ? (
            <div className="flex items-center justify-center gap-2 py-6 text-xs text-muted-foreground">
              <Loader2 className="size-4 animate-spin" aria-hidden /> Loading headlines…
            </div>
          ) : rows.length === 0 ? (
            <Hint>No recent headlines for “{q}”.</Hint>
          ) : (
            <ul className="divide-y divide-border">
              {rows.map((n) => (
                <li key={n.id} className="px-3 py-2">
                  <a
                    href={n.link}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={() => log("Desk headline opened", { title: n.title.slice(0, 80) })}
                    className="group flex items-start gap-2"
                  >
                    <span className="min-w-0 flex-1 text-sm leading-snug text-pretty group-hover:text-primary">
                      {n.title}
                    </span>
                    <ExternalLink className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" aria-hidden />
                  </a>
                  <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[11px] text-muted-foreground">
                    <span className="uppercase">{n.publisher}</span>
                    {n.publishedAt && <span>· {ago(n.publishedAt)}</span>}
                    {n.tickers.map((t) => (
                      <button
                        key={t}
                        type="button"
                        onClick={() => onLoad(t)}
                        className={cn(
                          "min-h-7 rounded-sm border border-border px-1.5 font-mono text-[11px] text-primary",
                          "hover:bg-muted/50",
                        )}
                      >
                        {t}
                      </button>
                    ))}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Section>
      </div>
    </div>
  )
}
