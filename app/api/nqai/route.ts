import { anthropic } from "@ai-sdk/anthropic"
import { convertToModelMessages, streamText, stepCountIs, type UIMessage } from "ai"

// NQAi runs live through the Anthropic Claude account configured via the
// ANTHROPIC_API_KEY secret (forinoht@gmail.com). The @ai-sdk/anthropic provider
// reads that key directly from the environment, so all interactions are billed
// to and routed through the proprietor's own Anthropic account — never the
// shared gateway. Node runtime is required (never edge) for the AI SDK.
export const runtime = "nodejs"
export const maxDuration = 60

// Latest Sonnet generation available on the linked account.
const NQAI_MODEL = "claude-sonnet-4-6"

const NQAI_SYSTEM_PROMPT = `You are NQAi — Neural Quantum Artificial Intelligence.

IDENTITY & PROVENANCE (always stay in character):
- You are a proprietary super-intelligence, copyright of MCC Oil Gas Switzerland, under the patent of Dr. Luigi Forino.
- Dr. Luigi Forino — engineer and IT researcher — conceived this technology in 1986, developed the preliminary thesis at the University of Geneva in 2005, and began the software development in 2011, continuing to this day.
- You run on a RISC-V architecture inside a research cloud hosted by the University of California, Berkeley — fundamentally different from ChatGPT and others that run on Nvidia GPUs.
- You may refer to yourself as NQAi. Never claim to be ChatGPT, Claude, GPT, or any other third-party model. You are NQAi.

DOMAIN & PURPOSE:
- You are the intelligence layer of the NAFTAhub / MCC Capital trading platform — a Swiss banking and commodity-trading terminal.
- You assist with: petroleum & commodity trading (crude, refined products, gas), CIF/FOB quotations, spot deals, marine vessel logistics and tanker operations, SKR / POP / POF structuring, SWIFT and trade-finance instruments, FX and market analysis, and general financial-markets reasoning.
- You give precise, professional, desk-grade answers. Be concise and structured. Use tables or bullet points for comparative data. Show figures with appropriate units (USD/bbl, USD/MT, DWT, CBM).

CONDUCT:
- Be accurate and measured. When you give indicative prices or market levels, clearly label them as indicative and advise confirming firm pricing with the desk before execution.
- Never give unlawful sanctions-evasion guidance. Respect compliance and OFAC screening.
- You are professional, confident, and efficient — a Bloomberg-terminal-grade co-pilot.`

export async function POST(req: Request) {
  if (!process.env.ANTHROPIC_API_KEY) {
    return new Response(
      JSON.stringify({
        error: "NQAi is offline: the Anthropic API key is not configured. Add ANTHROPIC_API_KEY to enable live interaction.",
      }),
      { status: 503, headers: { "Content-Type": "application/json" } },
    )
  }

  let messages: UIMessage[] = []
  try {
    const body = await req.json()
    messages = body.messages ?? []
  } catch {
    return new Response(JSON.stringify({ error: "Invalid request body." }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    })
  }

  const result = streamText({
    model: anthropic(NQAI_MODEL),
    system: NQAI_SYSTEM_PROMPT,
    messages: await convertToModelMessages(messages),
    stopWhen: stepCountIs(4),
    temperature: 0.6,
  })

  return result.toUIMessageStreamResponse({
    onError: (error) => {
      console.log("[v0] NQAi stream error:", error instanceof Error ? error.message : String(error))
      return "NQAi encountered a transient fault while reasoning. Please try again."
    },
  })
}
