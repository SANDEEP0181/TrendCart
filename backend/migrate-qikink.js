const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL ? { rejectUnauthorized: false } : false
});

async function run() {
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is not set');

  await pool.query(`
    ALTER TABLE products ADD COLUMN IF NOT EXISTS qikink_product_id TEXT;
    ALTER TABLE products ADD COLUMN IF NOT EXISTS qikink_variants JSONB;
  `);

  const sizes = { XS: 10, XL: 10 };
  const variants = {
    XS: {
      product_sku: 'USs-Wh-XS',
      design_sku: 'v-9Ryk3yaFaVZW0M8ONxYpubTerg3b9nOf',
      qikink_cost: 409.50,
      suggested_selling_cost: 599
    },
    XL: {
      product_sku: 'USs-Wh-XL',
      design_sku: 'v-9Ryk3yaFaVZW0M8ONxYpubTerg3b9nOe',
      qikink_cost: 409.50,
      suggested_selling_cost: 799
    }
  };

  const result = await pool.query(`
    INSERT INTO products
      (name, category, price, stock, sizes, qikink_product_id, qikink_variants)
    VALUES
      ('Unisex Sweatshirt', 'Clothes', 699, 20, $1::jsonb, '64762620', $2::jsonb)
    ON CONFLICT DO NOTHING
    RETURNING id, name, price, stock, sizes, qikink_product_id;
  `, [JSON.stringify(sizes), JSON.stringify(variants)]);

  if (result.rowCount) {
    console.log('Qikink Sweatshirt added:', result.rows[0]);
    return;
  }

  const existing = await pool.query(`
    UPDATE products
    SET price = 699,
        stock = GREATEST(COALESCE(stock, 0), 20),
        sizes = $1::jsonb,
        qikink_product_id = '64762620',
        qikink_variants = $2::jsonb
    WHERE LOWER(name) = LOWER('Unisex Sweatshirt')
      AND category = 'Clothes'
    RETURNING id, name, price, stock, sizes, qikink_product_id;
  `, [JSON.stringify(sizes), JSON.stringify(variants)]);

  console.log(existing.rowCount ? 'Qikink Sweatshirt updated:' : 'Qikink Sweatshirt not inserted:', existing.rows);
}

run()
  .catch(err => {
    console.error('Qikink migration failed:', err.message);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
