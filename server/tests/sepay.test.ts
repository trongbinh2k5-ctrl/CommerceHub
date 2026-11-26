import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createHmac } from 'node:crypto';
import mongoose from 'mongoose';
import jwt from 'jsonwebtoken';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import { createApp } from '../src/app';
import { User } from '../src/modules/auth/user.model';
import { Product } from '../src/modules/products/product.model';
import { Cart } from '../src/modules/cart/cart.model';
import { Address } from '../src/modules/addresses/address.model';
import { Order } from '../src/modules/orders/order.model';
import { Payment } from '../src/modules/payments/payment.model';
import { Notification } from '../src/modules/operations/operations.models';
import { SepayAttempt } from '../src/modules/payments/sepay.model';
import { authenticateSepayIpn,sepayAmount,sepayConfig,sepayForm,sepayReturnIsPublic } from '../src/modules/payments/sepay.config';

test('SePay strict amounts reject decimals and unsafe values; IPN secrets compare exactly',()=>{
  for(const value of ['10000','10000.00',10000])assert.equal(sepayAmount(value),10000);
  for(const value of ['10000.01','1e4','-1',NaN,Infinity,9007199254740992,{},'10000.000'])assert.equal(sepayAmount(value),null);
  assert.equal(authenticateSepayIpn('test','test'),true);assert.equal(authenticateSepayIpn('TEST','test'),false);assert.equal(authenticateSepayIpn(undefined,'test'),false);
});

test('local callbacks are omitted instead of sending a private return URL to SePay',()=>{
  const config={merchantId:'TEST',secretKey:'fake-test-key',ipnSecret:'fake-ipn-secret',returnUrl:'http://127.0.0.1:5173/payments/sepay/return'};
  for(const host of ['localhost','127.0.0.1','192.168.1.5','10.0.0.2','172.16.0.1','[::1]'])assert.equal(sepayReturnIsPublic(`http://${host}/return`),false);
  assert.equal(sepayReturnIsPublic('https://berylcore-demo.example/return'),true);
  const form=sepayForm(config,'test-invoice',10000);
  assert.equal(form.returnMode,'manual');
  for(const key of ['success_url','error_url','cancel_url'])assert.equal(form.fields[key],undefined);
  const expected='order_amount=10000,merchant=TEST,currency=VND,operation=PURCHASE,order_description=Thanh toan BerylCore test-invoice,order_invoice_number=test-invoice,payment_method=BANK_TRANSFER';
  assert.equal(form.fields.signature,createHmac('sha256',config.secretKey).update(expected).digest('base64'));
});

