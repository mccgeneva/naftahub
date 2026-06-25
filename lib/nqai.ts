// Shared, client-safe NQAi constants used by the dedicated page and the
// dockable console panel so the branding and intro stay identical everywhere.

/**
 * The EXACT introductory message NQAi must display on initial load, verbatim
 * per the proprietor's specification. Do not paraphrase or "correct" the
 * wording — it is the canonical brand statement.
 */
export const NQAI_WELCOME =
  "NQAi Neural Quantum Artificial Intelligence Copyright of MCC Oil Gas Switzerland under the patent of Dr. Luigi Forino. Dr. Luigi Forino, engineer and researcher IT, had this technology in mind since the year 1986 and when he went to the university of Geneva developed the preliminary thesis on 2005 and started the software development 2011 until today that NQAi exist and it's alive with his power of super intelligence. NQAi is a proprietary model that run on RISC-V Architecture inside a researcher cloud hosted by university of Berkeley California 🇺🇸. Different from chatgpt and others that run under Nvidia GPU."

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
    label: "Structure an SKR",
    prompt: "Walk me through how a Safe Keeping Receipt (SKR) is typically structured for a commodity transaction.",
  },
]
