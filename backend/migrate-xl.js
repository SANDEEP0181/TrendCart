const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL ? { rejectUnauthorized: false } : false
});

async function run() {
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is not set');
  const result = await pool.query(`
    UPDATE products
    SET sizes = COALESCE(sizes, '{}'::jsonb) || '{"XL":4}'::jsonb
    WHERE LOWER(name) = LOWER('Classic T-Shirt')
      AND category = 'Clothes'
    RETURNING id, name, sizes
  `);
  console.log(result.rowCount ? 'XL size ensured on Classic T-Shirt:' : 'Classic T-Shirt not found:', result.rows);
}

run().catch(err => {
  console.error('XL migration failed:', err.message);
  process.exitCode = 1;
}).finally(() => pool.end());
