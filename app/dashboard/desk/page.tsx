import { TradingDesk } from "@/components/desk/trading-desk"

export const metadata = {
  title: "Trading Desk · NAFTAhub",
  description: "Institutional multi-panel trading desk: market data, charts, news, execution, blotter, risk and messaging.",
}

export default function DeskPage() {
  return <TradingDesk />
}
