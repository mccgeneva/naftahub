import { NextResponse } from "next/server"
import { getMyCertificateRequests } from "@/app/actions/certificates"

// Read through a Route Handler (not a Server Action) so this background fetch is
// never serialized with — and can never freeze — client navigation. See
// app/api/ledger/route.ts for the full rationale.
export const runtime = "nodejs"
export const dynamic = "force-dynamic"

// GET /api/certificates -> the signed-in user's certificate requests.
export async function GET() {
  try {
    const res = await getMyCertificateRequests()
    return NextResponse.json({
      ok: true,
      requests: res.ok ? res.requests : [],
    })
  } catch {
    return NextResponse.json({ ok: true, requests: [] })
  }
}
