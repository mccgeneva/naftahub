import type { Metadata } from "next"
import { NqaiChat } from "@/components/nqai/nqai-chat"

export const metadata: Metadata = {
  title: "NQAi — Neural Quantum AI | NAFTAhub",
  description:
    "NQAi, the Neural Quantum Artificial Intelligence co-pilot for MCC Oil & Gas trading operations.",
}

export default function NqaiPage() {
  // The dashboard <main> wraps children in p-4/md:p-6 + pb-24. Cancel that
  // padding with matching negative margins and grow the height to compensate so
  // the console fills the entire content area edge-to-edge (no wasted gutter).
  return (
    <div className="-m-4 -mb-24 flex h-[calc(100%+7rem)] flex-col md:-m-6 md:-mb-24 md:h-[calc(100%+7.5rem)]">
      <NqaiChat />
    </div>
  )
}
