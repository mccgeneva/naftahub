import { NextResponse } from "next/server"
import { adminActionAuthorized } from "@/lib/admin-auth"
import {
  getTreasuryBankAccounts,
  saveTreasuryBankAccounts,
  sanitizeTreasuryAccounts,
} from "@/lib/treasury-bank-accounts-db"
import { validateIban, validateBic } from "@/lib/iban-swift"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function POST(req: Request) {
  let body: { op?: string; pin?: string; accounts?: unknown }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid request" }, { status: 400 })
  }
  if (!(await adminActionAuthorized(body.pin ?? ""))) {
    return NextResponse.json({ ok: false, error: "Not authorized" }, { status: 403 })
  }

  if (body.op === "load") {
    return NextResponse.json({ ok: true, accounts: await getTreasuryBankAccounts() })
  }

  if (body.op === "save") {
    const accounts = sanitizeTreasuryAccounts(body.accounts)
    for (const a of accounts) {
      if (!a.beneficiaryName || !a.bankName || !a.iban) {
        return NextResponse.json({ ok: false, error: `${a.label}: beneficiary, bank and IBAN are required.` })
      }
      if (!validateIban(a.iban).valid) {
        return NextResponse.json({ ok: false, error: `${a.label}: the IBAN ${a.iban} is not valid.` })
      }
      if (a.swift && !validateBic(a.swift).valid) {
        return NextResponse.json({ ok: false, error: `${a.label}: the SWIFT/BIC ${a.swift} is not valid.` })
      }
    }
    try {
      await saveTreasuryBankAccounts(accounts, "admin")
      return NextResponse.json({ ok: true, accounts })
    } catch (err) {
      console.error("[treasury-bank-accounts] save failed:", err)
      return NextResponse.json({ ok: false, error: "Could not save the treasury accounts." }, { status: 500 })
    }
  }

  return NextResponse.json({ ok: false, error: "Unknown operation" }, { status: 400 })
}