test('SePay sandbox isolated checkout, IPN, query, cancellation and shipping',{timeout:180000},async t=>{
  process.env.NODE_ENV='test';process.env.EMAIL_VERIFICATION_REQUIRED='false';
  process.env.JWT_ACCESS_SECRET='isolated-sepay-test-jwt-at-least-32-bytes';
  process.env.SEPAY_ENABLED='true';process.env.SEPAY_MERCHANT_ID='TESTMERCHANT';process.env.SEPAY_SECRET_KEY='spsk_test_isolated_fake_merchant_secret';process.env.SEPAY_IPN_SECRET='isolated-fake-ipn-secret-32-bytes-long';process.env.SEPAY_RETURN_URL='https://berylcore-demo.example/payments/sepay/return';
  const mongo=await MongoMemoryReplSet.create({replSet:{count:1}});
  let server:ReturnType<ReturnType<typeof createApp>['listen']>|undefined;
  try{
    await mongoose.connect(mongo.getUri('isolated_sepay'));await Promise.all(Object.values(mongoose.models).map(m=>m.init()));
    const users=await User.create(['CUSTOMER','CUSTOMER','ADMIN'].map((role,i)=>({fullName:'SePay test',email:`sep-${i}@test.local`,passwordHash:'unused',role})));
    const tokens=users.map(u=>jwt.sign({role:u.role},process.env.JWT_ACCESS_SECRET!,{subject:u.id}));
    const address=await Address.create({userId:users[0]._id,fullName:'Test',phone:'0901234567',province:'Hồ Chí Minh',ward: 'Phường Sài Gòn',detail:'123 Test'});
    const product=await Product.create({name:'Keyboard',sku:'SEPAY-TEST',price:10000,stock:100});
    server=createApp().listen(0,'127.0.0.1');await once(server,'listening');
    const base=`http://127.0.0.1:${(server.address() as {port:number}).port}/api`,httpFetch=fetch;
    const api=async(path:string,user=0,method='GET',body?:unknown,key?:string)=>{
      const res=await httpFetch(base+path,{method,headers:{Authorization:`Bearer ${tokens[user]}`,'Content-Type':'application/json',...(key?{'Idempotency-Key':key}:{})},...(body?{body:JSON.stringify(body)}:{})});
      return {status:res.status,body:await res.json() as any};
    };
    let sequence=0;
    const checkout=async()=>{await Cart.findOneAndUpdate({userId:users[0]._id},{$set:{items:[{productId:product._id,quantity:1}]},$inc:{__v:1}},{upsert:true});return api('/orders',0,'POST',{addressId:address.id,paymentMethod:'SEPAY'},'sepay-checkout-key-'+(++sequence));};
    const start=async()=>{const order=(await checkout()).body.data;const result=await api(`/payments/sepay/orders/${order._id}`,0,'POST');assert.equal(result.status,200);return {order,ref:result.body.data.fields.order_invoice_number,form:result.body.data};};
    const payload=(ref:string,extra:Record<string,unknown>={})=>({timestamp:Math.floor(Date.now()/1000),notification_type:'ORDER_PAID',order:{order_id:'SEPAY-'+ref,order_invoice_number:ref,order_status:'CAPTURED',order_amount:'10000.00',order_currency:'VND'},transaction:{id:'TX-'+ref,transaction_id:'BANK-'+ref,transaction_type:'PAYMENT',payment_method:'BANK_TRANSFER',transaction_status:'APPROVED',transaction_amount:'10000',transaction_currency:'VND'},...extra});
    const ipn=async(body:unknown,secret:string|undefined=process.env.SEPAY_IPN_SECRET)=>{const response=await httpFetch(base+'/payments/sepay/ipn',{method:'POST',headers:{'Content-Type':'application/json',...(secret?{'X-Secret-Key':secret}:{})},body:JSON.stringify(body)});return {status:response.status,body:await response.json() as any};};
    let current:Awaited<ReturnType<typeof start>>;
    await t.test('disabled/missing IPN config cannot create an online order',async()=>{
      const count=await Order.countDocuments();const secret=process.env.SEPAY_IPN_SECRET;delete process.env.SEPAY_IPN_SECRET;
      assert.equal((await checkout()).status,503);assert.equal(await Order.countDocuments(),count);process.env.SEPAY_IPN_SECRET=secret;
      const saved=process.env.SEPAY_SECRET_KEY;process.env.SEPAY_SECRET_KEY='spsk_live_forbidden';assert.equal(sepayConfig(),null);process.env.SEPAY_SECRET_KEY=saved;
    });
    await t.test('SDK signs sandbox POST fields in the documented field order',async()=>{
      current=await start();const f=current.form.fields;
      assert.equal(current.form.action,'https://pay-sandbox.sepay.vn/v1/checkout/init');assert.equal(f.order_amount,'10000');assert.equal(f.payment_method,'BANK_TRANSFER');
      const fields=['order_amount','merchant','currency','operation','order_description','order_invoice_number','payment_method','success_url','error_url','cancel_url'];
      assert.deepEqual(Object.keys(f),[...fields,'signature']);
      assert.equal(f.signature,createHmac('sha256',process.env.SEPAY_SECRET_KEY!).update(fields.map(k=>`${k}=${f[k]}`).join(',')).digest('base64'));
      assert.equal(new URL(f.success_url).searchParams.get('ref'),current.ref);
      assert.ok(!JSON.stringify(f).includes(process.env.SEPAY_SECRET_KEY!));assert.ok(!JSON.stringify(f).includes(process.env.SEPAY_IPN_SECRET!));
      const built=sepayForm(sepayConfig()!,current.ref,10000);assert.equal(built.fields.signature,f.signature);
    });
    await t.test('repeated checkout key cannot change SEPAY to COD; active attempts reuse invoice',async()=>{
      assert.equal((await api('/orders',0,'POST',{addressId:address.id,paymentMethod:'COD'},'sepay-checkout-key-'+sequence)).status,409);
      const again=await api(`/payments/sepay/orders/${current.order._id}`,0,'POST',{amount:1});assert.equal(again.body.data.fields.order_invoice_number,current.ref);
      assert.equal(await SepayAttempt.countDocuments({orderId:current.order._id}),1);
    });
    await t.test('owner checks cover checkout, return, query and cancel; unpaid confirm is blocked',async()=>{
      for(const suffix of ['','/reconcile','/cancel'])assert.ok([404,409].includes((await api(`/payments/sepay/orders/${current.order._id}${suffix}`,1,'POST')).status));
      assert.equal((await api('/payments/sepay/result?ref='+current.ref,1)).status,404);
      assert.equal((await api(`/admin/orders/${current.order._id}/status`,2,'PATCH',{status:'CONFIRMED'})).status,409);
      assert.equal((await api(`/orders/${current.order._id}/cancel`,0,'PATCH')).status,409);
    });
    await t.test('public callback bridge returns to the stored local origin without sharing a session or changing payment',async()=>{
      const started=await api(`/payments/sepay/orders/${current.order._id}`,0,'POST',{returnOrigin:'http://127.0.0.1:4173'});
      assert.equal(started.status,200);
      const callback=new URL(started.body.data.fields.success_url);
      assert.equal(callback.origin,'https://berylcore-demo.example');assert.equal(callback.pathname,'/api/payments/sepay/return');
      const response=await httpFetch(base+'/payments/sepay/return?'+callback.searchParams+'&returnOrigin=https://evil.example',{redirect:'manual'});
      assert.equal(response.status,303);
      assert.equal(response.headers.get('location'),`http://127.0.0.1:4173/payments/sepay/return?ref=${current.ref}&outcome=success`);
      assert.equal(response.headers.get('set-cookie'),null);
      assert.equal((await Payment.findOne({orderId:current.order._id}))!.status,'PENDING');
      assert.equal((await api(`/payments/sepay/orders/${current.order._id}`,0,'POST',{returnOrigin:'https://evil.example'})).status,400);
      assert.equal((await api(`/payments/sepay/orders/${current.order._id}`,0,'POST',{returnOrigin:'http://127.0.0.1:4173@evil.example'})).status,400);
      assert.equal((await SepayAttempt.findOne({ref:current.ref}))!.returnOrigin,'http://127.0.0.1:4173');
    });
    await t.test('browser success/error/cancel cannot mutate payment or release lock',async()=>{
      const result=await api('/payments/sepay/result?ref='+current.ref+'&outcome=success');assert.equal(result.body.data.paymentStatus,'PENDING');
      assert.equal((await Payment.findOne({orderId:current.order._id}))!.activeSepayRef,current.ref);
    });
    await t.test('authenticated ORDER_PAID can confirm an unpaid sandbox order',async()=>{
      assert.equal((await ipn(payload(current.ref))).status,200);
    });
    // Use a separate unpaid order for the negative callback and concurrency cases.
    await t.test('IPN authentication and amount checks do not mutate an unpaid order',async()=>{
      current=await start();const body=payload(current.ref);
      assert.equal((await ipn(body,'')).status,401);assert.equal((await ipn(body,'wrong')).status,401);
      assert.equal((await ipn({...body,order:{...body.order,order_amount:'1'}})).status,400);
      assert.equal((await ipn({...body,transaction:{...body.transaction,transaction_amount:'10000.01'}})).status,400);
      assert.equal((await ipn({...body,order:{...body.order,order_currency:'USD'}})).status,409);
      assert.equal((await ipn({...body,notification_type:'TRANSACTION_VOID'})).status,409);
      assert.equal((await Payment.findOne({orderId:current.order._id}))!.status,'PENDING');
    });
    await t.test('duplicate concurrent IPN commits one payment and one notification without another stock deduction',async()=>{
      const stock=(await Product.findById(product.id))!.stock;
      const responses=await Promise.all([ipn(payload(current.ref)),ipn(payload(current.ref))]);assert.ok(responses.every(r=>r.status===200));
      const payment=await Payment.findOne({orderId:current.order._id});assert.equal(payment!.status,'PAID');assert.equal(payment!.activeSepayRef,null);
      assert.equal(await Notification.countDocuments({dedupeKey:`payment:${payment!.id}:PAID`}),1);assert.equal((await Product.findById(product.id))!.stock,stock);
      const p=payload(current.ref);assert.equal((await ipn({...p,transaction:{...p.transaction,id:'conflicting-id'}})).status,409);
    });
    await t.test('paid SEPAY order ships while COD collection is prohibited',async()=>{
      const id=current.order._id;assert.equal((await api(`/admin/orders/${id}/status`,2,'PATCH',{status:'CONFIRMED'})).status,200);
      const shipment=await api('/admin/shipping',2,'POST',{orderId:id,carrier:'Test',trackingCode:'SEPAY-SHIP-001',carrierFee:0});assert.equal(shipment.status,201);
      for(const status of ['PICKED_UP','IN_TRANSIT','OUT_FOR_DELIVERY','DELIVERED'])assert.equal((await api(`/admin/shipping/${shipment.body.shipment._id}/status`,2,'PATCH',{status})).status,200);
      assert.equal((await api(`/admin/payments/orders/${id}/confirm`,2,'PATCH')).status,409);assert.equal((await Payment.findOne({orderId:id}))!.status,'PAID');
    });
    await t.test('query uses sandbox Basic Auth and validates invoice/amount before updating',async()=>{
      current=await start();const p=payload(current.ref);let wrong=true;
      globalThis.fetch=async(input,init)=>{
        assert.equal(String(input),'https://pgapi-sandbox.sepay.vn/v1/order/detail/'+current.ref);assert.equal(init!.redirect,'error');
        assert.equal((init!.headers as Record<string,string>).Authorization,'Basic '+Buffer.from(`${process.env.SEPAY_MERCHANT_ID}:${process.env.SEPAY_SECRET_KEY}`).toString('base64'));
        return new Response(JSON.stringify({data:{...p.order,order_amount:wrong?'9999.00':'10000.00',transactions:[p.transaction]}}));
      };
      try{assert.equal((await api(`/payments/sepay/orders/${current.order._id}/reconcile`,0,'POST')).status,502);assert.equal((await Payment.findOne({orderId:current.order._id}))!.status,'PENDING');wrong=false;assert.equal((await api(`/payments/sepay/orders/${current.order._id}/reconcile`,0,'POST')).status,200);assert.equal((await Payment.findOne({orderId:current.order._id}))!.status,'PAID');}
      finally{globalThis.fetch=httpFetch;}
    });
    await t.test('network errors cannot unlock a pending payment',async()=>{
      current=await start();globalThis.fetch=async()=>{throw new Error('test timeout');};
      try{assert.equal((await api(`/payments/sepay/orders/${current.order._id}/cancel`,0,'POST')).status,502);assert.equal((await Payment.findOne({orderId:current.order._id}))!.activeSepayRef,current.ref);}
      finally{globalThis.fetch=httpFetch;}
    });
    await t.test('verified gateway cancellation permits retry and then order cancellation with stock restore',async()=>{
      const p=payload(current.ref);let calls=0;
      globalThis.fetch=async(input,init)=>{calls++;if(init!.method==='POST'){assert.equal(String(input),'https://pgapi-sandbox.sepay.vn/v1/order/cancel');assert.equal(JSON.parse(init!.body as string).order_invoice_number,current.ref);return new Response('{}');}return new Response(JSON.stringify({data:{...p.order,order_status:'CANCELLED',transactions:[]}}));};
      try{assert.equal((await api(`/payments/sepay/orders/${current.order._id}/cancel`,0,'POST')).status,200);assert.equal(calls,2);assert.equal((await SepayAttempt.findOne({ref:current.ref}))!.status,'CANCELLED');}
      finally{globalThis.fetch=httpFetch;}
      const stock=(await Product.findById(product.id))!.stock;assert.equal((await api(`/orders/${current.order._id}/cancel`,0,'PATCH')).status,200);assert.equal((await Product.findById(product.id))!.stock,stock+1);
      assert.equal((await ipn(p)).status,409);
    });
  }finally{if(server)await new Promise<void>(resolve=>server!.close(()=>resolve()));await mongoose.disconnect();await mongo.stop();}
});
