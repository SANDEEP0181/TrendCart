const express=require('express');
const cors=require('cors');
const crypto=require('crypto');
const {Pool}=require('pg');
const app=express();
const PORT=process.env.PORT||5000;
const ADMIN_USERNAME=process.env.ADMIN_USERNAME||'admin';
const ADMIN_PASSWORD=process.env.ADMIN_PASSWORD||'TrendCart@Admin2026!';
const ADMIN_SECRET=process.env.ADMIN_SECRET||'TrendCart-Secure-Secret-2026-Change-Later';

app.use(cors());
app.use(express.json({limit:'10mb'}));

if(!process.env.DATABASE_URL)console.warn('DATABASE_URL is not set');
const pool=new Pool({connectionString:process.env.DATABASE_URL,ssl:process.env.DATABASE_URL?{rejectUnauthorized:false}:false});

async function initDb(){
  await pool.query(`CREATE TABLE IF NOT EXISTS products(id SERIAL PRIMARY KEY,name TEXT NOT NULL,category TEXT NOT NULL,price NUMERIC(12,2) NOT NULL,stock INTEGER DEFAULT 0,image TEXT,sizes JSONB DEFAULT '{}'::jsonb)`);
  await pool.query(`CREATE TABLE IF NOT EXISTS orders(id SERIAL PRIMARY KEY,customer_name TEXT NOT NULL,mobile TEXT NOT NULL,address TEXT NOT NULL,city TEXT NOT NULL,state TEXT NOT NULL,pincode TEXT NOT NULL,payment_method TEXT NOT NULL,items JSONB NOT NULL,total NUMERIC(12,2) NOT NULL,status TEXT DEFAULT 'Pending',created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP)`);
  const count=await pool.query('SELECT COUNT(*)::int AS c FROM products');
  if(count.rows[0].c===0){
    await pool.query(`INSERT INTO products(name,category,price,stock,image,sizes) VALUES($1,$2,$3,$4,$5,$6),($7,$8,$9,$10,$11,$12)`,['Classic T-Shirt','Clothes',499,20,null,JSON.stringify({S:4,M:5,L:5,XL:4,XXL:2}),'Running Shoes','Shoes',1299,15,null,JSON.stringify({'6':2,'7':3,'8':3,'9':3,'10':2,'11':2})]);
  }
}

function safeEqual(a,b){const x=Buffer.from(String(a||''));const y=Buffer.from(String(b||''));return x.length===y.length&&crypto.timingSafeEqual(x,y)}
function sign(value){return crypto.createHmac('sha256',ADMIN_SECRET).update(value).digest('hex')}
function makeToken(username){const payload=Buffer.from(JSON.stringify({u:username,t:Date.now()})).toString('base64url');return payload+'.'+sign(payload)}
function auth(req,res,next){const h=req.headers.authorization||'';if(!h.startsWith('Bearer '))return res.status(401).json({error:'Admin login required'});const token=h.slice(7);const parts=token.split('.');if(parts.length!==2||!safeEqual(parts[1],sign(parts[0])))return res.status(401).json({error:'Invalid admin token'});try{const p=JSON.parse(Buffer.from(parts[0],'base64url').toString());if(p.u!==ADMIN_USERNAME||Date.now()-p.t>86400000)return res.status(401).json({error:'Admin session expired'});req.admin=p.u;next()}catch(e){return res.status(401).json({error:'Invalid admin token'})}}

app.get('/',(q,s)=>s.json({success:true,message:'TrendCart Backend is running'}));
app.post('/api/admin/login',(q,s)=>{const{username,password}=q.body||{};if(!safeEqual(username,ADMIN_USERNAME)||!safeEqual(password,ADMIN_PASSWORD))return s.status(401).json({error:'Invalid username or password'});s.json({success:true,token:makeToken(username)})});

app.get('/api/products',async(q,s)=>{try{const r=await pool.query('SELECT * FROM products ORDER BY id DESC');s.json(r.rows)}catch(e){s.status(500).json({error:e.message})}});

app.post('/api/products',auth,async(q,s)=>{try{const{name,category='Other',price,stock,image=null,sizes={}}=q.body;if(!name||price===undefined||stock===undefined)return s.status(400).json({error:'Product details are required'});const r=await pool.query('INSERT INTO products(name,category,price,stock,image,sizes) VALUES($1,$2,$3,$4,$5,$6) RETURNING *',[name,category,Number(price),Number(stock),image,sizes]);s.json({success:true,product:r.rows[0]})}catch(e){s.status(500).json({error:e.message})}});

