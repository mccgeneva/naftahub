import { DashboardSidebar } from "@/components/dashboard/sidebar"
import { DashboardHeader } from "@/components/dashboard/header"
import { ActivityTracker } from "@/components/activity-tracker"
import { SessionGuard } from "@/components/session-guard"
import { DemoSeedGate } from "@/components/demo-seed-gate"
import { BeneficiariesProvider } from "@/lib/beneficiaries-store"
import { LedgerProvider } from "@/lib/ledger-store"
import { PaymentRequestsProvider } from "@/lib/payment-requests-store"
import { InstrumentRequestsProvider } from "@/lib/instrument-requests-store"
import { PPPRequestsProvider } from "@/lib/ppp-requests-store"
import { DOFRequestsProvider } from "@/lib/dof-requests-store"
import { DTCRequestsProvider } from "@/lib/dtc-requests-store"
import { CommodityDealsProvider } from "@/lib/commodity-deals-store"
import { LeverageRequestsProvider } from "@/lib/leverage-requests-store"
import { TreasuryProvider } from "@/lib/treasury-store"
import { GatewayProvider } from "@/lib/gateway-store"

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <ActivityTracker>
      <DemoSeedGate>
      <BeneficiariesProvider>
      <LedgerProvider>
      <PaymentRequestsProvider>
      <InstrumentRequestsProvider>
      <PPPRequestsProvider>
      <DOFRequestsProvider>
      <DTCRequestsProvider>
      <CommodityDealsProvider>
      <LeverageRequestsProvider>
      <TreasuryProvider>
      <GatewayProvider>
      <SessionGuard />
      <div className="flex h-screen overflow-hidden bg-background">
        {/* Desktop Sidebar */}
        <div className="hidden md:block">
          <DashboardSidebar />
        </div>

        {/* Main Content */}
        <div className="flex flex-1 flex-col overflow-hidden">
          <DashboardHeader />
          <main className="flex-1 overflow-y-auto p-4 md:p-6">{children}</main>
        </div>
      </div>
      </GatewayProvider>
      </TreasuryProvider>
      </LeverageRequestsProvider>
      </CommodityDealsProvider>
      </DTCRequestsProvider>
      </DOFRequestsProvider>
      </PPPRequestsProvider>
      </InstrumentRequestsProvider>
      </PaymentRequestsProvider>
      </LedgerProvider>
      </BeneficiariesProvider>
      </DemoSeedGate>
    </ActivityTracker>
  )
}
