// ---------------------------------------------------------------------------
// Partner banks (server-safe)
//
// This module holds the partner-bank catalogue, types, and pure lookup helpers
// with NO "use client" directive and no React imports, so it can be consumed
// from both client components and server actions (e.g. the account-inventory
// allocation logic). The client gateway store re-exports everything here so
// existing `@/lib/gateway-store` imports continue to work unchanged.
// ---------------------------------------------------------------------------

// The principal partner banks the gateway routes through. Each carries the BIC
// stem and the currencies it is the natural correspondent for, so the admin
// approval flow can suggest a sensible default per request currency.
export interface PartnerBank {
  key: string
  name: string
  country: string
  /** ISO 3166-1 alpha-2 country code — drives IBAN structure / jurisdiction. */
  countryCode: string
  bic: string
  currencies: string[]
  /** Geographic grouping for the Partner Banks directory. */
  region: BankRegion
  /**
   * Real domestic clearing identifier used to seed the bank-code portion of a
   * generated IBAN so it resolves to a genuine institution. Length/meaning is
   * country-specific: GB/IE 6-digit sort code; DE 8-digit BLZ; FR code
   * banque(5)+guichet(5); ES entidad(4)+oficina(4); IT ABI(5)+CAB(5); PT
   * bank(4)+branch(4); CH/AT clearing(5); BE/AE/LU bank code(3); SA bank
   * code(2); FI bank/office(6); SE clearing(3); NO/DK bank number(4). Omitted
   * for countries whose IBAN bank code is the BIC stem (NL, QA) or that have no
   * IBAN (US, CA, …).
   */
  nationalBankCode?: string
}

export type BankRegion = "Europe" | "Americas" | "Asia-Pacific" | "Middle East & Africa"

export const BANK_REGIONS: BankRegion[] = ["Europe", "Americas", "Asia-Pacific", "Middle East & Africa"]