app.put('/api/products/:id',auth,async(q,s)=>{try{const{name,category='Other',price,stock,image=null,sizes={}}=q.body;const r=await pool.query('UPDATE products SET name=$1,category=$2,price=$3,stock=$4,image=$5,sizes=$6 WHERE id=$7 RETURNING *',[name,category,Number(price),Number(stock),image,sizes,Number(q.params.id)]);if(!r.rowCount)return s.status(404).json({error:'Product not found'});s.json({success:true,product:r.rows[0]})}catch(e){s.status(500).json({error:e.message})}});

app.delete('/api/products/:id',auth,async(q,s)=>{try{const r=await pool.query('DELETE FROM products WHERE id=$1',[Number(q.params.id)]);if(!r.rowCount)return s.status(404).json({error:'Product not found'});s.json({success:true})}catch(e){s.status(500).json({error:e.message})}});

app.get('/api/orders',auth,async(q,s)=>{try{const r=await pool.query("SELECT id,customer_name,mobile,address,city,state,pincode,payment_method,items,total,status,created_at,to_char(created_at AT TIME ZONE 'Asia/Kolkata','DD Mon YYYY, HH12:MI:SS AM') AS created_at_ist FROM orders ORDER BY id DESC");s.json(r.rows)}catch(e){s.status(500).json({error:e.message})}});

app.post('/api/orders',async(q,s)=>{const client=await pool.connect();try{
  const{customer_name,mobile,address,city,state,pincode,payment_method='COD',items,total}=q.body||{};
  if(!customer_name||!mobile||!address||!city||!state||!pincode||!payment_method||!items||total===undefined)return s.status(400).json({error:'All order details are required'});
  const orderItems=typeof items==='string'?JSON.parse(items):items;
  if(!Array.isArray(orderItems)||!orderItems.length)return s.status(400).json({error:'Cart is empty'});
  const normalized=orderItems.map(item=>({id:Number(item.id),name:String(item.name||''),price:Number(item.price||0),quantity:Number(item.quantity||0),size:item.size||null}));
  if(normalized.some(item=>!Number.isInteger(item.id)||item.id<1||!Number.isInteger(item.quantity)||item.quantity<1))return s.status(400).json({error:'Invalid cart items'});

  await client.query('BEGIN');
  for(const item of normalized){
    const productResult=await client.query('SELECT id,name,stock,sizes FROM products WHERE id=$1 FOR UPDATE',[item.id]);
    if(!productResult.rowCount)throw new Error(`Product not found: ${item.id}`);
    const product=productResult.rows[0];
    if(product.stock<item.quantity)throw new Error(`Insufficient stock for ${product.name}. Available: ${product.stock}`);
    if(item.size){
      const sizes=product.sizes||{};const available=Number(sizes[item.size]||0);
      if(available<item.quantity)throw new Error(`Insufficient stock for ${product.name} (${item.size}). Available: ${available}`);
      sizes[item.size]=available-item.quantity;
      await client.query('UPDATE products SET stock=stock-$1,sizes=$2 WHERE id=$3',[item.quantity,sizes,item.id]);
    }else await client.query('UPDATE products SET stock=stock-$1 WHERE id=$2',[item.quantity,item.id]);
  }
  const orderResult=await client.query('INSERT INTO orders(customer_name,mobile,address,city,state,pincode,payment_method,items,total) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id',[customer_name,mobile,address,city,state,pincode,payment_method,normalized,Number(total)]);
  await client.query('COMMIT');
  s.json({success:true,orderId:orderResult.rows[0].id});
}catch(e){await client.query('ROLLBACK').catch(()=>{});s.status(400).json({error:e.message||'Order failed'})}finally{client.release()}});

app.put('/api/orders/:id/status',auth,async(q,s)=>{try{const allowed=['Pending','Confirmed','Shipped','Delivered','Cancelled'];if(!allowed.includes(q.body.status))return s.status(400).json({error:'Invalid status'});const r=await pool.query('UPDATE orders SET status=$1 WHERE id=$2',[q.body.status,Number(q.params.id)]);if(!r.rowCount)return s.status(404).json({error:'Order not found'});s.json({success:true})}catch(e){s.status(500).json({error:e.message})}});

initDb().then(()=>app.listen(PORT,()=>console.log(`TrendCart Backend running on port ${PORT}`))).catch(e=>{console.error('Database initialization failed:',e);process.exit(1)});