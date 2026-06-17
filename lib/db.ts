import { Pool } from "pg"

// Single shared pooled connection to Neon, reused across hot reloads in dev so
// we don't exhaust connections. Used by the P2P transfer server actions.
const globalForDb = globalThis as unknown as { __mccPool?: Pool }

export const pool =
  globalForDb.__mccPool ??
  new Pool({
    connectionString: process.env.DATABASE_URL,
    max: 5,
  })

if (process.env.NODE_ENV !== "production") {
  globalForDb.__mccPool = pool
}
