// Administrator gate for the in-app approval panel.
//
// NOTE: This app has no server-side auth roles, so the Administrator area is
// protected by a shared client-side passcode. This is a deliberate, documented
// limitation — it keeps the approval workflow inside the product without a
// backend. For a production deployment, replace this with a real server-side
// role check.
export const ADMIN_PASSCODE = "270476"

// Session flag key so the administrator does not have to re-enter the passcode
// on every navigation within the same browser tab session.
export const ADMIN_SESSION_KEY = "mcc.admin.unlocked.v1"
