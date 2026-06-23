import type { Metadata } from "next"
import { TradingConsole } from "@/components/console/trading-console"
import { listLiveSpotDeals } from "@/app/actions/spot-deals"

export const metadata: Metadata = {
  title: "Console | NAFTAhub Terminal",
  description:
    "Bloomberg-style multi-panel trading console — live markets, commodity benchmarks, vessels, spot deals and the NQAi co-pilot.",
}

export default async function ConsolePage() {
  // Seed the spot-deals panel server-side for an instant first paint; the panel
  // then keeps itself live via SWR polling.
  const initialDeals = await listLiveSpotDeals().catch(() => [])
  return <TradingConsole initialDeals={initialDeals} />
}
