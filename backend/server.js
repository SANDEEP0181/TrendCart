const express=require('express');
const cors=require('cors');
const crypto=require('crypto');
const Database=require('better-sqlite3');
const app=express();
const PORT=process.env.PORT||5000;
// Temporary free-plan admin configuration. Move these to Render Environment Variables later.
const ADMIN_USERNAME='admin';
const ADMIN_PASSWORD='TrendCart@Admin2026!';
const ADMIN_SECRET='TrendCart-Secure-Secret-2026-Change-Later';

app.use(cors());
app.use(express.json({limit:'10mb'}));

const db=new Database('trendcart.db');
db.prepare(`CREATE TABLE IF NOT EXISTS products(id INTEGER PRIMARY KEY AUTOINCREMENT,name TEXT NOT NULL,category TEXT NOT NULL,price REAL NOT NULL,stock INTEGER DEFAULT 0,image TEXT,sizes TEXT)`).run();
db.prepare(`CREATE TABLE IF NOT EXISTS orders(id INTEGER PRIMARY KEY AUTOINCREMENT,customer_name TEXT NOT NULL,mobile TEXT NOT NULL,address TEXT NOT NULL,city TEXT NOT NULL,state TEXT NOT NULL,pincode TEXT NOT NULL,payment_method TEXT NOT NULL,items TEXT NOT NULL,total REAL NOT NULL,status TEXT DEFAULT 'Pending',created_at DATETIME DEFAULT CURRENT_TIMESTAMP)`).run();
if(db.prepare('SELECT COUNT(*) c FROM products').get().c===0){const add=db.prepare('INSERT INTO products(name,category,price,stock,image,sizes) VALUES(?,?,?,?,?,?)');add.run('Classic T-Shirt','Clothes',499,20,null,JSON.stringify({S:4,M:5,L:5,XL:4,XXL:2}));add.run('Running Shoes','Shoes',1299,15,null,JSON.stringify({'6':2,'7':3,'8':3,'9':3,'10':2,'11':2}))}

function safeEqual(a,b){const x=Buffer.from(String(a||''));const y=Buffer.from(String(b||''));return x.length===y.length&&crypto.timingSafeEqual(x,y)}
function sign(value){return crypto.createHmac('sha256',ADMIN_SECRET).update(value).digest('hex')}
function makeToken(username){const payload=Buffer.from(JSON.stringify({u:username,t:Date.now()})).toString('base64url');return payload+'.'+sign(payload)}
function auth(req,res,next){const h=req.headers.authorization||'';if(!h.startsWith('Bearer '))return res.status(401).json({error:'Admin login required'});const token=h.slice(7);const parts=token.split('.');if(parts.length!==2||!safeEqual(parts[1],sign(parts[0])))return res.status(401).json({error:'Invalid admin token'});try{const p=JSON.parse(Buffer.from(parts[0],'base64url').toString());if(p.u!==ADMIN_USERNAME||Date.now()-p.t>86400000)return res.status(401).json({error:'Admin session expired'});req.admin=p.u;next()}catch(e){return res.status(401).json({error:'Invalid admin token'})}}

