import "server-only"
import { getGuaranteeConfig } from "@/lib/guarantees-config-db"
import { gatherGuaranteeProfile } from "@/lib/guarantees-profile"
import { listApprovalsForUsers } from "@/lib/approvals-db"
import { resolveFinancialMemberIds } from "@/lib/session-user"
import { isLiveRequest } from "@/lib/live-request"
import { convertCurrency } from "@/lib/fx"
import { computePpiQuote, type PpiExposure, type PpiQuote } from "@/lib/ppi-insurance"

export type PpiAnalysis = {
  exposure: PpiExposure
  quote: PpiQuote
  availableBalanceEur: number
  guaranteesEur: number
  riskBand: string
}

/** Analyze a client's profile and price full PPI cover. Server figures only. */
export async function analyzePpiProfile(userId: string): Promise<PpiAnalysis> {
  const config = await getGuaranteeConfig()
  const { score, overdraft } = await gatherGuaranteeProfile(userId, config, { applyOverride: false })

  let pppCapitalEur = 0
  try {
    const pool = await resolveFinancialMemberIds(userId)
    const ppp = await listApprovalsForUsers(pool, "ppp")
    for (const a of ppp) {
      if (a.status !== "approved") continue
      const rec = ((a.payload as Record<string, unknown> | null)?.record ?? {}) as Record<string, unknown>
      if (!isLiveRequest({ ...rec, status: a.status })) continue
      const amt = Number(rec.amount ?? a.amount ?? 0)
      const ccy = String(rec.currency ?? a.currency ?? "EUR")
      if (amt > 0) pppCapitalEur += convertCurrency(amt, ccy, "EUR")
    }
  } catch (err) {
    console.log("[v0] PPI ppp capital read failed:", (err as Error)?.message)
  }

  const exposure: PpiExposure = {
    debitExposureEur: Math.max(0, score.inputs.totalExposure),
    pppCapitalEur: Math.round(pppCapitalEur * 100) / 100,
    overdraftEur: Math.max(0, overdraft.negativeEur),
    riskScore: score.finalScore,
    overdueCharges: score.inputs.overdueCharges,
  }
  return {
    exposure,
    quote: computePpiQuote(exposure),
    availableBalanceEur: score.inputs.availableBalance,
    guaranteesEur: score.inputs.guarantees,
    riskBand: score.band,
  }
}
