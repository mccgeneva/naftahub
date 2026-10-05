import { type NextRequest, NextResponse } from "next/server"
import { handleUpload, type HandleUploadBody } from "@vercel/blob/client"
import { verifyAdminPin } from "@/lib/admin-auth"

export const runtime = "nodejs"

// Token route for browser → Blob uploads of AML letters. Admin-PIN gated via
// clientPayload and confined to the `aml/` prefix.
export async function POST(request: NextRequest): Promise<NextResponse> {
  const body = (await request.json()) as HandleUploadBody
  try {
    const json = await handleUpload({
      body,
      request,
      onBeforeGenerateToken: async (pathname, clientPayload) => {
        let passcode: string | undefined
        try {
          passcode = clientPayload ? (JSON.parse(clientPayload) as { passcode?: string }).passcode : undefined
        } catch {
          passcode = undefined
        }
        if (!verifyAdminPin(passcode)) throw new Error("Unauthorized")
        if (!pathname.startsWith("aml/")) throw new Error("Invalid upload path")
        return {
          allowedContentTypes: [
            "application/pdf",
            "image/jpeg",
            "image/png",
            "image/webp",
            "application/msword",
            "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
          ],
          maximumSizeInBytes: 25 * 1024 * 1024,
          addRandomSuffix: true,
        }
      },
      onUploadCompleted: async () => {},
    })
    return NextResponse.json(json)
  } catch (error) {
    const message = error instanceof Error ? error.message : "Upload authorization failed."
    return NextResponse.json({ error: message }, { status: 400 })
  }
}
