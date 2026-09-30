import "server-only"

import { getDynamicUserById } from "@/lib/admin-users-db"
import {
  currenciesWithBankingRows,
  extractBankingCoordinates,
  extractCurrencyBankingCoordinates,
} from "@/lib/banking-coordinates"

export interface MasterBankingView {
  bankName?: string
  iban?: string
  swift?: string
  accountCurrency?: string
  beneficiaryName?: string
  currencies?: Record<string, { bankName?: string; iban?: string; swift?: string }>
}

/**
 * Banking shown on a signed-in user's own settlement cards. Joint/sub members
 * read the Master's record (dataOwnerId); a child with no IBAN of its own falls
 * back to its group Master's banking.
 */
export async function readMasterBankingFor(session: {
  id: string
  dataOwnerId?: string | null
}): Promise<MasterBankingView> {
  let rec = await getDynamicUserById(session.dataOwnerId || session.id)
  if (!rec) return {}

  if (!extractBankingCoordinates(rec.profile.banking).iban && rec.profile.masterId && rec.profile.masterId !== rec.id) {
    const master = await getDynamicUserById(rec.profile.masterId)
    if (master && extractBankingCoordinates(master.profile.banking).iban) rec = master
  }

  const primary = extractBankingCoordinates(rec.profile.banking)
  const beneficiaryName = rec.profile.company?.trim() || rec.profile.fullName?.trim() || ""

  const currencies: NonNullable<MasterBankingView["currencies"]> = {}
  for (const cur of currenciesWithBankingRows(rec.profile.banking)) {
    const c = extractCurrencyBankingCoordinates(rec.profile.banking ?? [], cur)
    if (c.iban || c.bic || c.bankName) {
      currencies[cur] = {
        ...(c.bankName ? { bankName: c.bankName } : {}),
        ...(c.iban ? { iban: c.iban } : {}),
        ...(c.bic ? { swift: c.bic } : {}),
      }
    }
  }

  return {
    ...(primary.bankName ? { bankName: primary.bankName } : {}),
    ...(primary.iban ? { iban: primary.iban } : {}),
    ...(primary.bic ? { swift: primary.bic } : {}),
    ...(primary.currency ? { accountCurrency: primary.currency } : {}),
    ...(beneficiaryName ? { beneficiaryName } : {}),
    ...(Object.keys(currencies).length ? { currencies } : {}),
  }
}
