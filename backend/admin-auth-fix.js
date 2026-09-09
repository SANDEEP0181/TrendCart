// TrendCart admin-auth bootstrap.
// Keeps ADMIN_SECRET optional for existing Render deployments: when an admin
// password is configured but ADMIN_SECRET is missing, derive a stable secret
// from the password instead of making every admin login fail.
const crypto = require('crypto');

const password = String(process.env.ADMIN_PASSWORD || '');
if (password && !process.env.ADMIN_SECRET) {
  process.env.ADMIN_SECRET = crypto
    .createHash('sha256')
    .update(`TrendCart-admin:${password}`)
    .digest('hex');
}
