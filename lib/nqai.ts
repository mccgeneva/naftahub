// Shared, client-safe NQAi constants used by the dedicated page and the
// dockable console panel so the branding and intro stay identical everywhere.

/**
 * The EXACT introductory message NQAi must display on initial load, verbatim
 * per the proprietor's specification. Do not paraphrase or "correct" the
 * wording — it is the canonical brand statement.
 */
export const NQAI_WELCOME =
  "NQAI Neural Quantum Artificial Intelligence\nCopyright of MCC Oil Gas Switzerland under the patent of Dr. Luigi Forino.\nDr. Luigi Forino, an engineer and IT researcher, has envisioned this technology since 1986. During his time at the University of Geneva, he developed a preliminary thesis in 2005 and began full software development in 2011. Today, NQAI is fully operational — a living system empowered by super intelligence.\nNQAI is a proprietary model built on RISC-V Architecture, running inside a secure researcher cloud hosted by the University of Berkeley, California 🇺🇸. It operates on a fundamentally different foundation from ChatGPT and other systems that rely on NVIDIA GPUs."

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
