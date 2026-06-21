import { NextResponse } from "next/server"
import { getMySkrRecords, getMySkrRequests } from "@/app/actions/skr"

// Read through a Route Handler (not a Server Action) so this background fetch is
// never serialized with — and can never freeze — client navigation. See
// app/api/ledger/route.ts for the full rationale.
export const runtime = "nodejs"
export const dynamic = "force-dynamic"

// GET /api/skr -> the signed-in client's SKR records (read-only) and requests.
export async function GET() {
  try {
    const [rec, req] = await Promise.all([getMySkrRecords(), getMySkrRequests()])
    return NextResponse.json({
      ok: true,
      records: rec.ok ? rec.items : [],
      requests: req.ok ? req.items : [],
    })
  } catch {
    return NextResponse.json({ ok: true, records: [], requests: [] })
  }
}
