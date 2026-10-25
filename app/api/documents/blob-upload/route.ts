import { type NextRequest, NextResponse } from "next/server"
import { handleUpload, type HandleUploadBody } from "@vercel/blob/client"
import { resolveCurrentSession } from "@/lib/session-user"

// Token endpoint for archiving a copy of every PDF a customer generates, so the
// admin Document Traceability panel can open the exact document behind a trace.
// Uploads go browser → Blob directly to stay clear of function body limits.
export const runtime = "nodejs"

export async function POST(request: NextRequest): Promise<NextResponse> {
  const body = (await request.json()) as HandleUploadBody

  try {
    const jsonResponse = await handleUpload({
      body,
      request,
      onBeforeGenerateToken: async (pathname) => {
        const session = await resolveCurrentSession()
        if (!session) throw new Error("Unauthorized")
        if (!pathname.startsWith("doc-traces/")) throw new Error("Invalid upload path")
        return {
          allowedContentTypes: ["application/pdf"],
          maximumSizeInBytes: 40 * 1024 * 1024,
          addRandomSuffix: true,
        }
      },
      onUploadCompleted: async () => {},
    })
    return NextResponse.json(jsonResponse)
  } catch (error) {
    const message = error instanceof Error ? error.message : "Upload authorization failed"
    return NextResponse.json({ error: message }, { status: 400 })
  }
}
