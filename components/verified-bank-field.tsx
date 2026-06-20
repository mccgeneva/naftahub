"use client"

import { useEffect, useRef, useState } from "react"
import { Check, AlertCircle, Loader2, Building2, MapPin, Globe } from "lucide-react"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { cn } from "@/lib/utils"
import {
  validateIban,
  validateBic,
  lookupBankByIban,
  lookupBankByBic,
  isGenericBankInfo,
  type BankInfo,
} from "@/lib/iban-swift"
import { resolveIbanExternal } from "@/app/actions/bank-resolve"

type VerifiedBankFieldProps = {
  id: string
  label: string
  kind: "iban" | "bic"
  value: string
  onChange: (value: string) => void
  placeholder?: string
  required?: boolean
  maxLength?: number
  className?: string
  inputClassName?: string
  /**
   * When true, an IBAN field that doesn't look like an IBAN (e.g. a plain
   * domestic account number) is treated as neutral instead of invalid.
   */
  lenient?: boolean
  /** Notified whenever validity changes. */
  onValidChange?: (valid: boolean) => void
  /** Notified with resolved bank info (or null when cleared/invalid). */
  onResolved?: (info: BankInfo | null) => void
}

export function VerifiedBankField({
  id,
  label,
  kind,
  value,
  onChange,
  placeholder,
  required,
  maxLength,
  className,
  inputClassName,
  lenient,
  onValidChange,
  onResolved,
}: VerifiedBankFieldProps) {
  const [status, setStatus] = useState<"idle" | "checking" | "valid" | "invalid">("idle")
  const [error, setError] = useState<string | undefined>()
  const [bank, setBank] = useState<BankInfo | null>(null)
  const requestRef = useRef(0)

  useEffect(() => {
    const trimmed = value.trim()
    if (!trimmed) {
      setStatus("idle")
      setError(undefined)
      setBank(null)
      onValidChange?.(false)
      onResolved?.(null)
      return
    }

    // Lenient IBAN fields accept plain account numbers: if the value doesn't
    // start like an IBAN (2 letters + 2 digits), stay neutral.
    if (lenient && kind === "iban" && !/^[A-Za-z]{2}[0-9]{2}/.test(trimmed.replace(/[\s-]/g, ""))) {
      setStatus("idle")
      setError(undefined)
      setBank(null)
      onValidChange?.(true)
      onResolved?.(null)
      return
    }

    const result = kind === "iban" ? validateIban(trimmed) : validateBic(trimmed)
    if (!result.valid) {
      setStatus("invalid")
      setError(result.error)
      setBank(null)
      onValidChange?.(false)
      onResolved?.(null)
      return
    }

    // Valid format/checksum — resolve the institution (debounced).
    setStatus("checking")
    setError(undefined)
    const ticket = ++requestRef.current
    const timer = setTimeout(async () => {
      let info =
        kind === "iban" ? await lookupBankByIban(trimmed) : await lookupBankByBic(trimmed)

      // For IBANs not in the curated directory, enrich the generic fallback
      // with the external bank registry (server action). Failures are ignored
      // so the field still resolves with the structural label.
      if (kind === "iban" && isGenericBankInfo(info)) {
        try {
          const ext = await resolveIbanExternal(trimmed)
          if (ext && (ext.name || ext.bic || ext.city || ext.postalCode || ext.address)) {
            info = {
              name: ext.name ?? info?.name ?? "Registered institution",
              country: info?.country ?? "",
              countryCode: info?.countryCode ?? "",
              bic: ext.bic ?? info?.bic,
              city: ext.city ?? info?.city,
              postalCode: ext.postalCode ?? info?.postalCode,
              address: ext.address ?? info?.address,
            }
          }
        } catch {
          // keep the offline result
        }
      }

      if (ticket !== requestRef.current) return // superseded by newer input
      setBank(info)
      setStatus("valid")
      onValidChange?.(true)
      onResolved?.(info)
    }, 350)

    return () => clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, kind, lenient])

  return (
    <div className={cn("space-y-2", className)}>
      <Label htmlFor={id}>
        {label}
        {required ? " *" : ""}
      </Label>
      <div className="relative">
        <Input
          id={id}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          maxLength={maxLength}
          autoComplete="off"
          spellCheck={false}
          aria-invalid={status === "invalid"}
          className={cn(
            "font-mono uppercase pr-9",
            status === "valid" && "border-emerald-500 focus-visible:ring-emerald-500/30",
            status === "invalid" && "border-destructive focus-visible:ring-destructive/30",
            inputClassName,
          )}
        />
        <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2">
          {status === "checking" && (
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" aria-hidden />
          )}
          {status === "valid" && <Check className="h-4 w-4 text-emerald-500" aria-hidden />}
          {status === "invalid" && (
            <AlertCircle className="h-4 w-4 text-destructive" aria-hidden />
          )}
        </span>
      </div>

      {status === "invalid" && error && (
        <p className="text-xs text-destructive" role="alert">
          {error}
        </p>
      )}

      {status === "checking" && (
        <p className="text-xs text-muted-foreground">Verifying with bank directory…</p>
      )}

      {status === "valid" && bank && (
        <div className="rounded-md border border-emerald-500/30 bg-emerald-500/5 p-3">
          <div className="flex items-center gap-2">
            <Building2 className="h-4 w-4 text-emerald-600" aria-hidden />
            <p className="text-sm font-medium text-foreground">{bank.name}</p>
          </div>
          <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
            {(bank.address || bank.postalCode || bank.city || bank.branch) && (
              <span className="inline-flex items-center gap-1">
                <MapPin className="h-3 w-3" aria-hidden />
                {[bank.address, [bank.postalCode, bank.city].filter(Boolean).join(" "), bank.branch]
                  .filter(Boolean)
                  .join(" · ")}
              </span>
            )}
            <span className="inline-flex items-center gap-1">
              <Globe className="h-3 w-3" aria-hidden />
              {bank.country}
            </span>
            {bank.bic && <span className="font-mono">BIC {bank.bic}</span>}
          </div>
        </div>
      )}
    </div>
  )
}
