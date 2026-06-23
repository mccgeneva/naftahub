import type { Metadata } from "next"
import { NqaiChat } from "@/components/nqai/nqai-chat"

export const metadata: Metadata = {
  title: "NQAi — Neural Quantum AI | NAFTAhub",
  description:
    "NQAi, the Neural Quantum Artificial Intelligence co-pilot for MCC Oil & Gas trading operations.",
}

export default function NqaiPage() {
  return (
    <div className="flex h-[calc(100svh-3.5rem)] flex-col">
      <NqaiChat />
    </div>
  )
}
