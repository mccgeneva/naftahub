// Plain, client-safe shared types for the biometric (Face ID) feature.
// Kept separate from `lib/biometric-db.ts` (which is `server-only`) and from the
// `"use server"` actions file so the type can be imported by client components
// without dragging in server-only code or breaking the server-actions module
// (a `"use server"` file must only export async functions — never types).

/** Lightweight enrollment status for UI and login gating (no descriptor data). */
export interface FaceState {
  enrolled: boolean
  locked: boolean
  failCount: number
  enrolledAt: string | null
}
