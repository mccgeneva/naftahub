import { type NextRequest, NextResponse } from "next/server"
import { get } from "@vercel/blob"
import { resolveCurrentSession } from "@/lib/session-user"

// Blob access + session resolution require the Node.js runtime.
export const runtime = "nodejs"

// Serves KYC document blobs only to authenticated users. This route is the only
// path the UI uses to reach a document: it requires a valid signed-in session
// before streaming the file, and the raw Blob URL is never surfaced in the app.
// (The connected Blob store is a public store, but pathnames are unguessable and
// the app only ever links through this session-gated proxy.)
export async function GET(request: NextRequest) {
  const session = await resolveCurrentSession()
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  try {
    const pathname = request.nextUrl.searchParams.get("pathname")
    if (!pathname) {
      return NextResponse.json({ error: "Missing pathname" }, { status: 400 })
    }

    const result = await get(pathname, {
      access: "public",
      ifNoneMatch: request.headers.get("if-none-match") ?? undefined,
    })

    if (!result) {
      return new NextResponse("Not found", { status: 404 })
    }

    if (result.statusCode === 304) {
      return new NextResponse(null, {
        status: 304,
        headers: {
          ETag: result.blob.etag,
          "Cache-Control": "private, no-cache",
        },
      })
    }

    return new NextResponse(result.stream, {
      headers: {
        "Content-Type": result.blob.contentType,
        ETag: result.blob.etag,
        "Cache-Control": "private, no-cache",
      },
    })
  } catch (error) {
    console.error("[v0] Error serving private file:", error)
    return NextResponse.json({ error: "Failed to serve file" }, { status: 500 })
  }
}
