// Shared, client-safe NQAi constants used by the dedicated page and the
// dockable console panel so the branding and intro stay identical everywhere.

/**
 * The EXACT introductory message NQAi must display on initial load, verbatim
 * per the proprietor's specification. Do not paraphrase or "correct" the
 * wording — it is the canonical brand statement.
 */
export const NQAI_WELCOME =
  "Welcome to NQAi — your proprietary artificial intelligence.\n\nWho owns it\nNQAi is owned by N.A.C. ENTERPRISE Inc. (Delaware, USA · File No. 10832531).\n\nWho runs it\nNeural Artificial Corporation Limited (England & Wales · Company No. 15776214) develops, operates and sells NQAi on the owner's behalf.\nOffice: Flat 6, 16 Stratton Street, London W1J 8LH, United Kingdom.\n\nHow it started\nDr. Luigi Forino, engineer and IT researcher, first imagined NQAi in 1986. He wrote the first thesis at the University of Geneva in 2005 and started building the software in 2011. Today NQAi is fully operational.\n\nWhat makes it different\nNQAi is built on RISC-V architecture and runs in a secure research cloud at UC Berkeley, California. Unlike ChatGPT and similar systems, it does not depend on NVIDIA GPUs."

export const NQAI_TAGLINE = "Neural Quantum Artificial Intelligence"

/** Quick-start prompts surfaced under the welcome message. */
export const NQAI_SUGGESTIONS: { label: string; prompt: string }[] = [
  {
    label: "Brent vs WTI today",
    prompt: "Give me a concise read on the current Brent–WTI spread and what's driving it.",
  },
  {
    label: "Explain CIF vs FOB",
    prompt: "Explain the practical difference between CIF and FOB pricing for a crude oil cargo, with a worked example.",
  },
  {
    label: "Find crude into Rotterdam",
    prompt: "Find vessels approaching Rotterdam with crude oil capacity, and any live spot deals delivering crude there.",
  },
  {
    label: "Verify a vessel by IMO",
    prompt: "Verify vessel IMO 9782522 — confirm its identity, capacity and OFAC compliance status.",
  },
  {
    label: "Latest research: carbon capture",
    prompt: "What does the latest peer-reviewed research say about the cost and viability of carbon capture? Cite the key papers.",
  },
  {
    label: "Structure an SKR",
    prompt: "Walk me through how a Safe Keeping Receipt (SKR) is typically structured for a commodity transaction.",
  },
]
