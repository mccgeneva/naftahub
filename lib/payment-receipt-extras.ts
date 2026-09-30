import type { PaymentRequest } from "@/lib/payment-requests-store"
import type { ReceiptData } from "@/lib/receipt-pdf"

type ReceiptExtras = Pick<
  ReceiptData,
  "counterpartyAddress" | "counterpartyCountry" | "description" | "routedVia" | "uetr" | "transactionId"
>

/**
 * Approved payment debits are posted to the ledger as `APPR-<approvalId>`
 * (fees and returns append a suffix), so a ledger entry can be traced back to
 * the payment request that holds the beneficiary address and description.
 */
export function findPaymentForEntry(
  payments: PaymentRequest[],
  entry: { id: string; reference?: string } | undefined,
): PaymentRequest | undefined {
  if (!entry) return undefined
  const id = entry.id
  return payments.find((p) => {
    if (p.approvalId && (id === `APPR-${p.approvalId}` || id.startsWith(`APPR-${p.approvalId}-`))) return true
    if (id === p.id) return true
    return !!entry.reference && (entry.reference === p.id || entry.reference === p.uetr)
  })
}

export function paymentReceiptExtras(payment: PaymentRequest | undefined): ReceiptExtras {
  if (!payment) return {}
  const counterpartyAddress = [
    payment.beneficiaryAddress,
    [payment.beneficiaryPostalCode, payment.beneficiaryCity].filter(Boolean).join(" "),
  ]
    .filter(Boolean)
    .join(", ")
  const country =
    payment.beneficiaryCountry && payment.beneficiaryCountry !== "—" ? payment.beneficiaryCountry : ""
  return {
    counterpartyAddress,
    counterpartyCountry: country,
    description: payment.reference && payment.reference !== payment.id ? payment.reference : "",
    routedVia: payment.routedBankName
      ? `${payment.routedBankName}${payment.routedBankBic ? ` (${payment.routedBankBic})` : ""}`
      : "",
    uetr: payment.uetr,
    transactionId: payment.id,
  }
}
