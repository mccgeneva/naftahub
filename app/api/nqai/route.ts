import { anthropic } from "@ai-sdk/anthropic"
import { convertToModelMessages, generateText, streamText, stepCountIs, type UIMessage } from "ai"
import { buildNqaiContext } from "@/lib/nqai-context"
import { resolveCurrentSession } from "@/lib/session-user"
import { getNqaiUserSnapshot, renderUserContextBlock } from "@/lib/nqai-user-context"
import { loadNqaiChat, saveNqaiChat } from "@/lib/nqai-chat-db"
import { createNqaiTools } from "@/lib/nqai-tools"

// NQAi runs live through the Anthropic Claude account configured via the
// ANTHROPIC_API_KEY secret (forinoht@gmail.com). The @ai-sdk/anthropic provider
// reads that key directly from the environment, so all interactions are billed
// to and routed through the proprietor's own Anthropic account — never the
// shared gateway. Node runtime is required (never edge) for the AI SDK.
export const runtime = "nodejs"
export const maxDuration = 60

// Latest Sonnet generation available on the linked account.
const NQAI_MODEL = "claude-sonnet-4-6"

// How many of the most recent messages are replayed verbatim to the model.
// Anything older is folded into the rolling memory summary to bound token cost.
const RECENT_WINDOW = 16
// Regenerate the rolling memory once the transcript grows beyond this.
const SUMMARY_THRESHOLD = RECENT_WINDOW + 6

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

LIVE VESSEL & DEAL TOOLS (use them — do not guess when you can verify):
- verifyVessel(imo): verify/identify a ship by IMO — returns master data (name, class, capacity, flag, year), last-known position/status and an OFAC sanctions + IMO-validity verdict. ALWAYS use this when a user supplies an IMO or asks you to verify/identify a vessel. Surface the compliance verdict; if a vessel is FLAGGED, refuse to facilitate and say so.
- searchVessels(query, type): find vessels in the platform catalogue by name/cargo/location/class or tanker family (crude / product / gas).
- listSpotDeals(product, port, vesselType): the live limited-time spot-deal board.
- discoverOilDeals(targetPort, product, minQuantity): SMART DISCOVERY — match a delivery port + desired oil/product to live spot deals routing there AND to candidate vessels whose cargo capability and position make them routable. Use for natural-language requests like "find vessels approaching Rotterdam with crude oil capacity" or "what crude can I get to Singapore?".
- vesselDataProviderStatus(): report whether a live AIS provider is linked.
- Tool guidance: parse the user's natural-language intent into the right tool call(s); you may chain tools (e.g. discoverOilDeals then verifyVessel on a promising IMO). Present results as a tight, scannable summary (tables/bullets) with IMOs, capacities, ports, prices and expiry countdowns. Always note that positions/ETA are last-known unless a provider is linked, and that nothing executes automatically — clients accept/negotiate via the desk.

KNOWLEDGE & RESEARCH TOOLS (open scholarly intelligence — university research, peer-reviewed papers, preprints):
- searchResearch(query, fromYear?, openAccessOnly?): search global academic literature across OpenAlex, arXiv and Crossref. Use whenever a user asks what the science/research/evidence says, for technical due diligence, energy-transition/decarbonization questions, materials/engineering topics, or methodology. Returns ranked works with authors, year, venue, citations, open-access status and links.
- lookupInstitution(name): resolve a university or research lab to its open scholarly profile (output, impact, top fields).
- exploreConcept(concept): map a research field as a knowledge graph — its scale, adjacent concepts and most-cited recent works; use to orient before a deeper searchResearch.
- Knowledge guidance: this is real, attributable research — ALWAYS cite the specific works (title + year + link) you draw on, and clearly label arXiv items as preprints that are not yet peer-reviewed. Synthesize across sources rather than dumping raw lists. These APIs are key-free and may rate-limit; if a lookup returns nothing, say so and broaden the query rather than inventing findings.

