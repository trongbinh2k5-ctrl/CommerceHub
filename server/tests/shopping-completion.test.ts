import test from 'node:test';
import assert from 'node:assert/strict';
import {once} from 'node:events';
import {randomUUID} from 'node:crypto';
import mongoose from 'mongoose';
import jwt from 'jsonwebtoken';
import {MongoMemoryReplSet} from 'mongodb-memory-server';
import {createApp} from '../src/app';
import {User} from '../src/modules/auth/user.model';
import {Order,OrderStatus,PaymentMethod} from '../src/modules/orders/order.model';
import {Payment,PaymentStatus} from '../src/modules/payments/payment.model';
import {Product} from '../src/modules/products/product.model';
import {Cart} from '../src/modules/cart/cart.model';
import {Notification} from '../src/modules/operations/operations.models';
import {AuditEvent} from '../src/modules/operations/audit.service';
import {getDashboardOverview,getDashboardRevenue,getDashboardTopProducts} from '../src/modules/dashboard/dashboard.service';

test('shopping completion: refund accounting, order filters, reorder and notification isolation',{timeout:120000},async t=>{
 process.env.NODE_ENV='test';process.env.EMAIL_VERIFICATION_REQUIRED='false';process.env.GHN_ENABLED='false';process.env.SEPAY_ENABLED='false';process.env.JWT_ACCESS_SECRET='isolated-shopping-completion-jwt-key-32-bytes';
 const mongo=await MongoMemoryReplSet.create({replSet:{count:1}});let server:ReturnType<ReturnType<typeof createApp>['listen']>|undefined;
 try{
  await mongoose.connect(mongo.getUri('isolated_shopping_completion'));await Promise.all(Object.values(mongoose.models).map(m=>m.init()));
  const users=await User.create(['CUSTOMER','CUSTOMER','STAFF','ADMIN'].map((role,i)=>({role,fullName:'QA',email:`completion${i}@test.local`,passwordHash:'unused'})));
  const tokens=users.map(u=>jwt.sign({role:u.role},process.env.JWT_ACCESS_SECRET!,{subject:u.id}));
  server=createApp({apiRateLimit:10000}).listen(0,'127.0.0.1');await once(server,'listening');const base=`http://127.0.0.1:${(server.address() as {port:number}).port}/api`;
  const api=async(path:string,user=0,method='GET',body?:unknown,extra:Record<string,string>={})=>{const response=await fetch(base+path,{method,headers:{Authorization:'Bearer '+tokens[user],'Content-Type':'application/json',...extra},...(body===undefined?{}:{body:JSON.stringify(body)})});return {status:response.status,body:await response.json() as any};};
  let sequence=0;
  const fixture=async(owner=0,status=OrderStatus.CANCELLED,method=PaymentMethod.SEPAY,paid=true)=>{
   const product=await Product.create({name:'Completion device '+(++sequence),sku:'COMPLETE-'+sequence,price:10000,stock:10});
   const order=await Order.create({userId:users[owner]._id,items:[{productId:product._id,name:product.name,sku:product.sku,price:10000,quantity:2,subtotal:20000}],shippingAddress:{fullName:'QA',phone:'0901234567',province:'Hồ Chí Minh',ward:'Phường Sài Gòn',detail:'123 Đường QA'},status,paymentMethod:method,totalAmount:20000});
   const payment=await Payment.create({orderId:order._id,userId:users[owner]._id,method,amount:20000,status:paid?PaymentStatus.PAID:PaymentStatus.PENDING,paidAt:paid?new Date():null,...(paid&&status===OrderStatus.CANCELLED?{refundStatus:'REQUESTED',refundRequestedAt:new Date()}: {})});return {order,payment,product};
  };
  const f=await fixture();const endpoint='/admin/payments/orders/'+f.order.id+'/refund-complete';const proof={amount:20000,reference:'BANK-TRANSFER-001',confirmed:true};
  await t.test('only admin records refunds; proof and exact amount are required',async()=>{
   for(const role of [0,1,2])assert.equal((await api(endpoint,role,'POST',proof)).status,403);
   assert.equal((await api(endpoint,3,'POST',{...proof,confirmed:false})).status,400);
   assert.equal((await api(endpoint,3,'POST',{...proof,amount:1})).status,409);
   assert.equal((await Payment.findById(f.payment.id))!.refundStatus,'REQUESTED');
  });
  await t.test('refund confirmation preserves payment history and records one notification and audit',async()=>{
   assert.equal((await api(endpoint,3,'POST',proof)).status,200);
   const payment=await Payment.findById(f.payment.id);assert.equal(payment!.status,'PAID');assert.equal(payment!.refundStatus,'COMPLETED');assert.equal(payment!.refundAmount,20000);assert.ok(payment!.refundedAt);assert.equal(String(payment!.refundConfirmedBy),users[3].id);
   assert.equal(await Notification.countDocuments({dedupeKey:'refund:'+f.payment.id}),1);assert.equal(await AuditEvent.countDocuments({action:'REFUND_CONFIRMED'}),1);
   assert.equal((await api('/payments/orders/'+f.order.id,1)).status,404);
   const overview=await getDashboardOverview();assert.equal(overview.totalRevenue,0);assert.equal(overview.grossRevenue,20000);assert.equal(overview.refundedAmount,20000);
   const daily=await getDashboardRevenue({from:new Date('2020-01-01'),toExclusive:new Date('2100-01-01'),period:'day'});assert.equal(daily.data.reduce((n,r)=>n+r.revenue,0),0);
   assert.equal((await getDashboardTopProducts(10)).length,0);
  });
  await t.test('same refund acknowledgement replays; conflicting or reused references are rejected',async()=>{
   assert.equal((await api(endpoint,3,'POST',proof)).status,200);assert.equal(await AuditEvent.countDocuments({action:'REFUND_CONFIRMED'}),1);
   assert.equal((await api(endpoint,3,'POST',{...proof,reference:'OTHER-REFERENCE'})).status,409);
   const other=await fixture();assert.equal((await api('/admin/payments/orders/'+other.order.id+'/refund-complete',3,'POST',proof)).status,409);assert.equal((await Payment.findById(other.payment.id))!.refundStatus,'REQUESTED');
  });
  await t.test('active orders cannot be recorded as refunded',async()=>{
   const pending=await fixture(0,OrderStatus.CONFIRMED);assert.equal((await api('/admin/payments/orders/'+pending.order.id+'/refund-complete',3,'POST',{...proof,reference:'ACTIVE-REFUND'})).status,409);
  });
  await t.test('filters and product name or short order code searches stay within the customer account',async()=>{
   const unpaid=await fixture(0,OrderStatus.PENDING,PaymentMethod.SEPAY,false);const cod=await fixture(0,OrderStatus.PENDING,PaymentMethod.COD,false);const foreign=await fixture(1,OrderStatus.PENDING,PaymentMethod.COD,false);
   const a=await api('/orders?view=unpaid');assert.equal(a.status,200);assert.deepEqual(a.body.data.map((o:any)=>o._id),[unpaid.order.id]);
   const b=await api('/orders?view=pending');assert.ok(b.body.data.some((o:any)=>o._id===cod.order.id));assert.ok(!b.body.data.some((o:any)=>o._id===foreign.order.id));assert.ok(!b.body.data.some((o:any)=>o._id===unpaid.order.id));
   for(const text of [f.product.name,f.order.id.slice(-8)]){const found=await api('/orders?view=all&search='+encodeURIComponent(text));assert.equal(found.body.pagination.total,1);assert.equal(found.body.data[0]._id,f.order.id);}
   assert.equal((await api('/orders?view=invalid')).status,400);
  });
  await t.test('reorder uses current price, validates stock atomically, and replays without duplicates',async()=>{
   const key=randomUUID(),headers={'Idempotency-Key':key},url='/orders/'+f.order.id+'/reorder';
   assert.equal((await api(url,1,'POST',undefined,headers)).status,404);
   assert.equal((await api(url,0,'POST')).status,400);
   await Product.updateOne({_id:f.product._id},{$set:{price:12500}});
   assert.equal((await api(url,0,'POST',undefined,headers)).status,200);assert.equal((await api(url,0,'POST',undefined,headers)).status,200);
   const cart=await Cart.findOne({userId:users[0]._id});assert.equal(cart!.items.length,1);assert.equal(cart!.items[0].quantity,2);
   const publicCart=await api('/cart');assert.equal(publicCart.body.data.totalAmount,25000);
   const before=JSON.stringify(cart!.items);await Product.updateOne({_id:f.product._id},{$set:{stock:1}});
   assert.equal((await api(url,0,'POST',undefined,{'Idempotency-Key':randomUUID()})).status,409);assert.equal(JSON.stringify((await Cart.findById(cart!._id))!.items),before);
  });
  await t.test('reading one notification does not read someone else’s notification',async()=>{
   const notification=await Notification.findOne({dedupeKey:'refund:'+f.payment.id});const url='/notifications/'+notification!.id+'/read';
   assert.equal((await api(url,1,'PATCH')).status,404);assert.equal((await api(url,0,'PATCH')).status,200);const first=(await Notification.findById(notification!._id))!.readAt;
   assert.ok(first);assert.equal((await api(url,0,'PATCH')).status,200);assert.equal((await Notification.findById(notification!._id))!.readAt!.getTime(),first!.getTime());
  });
  const bank={bankName:'MB Bank',accountNumber:'123456789',accountHolder:'QA Customer'};let refund:Awaited<ReturnType<typeof fixture>>;
  await t.test('customer supplies private refund details; other customers and staff cannot read them',async()=>{
   refund=await fixture();const url='/payments/orders/'+refund.order.id+'/refund-details';
   assert.equal((await api(url,1)).status,404);assert.equal((await api(url,2)).status,403);
   assert.equal((await api(url,0,'PATCH',{...bank,accountNumber:'bad'})).status,400);assert.equal((await api(url,0,'PATCH',{...bank,pin:'000000'})).status,400);
   assert.equal((await api(url,1,'PATCH',bank)).status,404);
   const saved=await api(url,0,'PATCH',bank);assert.equal(saved.status,200);assert.equal(saved.body.data.recipient.accountHolder,'QA CUSTOMER');
   for(const [path,user] of [['/payments/orders/'+refund.order.id,0],['/admin/payments/orders/'+refund.order.id,2]] as const){const view=await api(path,user);assert.equal(view.status,200);assert.equal(view.body.data.refundRecipient,undefined);assert.ok(!JSON.stringify(view.body).includes(bank.accountNumber));}
   assert.equal((await api('/admin/payments/refunds',0)).status,403);assert.equal((await api('/admin/payments/refunds',2)).status,403);
   const queue=await api('/admin/payments/refunds',3);assert.equal(queue.status,200);assert.equal(queue.body.data.find((p:any)=>p.orderId===refund.order.id).refundRecipient.accountNumber,bank.accountNumber);
  });
  await t.test('admin acceptance locks the recipient; repeated acceptance does not duplicate notification',async()=>{
   const url='/admin/payments/orders/'+refund.order.id;const proof={amount:20000,reference:'BANK-PRIVATE-001',confirmed:true};
   assert.equal((await api(url+'/refund-complete',3,'POST',proof)).status,409);
   assert.equal((await api(url+'/refund-start',0,'POST')).status,403);assert.equal((await api(url+'/refund-start',2,'POST')).status,403);
   assert.equal((await api(url+'/refund-start',3,'POST')).status,200);assert.equal((await api(url+'/refund-start',3,'POST')).status,200);
   assert.equal(await Notification.countDocuments({dedupeKey:'refund-processing:'+refund.payment.id}),1);
   assert.equal((await Payment.findById(refund.payment.id))!.refundStatus,'PROCESSING');
   assert.equal((await api('/payments/orders/'+refund.order.id+'/refund-details',0,'PATCH',{...bank,accountNumber:'987654321'})).status,409);
   assert.equal((await api(url+'/refund-complete',3,'POST',proof)).status,200);assert.equal((await api(url+'/refund-complete',3,'POST',proof)).status,200);
   const completed=await Payment.findById(refund.payment.id);assert.equal(completed!.refundStatus,'COMPLETED');assert.equal(completed!.refundAmount,20000);assert.ok(completed!.refundProcessingAt);
   assert.equal(await Notification.countDocuments({dedupeKey:'refund:'+refund.payment.id}),1);
   const visible=await api('/payments/orders/'+refund.order.id);assert.equal(visible.body.data.refundReference,proof.reference);assert.equal(visible.body.data.refundStatus,'COMPLETED');
  });
  await t.test('refund queues filter accurately and invalid filters or missing recipients are rejected',async()=>{
   const empty=await fixture();assert.equal((await api('/admin/payments/orders/'+empty.order.id+'/refund-start',3,'POST')).status,409);
   const completed=await api('/admin/payments/refunds?status=COMPLETED',3);assert.ok(completed.body.data.every((p:any)=>p.refundStatus==='COMPLETED'));assert.ok(completed.body.data.some((p:any)=>p.orderId===refund.order.id));
   const pending=await api('/admin/payments/refunds',3);assert.ok(!pending.body.data.some((p:any)=>p.orderId===refund.order.id));
   assert.equal((await api('/admin/payments/refunds?status=bad',3)).status,400);assert.equal((await api('/admin/payments/refunds?page=0',3)).status,400);
  });
  await t.test('concurrent recipient edits and admin acceptance leave a stable recipient',async()=>{
   const fresh=await fixture();const url='/payments/orders/'+fresh.order.id+'/refund-details';assert.equal((await api(url,0,'PATCH',bank)).status,200);
   const results=await Promise.all([api(url,0,'PATCH',{...bank,accountNumber:'987654321'}),api('/admin/payments/orders/'+fresh.order.id+'/refund-start',3,'POST')]);
   assert.ok([200,409].includes(results[0].status));assert.equal(results[1].status,200);
   const p=await Payment.findById(fresh.payment.id).select('+refundRecipient');assert.equal(p!.refundStatus,'PROCESSING');assert.equal(p!.refundRecipient!.accountNumber,results[0].status===200?'987654321':bank.accountNumber);
   assert.equal((await api(url,0,'PATCH',bank)).status,409);
  });
 }finally{if(server)await new Promise<void>(resolve=>server!.close(()=>resolve()));await mongoose.disconnect();await mongo.stop();}
});
