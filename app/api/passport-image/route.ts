import { type NextRequest, NextResponse } from "next/server"
import { get } from "@vercel/blob"
import { resolveCurrentSession } from "@/lib/session-user"
import { verifyAdminPin } from "@/lib/admin-auth"

// Blob access + session resolution require the Node.js runtime.
export const runtime = "nodejs"

// Serves retained passport images for the admin security-audit KYC dossier. A
// passport scan is highly sensitive, so this route:
//   1. requires either a valid signed-in session OR a matching admin passcode
//      (`?p=` / `x-admin-passcode` — the admin panel authenticates with the
//      shared passcode, not a user session, and links opened in a new tab /
//      mobile in-app webview don't reliably carry the session cookie), and
//   2. only serves pathnames under the "identity/" prefix (where passport
//      uploads live).
// The pathnames themselves are unguessable and are surfaced to the UI only
// through the admin-passcode-gated security-audit route, so the raw Blob URL is
// never exposed in the app.
export async function GET(request: NextRequest) {
  // Read-only image proxy: a valid session OR the admin PIN (cookie-less new-tab
  // / mobile-webview opens). The PIN branch intentionally does not require an
  // admin session; escalation is blocked at the panel + action layer.
  const passcode = request.nextUrl.searchParams.get("p") ?? request.headers.get("x-admin-passcode") ?? ""
  const pinOk = passcode !== "" && verifyAdminPin(passcode)
  if (!pinOk) {
    const session = await resolveCurrentSession()
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }
  }

  const pathname = request.nextUrl.searchParams.get("pathname")
  if (!pathname || !pathname.startsWith("identity/")) {
    return NextResponse.json({ error: "Invalid pathname" }, { status: 400 })
  }

  // Some ID documents were uploaded with a ".jpg" name even though the actual
  // bytes are a PDF, so the Blob's stored contentType is a mislabeled
  // "image/jpeg" and a viewer served that header renders blank. The admin UI
  // knows the TRUE type from OCR (stored on the submission), so it may pass it
  // via `?ct=` and we honor it — restricted to a safe allowlist so the header
  // can never be attacker-controlled.
  const CT_ALLOWLIST = new Set([
    "image/jpeg",
    "image/png",
    "image/webp",
    "image/heic",
    "image/heif",
    "image/gif",
    "application/pdf",
  ])
  const ctOverrideRaw = (request.nextUrl.searchParams.get("ct") ?? "").toLowerCase().trim()
  const ctOverride = CT_ALLOWLIST.has(ctOverrideRaw) ? ctOverrideRaw : ""

  try {
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
        headers: { ETag: result.blob.etag, "Cache-Control": "private, no-cache" },
      })
    }

    return new NextResponse(result.stream, {
      headers: {
        "Content-Type": ctOverride || result.blob.contentType,
        "Content-Disposition": "inline",
        ETag: result.blob.etag,
        "Cache-Control": "private, no-cache",
      },
    })
  } catch (error) {
    console.error("[v0] Error serving passport image:", error)
    return NextResponse.json({ error: "Failed to serve passport image" }, { status: 500 })
  }
}
