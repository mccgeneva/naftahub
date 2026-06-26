// The mandatory disclaimer stamped on EVERY document the demo/showcase account
// exports or downloads (PDFs and CSV/data exports alike), so a generated file
// can never be mistaken for a genuine MCC Capital document.
//
// Kept in its own tiny, dependency-free module so it can be shared by both the
// PDF layer (lib/pdf-core) and the CSV/data export layer (lib/export-utils)
// without the latter pulling in jsPDF.

export const DEMO_DOCUMENT_NOTICE =
  "This is a demo account generated document for demonstration only! Data reported could be invented. Forbidden any other uses."