// ~100 of the world's largest banks, grouped by region. `region` powers the
// grouped/searchable Partner Banks directory. `countryCode` drives the IBAN
// jurisdiction (IBAN countries get a generated IBAN, others domestic coords).
export const PARTNER_BANKS: PartnerBank[] = [
  // --- United Kingdom & Ireland ---
  { key: "hsbc", name: "HSBC", country: "United Kingdom", countryCode: "GB", bic: "HBUKGB4B", currencies: ["GBP", "USD", "EUR", "HKD", "SGD"], region: "Europe", nationalBankCode: "400003" },
  { key: "barclays", name: "Barclays", country: "United Kingdom", countryCode: "GB", bic: "BARCGB22", currencies: ["GBP", "EUR", "USD"], region: "Europe", nationalBankCode: "200050" },
  { key: "natwest", name: "NatWest", country: "United Kingdom", countryCode: "GB", bic: "NWBKGB2L", currencies: ["GBP", "EUR"], region: "Europe", nationalBankCode: "600001" },
  { key: "lloyds", name: "Lloyds Bank", country: "United Kingdom", countryCode: "GB", bic: "LOYDGB2L", currencies: ["GBP", "EUR", "USD"], region: "Europe", nationalBankCode: "309634" },
  { key: "standardchartered", name: "Standard Chartered", country: "United Kingdom", countryCode: "GB", bic: "SCBLGB2L", currencies: ["GBP", "USD", "EUR", "HKD", "SGD", "AED"], region: "Europe", nationalBankCode: "609104" },
  { key: "santanderuk", name: "Santander UK", country: "United Kingdom", countryCode: "GB", bic: "ABBYGB2L", currencies: ["GBP", "EUR"], region: "Europe", nationalBankCode: "090029" },
  { key: "aib", name: "Allied Irish Banks", country: "Ireland", countryCode: "IE", bic: "AIBKIE2D", currencies: ["EUR", "GBP", "USD"], region: "Europe", nationalBankCode: "931152" },
  { key: "bankofireland", name: "Bank of Ireland", country: "Ireland", countryCode: "IE", bic: "BOFIIE2D", currencies: ["EUR", "GBP", "USD"], region: "Europe", nationalBankCode: "900017" },

  // --- Eurozone & wider Europe ---
  { key: "bnpparibas", name: "BNP Paribas", country: "France", countryCode: "FR", bic: "BNPAFRPP", currencies: ["EUR", "USD", "CHF"], region: "Europe", nationalBankCode: "3000400001" },
  { key: "creditagricole", name: "Crédit Agricole", country: "France", countryCode: "FR", bic: "AGRIFRPP", currencies: ["EUR", "USD"], region: "Europe", nationalBankCode: "1900600001" },
  { key: "societegenerale", name: "Société Générale", country: "France", countryCode: "FR", bic: "SOGEFRPP", currencies: ["EUR", "USD", "GBP"], region: "Europe", nationalBankCode: "3000300001" },
  { key: "bpce", name: "Groupe BPCE", country: "France", countryCode: "FR", bic: "CCBPFRPP", currencies: ["EUR", "USD"], region: "Europe", nationalBankCode: "1090700001" },
  { key: "creditmutuel", name: "Crédit Mutuel", country: "France", countryCode: "FR", bic: "CMCIFRPP", currencies: ["EUR", "USD"], region: "Europe", nationalBankCode: "1027800001" },
  { key: "deutschebank", name: "Deutsche Bank", country: "Germany", countryCode: "DE", bic: "DEUTDEFF", currencies: ["EUR", "USD", "GBP", "CHF"], region: "Europe", nationalBankCode: "50070010" },
  { key: "commerzbank", name: "Commerzbank", country: "Germany", countryCode: "DE", bic: "COBADEFF", currencies: ["EUR", "USD"], region: "Europe", nationalBankCode: "50040000" },
  { key: "dzbank", name: "DZ Bank", country: "Germany", countryCode: "DE", bic: "GENODEFF", currencies: ["EUR", "USD"], region: "Europe", nationalBankCode: "50060400" },
  { key: "kfw", name: "KfW", country: "Germany", countryCode: "DE", bic: "KFWIDEFF", currencies: ["EUR"], region: "Europe", nationalBankCode: "50020400" },
  { key: "ing", name: "ING Group", country: "Netherlands", countryCode: "NL", bic: "INGBNL2A", currencies: ["EUR", "USD", "GBP"], region: "Europe" },
  { key: "rabobank", name: "Rabobank", country: "Netherlands", countryCode: "NL", bic: "RABONL2U", currencies: ["EUR", "USD"], region: "Europe" },
  { key: "abnamro", name: "ABN AMRO", country: "Netherlands", countryCode: "NL", bic: "ABNANL2A", currencies: ["EUR", "USD", "GBP"], region: "Europe" },
  { key: "santander", name: "Banco Santander", country: "Spain", countryCode: "ES", bic: "BSCHESMM", currencies: ["EUR", "USD", "GBP", "BRL"], region: "Europe", nationalBankCode: "00490001" },
  { key: "bbva", name: "BBVA", country: "Spain", countryCode: "ES", bic: "BBVAESMM", currencies: ["EUR", "USD"], region: "Europe", nationalBankCode: "01820001" },
  { key: "caixabank", name: "CaixaBank", country: "Spain", countryCode: "ES", bic: "CAIXESBB", currencies: ["EUR", "USD"], region: "Europe", nationalBankCode: "21000001" },
  { key: "intesa", name: "Intesa Sanpaolo", country: "Italy", countryCode: "IT", bic: "BCITITMM", currencies: ["EUR", "USD"], region: "Europe", nationalBankCode: "0306901600" },
  { key: "unicredit", name: "UniCredit", country: "Italy", countryCode: "IT", bic: "UNCRITMM", currencies: ["EUR", "USD", "GBP"], region: "Europe", nationalBankCode: "0200801600" },
  { key: "kbc", name: "KBC Group", country: "Belgium", countryCode: "BE", bic: "KREDBEBB", currencies: ["EUR", "USD"], region: "Europe", nationalBankCode: "734" },
  { key: "belfius", name: "Belfius", country: "Belgium", countryCode: "BE", bic: "GKCCBEBB", currencies: ["EUR"], region: "Europe", nationalBankCode: "068" },
  { key: "ubs", name: "UBS", country: "Switzerland", countryCode: "CH", bic: "UBSWCHZH", currencies: ["CHF", "EUR", "USD", "GBP"], region: "Europe", nationalBankCode: "00240" },
  { key: "zkb", name: "Zürcher Kantonalbank", country: "Switzerland", countryCode: "CH", bic: "ZKBKCHZZ", currencies: ["CHF", "EUR", "USD"], region: "Europe", nationalBankCode: "00700" },
  { key: "raiffeisench", name: "Raiffeisen Switzerland", country: "Switzerland", countryCode: "CH", bic: "RAIFCH22", currencies: ["CHF", "EUR"], region: "Europe", nationalBankCode: "80000" },
  { key: "erste", name: "Erste Group Bank", country: "Austria", countryCode: "AT", bic: "GIBAATWW", currencies: ["EUR", "USD"], region: "Europe", nationalBankCode: "20111" },
  { key: "raiffeisenat", name: "Raiffeisen Bank International", country: "Austria", countryCode: "AT", bic: "RZBAATWW", currencies: ["EUR", "USD"], region: "Europe", nationalBankCode: "31000" },
  { key: "cgd", name: "Caixa Geral de Depósitos", country: "Portugal", countryCode: "PT", bic: "CGDIPTPL", currencies: ["EUR", "USD"], region: "Europe", nationalBankCode: "00350000" },
  { key: "millenniumbcp", name: "Millennium BCP", country: "Portugal", countryCode: "PT", bic: "BCOMPTPL", currencies: ["EUR"], region: "Europe", nationalBankCode: "00330000" },
  { key: "nordea", name: "Nordea", country: "Finland", countryCode: "FI", bic: "NDEAFIHH", currencies: ["EUR", "SEK", "NOK", "DKK", "USD"], region: "Europe", nationalBankCode: "182345" },
  { key: "opbank", name: "OP Financial Group", country: "Finland", countryCode: "FI", bic: "OKOYFIHH", currencies: ["EUR", "USD"], region: "Europe", nationalBankCode: "500001" },
  { key: "seb", name: "SEB", country: "Sweden", countryCode: "SE", bic: "ESSESESS", currencies: ["SEK", "EUR", "USD"], region: "Europe", nationalBankCode: "500" },
  { key: "handelsbanken", name: "Handelsbanken", country: "Sweden", countryCode: "SE", bic: "HANDSESS", currencies: ["SEK", "EUR", "USD", "GBP"], region: "Europe", nationalBankCode: "600" },
  { key: "swedbank", name: "Swedbank", country: "Sweden", countryCode: "SE", bic: "SWEDSESS", currencies: ["SEK", "EUR"], region: "Europe", nationalBankCode: "800" },
  { key: "dnb", name: "DNB Bank", country: "Norway", countryCode: "NO", bic: "DNBANOKK", currencies: ["NOK", "EUR", "USD"], region: "Europe", nationalBankCode: "1200" },
  { key: "danskebank", name: "Danske Bank", country: "Denmark", countryCode: "DK", bic: "DABADKKK", currencies: ["DKK", "EUR", "USD", "SEK", "NOK"], region: "Europe", nationalBankCode: "3000" },
  { key: "nykredit", name: "Nykredit", country: "Denmark", countryCode: "DK", bic: "NYKBDKKK", currencies: ["DKK", "EUR"], region: "Europe", nationalBankCode: "8117" },
  { key: "bankingcircle", name: "Banking Circle SA", country: "Luxembourg", countryCode: "LU", bic: "BCIRLULL", currencies: ["EUR", "USD", "GBP", "CHF"], region: "Europe", nationalBankCode: "080" },
  { key: "bil", name: "Banque Internationale à Luxembourg", country: "Luxembourg", countryCode: "LU", bic: "BILLLULL", currencies: ["EUR", "USD", "CHF"], region: "Europe", nationalBankCode: "002" },

  // --- North America ---
  { key: "jpmorgan", name: "JPMorgan Chase", country: "United States", countryCode: "US", bic: "CHASUS33", currencies: ["USD", "EUR", "GBP", "JPY"], region: "Americas" },
  { key: "bofa", name: "Bank of America", country: "United States", countryCode: "US", bic: "BOFAUS3N", currencies: ["USD", "EUR", "CAD"], region: "Americas" },
  { key: "citi", name: "Citibank", country: "United States", countryCode: "US", bic: "CITIUS33", currencies: ["USD", "EUR", "GBP", "JPY", "HKD", "SGD", "AED"], region: "Americas" },
  { key: "wellsfargo", name: "Wells Fargo", country: "United States", countryCode: "US", bic: "WFBIUS6S", currencies: ["USD"], region: "Americas" },
  { key: "usbank", name: "U.S. Bank", country: "United States", countryCode: "US", bic: "USBKUS44", currencies: ["USD"], region: "Americas" },
  { key: "pnc", name: "PNC Bank", country: "United States", countryCode: "US", bic: "PNCCUS33", currencies: ["USD"], region: "Americas" },
  { key: "truist", name: "Truist Bank", country: "United States", countryCode: "US", bic: "BRBTUS33", currencies: ["USD"], region: "Americas" },
  { key: "goldman", name: "Goldman Sachs", country: "United States", countryCode: "US", bic: "GSCMUS33", currencies: ["USD", "EUR", "GBP"], region: "Americas" },
  { key: "morganstanley", name: "Morgan Stanley", country: "United States", countryCode: "US", bic: "MSNYUS33", currencies: ["USD", "EUR"], region: "Americas" },
  { key: "bny", name: "BNY", country: "United States", countryCode: "US", bic: "IRVTUS3N", currencies: ["USD", "EUR", "GBP"], region: "Americas" },
  { key: "statestreet", name: "State Street", country: "United States", countryCode: "US", bic: "SBOSUS33", currencies: ["USD", "EUR"], region: "Americas" },
  { key: "capitalone", name: "Capital One", country: "United States", countryCode: "US", bic: "NFBKUS33", currencies: ["USD"], region: "Americas" },
  { key: "rbc", name: "Royal Bank of Canada", country: "Canada", countryCode: "CA", bic: "ROYCCAT2", currencies: ["CAD", "USD", "EUR", "GBP"], region: "Americas" },
  { key: "td", name: "TD Bank Group", country: "Canada", countryCode: "CA", bic: "TDOMCATTTOR", currencies: ["CAD", "USD"], region: "Americas" },
  { key: "scotiabank", name: "Scotiabank", country: "Canada", countryCode: "CA", bic: "NOSCCATT", currencies: ["CAD", "USD", "EUR"], region: "Americas" },
  { key: "bmo", name: "Bank of Montreal", country: "Canada", countryCode: "CA", bic: "BOFMCAM2", currencies: ["CAD", "USD"], region: "Americas" },
  { key: "cibc", name: "CIBC", country: "Canada", countryCode: "CA", bic: "CIBCCATT", currencies: ["CAD", "USD"], region: "Americas" },
  { key: "itau", name: "Itaú Unibanco", country: "Brazil", countryCode: "BR", bic: "ITAUBRSP", currencies: ["BRL", "USD", "EUR"], region: "Americas" },
  { key: "bradesco", name: "Banco Bradesco", country: "Brazil", countryCode: "BR", bic: "BBDEBRSP", currencies: ["BRL", "USD"], region: "Americas" },
  { key: "bancodobrasil", name: "Banco do Brasil", country: "Brazil", countryCode: "BR", bic: "BRASBRRJ", currencies: ["BRL", "USD", "EUR"], region: "Americas" },
  { key: "bancomer", name: "BBVA México", country: "Mexico", countryCode: "MX", bic: "BCMRMXMM", currencies: ["MXN", "USD"], region: "Americas" },

  // --- Asia-Pacific ---
  { key: "icbc", name: "ICBC", country: "China", countryCode: "CN", bic: "ICBKCNBJ", currencies: ["CNY", "USD", "HKD", "EUR"], region: "Asia-Pacific" },
  { key: "ccb", name: "China Construction Bank", country: "China", countryCode: "CN", bic: "PCBCCNBJ", currencies: ["CNY", "USD", "HKD"], region: "Asia-Pacific" },
  { key: "abchina", name: "Agricultural Bank of China", country: "China", countryCode: "CN", bic: "ABOCCNBJ", currencies: ["CNY", "USD"], region: "Asia-Pacific" },
  { key: "boc", name: "Bank of China", country: "China", countryCode: "CN", bic: "BKCHCNBJ", currencies: ["CNY", "USD", "HKD", "EUR", "GBP"], region: "Asia-Pacific" },
  { key: "bankofcomm", name: "Bank of Communications", country: "China", countryCode: "CN", bic: "COMMCNSH", currencies: ["CNY", "USD", "HKD"], region: "Asia-Pacific" },
  { key: "cmb", name: "China Merchants Bank", country: "China", countryCode: "CN", bic: "CMBCCNBS", currencies: ["CNY", "USD", "HKD"], region: "Asia-Pacific" },
  { key: "mufg", name: "MUFG Bank", country: "Japan", countryCode: "JP", bic: "BOTKJPJT", currencies: ["JPY", "USD", "EUR", "GBP"], region: "Asia-Pacific" },
  { key: "smbc", name: "Sumitomo Mitsui Banking Corp.", country: "Japan", countryCode: "JP", bic: "SMBCJPJT", currencies: ["JPY", "USD", "EUR"], region: "Asia-Pacific" },
  { key: "mizuho", name: "Mizuho Bank", country: "Japan", countryCode: "JP", bic: "MHCBJPJT", currencies: ["JPY", "USD", "EUR"], region: "Asia-Pacific" },
  { key: "japanpost", name: "Japan Post Bank", country: "Japan", countryCode: "JP", bic: "JPPSJPJ1", currencies: ["JPY"], region: "Asia-Pacific" },
  { key: "dbs", name: "DBS Bank", country: "Singapore", countryCode: "SG", bic: "DBSSSGSG", currencies: ["SGD", "USD", "HKD", "EUR"], region: "Asia-Pacific" },
  { key: "ocbc", name: "OCBC Bank", country: "Singapore", countryCode: "SG", bic: "OCBCSGSG", currencies: ["SGD", "USD", "HKD"], region: "Asia-Pacific" },
  { key: "uob", name: "United Overseas Bank", country: "Singapore", countryCode: "SG", bic: "UOVBSGSG", currencies: ["SGD", "USD"], region: "Asia-Pacific" },
  { key: "hangseng", name: "Hang Seng Bank", country: "Hong Kong", countryCode: "HK", bic: "HASEHKHH", currencies: ["HKD", "USD", "CNY"], region: "Asia-Pacific" },
  { key: "bochk", name: "Bank of China (Hong Kong)", country: "Hong Kong", countryCode: "HK", bic: "BKCHHKHH", currencies: ["HKD", "USD", "CNY"], region: "Asia-Pacific" },
  { key: "sbi", name: "State Bank of India", country: "India", countryCode: "IN", bic: "SBININBB", currencies: ["INR", "USD", "GBP", "AED"], region: "Asia-Pacific" },
  { key: "hdfc", name: "HDFC Bank", country: "India", countryCode: "IN", bic: "HDFCINBB", currencies: ["INR", "USD"], region: "Asia-Pacific" },
  { key: "icici", name: "ICICI Bank", country: "India", countryCode: "IN", bic: "ICICINBB", currencies: ["INR", "USD", "GBP"], region: "Asia-Pacific" },
  { key: "axis", name: "Axis Bank", country: "India", countryCode: "IN", bic: "AXISINBB", currencies: ["INR", "USD"], region: "Asia-Pacific" },
  { key: "commbank", name: "Commonwealth Bank", country: "Australia", countryCode: "AU", bic: "CTBAAU2S", currencies: ["AUD", "USD", "NZD"], region: "Asia-Pacific" },
  { key: "westpac", name: "Westpac", country: "Australia", countryCode: "AU", bic: "WPACAU2S", currencies: ["AUD", "USD", "NZD"], region: "Asia-Pacific" },
  { key: "anz", name: "ANZ", country: "Australia", countryCode: "AU", bic: "ANZBAU3M", currencies: ["AUD", "USD", "NZD", "SGD"], region: "Asia-Pacific" },
  { key: "nab", name: "National Australia Bank", country: "Australia", countryCode: "AU", bic: "NATAAU33", currencies: ["AUD", "USD"], region: "Asia-Pacific" },
  { key: "kbkookmin", name: "KB Kookmin Bank", country: "South Korea", countryCode: "KR", bic: "CZNBKRSE", currencies: ["KRW", "USD"], region: "Asia-Pacific" },
  { key: "shinhan", name: "Shinhan Bank", country: "South Korea", countryCode: "KR", bic: "SHBKKRSE", currencies: ["KRW", "USD", "EUR"], region: "Asia-Pacific" },
  { key: "maybank", name: "Maybank", country: "Malaysia", countryCode: "MY", bic: "MBBEMYKL", currencies: ["MYR", "USD", "SGD"], region: "Asia-Pacific" },

  // --- Middle East & Africa ---
  { key: "qnb", name: "Qatar National Bank", country: "Qatar", countryCode: "QA", bic: "QNBAQAQA", currencies: ["QAR", "USD", "EUR", "GBP"], region: "Middle East & Africa" },
  { key: "fab", name: "First Abu Dhabi Bank", country: "United Arab Emirates", countryCode: "AE", bic: "NBADAEAA", currencies: ["AED", "USD", "EUR", "GBP"], region: "Middle East & Africa", nationalBankCode: "035" },
  { key: "emiratesnbd", name: "Emirates NBD", country: "United Arab Emirates", countryCode: "AE", bic: "EBILAEAD", currencies: ["AED", "USD", "EUR"], region: "Middle East & Africa", nationalBankCode: "033" },
  { key: "adcb", name: "Abu Dhabi Commercial Bank", country: "United Arab Emirates", countryCode: "AE", bic: "ADCBAEAA", currencies: ["AED", "USD"], region: "Middle East & Africa", nationalBankCode: "030" },
  { key: "alrajhi", name: "Al Rajhi Bank", country: "Saudi Arabia", countryCode: "SA", bic: "RJHISARI", currencies: ["SAR", "USD"], region: "Middle East & Africa", nationalBankCode: "80" },
  { key: "snb", name: "Saudi National Bank", country: "Saudi Arabia", countryCode: "SA", bic: "NCBKSAJE", currencies: ["SAR", "USD", "EUR"], region: "Middle East & Africa", nationalBankCode: "10" },
  { key: "standardbank", name: "Standard Bank", country: "South Africa", countryCode: "ZA", bic: "SBZAZAJJ", currencies: ["ZAR", "USD", "EUR", "GBP"], region: "Middle East & Africa" },
  { key: "fnb", name: "First National Bank", country: "South Africa", countryCode: "ZA", bic: "FIRNZAJJ", currencies: ["ZAR", "USD"], region: "Middle East & Africa" },
  { key: "absa", name: "Absa Group", country: "South Africa", countryCode: "ZA", bic: "ABSAZAJJ", currencies: ["ZAR", "USD"], region: "Middle East & Africa" },
]

export function partnerBankByKey(key?: string): PartnerBank | undefined {
  return PARTNER_BANKS.find((b) => b.key === key)
}

/** Banks that can issue an account in the requested currency. */
export function banksForCurrency(currency: string): PartnerBank[] {
  return PARTNER_BANKS.filter((b) => b.currencies.includes(currency))
}

/** Does the bank support issuance in the requested currency / jurisdiction? */
export function bankSupportsCurrency(bankKey: string, currency: string): boolean {
  return !!partnerBankByKey(bankKey)?.currencies.includes(currency)
}

/** Suggested default partner bank for a currency (first bank that supports it). */
export function suggestedBankFor(currency: string): PartnerBank {
  return banksForCurrency(currency)[0] ?? PARTNER_BANKS[0]
}
