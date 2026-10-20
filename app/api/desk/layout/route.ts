import { NextResponse } from "next/server"
import { resolveCurrentSession } from "@/lib/session-user"
import { getDeskLayout, saveDeskLayout } from "@/lib/desk-layout-db"
import { DEFAULT_DESK_LAYOUT, normalizeDeskLayout } from "@/lib/desk-layout"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function GET() {
  const session = await resolveCurrentSession()
  if (!session?.id) return NextResponse.json({ ok: false, reason: "unauthenticated" }, { status: 401 })
  const layout = (await getDeskLayout(session.id)) ?? DEFAULT_DESK_LAYOUT
  return NextResponse.json({ ok: true, layout })
}

export async function PUT(req: Request) {
  const session = await resolveCurrentSession()
  if (!session?.id) return NextResponse.json({ ok: false, reason: "unauthenticated" }, { status: 401 })
  try {
    const body = await req.json()
    const layout = normalizeDeskLayout(body?.layout)
    await saveDeskLayout(session.id, layout)
    return NextResponse.json({ ok: true, layout })
  } catch (err) {
    return NextResponse.json({ ok: false, error: (err as Error)?.message ?? "Failed." }, { status: 500 })
  }
}