app.get('/',(q,s)=>s.json({success:true,message:'TrendCart Backend is running'}));
app.post('/api/admin/login',(q,s)=>{const{username,password}=q.body||{};if(!safeEqual(username,ADMIN_USERNAME)||!safeEqual(password,ADMIN_PASSWORD))return s.status(401).json({error:'Invalid username or password'});s.json({success:true,token:makeToken(username)})});
app.get('/api/products',(q,s)=>{const rows=db.prepare('SELECT * FROM products ORDER BY id DESC').all();s.json(rows.map(p=>({...p,sizes:p.sizes?JSON.parse(p.sizes):{}})))});
app.post('/api/products',auth,(q,s)=>{try{const{name,category='Other',price,stock,image=null,sizes={}}=q.body;if(!name||price===undefined||stock===undefined)return s.status(400).json({error:'Product details are required'});const r=db.prepare('INSERT INTO products(name,category,price,stock,image,sizes) VALUES(?,?,?,?,?,?)').run(name,category,Number(price),Number(stock),image,JSON.stringify(sizes));const p=db.prepare('SELECT * FROM products WHERE id=?').get(r.lastInsertRowid);p.sizes=JSON.parse(p.sizes);s.json({success:true,product:p})}catch(e){s.status(500).json({error:e.message})}});
app.put('/api/products/:id',auth,(q,s)=>{try{const{name,category='Other',price,stock,image=null,sizes={}}=q.body;const r=db.prepare('UPDATE products SET name=?,category=?,price=?,stock=?,image=?,sizes=? WHERE id=?').run(name,category,Number(price),Number(stock),image,JSON.stringify(sizes),Number(q.params.id));if(!r.changes)return s.status(404).json({error:'Product not found'});s.json({success:true})}catch(e){s.status(500).json({error:e.message})}});
app.delete('/api/products/:id',auth,(q,s)=>{const r=db.prepare('DELETE FROM products WHERE id=?').run(Number(q.params.id));if(!r.changes)return s.status(404).json({error:'Product not found'});s.json({success:true})});
app.get('/api/orders',auth,(q,s)=>s.json(db.prepare('SELECT * FROM orders ORDER BY id DESC').all()));

app.post('/api/orders',(q,s)=>{try{
  const{customer_name,mobile,address,city,state,pincode,payment_method='COD',items,total}=q.body||{};
  if(!customer_name||!mobile||!address||!city||!state||!pincode||!payment_method||!items||total===undefined)return s.status(400).json({error:'All order details are required'});
  const orderItems=typeof items==='string'?JSON.parse(items):items;
  if(!Array.isArray(orderItems)||!orderItems.length)return s.status(400).json({error:'Cart is empty'});

  const normalized=orderItems.map(item=>({
    id:Number(item.id),
    name:String(item.name||''),
    price:Number(item.price||0),
    quantity:Number(item.quantity||0),
    size:item.size||null
  }));
  if(normalized.some(item=>!Number.isInteger(item.id)||item.id<1||!Number.isInteger(item.quantity)||item.quantity<1))return s.status(400).json({error:'Invalid cart items'});

  const placeOrder=db.transaction(()=>{
    for(const item of normalized){
      const product=db.prepare('SELECT id,name,stock,sizes FROM products WHERE id=?').get(item.id);
      if(!product)throw new Error(`Product not found: ${item.id}`);
      if(product.stock<item.quantity)throw new Error(`Insufficient stock for ${product.name}. Available: ${product.stock}`);
      if(item.size){
        const sizes=product.sizes?JSON.parse(product.sizes):{};
        const available=Number(sizes[item.size]||0);
        if(available<item.quantity)throw new Error(`Insufficient stock for ${product.name} (${item.size}). Available: ${available}`);
        sizes[item.size]=available-item.quantity;
        db.prepare('UPDATE products SET stock=stock-?,sizes=? WHERE id=?').run(item.quantity,JSON.stringify(sizes),item.id);
      }else{
        db.prepare('UPDATE products SET stock=stock-? WHERE id=?').run(item.quantity,item.id);
      }
    }
    const r=db.prepare('INSERT INTO orders(customer_name,mobile,address,city,state,pincode,payment_method,items,total) VALUES(?,?,?,?,?,?,?,?,?)').run(customer_name,mobile,address,city,state,pincode,payment_method,JSON.stringify(normalized),Number(total));
    return r.lastInsertRowid;
  });

  const orderId=placeOrder();
  s.json({success:true,orderId});
}catch(e){s.status(400).json({error:e.message||'Order failed'})}});

app.put('/api/orders/:id/status',auth,(q,s)=>{const allowed=['Pending','Confirmed','Shipped','Delivered','Cancelled'];if(!allowed.includes(q.body.status))return s.status(400).json({error:'Invalid status'});const r=db.prepare('UPDATE orders SET status=? WHERE id=?').run(q.body.status,Number(q.params.id));if(!r.changes)return s.status(404).json({error:'Order not found'});s.json({success:true})});

app.listen(PORT,()=>console.log(`TrendCart Backend running on port ${PORT}`));