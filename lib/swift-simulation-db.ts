import "server-only"
import { query } from "@/lib/db"
import type { SwiftSimulationRecord } from "@/lib/swift-simulation"

let ready: Promise<void> | null = null

function ensureTable(): Promise<void> {
  if (!ready) {
    ready = (async () => {
      // is_simulation is locked to TRUE by a CHECK constraint so a stored row
      // can never be flipped to look like a real message.
      await query(`
        CREATE TABLE IF NOT EXISTS swift_simulations (
          id text PRIMARY KEY,
          is_simulation boolean NOT NULL DEFAULT true CHECK (is_simulation = true),
          created_by text NOT NULL,
          created_at timestamptz NOT NULL DEFAULT now(),
          input jsonb NOT NULL,
          fields jsonb NOT NULL,
          warnings jsonb NOT NULL DEFAULT '[]'::jsonb
        )
      `)
      await query(`CREATE INDEX IF NOT EXISTS swift_simulations_created_idx ON swift_simulations (created_at DESC)`)
    })().catch((err) => {
      ready = null
      throw err
    })
  }
  return ready
}

type Row = {
  id: string
  created_by: string
  created_at: string | Date
  input: SwiftSimulationRecord["input"]
  fields: SwiftSimulationRecord["fields"]
  warnings: string[]
}

function toRecord(r: Row): SwiftSimulationRecord {
  return {
    id: r.id,
    isSimulation: true,
    createdBy: r.created_by,
    createdAt: new Date(r.created_at).toISOString(),
    input: r.input,
    fields: r.fields,
    warnings: r.warnings ?? [],
  }
}

export async function insertSwiftSimulation(rec: SwiftSimulationRecord): Promise<void> {
  await ensureTable()
  await query(
    `INSERT INTO swift_simulations (id, is_simulation, created_by, created_at, input, fields, warnings)
     VALUES ($1, true, $2, $3, $4, $5, $6)`,
    [rec.id, rec.createdBy, rec.createdAt, JSON.stringify(rec.input), JSON.stringify(rec.fields), JSON.stringify(rec.warnings)],
  )
}

export async function listSwiftSimulations(limit = 50): Promise<SwiftSimulationRecord[]> {
  await ensureTable()
  const res = await query<Row>(
    `SELECT id, created_by, created_at, input, fields, warnings
     FROM swift_simulations ORDER BY created_at DESC LIMIT $1`,
    [limit],
  )
  return res.rows.map(toRecord)
}
