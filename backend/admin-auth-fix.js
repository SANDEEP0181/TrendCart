// TrendCart admin-auth bootstrap.
// Normalize common Render admin variable names before support-server loads.
const crypto = require('crypto');
const pick = (...values) => values.find(v => v !== undefined && v !== null && String(v).trim() !== '');
const normalize = (value) => {
  let s = String(value ?? '').trim();
  if (s.length >= 2) {
    const first = s[0], last = s[s.length - 1];
    if ((first === '"' && last === '"') || (first === "'" && last === "'")) s = s.slice(1, -1).trim();
  }
  return s;
};

const username = pick(
  process.env.ADMIN_USERNAME,
  process.env.ADMIN_ID,
  process.env.ADMIN_USER,
  process.env.ADMIN_LOGIN,
  'admin'
);
const password = pick(
  process.env.ADMIN_PASSWORD,
  process.env.ADMIN_PASS,
  process.env.ADMIN_PWD,
  process.env.ADMIN_LOGIN_PASSWORD,
  ''
);

process.env.ADMIN_USERNAME = normalize(username);
process.env.ADMIN_PASSWORD = normalize(password);

if (!process.env.ADMIN_SECRET && process.env.ADMIN_PASSWORD) {
  process.env.ADMIN_SECRET = crypto
    .createHash('sha256')
    .update(`TrendCart-admin:${process.env.ADMIN_PASSWORD}`)
    .digest('hex');
}
