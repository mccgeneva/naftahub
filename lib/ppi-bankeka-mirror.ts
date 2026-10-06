import "server-only"
import { getDynamicUserByEmail } from "@/lib/admin-users-db"
import { insertMessage } from "@/lib/bankeka-db"

// Same shared support inbox the Bankeka admin console anchors on.
const BANKEKA_OPERATOR_EMAIL = "admin@mccgva.ch"

async function operatorId(): Promise<string | null> {
  try {
    const rec = await getDynamicUserByEmail(BANKEKA_OPERATOR_EMAIL)
    return rec && rec.status === "active" ? rec.id : null
  } catch {
    return null
  }
}

/** Copies a PPI negotiation message into the customer's Bankeka thread with
 *  treasury, so the conversation is visible in Messages on both sides.
 *  Best-effort: never blocks the PPI message itself. */
export async function mirrorPpiMessageToBankeka(input: {
  direction: "treasury-to-client" | "client-to-treasury"
  clientId: string
  text: string
}): Promise<void> {
  try {
    const op = await operatorId()
    if (!op || op === input.clientId) return
    const body = `[PPI insurance] ${input.text}`
    if (input.direction === "treasury-to-client") {
      await insertMessage({ senderId: op, recipientId: input.clientId, body })
    } else {
      await insertMessage({ senderId: input.clientId, recipientId: op, body })
    }
  } catch (err) {
    console.error("[ppi] Bankeka mirror failed:", err)
  }
}
