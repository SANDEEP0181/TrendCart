const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL ? { rejectUnauthorized: false } : false
});

/**
 * Build a Qikink-ready fulfillment job from a TrendCart order.
 * This module deliberately does not call an undocumented Qikink endpoint.
 * Once the official Open API contract is available, only submitToQikink()
 * needs to be connected to it.
 */
async function buildFulfillmentJob(orderId) {
  const orderResult = await pool.query(
    `SELECT id, customer_name, mobile, address, city, state, pincode,
            payment_method, items, total, status, qikink_order_id,
            qikink_status, qikink_error
       FROM orders WHERE id=$1`,
    [Number(orderId)]
  );
  if (!orderResult.rowCount) throw new Error('Order not found');

  const order = orderResult.rows[0];
  const items = Array.isArray(order.items) ? order.items : JSON.parse(order.items || '[]');
  if (!items.length) throw new Error('Order has no items');

  const productIds = [...new Set(items.map(i => Number(i.id)).filter(Number.isInteger))];
  const products = await pool.query(
    `SELECT id, name, qikink_product_id, qikink_variants
       FROM products WHERE id = ANY($1::int[])`,
    [productIds]
  );
  const byId = new Map(products.rows.map(p => [Number(p.id), p]));

  const fulfillmentItems = items.map(item => {
    const product = byId.get(Number(item.id));
    if (!product) throw new Error(`Product not found: ${item.id}`);
    if (!product.qikink_product_id) {
      throw new Error(`${product.name} is not configured for Qikink fulfillment`);
    }

    const variants = product.qikink_variants || {};
    const variant = item.size ? variants[item.size] : null;
    if (item.size && !variant) {
      throw new Error(`${product.name} (${item.size}) has no Qikink variant mapping`);
    }

    return {
      trendcart_product_id: Number(item.id),
      name: product.name,
      quantity: Number(item.quantity),
      size: item.size || null,
      qikink_product_id: String(product.qikink_product_id),
      product_sku: variant?.product_sku || null,
      design_sku: variant?.design_sku || null
    };
  });

  return {
    trendcart_order_id: Number(order.id),
    customer: {
      name: order.customer_name,
      mobile: order.mobile,
      address: order.address,
      city: order.city,
      state: order.state,
      pincode: order.pincode
    },
    payment_method: order.payment_method,
    order_value: Number(order.total),
    items: fulfillmentItems
  };
}

async function markReady(orderId) {
  await pool.query(
    `UPDATE orders
        SET qikink_status='Ready for Submission',
            qikink_error=NULL,
            qikink_synced_at=NOW()
      WHERE id=$1`,
    [Number(orderId)]
  );
}

async function close() {
  await pool.end();
}

module.exports = { buildFulfillmentJob, markReady, close };
