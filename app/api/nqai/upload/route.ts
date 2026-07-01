import { put } from "@vercel/blob"
import { resolveCurrentSession } from "@/lib/session-user"
import { resolveUpload } from "@/lib/nqai-extract"

// Uploads a single document for NQAi to analyze. Files are stored in Blob under
// an unguessable, per-user prefix and the public URL is handed back to the
// client, which then attaches it to the next chat message as a file part. The
// Anthropic provider fetches that URL directly (URL source) so we never inline
// base64 into the persisted transcript — keeping the chat row lightweight.
//
// The model can only read PDF, images (PNG/JPEG/GIF/WEBP) and plain text over a
// URL source, so `resolveUpload` extracts/converts anything else server-side
// (docx/doc/rtf/bin → text, tiff → png) and we store THAT derived payload —
// never the raw Office/TIFF bytes.
export const runtime = "nodejs"
export const maxDuration = 60

const MAX_BYTES = 20 * 1024 * 1024 // 20 MB — comfortably within Claude's limits

function json(body: unknown, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  })
}

export async function POST(req: Request) {
  const session = await resolveCurrentSession()
  if (!session?.id) {
    return json({ error: "You must be signed in to upload documents." }, 401)
  }

  let file: File | null = null
  try {
    const form = await req.formData()
    const f = form.get("file")
    if (f instanceof File) file = f
  } catch {
    return json({ error: "Invalid upload request." }, 400)
  }
  if (!file) return json({ error: "No file provided." }, 400)
  if (file.size === 0) return json({ error: "The file is empty." }, 400)
  if (file.size > MAX_BYTES) {
    return json({ error: "File is too large. The maximum size is 20 MB." }, 413)
  }

  // Extract/convert the upload into a model-ingestible payload.
  const resolved = await resolveUpload(file)
  if ("error" in resolved) {
    return json(
      {
        error:
          resolved.error === "Unsupported file type."
            ? "Unsupported file type. Upload a PDF, Word (DOC/DOCX), RTF, text, image (JPG/JPEG/GIF/PNG/WEBP/TIFF) or BIN file."
            : resolved.error,
      },
      415,
    )
  }

  // Sanitize the filename for the storage key (the original name is preserved
  // in the response and shown in the UI / sent to the model as the title).
  const safeName = (file.name || "document").replace(/[^\w.\- ]+/g, "_").slice(-100)

  try {
    const blob = await put(`nqai/${session.id}/${crypto.randomUUID()}-${safeName}`, resolved.body, {
      access: "public",
      addRandomSuffix: true,
      contentType: resolved.contentType,
    })
    return json(
      { url: blob.url, name: file.name || safeName, mediaType: resolved.mediaType, size: file.size },
      200,
    )
  } catch (err) {
    console.log("[v0] NQAi upload failed:", err instanceof Error ? err.message : String(err))
    return json({ error: "Upload failed. Please try again." }, 500)
  }
}
