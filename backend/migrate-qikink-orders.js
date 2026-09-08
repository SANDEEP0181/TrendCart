const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL ? { rejectUnauthorized: false } : false
});

async function run() {
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is not set');

  await pool.query(`
    ALTER TABLE orders ADD COLUMN IF NOT EXISTS qikink_order_id TEXT;
    ALTER TABLE orders ADD COLUMN IF NOT EXISTS qikink_status TEXT DEFAULT 'Not Submitted';
    ALTER TABLE orders ADD COLUMN IF NOT EXISTS qikink_error TEXT;
    ALTER TABLE orders ADD COLUMN IF NOT EXISTS qikink_synced_at TIMESTAMPTZ;
  `);

  console.log('Qikink order tracking fields ensured on orders table.');
}

run()
  .catch(err => {
    console.error('Qikink order migration failed:', err.message);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
