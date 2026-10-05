export interface LegalDeskSender {
  address: string
  organisation: string
  department: string
  location: string
  intro: string
  footer: string
}

export const LEGAL_DESK_SENDERS: LegalDeskSender[] = [
  {
    address: "lawfirm@juristreuhand.com",
    organisation: "Juris Treuhand AG",
    department: "Legal Desk",
    location: "Zurich, Switzerland",
    intro: "Juris Treuhand AG transmits the following legal notice in SWIFT MT799 free-format layout.",
    footer:
      "This legal communication is confidential and may be privileged. It is intended solely for the addressee. If you received it in error, please notify Juris Treuhand AG and delete it.",
  },
  {
    address: "president@mccpetroli.com",
    organisation: "MCC Petroli Company Inc",
    department: "Office of the President",
    location: "Geneva, Switzerland",
    intro: "The Office of the President of MCC Petroli Company Inc transmits the following corporate communication in SWIFT MT799 free-format layout.",
    footer:
      "This corporate communication from MCC Petroli Company Inc is confidential and intended solely for the addressee. If you received it in error, please notify the sender and delete it.",
  },
  {
    address: "sales@mccoilgas.com",
    organisation: "MCC Oil Gas",
    department: "Trade Desk",
    location: "Geneva, Switzerland",
    intro: "The MCC Oil Gas trade desk transmits the following trade correspondence in SWIFT MT799 free-format layout.",
    footer:
      "This trade correspondence from MCC Oil Gas is confidential and does not constitute a binding offer unless confirmed in a signed contract. If you received it in error, please notify the sender and delete it.",
  },
  {
    address: "trader@mccgva.ch",
    organisation: "MCC Bank Trading Platform",
    department: "Trading Desk",
    location: "Geneva, Switzerland",
    intro: "MCC Bank Trading Platform transmits the following platform communication in SWIFT MT799 free-format layout.",
    footer:
      "This communication from MCC Bank Trading Platform is confidential and intended solely for the addressee. If you received it in error, please notify the sender and delete it.",
  },
]

export const DEFAULT_LEGAL_DESK_SENDER = LEGAL_DESK_SENDERS[0]

export function findLegalDeskSender(address: string | null | undefined): LegalDeskSender | null {
  const a = String(address ?? "").trim().toLowerCase()
  return LEGAL_DESK_SENDERS.find((s) => s.address === a) ?? null
}
