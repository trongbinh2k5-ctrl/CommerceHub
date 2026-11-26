import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { mkdtemp, readdir, unlink, rmdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import mongoose from 'mongoose';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import { User } from '../src/modules/auth/user.model';
import { AccountChallenge } from '../src/modules/auth/account.models';
import { setTestMailTransport, type Mail } from '../src/modules/auth/mail.service';
import { Product } from '../src/modules/products/product.model';
import { Cart } from '../src/modules/cart/cart.model';
import { Address } from '../src/modules/addresses/address.model';
import { Coupon } from '../src/modules/coupons/coupon.model';
import { StoreSettings } from '../src/modules/store/store.model';
import { Order } from '../src/modules/orders/order.model';
import { Notification, StockMovement } from '../src/modules/operations/operations.models';

test('Customer account, catalog, checkout and after-sales workflows', {timeout:120000}, async t=>{
  process.env.NODE_ENV='test'; process.env.JWT_ACCESS_SECRET='isolated-completeness-secret';
  process.env.EMAIL_VERIFICATION_REQUIRED='false';
  const uploadDir=await mkdtemp(path.join(tmpdir(),'commerce-media-test-'));
  process.env.UPLOAD_DIRECTORY=uploadDir;
  const { default: app }=await import('../src/app');
  const mongo=await MongoMemoryReplSet.create({replSet:{count:1}});
  let server:ReturnType<typeof app.listen>|undefined;
  const mails:Mail[]=[];
  const challengeToken=()=>mails.at(-1)!.text.match(/token=([a-f0-9]{64})/)![1];
  try {
    await mongoose.connect(mongo.getUri('customer_completeness'));
    await Promise.all(Object.values(mongoose.models).map(m=>m.init()));
    const hash=await bcrypt.hash('InitialPass!2026',4);
    const [customer,other,staff,admin]=await User.create(['CUSTOMER','CUSTOMER','STAFF','ADMIN'].map((role,i)=>({fullName:role,email:`complete-${i}@test.local`,passwordHash:hash,role})));
    const bearer=(u:typeof customer)=>jwt.sign({role:u.role},process.env.JWT_ACCESS_SECRET!,{subject:u.id});
    const ct=bearer(customer),ot=bearer(other),st=bearer(staff),at=bearer(admin);
    server=app.listen(0,'127.0.0.1');await once(server,'listening');
    const base=`http://127.0.0.1:${(server.address() as {port:number}).port}/api`;
    const api=async(p:string,method='GET',body?:unknown,token?:string,extra:Record<string,string>={})=>{
      const res=await fetch(base+p,{method,headers:{'Content-Type':'application/json',...(token?{Authorization:`Bearer ${token}`} : {}),...extra},body:body===undefined?undefined:JSON.stringify(body)});
      return {status:res.status,body:await res.json() as any,cookie:res.headers.get('set-cookie')?.split(';')[0],headers:res.headers};
    };
    const login=()=>api('/auth/login','POST',{email:customer.email,password:'InitialPass!2026'});
    let access='',cookie='',orderId='',productId='';
    await t.test('mail unavailable is explicit; account verification gates login when enabled',async()=>{
      assert.equal((await api('/auth/options')).body.data.emailDeliveryAvailable,false);
      assert.equal((await api('/auth/forgot-password','POST',{email:customer.email})).status,503);
      const unverified=await login();assert.equal(unverified.status,200);
      process.env.EMAIL_VERIFICATION_REQUIRED='true';
      assert.equal((await api('/auth/me','GET',undefined,unverified.body.data.accessToken)).status,403);
      assert.equal((await api('/auth/refresh','POST',undefined,undefined,{Cookie:unverified.cookie!})).status,401);
      assert.equal((await login()).status,403);
      setTestMailTransport(async mail=>{mails.push(mail);});
      assert.equal((await api('/auth/resend-verification','POST',{email:customer.email})).status,202);
      const token=challengeToken();
      const stored=await AccountChallenge.findOne({userId:customer._id}).select('+tokenHash');
      assert.equal(stored!.tokenHash,createHash('sha256').update(token).digest('hex'));
      assert.equal((await api('/auth/verify-email','POST',{token})).status,200);
      assert.equal((await api('/auth/verify-email','POST',{token})).status,400);
      const r=await login();assert.equal(r.status,200);access=r.body.data.accessToken;cookie=r.cookie!;
      assert.match(r.headers.get('set-cookie')!,/HttpOnly/i);
      process.env.EMAIL_VERIFICATION_REQUIRED='false';
    });
    await t.test('refresh rotates cookies; old refresh cannot replay; foreign origin is rejected',async()=>{
      assert.equal((await api('/auth/refresh','POST',undefined,undefined,{Cookie:cookie,Origin:'https://evil.test'})).status,403);
      const r=await api('/auth/refresh','POST',undefined,undefined,{Cookie:cookie});assert.equal(r.status,200);
      assert.notEqual(r.cookie,cookie);
      assert.equal((await api('/auth/refresh','POST',undefined,undefined,{Cookie:cookie})).status,401);
      access=r.body.data.accessToken;cookie=r.cookie!;
      assert.equal((await api('/auth/me','GET',undefined,access)).body.data.emailVerified,true);
    });
    await t.test('profile update cannot inject role/email; sessions are private and can be revoked',async()=>{
      const r=await api('/auth/profile','PATCH',{fullName:'Updated Customer',phone:'0901234567',role:'ADMIN',email:'stolen@test.local'},access);
      assert.equal(r.status,200);assert.equal(r.body.data.role,'CUSTOMER');assert.equal(r.body.data.email,customer.email);
      assert.equal((await api('/auth/profile','PATCH',{fullName:'',phone:'abc'},access)).status,400);
      const own=(await api('/auth/sessions','GET',undefined,access)).body.data;
      assert.equal(own.length,1);assert.equal(own[0].current,true);assert.equal(own[0].tokenHash,undefined);
      assert.equal((await api('/auth/sessions','GET',undefined,ot)).body.data.length,0);
      await api('/auth/sessions/'+own[0]._id,'DELETE',undefined,ot);
      assert.equal((await api('/auth/me','GET',undefined,access)).status,200);
      await api('/auth/sessions/'+own[0]._id,'DELETE',undefined,access);
      assert.equal((await api('/auth/me','GET',undefined,access)).status,401);
      const next=await login();access=next.body.data.accessToken;cookie=next.cookie!;
    });
    await t.test('reset tokens expire, are single-use, and revoke all old access and refresh sessions',async()=>{
      await api('/auth/forgot-password','POST',{email:customer.email});const expired=challengeToken();
      await AccountChallenge.updateOne({userId:customer._id,purpose:'RESET_PASSWORD'},{$set:{expiresAt:new Date(Date.now()-1000)}});
      assert.equal((await api('/auth/reset-password','POST',{token:expired,password:'NewPass!2026'})).status,400);
      await api('/auth/forgot-password','POST',{email:customer.email});const token=challengeToken();
      const beforeReset=await User.findById(customer._id).select('+passwordHash');
      const rejected=await api('/auth/reset-password','POST',{token,password:'InitialPass!2026'});
      assert.equal(rejected.status,400);assert.match(rejected.body.message,/phải khác mật khẩu hiện tại/);
      const unchanged=await User.findById(customer._id).select('+passwordHash');
      assert.equal(unchanged!.passwordHash,beforeReset!.passwordHash);assert.equal(unchanged!.authVersion,beforeReset!.authVersion);
      assert.ok(await AccountChallenge.exists({userId:customer._id,purpose:'RESET_PASSWORD',tokenHash:createHash('sha256').update(token).digest('hex')}));
      assert.equal((await api('/auth/me','GET',undefined,access)).status,200);
      assert.equal((await api('/auth/reset-password','POST',{token,password:'NewPass!2026'})).status,200);
      assert.equal((await api('/auth/reset-password','POST',{token,password:'AnotherPass!2026'})).status,400);
      assert.equal((await api('/auth/me','GET',undefined,access)).status,401);
      assert.equal((await api('/auth/refresh','POST',undefined,undefined,{Cookie:cookie})).status,401);
      assert.equal((await login()).status,401);
      const fresh=await api('/auth/login','POST',{email:customer.email,password:'NewPass!2026'});access=fresh.body.data.accessToken;
      assert.equal(fresh.status,200);
    });
    await t.test('password/email changes require current password; email changes only after confirmation',async()=>{
      assert.equal((await api('/auth/change-password','POST',{currentPassword:'wrong',password:'AgainPass!2026'},access)).status,400);
      assert.equal((await api('/auth/email-change','POST',{password:'wrong',email:'new@test.local'},access)).status,400);
      assert.equal((await api('/auth/email-change','POST',{password:'NewPass!2026',email:'new@test.local'},access)).status,202);
      assert.equal((await User.findById(customer._id))!.email,customer.email);
      assert.equal(mails.at(-1)!.to,'new@test.local');
      assert.equal((await api('/auth/verify-email','POST',{token:challengeToken()})).status,200);
      assert.equal((await api('/auth/me','GET',undefined,access)).status,401);
      assert.equal((await User.findById(customer._id))!.email,'new@test.local');
    });
    await t.test('product information, real variants, filters and malicious gallery input',async()=>{
      const r=await api('/products','POST',{name:'QA laptop',sku:'COMPLETE-1',price:100000,stock:5,brand:'QA Brand',modelName:'Exact SKU',variantGroup:'QA-LAPTOP',variantLabel:'16 GB',specifications:[{label:'RAM',value:'16 GB'}],gallery:['/images/hero-headphones.png']},st);
      assert.equal(r.status,201);productId=r.body.data._id;
      assert.equal((await api('/products/'+productId)).body.data.specifications[0].value,'16 GB');
      assert.equal((await api('/products/'+productId,'PATCH',{gallery:['javascript:alert(1)']},st)).status,400);
      assert.equal((await api('/products?brand=QA%20Brand&inStock=true')).body.data.length,1);
      assert.equal((await api('/products?inStock=oops')).status,400);
      assert.equal((await api('/products/'+productId+'/options')).body.data.length,1);
      assert.equal((await api('/products/facets')).body.data.brands.includes('QA Brand'),true);
    });
    await t.test('settings are admin-only and unknown policy content stays blank',async()=>{
      assert.equal((await api('/store')).body.data.warranty,'');
      assert.equal((await api('/admin/settings','PATCH',{shippingFee:100},st)).status,403);
      assert.equal((await api('/admin/settings','PATCH',{shippingConfigured:true,shippingFee:20000,freeShippingThreshold:150000,returns:'Actual policy for tests'},at)).status,200);
      assert.equal((await api('/admin/settings','PATCH',{shippingFee:-1},at)).status,400);
      assert.equal((await api('/store')).body.data.returns,'Actual policy for tests');
    });
    // Use a separate customer with a legacy version-0 test JWT for commerce scenarios.
    const buyer=other,bt=ot;
    const address=await Address.create({userId:buyer._id,fullName:'Buyer',phone:'0901234567',province:'Hồ Chí Minh',ward: 'Phường Sài Gòn',detail:'1 QA street'});
    const coupon=await Coupon.create({code:'COMPLETE10',type:'PERCENT',value:10,minSubtotal:0,maxUses:5,startsAt:new Date(Date.now()-1000),expiresAt:new Date(Date.now()+86400000)});
    await Cart.create({userId:buyer._id,items:[{productId,quantity:1}]});
    await t.test('quotes do not reserve stock/coupons; stale totals roll back; order records shipping',async()=>{
      const quote=(await api('/orders/quote','POST',{couponCode:coupon.code},bt)).body.data;
      assert.equal(quote.subtotal,100000);assert.equal(quote.discountAmount,10000);assert.equal(quote.shippingFee,20000);assert.equal(quote.totalAmount,110000);
      assert.equal((await Coupon.findById(coupon._id))!.usedCount,0);assert.equal((await Product.findById(productId))!.stock,5);
      const input={addressId:address.id,couponCode:coupon.code,expectedTotal:1};
      assert.equal((await api('/orders','POST',input,bt,{'Idempotency-Key':'complete-stale-key-0001'})).status,409);
      assert.equal((await Order.countDocuments()),0);assert.equal((await Coupon.findById(coupon._id))!.usedCount,0);
      assert.equal((await Product.findById(productId))!.stock,5);assert.equal(await StockMovement.countDocuments(),0);
      const created=await api('/orders','POST',{...input,expectedTotal:110000},bt,{'Idempotency-Key':'complete-fresh-key-0001'});
      assert.equal(created.status,201);assert.equal(created.body.data.shippingFee,20000);orderId=created.body.data._id;
      assert.equal((await StockMovement.findOne({orderId}))!.delta,-1);
      assert.equal((await api('/orders/quote','POST',{},bt)).status,409);
    });
    await t.test('support requires an owned delivered purchase and prevents duplicate open requests',async()=>{
      const input={orderId,productId,type:'WARRANTY',quantity:1,reason:'Test device requires checking'};
      assert.equal((await api('/support','POST',input,bt)).status,409);
      await Order.updateOne({_id:orderId},{$set:{status:'DELIVERED'}});
      assert.equal((await api('/support','POST',input,ct)).status,401); // reset invalidated legacy JWT version 0
      const outsider=await User.create({fullName:'Outsider',email:'outsider@test.local',passwordHash:hash});
      assert.equal((await api('/support','POST',input,bearer(outsider))).status,409);
      const r=await api('/support','POST',input,bt);assert.equal(r.status,201);
      assert.equal((await api('/support','POST',input,bt)).status,409);
      const id=r.body.data._id;
      assert.equal((await api('/admin/support/'+id,'PATCH',{status:'RESOLVED',response:'skip approval'},st)).status,409);
      assert.equal((await api('/admin/support/'+id,'PATCH',{status:'APPROVED',response:'Please send the product for inspection.'},bt)).status,403);
      assert.equal((await api('/admin/support/'+id,'PATCH',{status:'APPROVED',response:'Please send the product for inspection.'},st)).status,200);
      const notifications=await api('/notifications','GET',undefined,bt);assert.ok(notifications.body.unread>=2);
      assert.ok(notifications.body.data.some((n:any)=>n.title==='Cập nhật yêu cầu sau mua'));
      assert.equal((await api('/notifications','GET',undefined,bearer(outsider))).body.data.length,0);
      await api('/notifications/read','PATCH',undefined,bt);
      assert.equal((await api('/notifications','GET',undefined,bt)).body.unread,0);
      assert.equal(await Notification.countDocuments({userId:outsider._id}),0);
    });
    await t.test('order and payment pagination validates filters and never leaks another customer order',async()=>{
      const orders=await api('/orders?page=1&limit=1','GET',undefined,bt);
      assert.equal(orders.body.pagination.total,1);assert.equal(orders.body.data[0]._id,orderId);
      const outsider=await User.findOne({email:'outsider@test.local'});
      assert.equal((await api('/orders?page=1&limit=1','GET',undefined,bearer(outsider!))).body.pagination.total,0);
      assert.equal((await api('/admin/orders?search='+orderId+'&limit=1','GET',undefined,at)).body.pagination.total,1);
      assert.equal((await api('/admin/payments?search='+orderId+'&limit=1','GET',undefined,st)).body.pagination.total,1);
      assert.equal((await api('/admin/orders?status=oops','GET',undefined,at)).status,400);
      assert.equal((await api('/admin/payments?page=9007199254740991&limit=100','GET',undefined,st)).status,400);
    });
    await t.test('admin user changes cannot grant ADMIN, edit self or expose password hashes',async()=>{
      assert.equal((await api('/admin/users','GET',undefined,st)).status,403);
      assert.equal((await api('/admin/users/'+other.id,'PATCH',{role:'ADMIN'},at)).status,400);
      assert.equal((await api('/admin/users/'+admin.id,'PATCH',{isActive:false},at)).status,409);
      const users=await api('/admin/users','GET',undefined,at);assert.equal(users.body.data[0].passwordHash,undefined);
      assert.equal((await api('/admin/users/'+other.id,'PATCH',{isActive:false},at)).status,200);
      assert.equal((await api('/orders','GET',undefined,bt)).status,401);
    });
    await t.test('upload rejects scripts, wrong signatures and customer permissions, serves uploaded images',async()=>{
      const bytes=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aZ1UAAAAASUVORK5CYII=','base64');
      const upload=(body:Buffer,token:string)=>fetch(base+'/admin/media',{method:'POST',headers:{Authorization:`Bearer ${token}`,'Content-Type':'image/png'},body});
      assert.equal((await upload(Buffer.from('<script>bad</script>'),st)).status,400);
      assert.equal((await upload(bytes,bt)).status,401);
      const r=await upload(bytes,st);assert.equal(r.status,201);const payload=await r.json() as any;
      const image=await fetch(base.replace(/\/api$/,'')+payload.data.url);assert.equal(image.status,200);assert.match(image.headers.get('content-type')!,/image\/png/);
      assert.equal(Buffer.compare(Buffer.from(await image.arrayBuffer()),bytes),0);
    });
    await t.test('delivery failure while registering does not claim mail was sent or lose created account',async()=>{
      process.env.EMAIL_VERIFICATION_REQUIRED='true';setTestMailTransport(async()=>{throw new Error('transport unavailable');});
      const r=await api('/auth/register','POST',{fullName:'Registration delivery failure',email:'delivery@test.local',password:'InitialPass!2026'});
      assert.equal(r.status,201);assert.equal(r.body.data.emailSent,false);assert.ok(await User.exists({email:'delivery@test.local'}));
      assert.equal((await api('/auth/login','POST',{email:'delivery@test.local',password:'InitialPass!2026'})).status,403);
    });
  } finally {
    setTestMailTransport(undefined);process.env.EMAIL_VERIFICATION_REQUIRED='false';
    if(server) await new Promise<void>((resolve,reject)=>server!.close(e=>e?reject(e):resolve()));
    await mongoose.disconnect();await mongo.stop();
    for(const name of await readdir(uploadDir)) await unlink(path.join(uploadDir,name));await rmdir(uploadDir);
  }
});
