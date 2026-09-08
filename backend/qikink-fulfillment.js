const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL ? { rejectUnauthorized: false } : false
});

let cachedToken = null;
let tokenExpiresAt = 0;

function baseUrl() {
  return String(process.env.QIKINK_API_URL || (String(process.env.QIKINK_SANDBOX_MODE).toLowerCase() === 'true' ? 'https://sandbox.qikink.com' : 'https://api.qikink.com')).replace(/\/$/, '');
}

function clientSecret() {
  return process.env.QIKINK_CLIENT_SECRET || process.env.QIKINK_SECRET_KEY || process.env.QIKINK_SANDBOX_SECRET || '';
}

async function getToken(forceRefresh = false) {
  if (!forceRefresh && cachedToken && Date.now() < tokenExpiresAt) return cachedToken;
  const clientId = process.env.QIKINK_CLIENT_ID;
  const secret = clientSecret();
  if (!clientId || !secret) throw new Error('Qikink API credentials are not configured');

  const form = new URLSearchParams();
  form.set('ClientId', clientId);
  form.set('client_secret', secret);
  const response = await fetch(`${baseUrl()}/api/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: form
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data.Accesstoken) throw new Error(data.message || data.error || `Qikink authentication failed (${response.status})`);
  cachedToken = data.Accesstoken;
  tokenExpiresAt = Date.now() + ((Number(data.expires_in) || 3600) - 60) * 1000;
  return cachedToken;
}

async function qikinkRequest(path, options = {}, retry = true) {
  const token = await getToken(false);
  const response = await fetch(`${baseUrl()}${path}`, {
    ...options,
    headers: {
      'ClientId': process.env.QIKINK_CLIENT_ID,
      'Accesstoken': token,
      'Content-Type': 'application/json',
      ...(options.headers || {})
    }
  });
  const data = await response.json().catch(() => ({}));
  if (response.status === 401 && retry) {
    await getToken(true);
    return qikinkRequest(path, options, false);
  }
  if (!response.ok) throw new Error(data.message || data.error || `Qikink API error (${response.status})`);
  if (data.status_code && String(data.status_code) !== '200') throw new Error(data.message || data.error || 'Qikink rejected the request');
  return data;
}

function splitName(name) {
  const parts = String(name || 'Customer').trim().split(/\s+/);
  return { first_name: parts.shift() || 'Customer', last_name: parts.join(' ') };
}

async function buildFulfillmentJob(orderId) {
  const orderResult = await pool.query(
    `SELECT id, customer_name, customer_email, mobile, address, city, state, pincode,
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
  const products = await pool.query(`SELECT id,name,qikink_product_id,qikink_variants FROM products WHERE id=ANY($1::int[])`, [productIds]);
  const byId = new Map(products.rows.map(p => [Number(p.id), p]));

  const fulfillmentItems = items.map(item => {
    const product = byId.get(Number(item.id));
    if (!product) throw new Error(`Product not found: ${item.id}`);
    if (!product.qikink_product_id) throw new Error(`${product.name} is not configured for Qikink fulfillment`);
    const variants = product.qikink_variants || {};
    const variant = item.size ? variants[item.size] : null;
    if (item.size && !variant) throw new Error(`${product.name} (${item.size}) has no Qikink variant mapping`);
    if (!variant?.product_sku) throw new Error(`${product.name} has no Qikink SKU mapping`);
    return {
      trendcart_product_id: Number(item.id),
      name: product.name,
      quantity: Number(item.quantity),
      size: item.size || null,
      price: Number(item.price || 0),
      qikink_product_id: String(product.qikink_product_id),
      product_sku: variant.product_sku,
      design_sku: variant.design_sku || null
    };
  });

  const customerName = splitName(order.customer_name);
  return {
    trendcart_order_id: Number(order.id),
    customer: {
      first_name: customerName.first_name,
      last_name: customerName.last_name,
      email: order.customer_email || process.env.QIKINK_DEFAULT_EMAIL || '',
      phone: order.mobile,
      address1: order.address,
      city: order.city,
      state: order.state,
      zip: order.pincode
    },
    payment_method: order.payment_method,
    order_value: Number(order.total),
    items: fulfillmentItems
  };
}

async function submitToQikink(job) {
  if (String(process.env.QIKINK_AUTO_SUBMIT).toLowerCase() !== 'true') {
    return { submitted: false, reason: 'QIKINK_AUTO_SUBMIT is not enabled' };
  }
  if (!job.customer.email) throw new Error('Customer email is required for Qikink fulfillment. Add an email at checkout or set QIKINK_DEFAULT_EMAIL.');

  const sandbox = String(process.env.QIKINK_SANDBOX_MODE).toLowerCase() === 'true';
  const line_items = job.items.map(item => {
    const base = {
      search_from_my_products: sandbox ? 0 : 1,
      sku: String(item.product_sku),
      quantity: String(item.quantity),
      price: String(item.price)
    };
    if (sandbox) {
      base.print_type_id = Number(process.env.QIKINK_SANDBOX_PRINT_TYPE_ID || 1);
      base.designs = [{
        design_code: item.design_sku || `TC${job.trendcart_order_id}`,
        width_inches: '10',
        height_inches: '10',
        placement_sku: process.env.QIKINK_PLACEMENT_SKU || 'fr',
        design_link: process.env.QIKINK_SANDBOX_DESIGN_URL || '',
        mockup_link: process.env.QIKINK_SANDBOX_MOCKUP_URL || ''
      }];
      if (!base.designs[0].design_link || !base.designs[0].mockup_link) throw new Error('Sandbox Qikink submission needs QIKINK_SANDBOX_DESIGN_URL and QIKINK_SANDBOX_MOCKUP_URL');
    }
    return base;
  });

  const payload = {
    order_number: `TC${String(job.trendcart_order_id).slice(-12)}`,
    qikink_shipping: '1',
    gateway: job.payment_method === 'COD' ? 'COD' : 'Prepaid',
    total_order_value: String(job.order_value),
    line_items,
    shipping_address: {
      first_name: job.customer.first_name,
      last_name: job.customer.last_name,
      address1: job.customer.address1,
      address2: '',
      phone: job.customer.phone,
      email: job.customer.email,
      city: job.customer.city,
      zip: job.customer.zip,
      province: job.customer.state,
      country_code: 'IN'
    }
  };

  const data = await qikinkRequest('/api/order/create', { method: 'POST', body: JSON.stringify(payload) });
  const qikinkOrderId = data.order_id || data.qikink_order_id || data.id;
  if (!qikinkOrderId) throw new Error(data.message || 'Qikink did not return an order ID');
  return { submitted: true, qikinkOrderId: String(qikinkOrderId), response: data };
}

async function submitOrder(orderId) {
  const job = await buildFulfillmentJob(orderId);
  const result = await submitToQikink(job);
  if (!result.submitted) {
    await markReady(orderId);
    return result;
  }
  await pool.query(`UPDATE orders SET qikink_order_id=$1,qikink_status='Submitted',qikink_error=NULL,qikink_synced_at=NOW() WHERE id=$2`, [result.qikinkOrderId, Number(orderId)]);
  return result;
}

async function syncOrderStatus(orderId) {
  const r = await pool.query('SELECT qikink_order_id FROM orders WHERE id=$1', [Number(orderId)]);
  if (!r.rowCount) throw new Error('Order not found');
  if (!r.rows[0].qikink_order_id) throw new Error('Qikink order ID is not available');
  const data = await qikinkRequest(`/api/order?id=${encodeURIComponent(r.rows[0].qikink_order_id)}`);
  const status = String(data.status || data.order_status || 'Submitted');
  await pool.query(`UPDATE orders SET qikink_status=$1,qikink_synced_at=NOW(),qikink_error=NULL WHERE id=$2`, [status, Number(orderId)]);
  return { status, data };
}

async function markReady(orderId) {
  await pool.query(`UPDATE orders SET qikink_status='Ready for Submission',qikink_error=NULL,qikink_synced_at=NOW() WHERE id=$1`, [Number(orderId)]);
}

async function close() { await pool.end(); }

module.exports = { buildFulfillmentJob, submitOrder, syncOrderStatus, submitToQikink, markReady, close };
