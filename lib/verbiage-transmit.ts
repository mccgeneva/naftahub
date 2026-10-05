import "server-only"
import { sendLegalMt799 } from "@/lib/legal-desk-email"
import { findLegalDeskSender, DEFAULT_LEGAL_DESK_SENDER } from "@/lib/legal-desk-senders"
import { getBarclaysExecutionEmail, updateVerbiage, type VerbiageSubmission } from "@/lib/verbiage-db"
import { insertNotification } from "@/lib/notifications-db"

const SENDER_ADDRESS = "trader@mccgva.ch"

/**
 * Sends a client-approved verbiage to Barclays Bank PLC as an MT799-format
 * email (pre-advice requesting issuance). Requires the Barclays execution
 * address to be configured by the administrator; otherwise the submission
 * stays "awaiting_transmission" and the administrator is the fallback.
 */
export async function transmitVerbiageToBarclays(
  sub: VerbiageSubmission,
  overrideEmail?: string,
): Promise<{ ok: true; to: string } | { ok: false; error: string; noAddress?: boolean }> {
  const to = (overrideEmail || (await getBarclaysExecutionEmail())).trim()
  if (!to) return { ok: false, error: "No Barclays execution address is configured.", noAddress: true }

  const a = sub.analysis
  const sender = findLegalDeskSender(SENDER_ADDRESS) ?? DEFAULT_LEGAL_DESK_SENDER
  const ref = sub.id.replace(/^VRB-/, "VRB").slice(0, 16)
  const amount = a.faceValue ? `${a.currency} ${Number(a.faceValue).toLocaleString("en-US")}` : "as per verbiage"

  const narrative = [
    "WE HEREBY SUBMIT, ON BEHALF OF OUR CLIENT, THE APPROVED DRAFT VERBIAGE",
    `FOR A ${(a.instrumentType || "BANK INSTRUMENT").toUpperCase()} FOR ISSUANCE AND EXECUTION.`,
    "",
    `INSTRUMENT: ${a.instrumentType || "-"} ${a.swiftMessageType ? `(${a.swiftMessageType})` : ""}`,
    `APPLICANT: ${a.applicant || sub.holderLabel}`,
    `BENEFICIARY: ${a.beneficiary || "-"}`,
    `FACE VALUE: ${amount}`,
    `TENOR: ${a.tenor || a.expiryDate || "-"}`,
    `GOVERNING RULES: ${a.governingRules || "-"}`,
    "",
    "OPERATIVE CLAUSES:",
    ...(a.keyClauses.length ? a.keyClauses.map((c, i) => `${i + 1}. ${c}`) : ["- AS PER ATTACHED VERBIAGE"]),
    "",
    ...(sub.correctedText ? ["APPROVED VERBIAGE (FULL TEXT):", sub.correctedText, ""] : []),
    "PLEASE CONFIRM RECEIPT, ADVISE ANY AMENDMENTS REQUIRED, AND PROCEED",
    "WITH ISSUANCE UPON COMPLETION OF YOUR COMPLIANCE REVIEW.",
  ].join("\n")

  const res = await sendLegalMt799({
    to: [to],
    cc: [],
    sender,
    message: {
      transactionReference: ref,
      relatedReference: "NONREF",
      recipientName: "Barclays Bank PLC — Trade & Working Capital",
      subject: `Request for issuance — ${a.instrumentType || "bank instrument"} ${amount}`,
      subjectMatter: [`Client: ${sub.holderLabel}`, `Submission: ${sub.id}`, `Source document: ${sub.fileName}`],
      narrative,
      dateIso: new Date().toISOString(),
    },
  })

  if (!res.ok) {
    await updateVerbiage(sub.id, { transmissionError: res.error })
    return { ok: false, error: res.error }
  }

  await updateVerbiage(sub.id, {
    status: "transmitted",
    transmittedAt: new Date().toISOString(),
    transmittedTo: to,
    transmissionError: null,
  })
  await insertNotification({
    userId: sub.userId,
    tone: "success",
    title: "Verbiage sent to Barclays",
    body: `Your approved ${a.instrumentType || "instrument"} verbiage (${amount}) was transmitted to Barclays Bank PLC for execution. You'll be notified when the instrument is issued.`,
    href: "/dashboard/instruments",
  }).catch(() => undefined)
  return { ok: true, to }
}
