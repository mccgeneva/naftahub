import { type NextRequest, NextResponse } from "next/server"
import { get } from "@vercel/blob"
import { resolveCurrentSession } from "@/lib/session-user"
import { listClientComplianceNotices } from "@/lib/aml-cases-db"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

// Streams a letter attached to a compliance notice — only when that notice is
// shared with the signed-in customer AND its letters were shared too.
export async function GET(request: NextRequest) {
  const session = await resolveCurrentSession()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const pathname = request.nextUrl.searchParams.get("pathname") ?? ""
  if (!pathname) return NextResponse.json({ error: "Missing pathname" }, { status: 400 })

  const ids = Array.from(new Set([session.id, session.dataOwnerId].filter(Boolean)))
  const notices = await listClientComplianceNotices(ids)
  const doc = notices.flatMap((n) => n.documents).find((d) => d.pathname === pathname)
  if (!doc) return NextResponse.json({ error: "Not found" }, { status: 404 })

  const result = await get(pathname, { access: "public" })
  if (!result || result.statusCode !== 200) return new NextResponse("Not found", { status: 404 })
  return new NextResponse(result.stream, {
    headers: {
      "Content-Type": doc.contentType || result.blob.contentType,
      "Content-Disposition": `inline; filename="${doc.name.replace(/"/g, "")}"`,
      "Cache-Control": "private, no-cache",
    },
  })
}
