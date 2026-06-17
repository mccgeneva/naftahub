import { Pool } from "pg"

// Resolve the Postgres connection string from any of the common env var names
// that Neon / Vercel integrations expose. This makes the app resilient whether
// the integration injects DATABASE_URL, POSTGRES_URL, or one of the variants.
export function getConnectionString(): string | undefined {
  return (
    process.env.DATABASE_URL ||
    process.env.POSTGRES_URL ||
    process.env.POSTGRES_PRISMA_URL ||
    process.env.DATABASE_URL_UNPOOLED ||
    process.env.POSTGRES_URL_NON_POOLING ||
    process.env.NEON_DATABASE_URL ||
    undefined
  )
}

/** Whether a database connection string is configured in this environment. */
export const isDatabaseConfigured = Boolean(getConnectionString())

// Single shared pooled connection to Neon, reused across hot reloads in dev so
// we don't exhaust connections. Used by the P2P transfer server actions.
const globalForDb = globalThis as unknown as { __mccPool?: Pool }

export const pool =
  globalForDb.__mccPool ??
  new Pool({
    connectionString: getConnectionString(),
    max: 5,
  })

if (process.env.NODE_ENV !== "production") {
  globalForDb.__mccPool = pool
}
