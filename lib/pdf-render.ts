// ---------------------------------------------------------------------------
// Client-only helper that renders every page of a PDF File into a JPEG Blob
// using pdf.js. Running in the browser (where a real <canvas> exists) keeps the
// server free of native canvas dependencies. The resulting page images are
// uploaded directly to Vercel Blob (client upload) and then analysed by the
// KYC endpoint.
//
// JPEG (not PNG) is used deliberately: the page images are uploaded over the
// network, so the ~5-10x smaller JPEG payload keeps uploads fast and well under
// any per-file size limits, while remaining more than sharp enough for the
// model to read passport / document text.
// ---------------------------------------------------------------------------

/** Hard ceiling so a huge PDF can't lock up the browser or blow past limits. */
const MAX_PAGES = 20
/** Target longest-edge pixel size — high enough for OCR-quality text reading. */
const TARGET_MAX_EDGE = 1700
/** JPEG quality — high enough for crisp document text, small enough to upload. */
const JPEG_QUALITY = 0.82

export interface RenderedPdf {
  pages: Blob[]
  totalPages: number
}

/** Reject if a promise takes longer than `ms`, so the UI can never hang forever. */
function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error(`${label} timed out after ${Math.round(ms / 1000)}s.`)),
      ms,
    )
    promise.then(
      (v) => {
        clearTimeout(timer)
        resolve(v)
      },
      (e) => {
        clearTimeout(timer)
        reject(e)
      },
    )
  })
}

/** Render a PDF File to an ordered array of JPEG Blobs (one per page). */
export async function renderPdfToPngBlobs(file: File): Promise<RenderedPdf> {
  if (typeof window === "undefined") {
    throw new Error("renderPdfToPngBlobs must run in the browser.")
  }

  // Import pdf.js lazily so it never ends up in the server bundle.
  const pdfjs = await import("pdfjs-dist")
  // Load the worker from a stable public path. Resolving it via import.meta.url
  // is unreliable across bundlers/mobile Safari and can leave getDocument()
  // hanging forever when the worker never loads; a fixed /public URL avoids that.
  pdfjs.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs"

  const data = await file.arrayBuffer()
  const loadingTask = pdfjs.getDocument({ data })
  const pdf = await withTimeout(loadingTask.promise, 30_000, "Reading the PDF")
  const totalPages = pdf.numPages
  const pageCount = Math.min(totalPages, MAX_PAGES)

  const pages: Blob[] = []
  for (let i = 1; i <= pageCount; i++) {
    const page = await pdf.getPage(i)
    const base = page.getViewport({ scale: 1 })
    const longestEdge = Math.max(base.width, base.height)
    const scale = Math.min(2.5, TARGET_MAX_EDGE / longestEdge)
    const viewport = page.getViewport({ scale: scale > 0 ? scale : 1 })

    const canvas = document.createElement("canvas")
    canvas.width = Math.ceil(viewport.width)
    canvas.height = Math.ceil(viewport.height)
    const ctx = canvas.getContext("2d")
    if (!ctx) throw new Error("Unable to get a 2D canvas context.")

    await withTimeout(
      page.render({ canvasContext: ctx, viewport }).promise,
      30_000,
      `Rendering page ${i}`,
    )

    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob((b) => resolve(b), "image/jpeg", JPEG_QUALITY),
    )
    if (blob) pages.push(blob)

    // Free the page resources before moving on.
    page.cleanup()
  }

  return { pages, totalPages }
}
