import { redirect } from "next/navigation"

// Internal Transfers (P2P) has been merged into the unified Send Money page,
// which now offers both instant transfers and approval-based transfers.
export default function TransfersRedirectPage() {
  redirect("/dashboard/send")
}
