"use server"

import { adminActionAuthorized } from "@/lib/admin-auth"
import { resolveCurrentSession } from "@/lib/session-user"
import { logActivity } from "@/app/actions/log-activity"
import { insertSwiftSimulation, listSwiftSimulations } from "@/lib/swift-simulation-db"
import {
  buildSimulationFields,
  validateSimulationInput,
  SIM_CHARGE_OPTIONS,
  type SwiftSimulationInput,
  type SwiftSimulationRecord,
} from "@/lib/swift-simulation"

type Result<T> = { ok: true } & T | { ok: false; error: string }

function newSimId(): string {
  const rand = Math.random().toString(36).slice(2, 7).toUpperCase()
  return `SIM-${Date.now().toString(36).toUpperCase()}-${rand}`
}

export async function generateSwiftSimulationAdmin(
  passcode: string,
  raw: SwiftSimulationInput,
): Promise<Result<{ record: SwiftSimulationRecord }>> {
  if (!(await adminActionAuthorized(passcode))) return { ok: false, error: "Not authorised." }
  const session = await resolveCurrentSession().catch(() => null)
  if (!session) return { ok: false, error: "Not signed in." }

  const input: SwiftSimulationInput = {
    senderName: String(raw.senderName ?? ""),
    senderAddress: String(raw.senderAddress ?? ""),
    beneficiaryName: String(raw.beneficiaryName ?? ""),
    beneficiaryAddress: String(raw.beneficiaryAddress ?? ""),
    amount: String(raw.amount ?? "").replace(/,/g, ""),
    currency: String(raw.currency ?? "").trim().toUpperCase(),
    valueDate: String(raw.valueDate ?? ""),
    reference: String(raw.reference ?? ""),
    remittanceInfo: String(raw.remittanceInfo ?? ""),
    charges: SIM_CHARGE_OPTIONS.includes(raw.charges) ? raw.charges : "SHA",
  }
  const invalid = validateSimulationInput(input)
  if (invalid) return { ok: false, error: invalid }

  const { fields, warnings } = buildSimulationFields(input)
  const sessionEmail = (session as { email?: string }).email
  const record: SwiftSimulationRecord = {
    id: newSimId(),
    isSimulation: true,
    createdAt: new Date().toISOString(),
    createdBy: sessionEmail || session.id,
    input,
    fields,
    warnings,
  }

  try {
    await insertSwiftSimulation(record)
  } catch (err) {
    console.log("[v0] swift simulation insert failed:", err)
    return { ok: false, error: "Could not save the simulation. Please try again." }
  }

  await logActivity({
    category: "Administration / SWIFT Simulation",
    action: "MT103-style training simulation generated",
    details: {
      simulationId: record.id,
      generatedBy: record.createdBy,
      amount: input.amount,
      currency: input.currency,
      orderingCustomer: input.senderName,
      beneficiary: input.beneficiaryName,
      reference: input.reference,
      valueDate: input.valueDate,
      watermark: "SIMULATION – NOT A BANK DOCUMENT",
    },
  })

  return { ok: true, record }
}

export async function listSwiftSimulationsAdmin(
  passcode: string,
): Promise<Result<{ records: SwiftSimulationRecord[] }>> {
  if (!(await adminActionAuthorized(passcode))) return { ok: false, error: "Not authorised." }
  try {
    return { ok: true, records: await listSwiftSimulations(50) }
  } catch (err) {
    console.log("[v0] swift simulation list failed:", err)
    return { ok: false, error: "Could not load simulations." }
  }
}
