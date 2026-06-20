"use client"

import { useMemo, useState } from "react"
import { Check, ChevronsUpDown, Landmark } from "lucide-react"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import {
  PARTNER_BANKS,
  BANK_REGIONS,
  partnerBankByKey,
  type PartnerBank,
} from "@/lib/partner-banks"

type BankComboboxProps = {
  /** Selected partner-bank key (e.g. "hsbc"). */
  value?: string
  onChange: (key: string) => void
  placeholder?: string
  id?: string
  triggerClassName?: string
  contentClassName?: string
}

/**
 * Searchable, scrollable issuing-bank selector backed by the centralized
 * worldwide partner-bank catalogue (`PARTNER_BANKS`). Banks are grouped by
 * region and searchable by name, country or BIC, so the administrator can reach
 * any institution — including those at the bottom of the list. Because it reads
 * straight from the catalogue, any bank added there appears here automatically.
 */
export function BankCombobox({
  value,
  onChange,
  placeholder = "Select issuing bank",
  id,
  triggerClassName,
  contentClassName,
}: BankComboboxProps) {
  const [open, setOpen] = useState(false)
  const selected = value ? partnerBankByKey(value) : undefined

  // Group the catalogue by region once, preserving the canonical region order.
  const grouped = useMemo(() => {
    const byRegion = new Map<string, PartnerBank[]>()
    for (const bank of PARTNER_BANKS) {
      const list = byRegion.get(bank.region) ?? []
      list.push(bank)
      byRegion.set(bank.region, list)
    }
    return BANK_REGIONS.map((region) => ({
      region,
      banks: (byRegion.get(region) ?? []).sort((a, b) => a.name.localeCompare(b.name)),
    })).filter((g) => g.banks.length > 0)
  }, [])

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          id={id}
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className={cn(
            "w-full justify-between font-normal",
            !selected && "text-muted-foreground",
            triggerClassName,
          )}
        >
          {selected ? (
            <span className="flex items-center gap-2 truncate">
              <Landmark className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
              <span className="truncate">{selected.name}</span>
              <span className="shrink-0 text-xs text-muted-foreground">{selected.country}</span>
            </span>
          ) : (
            placeholder
          )}
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        className={cn("w-[var(--radix-popover-trigger-width)] p-0", contentClassName)}
        align="start"
      >
        <Command>
          <CommandInput placeholder="Search by bank, country or BIC..." />
          <CommandList>
            <CommandEmpty>No bank found.</CommandEmpty>
            {grouped.map((group) => (
              <CommandGroup key={group.region} heading={group.region}>
                {group.banks.map((bank) => (
                  <CommandItem
                    key={bank.key}
                    // Include country and BIC so search also matches those.
                    value={`${bank.name} ${bank.country} ${bank.bic} ${bank.key}`}
                    onSelect={() => {
                      onChange(bank.key)
                      setOpen(false)
                    }}
                    className="gap-2"
                  >
                    <Landmark className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                    <span className="flex min-w-0 flex-col">
                      <span className="truncate">{bank.name}</span>
                      <span className="truncate text-xs text-muted-foreground">
                        {bank.country} · {bank.bic}
                      </span>
                    </span>
                    <Check
                      className={cn(
                        "ml-auto h-4 w-4",
                        selected?.key === bank.key ? "opacity-100" : "opacity-0",
                      )}
                    />
                  </CommandItem>
                ))}
              </CommandGroup>
            ))}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}
