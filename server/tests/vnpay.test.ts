import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createHmac } from 'node:crypto';
import mongoose from 'mongoose';
import jwt from 'jsonwebtoken';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import { createApp } from '../src/app';
import { User } from '../src/modules/auth/user.model';
import { Address } from '../src/modules/addresses/address.model';
import { Product } from '../src/modules/products/product.model';
import { Cart } from '../src/modules/cart/cart.model';
import { Order } from '../src/modules/orders/order.model';
import { Payment } from '../src/modules/payments/payment.model';
import { VnpayAttempt } from '../src/modules/payments/vnpay.model';
import { Notification } from '../src/modules/operations/operations.models';
import { canonicalVnpay, signVnpay, verifyVnpay, vnpayDate } from '../src/modules/payments/vnpay.config';

test('VNPAY canonical signature encodes spaces, sorts keys and rejects ambiguity',()=>{
  assert.equal(canonicalVnpay({vnp_Z:'a b+c',vnp_A:'1'}),'vnp_A=1&vnp_Z=a+b%2Bc');
  const p={vnp_Amount:'1000000',vnp_OrderInfo:'Thanh toan don hang'};
  const hash=createHmac('sha512','test').update('vnp_Amount=1000000&vnp_OrderInfo=Thanh+toan+don+hang').digest('hex');
  assert.equal(signVnpay(p,'test'),hash);
  assert.deepEqual(verifyVnpay({...p,vnp_SecureHash:hash},'test'),p);
  assert.equal(verifyVnpay({...p,vnp_Amount:['1000000','1'],vnp_SecureHash:hash},'test'),null);
  assert.equal(verifyVnpay({...p,vnp_Amount:'1',vnp_SecureHash:hash},'test'),null);
  assert.equal(vnpayDate(new Date('2026-11-17T18:00:00Z')),'20261118010000');
});

