import { type NextRequest, NextResponse } from "next/server"
import { handleUpload, type HandleUploadBody } from "@vercel/blob/client"
import { adminActionAuthorized } from "@/lib/admin-auth"

export const runtime = "nodejs"

export async function POST(request: NextRequest): Promise<NextResponse> {
  const body = (await request.json()) as HandleUploadBody

  try {
    const jsonResponse = await handleUpload({
      body,
      request,
      onBeforeGenerateToken: async (pathname, clientPayload) => {
        let pin = ""
        try {
          pin = (JSON.parse(clientPayload ?? "{}") as { pin?: string }).pin ?? ""
        } catch {
          pin = ""
        }
        if (!(await adminActionAuthorized(pin))) throw new Error("Unauthorized")
        if (!pathname.startsWith("source-of-funds/")) throw new Error("Invalid upload path")
        return {
          allowedContentTypes: ["image/jpeg", "image/png", "image/webp", "image/heic", "application/pdf"],
          maximumSizeInBytes: 25 * 1024 * 1024,
          addRandomSuffix: true,
        }
      },
      onUploadCompleted: async () => {},
    })
    return NextResponse.json(jsonResponse)
  } catch (error) {
    const message = error instanceof Error ? error.message : "Upload authorization failed."
    return NextResponse.json({ error: message }, { status: 400 })
  }
}
