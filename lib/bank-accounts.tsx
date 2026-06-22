"use client"

// ---------------------------------------------------------------------------
// Shared bank-account data, formatting helpers and the live-account builder.
//
// This module is the single source of truth for the client's bank accounts so
// that BOTH the accounts list page and the per-account detail page render the
// exact same data. Balances are overlaid live from the ledger store via the
// useBankAccounts() hook.
// ---------------------------------------------------------------------------

import { useLedger } from "@/lib/ledger-store"

export type BankAccount = {
  id: string
  bankName: string
  bankLogo: string
  country: string
  countryCode: string
  rating: string
  accountName: string
  accountNumber: string
  iban: string
  swift: string
  currency: string
  balance: number
  availableBalance: number
  reservedBalance: number
  accountType: string
  status: string
  openDate: string
  lastActivity: string
  dailyLimit: number
  monthlyVolume: number
  relationship: string
  contactPerson: string
  contactEmail: string
  branchAddress: string
  beneficiaryAddress: string
  sortCode?: string
  routingNumber?: string
  bsb?: string
  branchCode?: string
  escrowDetails?: string
}

export const baseBankAccounts: BankAccount[] = [
  {
    id: "ACC-001",
    bankName: "Banking Circle - German Branch",
    bankLogo: "BC",
    country: "Germany",
    countryCode: "DE",
    rating: "A",
    accountName: "MCC Capital",
    accountNumber: "0029 2908 19",
    iban: "DE73 2022 0800 0029 2908 19",
    swift: "SXPYDEHHXXX",
    currency: "EUR",
    balance: 0.0,
    availableBalance: 0.0,
    reservedBalance: 0.0,
    accountType: "MCC Capital Bank Account",
    status: "active",
    openDate: "2026-04-24",
    lastActivity: "2026-04-24T18:20:00Z",
    dailyLimit: 0,
    monthlyVolume: 0,
    relationship: "Business Banking",
    contactPerson: "MCC Client Services",
    contactEmail: "admin@mccgva.ch",
    branchAddress: "80333 München, Germany",
    beneficiaryAddress: "Rue du Rhone 14, 1204 Geneva, Switzerland",
  },
]

export const currencyAccountMeta: Record<
  string,
  {
    bankName: string
    bankLogo: string
    country: string
    countryCode: string
    swift: string
    accountType: string
  }
> = {
  USD: {
    bankName: "Banking Circle - US Branch",
    bankLogo: "BC",
    country: "United States",
    countryCode: "US",
    swift: "SXPYUS33XXX",
    accountType: "USD Settlement Account",
  },
  GBP: {
    bankName: "Banking Circle - UK Branch",
    bankLogo: "BC",
    country: "United Kingdom",
    countryCode: "GB",
    swift: "SXPYGB2LXXX",
    accountType: "GBP Settlement Account",
  },
  CHF: {
    bankName: "Banking Circle - Swiss Branch",
    bankLogo: "BC",
    country: "Switzerland",
    countryCode: "CH",
    swift: "SXPYCHGGXXX",
    accountType: "CHF Settlement Account",
  },
  JPY: {
    bankName: "Banking Circle - Japan Branch",
    bankLogo: "BC",
    country: "Japan",
    countryCode: "JP",
    swift: "SXPYJPJTXXX",
    accountType: "JPY Settlement Account",
  },
  AUD: {
    bankName: "Banking Circle - Australia Branch",
    bankLogo: "BC",
    country: "Australia",
    countryCode: "AU",
    swift: "SXPYAU2SXXX",
    accountType: "AUD Settlement Account",
  },
  CAD: {
    bankName: "Banking Circle - Canada Branch",
    bankLogo: "BC",
    country: "Canada",
    countryCode: "CA",
    swift: "SXPYCATTXXX",
    accountType: "CAD Settlement Account",
  },
  SGD: {
    bankName: "Banking Circle - Singapore Branch",
    bankLogo: "BC",
    country: "Singapore",
    countryCode: "SG",
    swift: "SXPYSGSGXXX",
    accountType: "SGD Settlement Account",
  },
}

export const currencySymbols: Record<string, string> = {
  CHF: "CHF",
  EUR: "€",
  USD: "$",
  GBP: "£",
  SGD: "S$",
  JPY: "¥",
  AUD: "A$",
  HKD: "HK$",
  AED: "AED",
}