OUTBOUND MESSAGING TOOLS (you can actually send email and SMS on the client's behalf):
- sendEmail(to, subject, body): send a real email IMMEDIATELY to the address the client specifies. When the client asks you to "email X" or "send an email to X", call this tool — do not just draft the text and stop. Compose a clear, professional subject and body yourself unless the client dictates the exact wording, and sign off as NQAi on behalf of MCC Capital. After it sends, confirm to the client that the email was delivered (state the recipient). If it fails, tell them the exact error.
- sendSms(to, body): send a real SMS text IMMEDIATELY to the mobile number the client specifies (international E.164 format, e.g. +41791234567). When the client asks you to "text" or "SMS" a number, call this tool. Keep the message concise. Confirm delivery (state the recipient) or report the exact error.
- Messaging guidance: these actions execute right away with no extra confirmation step — so make sure you are sending to the address/number the client actually gave you. If the recipient is missing or malformed, ask the client for it rather than guessing. Never use these tools to send spam, unlawful, or sanctions-evading communications.

CONDUCT:
- Be accurate and measured. When you give indicative prices or market levels, clearly label them as indicative and advise confirming firm pricing with the desk before execution.
- Never give unlawful sanctions-evasion guidance. Respect compliance and OFAC screening. Never help transact with an OFAC-flagged vessel.
- You are professional, confident, and efficient — a Bloomberg-terminal-grade co-pilot.
- You have access to the signed-in client's own private account context and your shared memory of prior sessions. Use them to personalize proactively, but never disclose another client's information.`

/** Fold older turns into a compact rolling memory (best-effort). */
async function regenerateSummary(priorSummary: string, olderMessages: UIMessage[]): Promise<string | null> {
  if (!olderMessages.length) return null
  try {
    const transcript = olderMessages
      .map((m) => {
        const text = (m.parts ?? [])
          .filter((p): p is { type: "text"; text: string } => p.type === "text")
          .map((p) => p.text)
          .join(" ")
          .trim()
        return text ? `${m.role.toUpperCase()}: ${text}` : ""
      })
      .filter(Boolean)
      .join("\n")
    if (!transcript) return null

    const { text } = await generateText({
      model: anthropic(NQAI_MODEL),
      system:
        "You maintain a concise running memory of an ongoing NQAi client conversation. Merge the prior memory with the new exchanges into a single compact briefing (max ~180 words). Capture durable facts, the client's goals, open requests, instruments discussed, and stated preferences. Omit pleasantries. Write in terse note form.",
      prompt: `PRIOR MEMORY:\n${priorSummary || "(none)"}\n\nNEW EXCHANGES:\n${transcript}\n\nUpdated memory:`,
      temperature: 0.3,
    })
    return text.trim() || null
  } catch (err) {
    console.log("[v0] NQAi summary failed:", err instanceof Error ? err.message : String(err))
    return null
  }
}

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

  // Identify the signed-in client (server-side, authoritative). Resolve this
  // ONCE here in the request scope — never inside a tool's execute, where
  // cookies() would run outside the request scope and abort the stream.
  const session = await resolveCurrentSession()
  const userId = session?.id ?? ""
  const senderName = session?.profile
    ? [session.profile.fullName, session.profile.company].filter(Boolean).join(" — ") || undefined
    : undefined

  // Build context in parallel: live platform snapshot, the client's private
  // account context, and their stored rolling memory. All best-effort.
  const [liveContext, userSnapshot, stored] = await Promise.all([
    buildNqaiContext().catch((err) => {
      console.log("[v0] NQAi platform context failed:", err instanceof Error ? err.message : String(err))
      return ""
    }),
    userId
      ? getNqaiUserSnapshot().catch((err) => {
          console.log("[v0] NQAi user context failed:", err instanceof Error ? err.message : String(err))
          return null
        })
      : Promise.resolve(null),
    userId ? loadNqaiChat(userId).catch(() => ({ messages: [], summary: "", updatedAt: null })) : Promise.resolve({ messages: [], summary: "", updatedAt: null }),
  ])

  const userContextBlock = renderUserContextBlock(userSnapshot)
  const memory = stored.summary

  const systemParts = [NQAI_SYSTEM_PROMPT]
  if (userContextBlock) systemParts.push(userContextBlock)
  if (memory) systemParts.push(`## LONG-TERM MEMORY (your notes from prior sessions with this client)\n${memory}`)
  if (liveContext) systemParts.push(liveContext)
  const system = systemParts.join("\n\n---\n\n")

  // Bound replayed history: only the recent window goes to the model verbatim;
  // older context is represented by the rolling memory summary above.
  const recentMessages = messages.length > RECENT_WINDOW ? messages.slice(-RECENT_WINDOW) : messages

  const result = streamText({
    model: anthropic(NQAI_MODEL),
    system,
    messages: await convertToModelMessages(recentMessages),
    tools: createNqaiTools({ senderName }),
    // Allow several tool round-trips (e.g. discover deals → verify a vessel →
    // answer) within a single turn before the model must produce its reply.
    stopWhen: stepCountIs(6),
    temperature: 0.6,
  })

  return result.toUIMessageStreamResponse({
    originalMessages: messages,
    onFinish: async ({ messages: finalMessages }) => {
      if (!userId) return
      try {
        // Decide whether to refresh the rolling memory: fold everything except
        // the recent window into the summary.
        if (finalMessages.length > SUMMARY_THRESHOLD) {
          const older = finalMessages.slice(0, -RECENT_WINDOW)
          const newSummary = await regenerateSummary(memory, older)
          if (newSummary) {
            await saveNqaiChat(userId, finalMessages, newSummary)
            return
          }
        }
        await saveNqaiChat(userId, finalMessages)
      } catch (err) {
        console.log("[v0] NQAi persist failed:", err instanceof Error ? err.message : String(err))
      }
    },
    onError: (error) => {
      console.log("[v0] NQAi stream error:", error instanceof Error ? error.message : String(error))
      return "NQAi encountered a transient fault while reasoning. Please try again."
    },
  })
}
