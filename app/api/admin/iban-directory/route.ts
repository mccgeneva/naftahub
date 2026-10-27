import { NextResponse } from "next/server"
import { adminActionAuthorized } from "@/lib/admin-auth"
import { query } from "@/lib/db"
import { listDynamicUsers } from "@/lib/admin-users-db"
import { extractCurrencyBankingCoordinates, currenciesWithBankingRows } from "@/lib/banking-coordinates"
import { getTreasuryBankAccounts } from "@/lib/treasury-bank-accounts-db"
import { normalizeIban } from "@/lib/iban"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export type PlatformIbanEntry = {
  key: string
  holder: string
  company?: string
  email?: string
  iban: string
  swift: string
  bankName: string
  currency: string
  source: "Master account" | "Gateway account" | "Treasury account"
}

async function readGatewayAccounts(): Promise<PlatformIbanEntry[]> {
  try {
    const { rows } = await query(
      `SELECT request_id, payload FROM gateway_accounts WHERE status = 'active'`,
    )
    return rows.flatMap((row: Record<string, unknown>) => {
      const p = (row.payload ?? {}) as {
        accountHolder?: string
        company?: string
        currency?: string
        coordinates?: { iban?: string; bic?: string; partnerBankName?: string }
      }
      const iban = p.coordinates?.iban
      if (!iban) return []
      return [
        {
          key: `gw-${row.request_id as string}`,
          holder: p.accountHolder || p.company || "Gateway account",
          company: p.company,
          iban,
          swift: p.coordinates?.bic ?? "",
          bankName: p.coordinates?.partnerBankName ?? "",
          currency: p.currency ?? "",
          source: "Gateway account" as const,
        },
      ]
    })
  } catch {
    return []
  }
}

async function readMasterAccounts(): Promise<PlatformIbanEntry[]> {
  const out: PlatformIbanEntry[] = []
  try {
    const users = await listDynamicUsers()
    for (const u of users) {
      const rows = u.profile?.banking
      if (!rows || rows.length === 0) continue
      const seen = new Set<string>()
      for (const cur of ["EUR", ...currenciesWithBankingRows(rows)]) {
        const c = extractCurrencyBankingCoordinates(rows, cur) as {
          iban?: string | null
          bic?: string | null
          bankName?: string | null
        }
        const iban = normalizeIban(c.iban ?? "")
        if (!iban || seen.has(iban)) continue
        seen.add(iban)
        out.push({
          key: `ma-${u.id}-${cur}`,
          holder: u.profile?.fullName || u.profile?.company || u.email || u.id,
          company: u.profile?.company,
          email: u.email,
          iban: c.iban ?? iban,
          swift: c.bic ?? "",
          bankName: c.bankName ?? "",
          currency: cur,
          source: "Master account",
        })
      }
    }
  } catch {
    // directory is best-effort
  }
  return out
}

async function readTreasuryAccounts(): Promise<PlatformIbanEntry[]> {
  try {
    const accounts = await getTreasuryBankAccounts()
    return accounts
      .filter((a) => a.iban)
      .map((a) => ({
        key: `tr-${a.id}`,
        holder: a.beneficiaryName || a.label,
        iban: a.iban,
        swift: a.swift,
        bankName: a.bankName,
        currency: a.currency,
        source: "Treasury account" as const,
      }))
  } catch {
    return []
  }
}

export async function POST(req: Request) {
  let body: { pin?: string }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid request" }, { status: 400 })
  }
  if (!(await adminActionAuthorized(body.pin ?? ""))) {
    return NextResponse.json({ ok: false, error: "Not authorized" }, { status: 403 })
  }
  const [master, gateway, treasury] = await Promise.all([
    readMasterAccounts(),
    readGatewayAccounts(),
    readTreasuryAccounts(),
  ])
  return NextResponse.json({ ok: true, entries: [...treasury, ...master, ...gateway] })
}