export function formatCurrency(amount: number, currency: string): string {
  const symbol = currencySymbols[currency] || currency
  if (currency === "JPY") {
    return `${symbol}${amount.toLocaleString("en-US", { maximumFractionDigits: 0 })}`
  }
  return `${symbol}${amount.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

export function getRatingColor(rating: string): string {
  if (rating.startsWith("AAA")) return "bg-emerald-500/20 text-emerald-400 border-emerald-500/30"
  if (rating.startsWith("AA")) return "bg-green-500/20 text-green-400 border-green-500/30"
  if (rating.startsWith("A")) return "bg-amber-500/20 text-amber-400 border-amber-500/30"
  return "bg-zinc-500/20 text-zinc-400 border-zinc-500/30"
}

export function getStatusColor(status: string): string {
  switch (status) {
    case "active":
      return "bg-emerald-500/20 text-emerald-400 border-emerald-500/30"
    case "restricted":
      return "bg-amber-500/20 text-amber-400 border-amber-500/30"
    case "dormant":
      return "bg-zinc-500/20 text-zinc-400 border-zinc-500/30"
    case "closed":
      return "bg-red-500/20 text-red-400 border-red-500/30"
    default:
      return "bg-zinc-500/20 text-zinc-400 border-zinc-500/30"
  }
}

export function getFlagEmoji(countryCode: string): string {
  const flags: Record<string, string> = {
    CH: "🇨🇭",
    DE: "🇩🇪",
    US: "🇺🇸",
    GB: "🇬🇧",
    FR: "🇫🇷",
    SG: "🇸🇬",
    JP: "🇯🇵",
    AU: "🇦🇺",
    HK: "🇭🇰",
    AE: "🇦🇪",
  }
  return flags[countryCode] || "🏳️"
}

/**
 * Build the client's full account list with live ledger balances overlaid.
 * The master EUR account reflects the live ledger balance; every additional
 * currency the client holds surfaces a dedicated settlement account.
 */
export function useBankAccounts(): BankAccount[] {
  const { balanceFor, reservedFor, currencies } = useLedger()

  const liveBaseAccounts = baseBankAccounts.map((account) => {
    if (account.id !== "ACC-001") return account
    // balanceFor() is the AVAILABLE (spendable) balance — it already excludes
    // funds on hold. Total = available + reserved, so the three figures add up
    // and the reserved hold (e.g. a commodity-deal block) is reflected here.
    const available = balanceFor(account.currency)
    const reserved = reservedFor(account.currency)
    return {
      ...account,
      balance: available + reserved,
      availableBalance: available,
      reservedBalance: reserved,
    }
  })

  const baseCurrencies = new Set(baseBankAccounts.map((a) => a.currency))
  const extraCurrencyAccounts = currencies
    .filter((cur) => !baseCurrencies.has(cur) && currencyAccountMeta[cur])
    .map((cur) => {
      const meta = currencyAccountMeta[cur]
      // Same model as the master account: available is net of holds, total adds
      // the reserved amount back so reserved funds surface per currency.
      const available = balanceFor(cur)
      const reserved = reservedFor(cur)
      return {
        id: `ACC-${cur}`,
        bankName: meta.bankName,
        bankLogo: meta.bankLogo,
        country: meta.country,
        countryCode: meta.countryCode,
        rating: "A",
        accountName: "MCC Capital",
        accountNumber: `${cur}-2908 19`,
        iban: "—",
        swift: meta.swift,
        currency: cur,
        balance: available + reserved,
        availableBalance: available,
        reservedBalance: reserved,
        accountType: meta.accountType,
        status: "active",
        openDate: "2026-04-24",
        lastActivity: new Date().toISOString(),
        dailyLimit: 0,
        monthlyVolume: 0,
        relationship: "Business Banking",
        contactPerson: "MCC Client Services",
        contactEmail: "admin@mccgva.ch",
        branchAddress: meta.country,
        beneficiaryAddress: "Rue du Rhone 14, 1204 Geneva, Switzerland",
      }
    })

  return [...liveBaseAccounts, ...extraCurrencyAccounts]
}
