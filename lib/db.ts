import { Pool, type PoolClient, type QueryResult, type QueryResultRow } from "pg"

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
// we don't exhaust connections.
const globalForDb = globalThis as unknown as { __mccPool?: Pool }

function createPool(): Pool {
  const p = new Pool({
    connectionString: getConnectionString(),
    max: 5,
    // Neon's pooler aggressively closes idle server-side connections. Recycle our
    // idle clients quickly so we don't keep handing out sockets that Neon has
    // already dropped (the classic source of "read ECONNRESET").
    idleTimeoutMillis: 10_000,
    connectionTimeoutMillis: 10_000,
    // TCP keepalive helps detect a dead connection before we try to use it.
    keepAlive: true,
    allowExitOnIdle: false,
  })

  // CRITICAL: a pooled client can emit 'error' while idle (e.g. Neon reset the
  // connection). Without this handler that error is unhandled and can crash the
  // process. We just log it; the dead client is removed from the pool by pg.
  p.on("error", (err) => {
    console.log("[v0] pg pool idle client error (recovered):", (err as Error)?.message)
  })

  return p
}

export const pool = globalForDb.__mccPool ?? createPool()

if (process.env.NODE_ENV !== "production") {
  globalForDb.__mccPool = pool
}

// Boot-time diagnostic: confirms at a glance (in server logs) whether a database
// connection string was found in the current environment. If this logs `false`
// in production, the DATABASE_URL project env var is missing from the deployment.
console.log("[v0] database configured:", isDatabaseConfigured)

// Connection-level errors that mean "the socket was dead"; safe to retry once on
// a fresh connection because the query never actually ran on the server.
const RETRYABLE = new Set([
  "ECONNRESET",
  "EPIPE",
  "ETIMEDOUT",
  "ECONNREFUSED",
  "57P01", // admin_shutdown
  "57P02", // crash_shutdown
  "08006", // connection_failure
  "08003", // connection_does_not_exist
])

function isRetryable(err: unknown): boolean {
  const e = err as { code?: string; message?: string }
  if (e?.code && RETRYABLE.has(e.code)) return true
  const msg = e?.message ?? ""
  return (
    msg.includes("ECONNRESET") ||
    msg.includes("Connection terminated") ||
    msg.includes("connection terminated") ||
    msg.includes("server closed the connection")
  )
}

/**
 * Resilient query: runs against the shared pool and transparently retries once
 * on a transient connection-reset error. All app reads/writes go through here so
 * a single dropped Neon connection never surfaces as a failed dashboard panel.
 */
export async function query<T extends QueryResultRow = QueryResultRow>(
  text: string,
  params?: unknown[],
): Promise<QueryResult<T>> {
  try {
    return await pool.query<T>(text, params as never)
  } catch (err) {
    if (!isRetryable(err)) throw err
    console.log("[v0] db query retry after transient error:", (err as Error)?.message)
    // Small backoff to let the pool establish a fresh connection.
    await new Promise((r) => setTimeout(r, 150))
    return await pool.query<T>(text, params as never)
  }
}

/** Run a function with a dedicated client (for transactions). */
export async function withClient<T>(fn: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect()
  try {
    return await fn(client)
  } finally {
    client.release()
  }
}
