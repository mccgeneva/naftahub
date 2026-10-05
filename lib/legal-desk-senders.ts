export interface LegalDeskSender {
  address: string
  organisation: string
  department: string
  location: string
}

export const LEGAL_DESK_SENDERS: LegalDeskSender[] = [
  { address: "lawfirm@juristreuhand.com", organisation: "JURIS TREUHAND AG", department: "Legal Desk", location: "Zurich, Switzerland" },
  { address: "president@mccpetroli.com", organisation: "MCC Petroli", department: "Office of the President", location: "Geneva, Switzerland" },
  { address: "sales@mccoilgas.com", organisation: "MCC Oil & Gas", department: "Sales", location: "Geneva, Switzerland" },
  { address: "trader@mccgva.ch", organisation: "MCC Capital", department: "Trading Desk", location: "Geneva, Switzerland" },
]

export const DEFAULT_LEGAL_DESK_SENDER = LEGAL_DESK_SENDERS[0]

export function findLegalDeskSender(address: string | null | undefined): LegalDeskSender | null {
  const a = String(address ?? "").trim().toLowerCase()
  return LEGAL_DESK_SENDERS.find((s) => s.address === a) ?? null
}
