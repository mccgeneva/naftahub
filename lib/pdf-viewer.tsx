"use client"

// App-wide PDF preview context. Mount <PdfViewerProvider> once (in the
// dashboard layout) and any client component can call usePdfViewer().preview()
// to open a generated jsPDF document in the shared in-app viewer, which offers
// Download / Print / Open-in-tab. This gives every export a consistent
// "preview in browser, then download" experience.

import { createContext, useCallback, useContext, useState } from "react"
import type { jsPDF } from "jspdf"
import { PdfPreviewModal } from "@/components/pdf-preview-modal"

interface PdfViewerState {
  doc: jsPDF
  filename: string
  title?: string
}

interface PdfViewerContextValue {
  /** Open the in-app preview for a generated PDF document. */
  preview: (doc: jsPDF, filename: string, title?: string) => void
}

const PdfViewerContext = createContext<PdfViewerContextValue | null>(null)

export function PdfViewerProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<PdfViewerState | null>(null)

  const preview = useCallback((doc: jsPDF, filename: string, title?: string) => {
    setState({ doc, filename, title })
  }, [])

  return (
    <PdfViewerContext.Provider value={{ preview }}>
      {children}
      {state && (
        <PdfPreviewModal
          doc={state.doc}
          filename={state.filename}
          title={state.title}
          onClose={() => setState(null)}
        />
      )}
    </PdfViewerContext.Provider>
  )
}

export function usePdfViewer(): PdfViewerContextValue {
  const ctx = useContext(PdfViewerContext)
  if (!ctx) {
    throw new Error("usePdfViewer must be used within a <PdfViewerProvider>")
  }
  return ctx
}