test('VNPAY sandbox: isolated checkout, callback and reconciliation security',{timeout:180000},async t=>{
  process.env.NODE_ENV='test';process.env.EMAIL_VERIFICATION_REQUIRED='false';
  process.env.JWT_ACCESS_SECRET='isolated-vnpay-jwt-secret-at-least-32-bytes';
  process.env.VNPAY_ENABLED='true';process.env.VNPAY_TMN_CODE='TESTCODE';process.env.VNPAY_HASH_SECRET='fake-test-only-secret';process.env.VNPAY_RETURN_URL='http://127.0.0.1:5173/payments/vnpay/return';
  const mongo=await MongoMemoryReplSet.create({replSet:{count:1}});
  let server:ReturnType<ReturnType<typeof createApp>['listen']>|undefined;
  try{
    await mongoose.connect(mongo.getUri('isolated_vnpay'));
    await Promise.all(Object.values(mongoose.models).map(m=>m.init()));
    const users=await User.create(['CUSTOMER','CUSTOMER','ADMIN'].map((role,i)=>({fullName:'Vnpay test',email:`vnp-${i}@test.local`,passwordHash:'unused',role})));
    const tokens=users.map(u=>jwt.sign({role:u.role},process.env.JWT_ACCESS_SECRET!,{subject:u.id}));
    const address=await Address.create({userId:users[0]._id,fullName:'Test',phone:'0901234567',province:'Hồ Chí Minh',ward: 'Phường Sài Gòn',detail:'Test address'});
    const product=await Product.create({name:'Keyboard',sku:'VNP-TEST',price:10000,stock:30});
    server=createApp().listen(0,'127.0.0.1');await once(server,'listening');
    const base=`http://127.0.0.1:${(server.address() as {port:number}).port}/api`;
    const httpFetch=fetch;
    const api=async(path:string,user=0,method='GET',body?:unknown,key?:string)=>{
      const res=await httpFetch(base+path,{method,headers:{Authorization:`Bearer ${tokens[user]}`,'Content-Type':'application/json',...(key?{'Idempotency-Key':key}:{})},body:body===undefined?undefined:JSON.stringify(body)});
      return {status:res.status,body:await res.json() as any};
    };
    let sequence=0;
    const checkout=async(method='VNPAY')=>{
      await Cart.findOneAndUpdate({userId:users[0]._id},{$set:{items:[{productId:product._id,quantity:1}]},$inc:{__v:1}},{upsert:true});
      return api('/orders',0,'POST',{addressId:address.id,paymentMethod:method},'vnpay-checkout-key-'+(++sequence));
    };
    const signed=(p:Record<string,string>)=>({...p,vnp_SecureHash:signVnpay(p,process.env.VNPAY_HASH_SECRET!)});
    const ipn=(p:Record<string,string>)=>api('/payments/vnpay/ipn?'+new URLSearchParams(p));
    let orderId='',ref='',callback:Record<string,string>={};
    await t.test('disabled configuration rejects online orders without writes',async()=>{
      process.env.VNPAY_ENABLED='false';const before=await Order.countDocuments();
      assert.equal((await checkout()).status,503);assert.equal(await Order.countDocuments(),before);
      process.env.VNPAY_ENABLED='true';
    });
    await t.test('checkout stores VNPAY and hashes method in idempotency request',async()=>{
      const res=await checkout();assert.equal(res.status,201);orderId=res.body.data._id;
      assert.equal(res.body.data.paymentMethod,'VNPAY');assert.equal((await Payment.findOne({orderId}))!.amount,10000);
      assert.equal((await api('/orders',0,'POST',{addressId:address.id,paymentMethod:'COD'},'vnpay-checkout-key-'+sequence)).status,409);
    });
    await t.test('unpaid online order cannot be confirmed and another customer cannot pay',async()=>{
      assert.equal((await api(`/admin/orders/${orderId}/status`,2,'PATCH',{status:'CONFIRMED'})).status,409);
      assert.equal((await api(`/payments/vnpay/orders/${orderId}`,1,'POST')).status,409);
    });
    await t.test('creates signed URL using server amount and reuses active attempt',async()=>{
      const res=await api(`/payments/vnpay/orders/${orderId}`,0,'POST',{amount:1});assert.equal(res.status,200);
      const url=new URL(res.body.data.url);const p=Object.fromEntries(url.searchParams);
      assert.equal(url.origin,'https://sandbox.vnpayment.vn');assert.equal(p.vnp_Amount,'1000000');assert.ok(verifyVnpay(p,process.env.VNPAY_HASH_SECRET!));
      ref=p.vnp_TxnRef;
      assert.equal((await api(`/payments/vnpay/orders/${orderId}`,0,'POST')).body.data.url,res.body.data.url);
      assert.equal(await VnpayAttempt.countDocuments({orderId}),1);
      callback={vnp_TmnCode:'TESTCODE',vnp_TxnRef:ref,vnp_Amount:'1000000',vnp_ResponseCode:'00',vnp_TransactionStatus:'00',vnp_TransactionNo:'12345678'};
    });
    await t.test('return lookup is private and cannot mark payment paid',async()=>{
      assert.equal((await api('/payments/vnpay/result?ref='+ref,1)).status,404);
      const res=await api('/payments/vnpay/result?ref='+ref+'&vnp_ResponseCode=00');assert.equal(res.body.data.paymentStatus,'PENDING');
      assert.equal((await Payment.findOne({orderId}))!.status,'PENDING');
    });
    await t.test('active attempt blocks cancellation and expired URL cannot create second charge',async()=>{
      assert.equal((await api(`/orders/${orderId}/cancel`,0,'PATCH')).status,409);
      assert.equal((await api(`/admin/orders/${orderId}/status`,2,'PATCH',{status:'CANCELLED'})).status,409);
      await VnpayAttempt.updateOne({ref},{$set:{expiresAt:new Date(0)}});
      assert.equal((await api(`/payments/vnpay/orders/${orderId}`,0,'POST')).status,409);
      assert.equal(await VnpayAttempt.countDocuments({orderId}),1);
    });
    await t.test('invalid checksum, tampered amount and wrong terminal do not mutate',async()=>{
      assert.equal((await ipn({...signed(callback),vnp_Amount:'1'})).body.RspCode,'97');
      assert.equal((await ipn(signed({...callback,vnp_Amount:'1'}))).body.RspCode,'04');
      assert.equal((await ipn(signed({...callback,vnp_TmnCode:'OTHER'}))).body.RspCode,'97');
      assert.equal((await Payment.findOne({orderId}))!.status,'PENDING');
    });
    await t.test('valid IPN is public, late success is accepted, replay is idempotent',async()=>{
      const response=await httpFetch(base+'/payments/vnpay/ipn?'+new URLSearchParams(signed(callback)));
      assert.equal((await response.json() as any).RspCode,'00');
      assert.equal((await ipn(signed(callback))).body.RspCode,'02');
      const payment=await Payment.findOne({orderId});assert.equal(payment!.status,'PAID');assert.equal(payment!.gatewayTransactionNo,'12345678');
      assert.equal(await Notification.countDocuments({dedupeKey:`payment:${payment!.id}:PAID`}),1);
      assert.equal((await Order.findById(orderId))!.status,'PENDING');
      assert.equal((await api(`/admin/orders/${orderId}/status`,2,'PATCH',{status:'CONFIRMED'})).status,200);
      assert.equal((await api(`/admin/payments/orders/${orderId}/confirm`,2,'PATCH')).status,409);
    });
    await t.test('failed gateway result permits another attempt, then safe cancellation',async()=>{
      const order=(await checkout()).body.data;const res=await api(`/payments/vnpay/orders/${order._id}`,0,'POST');const r=new URL(res.body.data.url).searchParams.get('vnp_TxnRef')!;
      assert.equal((await ipn(signed({...callback,vnp_TxnRef:r,vnp_ResponseCode:'24',vnp_TransactionStatus:'02'}))).body.RspCode,'00');
      assert.equal((await Payment.findOne({orderId:order._id}))!.status,'PENDING');
      assert.equal((await api(`/orders/${order._id}/cancel`,0,'PATCH')).status,200);
      assert.equal((await api(`/payments/vnpay/orders/${order._id}`,0,'POST')).status,409);
    });
    await t.test('paid VNPAY order supports shipping without collecting COD again',async()=>{
      const res=await api('/admin/shipping',2,'POST',{orderId,carrier:'Test Delivery',trackingCode:'VNPAY-SHIP-001',carrierFee:0});
      assert.equal(res.status,201,JSON.stringify(res.body));
      const shipmentId=res.body.shipment._id;
      for(const status of ['PICKED_UP','IN_TRANSIT','OUT_FOR_DELIVERY','DELIVERED']){
        const next=await api(`/admin/shipping/${shipmentId}/status`,2,'PATCH',{status});assert.equal(next.status,200,JSON.stringify(next.body));
      }
      assert.equal((await Order.findById(orderId))!.status,'DELIVERED');
      assert.equal((await Payment.findOne({orderId}))!.status,'PAID');
    });
    await t.test('concurrent IPN records once; return shipping preserves paid status for separate refund',async()=>{
      const order=(await checkout()).body.data;
      const started=await api(`/payments/vnpay/orders/${order._id}`,0,'POST');
      const r=new URL(started.body.data.url).searchParams.get('vnp_TxnRef')!;
      const payload=signed({...callback,vnp_TxnRef:r,vnp_TransactionNo:'333333'});
      const results=await Promise.all([ipn(payload),ipn(payload)]);
      assert.deepEqual(results.map(x=>x.body.RspCode).sort(),['00','02']);
      const pay=await Payment.findOne({orderId:order._id});
      assert.equal(await Notification.countDocuments({dedupeKey:`payment:${pay!.id}:PAID`}),1);
      assert.equal((await api(`/admin/orders/${order._id}/status`,2,'PATCH',{status:'CONFIRMED'})).status,200);
      const shipment=await api('/admin/shipping',2,'POST',{orderId:order._id,carrier:'Test Delivery',trackingCode:'VNPAY-SHIP-002',carrierFee:0});
      assert.equal(shipment.status,201);
      for(const status of ['PICKED_UP','IN_TRANSIT','OUT_FOR_DELIVERY','DELIVERY_FAILED','RETURNING','RETURNED']){
        const res=await api(`/admin/shipping/${shipment.body.shipment._id}/status`,2,'PATCH',{status,note:'Test return'});assert.equal(res.status,200,JSON.stringify(res.body));
      }
      assert.equal((await Order.findById(order._id))!.status,'RETURNED');
      assert.equal((await Payment.findOne({orderId:order._id}))!.status,'PAID');
    });
    await t.test('reconciliation verifies gateway response and never trusts an unsigned success',async()=>{
      const order=(await checkout()).body.data;await api(`/payments/vnpay/orders/${order._id}`,0,'POST');
      const a=await VnpayAttempt.findOne({orderId:order._id});
      const reply:Record<string,string>={vnp_ResponseId:'response1',vnp_Command:'querydr',vnp_ResponseCode:'00',vnp_Message:'Success',vnp_TmnCode:'TESTCODE',vnp_TxnRef:a!.ref,vnp_Amount:'1000000',vnp_BankCode:'NCB',vnp_PayDate:'20261117120000',vnp_TransactionNo:'222222',vnp_TransactionType:'01',vnp_TransactionStatus:'00',vnp_OrderInfo:'Test'};
      let valid=false;
      globalThis.fetch=async(input,init)=>{
        assert.equal(String(input),'https://sandbox.vnpayment.vn/merchant_webapi/api/transaction');
        const request=JSON.parse(init!.body as string);assert.equal(request.vnp_TxnRef,a!.ref);
        const keys=['vnp_RequestId','vnp_Version','vnp_Command','vnp_TmnCode','vnp_TxnRef','vnp_TransactionDate','vnp_CreateDate','vnp_IpAddr','vnp_OrderInfo'];
        assert.equal(request.vnp_SecureHash,createHmac('sha512',process.env.VNPAY_HASH_SECRET!).update(keys.map(k=>request[k]).join('|')).digest('hex'));
        const fields=['vnp_ResponseId','vnp_Command','vnp_ResponseCode','vnp_Message','vnp_TmnCode','vnp_TxnRef','vnp_Amount','vnp_BankCode','vnp_PayDate','vnp_TransactionNo','vnp_TransactionType','vnp_TransactionStatus','vnp_OrderInfo','vnp_PromotionCode','vnp_PromotionAmount'];
        return new Response(JSON.stringify({...reply,vnp_SecureHash:valid?createHmac('sha512',process.env.VNPAY_HASH_SECRET!).update(fields.map(k=>reply[k]||'').join('|')).digest('hex'):'0'.repeat(128)}));
      };
      try{
        assert.equal((await api(`/payments/vnpay/orders/${order._id}/reconcile`,0,'POST')).status,502);
        assert.equal((await Payment.findOne({orderId:order._id}))!.status,'PENDING');
        valid=true;assert.equal((await api(`/payments/vnpay/orders/${order._id}/reconcile`,0,'POST')).status,200);
        assert.equal((await Payment.findOne({orderId:order._id}))!.status,'PAID');
      }finally{globalThis.fetch=httpFetch;}
    });
  }finally{
    if(server)await new Promise<void>(resolve=>server!.close(()=>resolve()));
    await mongoose.disconnect();await mongo.stop();
  }
});
