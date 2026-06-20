const { Pool } = require("pg");
const url = process.env.DATABASE_URL || process.env.POSTGRES_URL || process.env.NEON_DATABASE_URL || process.env.POSTGRES_URL_NON_POOLING || process.env.DATABASE_URL_UNPOOLED;
if (!url) { console.log("NO DB URL in this shell"); process.exit(0); }
(async () => {
  const pool = new Pool({ connectionString: url, max: 1 });
  try {
    const t = await pool.query("SELECT to_regclass('public.swift_routing_requests') AS t");
    console.log("table exists:", t.rows[0].t);
    if (t.rows[0].t) {
      const { rows } = await pool.query("SELECT id, user_id, message_type, status, customer_email, created_at FROM swift_routing_requests ORDER BY created_at DESC LIMIT 20");
      console.log("ROW COUNT:", rows.length);
      for (const r of rows) console.log(JSON.stringify(r));
    }
  } catch (e) { console.log("ERR:", e.message); }
  await pool.end();
})();
