const { Pool } = require("pg")
const pool = new Pool({ connectionString: process.env.DATABASE_URL||process.env.POSTGRES_URL })
;(async()=>{const c=await pool.connect();try{
  const uid='du_mqoq0u18f47ydj'
  await c.query("BEGIN")
  const a=await c.query("DELETE FROM approval_requests WHERE kind='project_funding' AND title ILIKE '%BrowserTest Wind Farm%' RETURNING id")
  const l=await c.query("DELETE FROM ledger_entries WHERE user_id=$1 AND (entry_id LIKE 'FND-CAP-PF-MQR8%' OR entry_id LIKE 'TRYFIN-%') RETURNING entry_id",[uid])
  // restore treasury to prior pending baseline
  const t=await c.query("UPDATE treasury_accounts SET profile='pro',required_deposit=500000,customer_contribution=0,leverage_enabled=true,transaction_exposure=0,status='pending',secured_at=NULL,note=NULL,transactions='[]'::jsonb WHERE user_id=$1 RETURNING status",[uid])
  await c.query("COMMIT")
  console.log("deleted approvals:",a.rowCount,"| deleted ledger:",l.rows.map(r=>r.entry_id),"| treasury restored:",t.rows[0])
}catch(e){await c.query("ROLLBACK");console.log("ERR",e.message)}finally{c.release();await pool.end()}})()
