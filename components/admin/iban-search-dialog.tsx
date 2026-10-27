"use client"

import { useEffect, useMemo, useState } from "react"
import { Building2, Globe, Loader2, Search } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { ADMIN_PASSCODE } from "@/lib/admin-config"
import { validateIban, lookupBankByIban, isGenericBankInfo } from "@/lib/iban-swift"
import { resolveIbanExternal } from "@/app/actions/bank-resolve"
import type { PlatformIbanEntry } from "@/app/api/admin/iban-directory/route"

export type IbanPick = {
  holder: string
  iban: string
  swift: string
  bankName: string
  bankAddress?: string
  currency?: string
  external: boolean
}

type ExternalResult = { iban: string; bankName: string; swift: string; bankAddress: string }

const compact = (v: string) => v.replace(/\s+/g, "").toUpperCase()
const groupIban = (v: string) => compact(v).replace(/(.{4})/g, "$1 ").trim()

export function IbanSearchDialog({
  open,
  onOpenChange,
  initialQuery = "",
  onSelect,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  initialQuery?: string
  onSelect: (pick: IbanPick) => void
}) {
  const [entries, setEntries] = useState<PlatformIbanEntry[] | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [q, setQ] = useState(initialQuery)
  const [external, setExternal] = useState<ExternalResult | null>(null)
  const [externalError, setExternalError] = useState<string | null>(null)
  const [searchingExternal, setSearchingExternal] = useState(false)

  useEffect(() => {
    if (!open) return
    setQ(initialQuery)
    setExternal(null)
    setExternalError(null)
    if (entries) return
    let cancelled = false
    fetch("/api/admin/iban-directory", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pin: ADMIN_PASSCODE }),
    })
      .then((r) => r.json())
      .then((data) => {
        if (cancelled) return
        if (data?.ok) setEntries(data.entries as PlatformIbanEntry[])
        else setLoadError(data?.error ?? "Could not load the platform directory.")
      })
      .catch(() => !cancelled && setLoadError("Could not load the platform directory."))
    return () => {
      cancelled = true
    }
  }, [open, initialQuery, entries])

  const results = useMemo(() => {
    if (!entries) return []
    const term = q.trim().toLowerCase()
    const termCompact = compact(q)
    if (!term) return entries.slice(0, 50)
    return entries
      .filter((e) => {
        const text = `${e.holder} ${e.company ?? ""} ${e.email ?? ""} ${e.bankName} ${e.currency}`.toLowerCase()
        return (
          text.includes(term) ||
          (termCompact.length >= 3 &&
            (compact(e.iban).includes(termCompact) || compact(e.swift).includes(termCompact)))
        )
      })
      .slice(0, 50)
  }, [entries, q])

  const queryIsIban = validateIban(compact(q)).valid

  const searchExternally = async () => {
    const iban = compact(q)
    if (!validateIban(iban).valid) {
      setExternalError("Enter a complete, valid IBAN to search outside the platform.")
      return
    }
    setSearchingExternal(true)
    setExternalError(null)
    setExternal(null)
    try {
      let info = await lookupBankByIban(iban)
      let address = ""
      if (isGenericBankInfo(info)) {
        const ext = await resolveIbanExternal(iban).catch(() => null)
        if (ext && (ext.name || ext.bic)) {
          info = {
            name: ext.name || info?.name || "",
            bic: ext.bic || info?.bic,
            city: ext.city,
            country: info?.country || "",
            countryCode: info?.countryCode || iban.slice(0, 2),
          }
          address = [ext.address, ext.postalCode, ext.city].filter(Boolean).join(", ")
        }
      }
      if (!info || (!info.name && !info.bic)) {
        setExternalError("The bank for this IBAN wasn't found externally. You can still use the IBAN and enter the bank manually.")
        setExternal({ iban, bankName: "", swift: "", bankAddress: "" })
      } else {
        setExternal({
          iban,
          bankName: info.name ?? "",
          swift: info.bic ?? "",
          bankAddress: address || [info.city, info.country].filter(Boolean).join(", "),
        })
      }
    } catch {
      setExternalError("External search failed. Try again or enter the bank manually.")
    } finally {
      setSearchingExternal(false)
    }
  }

  const pick = (p: IbanPick) => {
    onSelect(p)
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[88dvh] max-w-lg flex-col gap-3 overflow-hidden">
        <DialogHeader className="shrink-0">
          <DialogTitle>Find an IBAN</DialogTitle>
          <DialogDescription>
            Search platform accounts by name, company, IBAN or SWIFT. If it isn&apos;t on the platform, search it externally.
          </DialogDescription>
        </DialogHeader>

        <div className="relative shrink-0">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            autoFocus
            value={q}
            onChange={(e) => {
              setQ(e.target.value)
              setExternal(null)
              setExternalError(null)
            }}
            placeholder="Name, company, IBAN or SWIFT"
            className="h-11 pl-9 text-base"
            autoComplete="off"
            autoCorrect="off"
            autoCapitalize="none"
            spellCheck={false}
            data-1p-ignore
            data-lpignore="true"
          />
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto pr-1">
          {!entries && !loadError && (
            <div className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" /> Loading platform accounts…
            </div>
          )}
          {loadError && <p className="py-3 text-sm text-destructive">{loadError}</p>}

          {entries && results.length > 0 && (
            <ul className="flex flex-col gap-2">
              {results.map((e) => (
                <li key={e.key}>
                  <button
                    type="button"
                    onClick={() =>
                      pick({
                        holder: e.holder,
                        iban: compact(e.iban),
                        swift: e.swift,
                        bankName: e.bankName,
                        currency: e.currency,
                        external: false,
                      })
                    }
                    className="flex w-full min-h-11 flex-col gap-1 rounded-lg border border-border bg-secondary/30 p-3 text-left transition-colors hover:bg-secondary/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <span className="min-w-0 font-medium text-foreground">
                        {e.holder}
                        {e.company && e.company !== e.holder && (
                          <span className="block text-xs font-normal text-muted-foreground">{e.company}</span>
                        )}
                      </span>
                      <Badge variant="outline" className="shrink-0 text-[10px]">
                        {e.source}
                        {e.currency ? ` · ${e.currency}` : ""}
                      </Badge>
                    </div>
                    <span className="break-all font-mono text-sm text-foreground">{groupIban(e.iban)}</span>
                    <span className="text-xs text-muted-foreground">
                      SWIFT {e.swift || "—"}
                      {e.bankName ? ` · ${e.bankName}` : ""}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}

          {entries && results.length === 0 && (
            <div className="flex flex-col gap-3 py-2">
              <p className="text-sm text-muted-foreground">No platform account matches &ldquo;{q.trim()}&rdquo;.</p>
              <Button
                type="button"
                variant="outline"
                className="h-11"
                onClick={searchExternally}
                disabled={searchingExternal || !queryIsIban}
              >
                {searchingExternal ? <Loader2 className="size-4 animate-spin" /> : <Globe className="size-4" />}
                Search externally
              </Button>
              {!queryIsIban && (
                <p className="text-xs text-muted-foreground">Type a full IBAN to search outside the platform.</p>
              )}
              {externalError && <p className="text-sm text-amber-600 dark:text-amber-400">{externalError}</p>}
              {external && (
                <button
                  type="button"
                  onClick={() =>
                    pick({
                      holder: "",
                      iban: external.iban,
                      swift: external.swift,
                      bankName: external.bankName,
                      bankAddress: external.bankAddress,
                      external: true,
                    })
                  }
                  className="flex w-full min-h-11 flex-col gap-1 rounded-lg border border-primary/40 bg-primary/5 p-3 text-left hover:bg-primary/10"
                >
                  <span className="flex items-center gap-2 text-xs font-medium text-primary">
                    <Building2 className="size-3.5" /> External bank — tap to use
                  </span>
                  <span className="break-all font-mono text-sm text-foreground">{groupIban(external.iban)}</span>
                  <span className="text-xs text-muted-foreground">
                    SWIFT {external.swift || "—"}
                    {external.bankName ? ` · ${external.bankName}` : ""}
                  </span>
                </button>
              )}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
