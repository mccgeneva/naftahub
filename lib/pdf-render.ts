// ---------------------------------------------------------------------------
// Client-only helper that renders every page of a PDF File into a PNG Blob
// using pdf.js. Running in the browser (where a real <canvas> exists) keeps the
// server free of native canvas dependencies. The resulting page images are
// uploaded to the KYC analyze endpoint for storage + AI extraction.
// ---------------------------------------------------------------------------

/** Hard ceiling so a huge PDF can't lock up the browser or blow past limits. */
const MAX_PAGES = 20
/** Target longest-edge pixel size — high enough for OCR-quality text reading. */
const TARGET_MAX_EDGE = 2000

export interface RenderedPdf {
  pages: Blob[]
  totalPages: number
}

/** Render a PDF File to an ordered array of PNG Blobs (one per page). */
export async function renderPdfToPngBlobs(file: File): Promise<RenderedPdf> {
  if (typeof window === "undefined") {
    throw new Error("renderPdfToPngBlobs must run in the browser.")
  }

  // Import pdf.js lazily so it never ends up in the server bundle.
  const pdfjs = await import("pdfjs-dist")
  // Resolve the worker from the bundled package (handled by Turbopack/webpack 5).
  pdfjs.GlobalWorkerOptions.workerSrc = new URL(
    "pdfjs-dist/build/pdf.worker.min.mjs",
    import.meta.url,
  ).toString()

  const data = await file.arrayBuffer()
  const pdf = await pdfjs.getDocument({ data }).promise
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

    await page.render({ canvasContext: ctx, viewport }).promise

    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob((b) => resolve(b), "image/png"),
    )
    if (blob) pages.push(blob)

    // Free the page resources before moving on.
    page.cleanup()
  }

  return { pages, totalPages }
}
