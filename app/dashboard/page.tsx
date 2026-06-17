import { PortfolioOverview } from "@/components/dashboard/portfolio-overview"
import { PortfolioChart } from "@/components/dashboard/portfolio-chart"
import { LiveRates } from "@/components/dashboard/live-rates"
import { RecentTransactions } from "@/components/dashboard/recent-transactions"
import { BankAccounts } from "@/components/dashboard/bank-accounts"
import { Instruments } from "@/components/dashboard/instruments"
import { QuickActions } from "@/components/dashboard/quick-actions"
import { OverviewAside } from "@/components/dashboard/overview-aside"
import { WelcomeHeader } from "@/components/dashboard/welcome-header"

export default function DashboardPage() {
  return (
    <div className="space-y-6">
      {/* Welcome Section */}
      <WelcomeHeader />

      {/* Portfolio Stats */}
      <PortfolioOverview />

      {/* Quick Actions */}
      <QuickActions />

      {/* Main grid: primary content + cards/quick transfer aside */}
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <PortfolioChart />
          <BankAccounts />
          <RecentTransactions />
        </div>
        <div className="space-y-6">
          <OverviewAside />
          <LiveRates />
        </div>
      </div>

      {/* Bank Instruments */}
      <Instruments />
    </div>
  )
}
