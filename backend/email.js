const nodemailer=require('nodemailer');

let transporter=null;
function getTransporter(){
  if(transporter)return transporter;
  const host=process.env.SMTP_HOST;
  const port=Number(process.env.SMTP_PORT||587);
  const user=process.env.SMTP_USER;
  const pass=process.env.SMTP_PASS;
  if(!host||!user||!pass)return null;
  transporter=nodemailer.createTransport({host,port,secure:process.env.SMTP_SECURE==='true',auth:{user,pass}});
  return transporter;
}

function money(v){return `₹${Number(v||0).toFixed(2)}`}
function esc(v){return String(v??'').replace(/[&<>\"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','\\"':'&quot;'}[c]||c))}

async function sendOrderConfirmationEmail(order,email){
  const t=getTransporter();
  if(!t||!email)return {sent:false,reason:'Email service is not configured or customer email is unavailable'};
  const items=Array.isArray(order.items)?order.items:[];
  const rows=items.map(i=>`<tr><td style="padding:8px;border-bottom:1px solid #eee">${esc(i.name)}</td><td style="padding:8px;border-bottom:1px solid #eee">${esc(i.size||'-')}</td><td style="padding:8px;border-bottom:1px solid #eee;text-align:center">${Number(i.quantity||0)}</td><td style="padding:8px;border-bottom:1px solid #eee;text-align:right">${money(Number(i.price||0)*Number(i.quantity||0))}</td></tr>`).join('');
  const from=process.env.SMTP_FROM||process.env.SMTP_USER;
  const subject=`TrendCart Order Confirmed #${order.id}`;
  const html=`<!doctype html><html><body style="margin:0;background:#f5f7fb;font-family:Arial,sans-serif;color:#222"><div style="max-width:640px;margin:24px auto;background:#fff;border-radius:12px;padding:28px"><h2 style="margin-top:0">TrendCart — Order Confirmed 🎉</h2><p>Hi ${esc(order.customer_name)}, your order has been successfully placed.</p><div style="background:#f7f7f7;padding:14px;border-radius:8px"><b>Order ID:</b> #${order.id}<br><b>Payment:</b> ${esc(order.payment_method)}<br><b>Status:</b> ${esc(order.status)}</div><h3>Order Details</h3><table width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse"><thead><tr><th style="text-align:left;padding:8px">Product</th><th style="padding:8px">Size</th><th style="padding:8px">Qty</th><th style="text-align:right;padding:8px">Amount</th></tr></thead><tbody>${rows}</tbody></table><p style="font-size:18px;text-align:right"><b>Total: ${money(order.total)}</b></p><p><b>Delivery Address</b><br>${esc(order.address)}, ${esc(order.city)}, ${esc(order.state)} - ${esc(order.pincode)}</p><p style="margin-top:24px"><a href="${process.env.FRONTEND_URL||'https://sandeep0181.github.io/TrendCart/'}track-order.html?id=${encodeURIComponent(order.id)}&mobile=${encodeURIComponent(order.mobile)}" style="display:inline-block;padding:11px 18px;background:#111;color:#fff;text-decoration:none;border-radius:7px">Track Order</a></p><p style="color:#777;font-size:12px">Thank you for shopping with TrendCart.</p></div></body></html>`;
  await t.sendMail({from,to:email,subject,html,text:`TrendCart Order #${order.id} confirmed. Total: ${money(order.total)}. Track your order on the TrendCart website.`});
  return {sent:true};
}

module.exports={sendOrderConfirmationEmail};
