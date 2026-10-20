export type InspectionFigi = {
  figi: string
  name: string | null
  ticker: string | null
  exchCode: string | null
  securityType: string | null
  securityType2: string | null
  marketSector: string | null
  description: string | null
}

export type InstrumentInspection = {
  isin: string
  nsin: string
  checkDigitValid: boolean
  issuingCountryCode: string
  issuingCountry: string
  cusip: string | null
  registry: {
    available: boolean
    listed: boolean
    reason: string | null
    matches: InspectionFigi[]
  }
  terms: { coupon: number | null; maturity: string | null }
  platform: {
    id: string
    bankName: string
    bankBic: string
    bankCountry: string
    type: string
    typeFull: string
    faceValue: number
    currency: string
    tenorMonths: number
    rating: string
    assignable: boolean
    monetizable: boolean
    verifiedSource: string | null
    issueDate: string | null
    maturityDate: string | null
    available: boolean
  } | null
  checkedAt: string
}

export const ISIN_PATTERN = /^[A-Z]{2}[A-Z0-9]{9}\d$/

export function isinFromText(text: string): string | null {
  const m = text.toUpperCase().match(/\b[A-Z]{2}[A-Z0-9]{9}\d\b/)
  return m ? m[0] : null
}
