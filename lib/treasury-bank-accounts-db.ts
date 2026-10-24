import "server-only"
import { query } from "@/lib/db"

export type TreasuryBankAccount = {
  id: string
  label: string
  beneficiaryName: string
  bankName: string
  bankAddress: string
  swift: string
  iban: string
  currency: string
  paymentDetails: string
}

export const DEFAULT_TREASURY_BANK_ACCOUNTS: TreasuryBankAccount[] = [
  {
    id: "treasury-1",
    label: "Treasury n. 1",
    beneficiaryName: "National Westminster Bank",
    bankName: "National Westminster Bank",
    bankAddress: "National Westminster Bank PLC, Waterside Court, Chatham Maritime, Kent, ME4 4RT 0LZ",
    swift: "NWBKGB2L",
    iban: "GB62NWBK60721442191335",
    currency: "EUR",
    paymentDetails: "W04997686EUR",
  },
  {
    id: "treasury-2",
    label: "Treasury n. 2",
    beneficiaryName: "Barclays Bank",
    bankName: "Barclays Bank PLC",
    bankAddress: "1, Churchill Place, London, E14 5HP, United Kingdom",
    swift: "BARCGB22",
    iban: "GB17BARC20000064117544",
    currency: "EUR",
    paymentDetails: "W04997686EUR",
  },
]

let ensured: Promise<void> | null = null
function ensureTable() {
  if (!ensured) {
    ensured = (async () => {
      await query(`CREATE TABLE IF NOT EXISTS treasury_bank_accounts_config (
        id text PRIMARY KEY,
        accounts jsonb NOT NULL,
        updated_at timestamptz NOT NULL DEFAULT now(),
        updated_by text
      )`)
      await query(
        `INSERT INTO treasury_bank_accounts_config (id, accounts) VALUES ('global', $1::jsonb) ON CONFLICT (id) DO NOTHING`,
        [JSON.stringify(DEFAULT_TREASURY_BANK_ACCOUNTS)],
      )
    })().catch((err) => {
      ensured = null
      throw err
    })
  }
  return ensured
}

function clean(v: unknown, max = 300): string {
  return typeof v === "string" ? v.trim().slice(0, max) : ""
}

export function sanitizeTreasuryAccounts(input: unknown): TreasuryBankAccount[] {
  if (!Array.isArray(input)) return []
  return input.slice(0, 20).map((raw, i) => {
    const a = (raw ?? {}) as Record<string, unknown>
    return {
      id: clean(a.id, 60) || `treasury-${Date.now()}-${i}`,
      label: clean(a.label, 80) || `Treasury n. ${i + 1}`,
      beneficiaryName: clean(a.beneficiaryName),
      bankName: clean(a.bankName),
      bankAddress: clean(a.bankAddress, 500),
      swift: clean(a.swift, 11).toUpperCase().replace(/\s+/g, ""),
      iban: clean(a.iban, 40).toUpperCase().replace(/\s+/g, ""),
      currency: clean(a.currency, 3).toUpperCase() || "EUR",
      paymentDetails: clean(a.paymentDetails, 200),
    }
  })
}

export async function getTreasuryBankAccounts(): Promise<TreasuryBankAccount[]> {
  try {
    await ensureTable()
    const res = await query<{ accounts: unknown }>(
      `SELECT accounts FROM treasury_bank_accounts_config WHERE id = 'global'`,
    )
    const rows = res.rows[0]?.accounts
    return Array.isArray(rows) ? sanitizeTreasuryAccounts(rows) : DEFAULT_TREASURY_BANK_ACCOUNTS
  } catch (err) {
    console.error("[treasury-bank-accounts] read failed:", err)
    return DEFAULT_TREASURY_BANK_ACCOUNTS
  }
}

export async function saveTreasuryBankAccounts(accounts: TreasuryBankAccount[], updatedBy?: string) {
  await ensureTable()
  await query(
    `INSERT INTO treasury_bank_accounts_config (id, accounts, updated_at, updated_by)
     VALUES ('global', $1::jsonb, now(), $2)
     ON CONFLICT (id) DO UPDATE SET accounts = EXCLUDED.accounts, updated_at = now(), updated_by = EXCLUDED.updated_by`,
    [JSON.stringify(accounts), updatedBy ?? null],
  )
}
