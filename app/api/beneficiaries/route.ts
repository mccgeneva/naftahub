import { NextResponse } from "next/server"
import { getMyBeneficiaries } from "@/app/actions/beneficiaries"

// Read through a Route Handler (not a Server Action) so this background fetch is
// never serialized with — and can never freeze — client navigation. See
// app/api/ledger/route.ts for the full rationale.
export const runtime = "nodejs"
export const dynamic = "force-dynamic"

// GET /api/beneficiaries -> the signed-in user's beneficiaries.
export async function GET() {
  try {
    const res = await getMyBeneficiaries()
    return NextResponse.json({
      ok: true,
      beneficiaries: res.ok ? res.beneficiaries : [],
    })
  } catch {
    return NextResponse.json({ ok: true, beneficiaries: [] })
  }
}
