"use client"

// Administrator view for the Payment Gateway.
//
// IMPORTANT: the approval queue here MUST read every client's requests, not the
// signed-in admin's own. Previously this section used the per-user `useGateway`
// client store (scoped to the current user's id), so an administrator saw only
// their own gateway accounts and "nothing to approve" for requests submitted by
// other clients. We now compose the cross-user, DB-backed `GatewayManager`
// (which reads via the passcode-verified `getAllGatewayAccountsAdmin` action)
// alongside the global configuration panels.

import { GatewayConfigManager } from "@/components/admin/gateway-config-manager"
import { BankInventoryManager } from "@/components/admin/bank-inventory-manager"
import { GatewayManager } from "@/components/admin/gateway-manager"

export function AdminGatewaySection() {
  return (
    <>
      {/* Account Types & Currencies availability */}
      <GatewayConfigManager />

      {/* Partner Bank Availability & Capacity */}
      <BankInventoryManager />

      {/* Cross-user pending requests, funding & reconciliation, decision history */}
      <GatewayManager />
    </>
  )
}
