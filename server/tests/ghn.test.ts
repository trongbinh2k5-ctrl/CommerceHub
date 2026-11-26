import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import mongoose from 'mongoose';
import jwt from 'jsonwebtoken';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import { createApp } from '../src/app';
import { User } from '../src/modules/auth/user.model';
import { Product } from '../src/modules/products/product.model';
import { Order,OrderStatus,PaymentMethod } from '../src/modules/orders/order.model';
import { Payment,PaymentStatus } from '../src/modules/payments/payment.model';
import { Shipment } from '../src/modules/shipping/shipping.model';
import { GhnBooking } from '../src/modules/shipping/ghn.model';
import { ghnConfig } from '../src/modules/shipping/ghn.config';

test('GHN staging booking, recovery, synchronization and money invariants',{timeout:180000},async t=>{
  process.env.NODE_ENV='test';process.env.EMAIL_VERIFICATION_REQUIRED='false';process.env.JWT_ACCESS_SECRET='ghn-isolated-test-jwt-secret-at-least-32-bytes';
  process.env.GHN_ENABLED='true';process.env.GHN_ENV='staging';process.env.GHN_TOKEN='fake-staging-token';process.env.GHN_SHOP_ID='123';
  const mongo=await MongoMemoryReplSet.create({replSet:{count:1}});let server:ReturnType<ReturnType<typeof createApp>['listen']>|undefined;
  const httpFetch=globalThis.fetch;
  try{
    await mongoose.connect(mongo.getUri('isolated_ghn'));await Promise.all(Object.values(mongoose.models).map(m=>m.init()));
    const users=await User.create(['CUSTOMER','STAFF','ADMIN'].map((role,i)=>({fullName:role,email:`ghn-${i}@test.local`,passwordHash:'unused',role})));
    const tokens=users.map(u=>jwt.sign({role:u.role},process.env.JWT_ACCESS_SECRET!,{subject:u.id}));
    server=createApp({apiRateLimit:10000}).listen(0,'127.0.0.1');await once(server,'listening');
    const base=`http://127.0.0.1:${(server.address() as {port:number}).port}/api`;
    const api=async(path:string,user=2,method='GET',body?:unknown)=>{const r=await httpFetch(base+path,{method,headers:{Authorization:`Bearer ${tokens[user]}`,'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});return {status:r.status,body:await r.json() as any};};
    let count=0,remoteCalls=0,timeoutAfterCreate=false,badShop=false,badSender=false,badRecipient=false,lookupUnavailable=false,now=Date.parse('2026-11-21T10:00:00Z');
    const remotes=new Map<string,any>();
    globalThis.fetch=async(input,init)=>{
      remoteCalls++;const url=new URL(String(input));assert.equal(url.origin,'https://dev-online-gateway.ghn.vn');assert.equal(init!.redirect,'error');
      const h=init!.headers as Record<string,string>;assert.equal(h.Token,'fake-staging-token');assert.equal(h.ShopId,'123');
      const body=init!.body?JSON.parse(String(init!.body)):{};
      if(badRecipient&&url.pathname.endsWith('/preview'))return new Response(JSON.stringify({code:400,message:`Fail when get place name of from ward code: ward not found: ${body.to_ward_name} in province ${body.to_province_name}`}),{status:400});
      if(url.pathname.endsWith('/preview'))return badSender?new Response(JSON.stringify({code:400,message:'Fail when get place name of from ward code: ward not found: PRIVATE_ADDRESS in province PRIVATE_PROVINCE'}),{status:400}):new Response(JSON.stringify({code:200,data:{total_fee:32000,order_code:''}}));
      if(url.pathname.endsWith('/create')){
        assert.equal(body.payment_type_id,1);assert.equal(body.is_new_to_address,true);assert.equal(body.service_type_id,2);assert.equal(body.insurance_value,0);
        let remote=remotes.get(body.client_order_code);
        if(!remote){remote={order_code:'GHN'+String(remotes.size+1).padStart(5,'0'),client_order_code:body.client_order_code,shop_id:123,status:'ready_to_pick',cod_amount:body.cod_amount,updated_date:new Date(now+=1000).toISOString()};remotes.set(body.client_order_code,remote);}
        if(timeoutAfterCreate){timeoutAfterCreate=false;throw new Error('simulated network timeout after remote commit');}
        return new Response(JSON.stringify({code:200,data:{order_code:remote.order_code,total_fee:32000}}));
      }
      if(url.pathname.endsWith('/cancel')){
        const remote=[...remotes.values()].find(x=>body.order_codes.includes(x.order_code));assert.ok(remote);remote.status='cancel';remote.updated_date=new Date(now+=1000).toISOString();
        return new Response(JSON.stringify({code:200,data:[{order_code:remote.order_code,result:true}]}));
      }
      assert.ok(url.pathname.endsWith('/detail-by-client-code'));
      if(lookupUnavailable)return new Response(JSON.stringify({code:401,message:'Unauthorized'}),{status:401});
      const remote=remotes.get(url.searchParams.get('client_order_code')!);
      if(!remote)return new Response(JSON.stringify({code:400,message:'Lỗi gọi api: corev2_tenant_order_detail_by_client_order_code - Đơn hàng không tồn tại'}),{status:400});
      return new Response(JSON.stringify({code:200,data:{...remote,shop_id:badShop?999:123}}));
    };
    const parcel={weight:500,length:20,width:15,height:10};
    const fixture=async(method=PaymentMethod.COD,paid=false)=>{
      const product=await Product.create({name:'Test laptop',sku:'GHN-'+(++count),price:10000,stock:8});
      const order=await Order.create({userId:users[0]._id,items:[{productId:product._id,name:product.name,sku:product.sku,price:10000,quantity:2,subtotal:20000}],shippingAddress:{fullName:'Test recipient',phone:'0901234567',province:'Hồ Chí Minh',ward:'Phường Sài Gòn',detail:'123 Test'},totalAmount:20000,paymentMethod:method,status:OrderStatus.CONFIRMED});
      await Payment.create({orderId:order._id,userId:users[0]._id,method,amount:20000,status:paid?PaymentStatus.PAID:PaymentStatus.PENDING});return {order,product};
    };
    let current=await fixture();
    const call=(operation:string,body:unknown=parcel,user=2)=>api(`/admin/shipping/ghn/orders/${current.order.id}/${operation}`,user,'POST',body);
    const remote=()=>remotes.get('BC-'+current.order.id)!;
    const setStatus=(status:string)=>{remote().status=status;remote().updated_date=new Date(now+=1000).toISOString();};
    await t.test('only staging is enabled; missing credentials are explicit and customers cannot book',async()=>{
      process.env.GHN_ENV='production';assert.equal(ghnConfig(),null);process.env.GHN_ENV='staging';
      process.env.GHN_ENABLED='false';assert.equal((await call('create')).status,503);process.env.GHN_ENABLED='true';
      assert.equal((await call('create',parcel,0)).status,403);assert.equal(remoteCalls,0);
    });
    await t.test('invalid parcels and unconfirmed/unpaid online orders cannot reach GHN',async()=>{
      const before=remoteCalls;
      for(const weight of [0,20000,1.5,'500'])assert.equal((await call('create',{...parcel,weight})).status,400);
      await Order.updateOne({_id:current.order._id},{$set:{status:OrderStatus.PENDING}});assert.equal((await call('create')).status,409);await Order.updateOne({_id:current.order._id},{$set:{status:OrderStatus.CONFIRMED}});
      const saved=current;current=await fixture(PaymentMethod.SEPAY);assert.equal((await call('create')).status,409);current=saved;assert.equal(remoteCalls,before);
    });
    await t.test('preview does not reserve or change customer price; COD is server-derived',async()=>{
      const res=await call('preview',{...parcel,cod_amount:1});assert.equal(res.status,200);assert.equal(res.body.data.fee,32000);assert.equal(res.body.data.codAmount,20000);
      assert.equal(await GhnBooking.countDocuments(),0);assert.equal(await Shipment.countDocuments(),0);assert.equal((await Order.findById(current.order.id))!.totalAmount,20000);
    });
    await t.test('invalid sender address explains the shop fix without exposing provider details',async()=>{
      badSender=true;
      try{const res=await call('preview');assert.equal(res.status,502);assert.match(res.body.message,/địa chỉ lấy hàng/);assert.ok(!JSON.stringify(res.body).includes('PRIVATE_'));assert.equal(await GhnBooking.countDocuments(),0);}
      finally{badSender=false;}
    });
    await t.test('mislabelled GHN recipient lookup errors do not instruct staff to change the shop',async()=>{
      badRecipient=true;
      try{const res=await call('preview');assert.equal(res.status,502);assert.match(res.body.message,/người nhận/);assert.ok(!res.body.message.includes('địa chỉ lấy hàng'));assert.equal(await GhnBooking.countDocuments(),0);}
      finally{badRecipient=false;}
    });
    await t.test('lost create acknowledgment locks cancellation and manual shipping; same code recovers exactly once',async()=>{
      timeoutAfterCreate=true;assert.equal((await call('create')).status,502);assert.equal((await GhnBooking.findOne({orderId:current.order._id}))!.state,'UNCERTAIN');
      assert.equal((await api(`/admin/orders/${current.order.id}/status`,2,'PATCH',{status:'CANCELLED'})).status,409);
      assert.equal((await api('/admin/shipping',2,'POST',{orderId:current.order.id,carrier:'Manual',trackingCode:'MANUAL-001',carrierFee:1})).status,409);
      assert.equal((await call('create',{...parcel,weight:700})).status,409);
      const res=await call('create');assert.equal(res.status,200,JSON.stringify(res.body));assert.equal(res.body.data.provider,'GHN');
      assert.equal(remotes.size,1);assert.equal(await Shipment.countDocuments({orderId:current.order._id}),1);assert.equal(res.body.data.carrierFee,32000);
      assert.equal((await call('create')).status,200);assert.equal(remotes.size,1);
      const bookingView=await api(`/admin/shipping/ghn/orders/${current.order.id}`);
      assert.equal(bookingView.status,200);assert.deepEqual(bookingView.body.data.parcel,parcel);
      assert.equal(bookingView.body.data.state,'CREATED');assert.equal(bookingView.body.data.payload,undefined);
      assert.equal(bookingView.body.data.actorId,undefined);
    });
    await t.test('manual status mutation of provider-owned shipping is refused',async()=>{
      const shipment=await Shipment.findOne({orderId:current.order._id});assert.equal((await api(`/admin/shipping/${shipment!.id}/status`,1,'PATCH',{status:'PICKED_UP'})).status,409);
    });
    await t.test('shop/amount mismatches cannot alter local status',async()=>{
      badShop=true;assert.equal((await call('sync')).status,502);badShop=false;
      remote().cod_amount=1;assert.equal((await call('sync')).status,409);remote().cod_amount=20000;
      assert.equal((await Shipment.findOne({orderId:current.order._id}))!.status,'READY');
    });
    await t.test('authoritative status may skip intermediate steps; replay and old snapshots do not duplicate events',async()=>{
      setStatus('delivering');assert.equal((await call('sync')).status,200);
      const shipment=await Shipment.findOne({orderId:current.order._id});assert.equal(shipment!.status,'OUT_FOR_DELIVERY');assert.equal((await Order.findById(current.order.id))!.status,'SHIPPING');
      const events=shipment!.events.length;assert.equal((await call('sync')).status,200);assert.equal((await Shipment.findById(shipment!._id))!.events.length,events);
      remote().status='ready_to_pick';remote().updated_date='2020-01-01T00:00:00Z';assert.equal((await call('sync')).status,200);assert.equal((await Shipment.findById(shipment!._id))!.status,'OUT_FOR_DELIVERY');
      setStatus('delivered');assert.equal((await call('sync')).status,200);assert.equal((await Order.findById(current.order.id))!.status,'DELIVERED');assert.equal((await Payment.findOne({orderId:current.order._id}))!.status,'PENDING');
    });
    await t.test('customers read their timeline without internal carrier fee',async()=>{
      const res=await api(`/shipping/me/orders/${current.order.id}`,0);assert.equal(res.status,200);assert.equal(res.body.shipment.carrierFee,undefined);assert.equal(res.body.shipment.status,'DELIVERED');assert.ok(res.body.shipment.events.length>1);
    });
    await t.test('paid online order sends zero COD; carrier returns preserve paid money and do not restore stock',async()=>{
      current=await fixture(PaymentMethod.SEPAY,true);assert.equal((await call('create')).status,200);assert.equal(remote().cod_amount,0);
      setStatus('returned');assert.equal((await call('sync')).status,200);assert.equal((await Order.findById(current.order.id))!.status,'RETURNED');assert.equal((await Payment.findOne({orderId:current.order._id}))!.status,'PAID');assert.equal((await Product.findById(current.product.id))!.stock,8);
    });
    await t.test('provider cancellation does not cancel the shop order; normal cancellation then restores stock once',async()=>{
      current=await fixture();assert.equal((await call('create')).status,200);assert.equal((await call('cancel')).status,200);
      assert.equal((await GhnBooking.findOne({orderId:current.order._id}))!.state,'CANCELLED');assert.equal((await Order.findById(current.order.id))!.status,'CONFIRMED');assert.equal((await Product.findById(current.product.id))!.stock,8);
      assert.equal((await api(`/admin/orders/${current.order.id}/status`,2,'PATCH',{status:'CANCELLED'})).status,200);assert.equal((await Product.findById(current.product.id))!.stock,10);
    });
    await t.test('customer cancels a confirmed COD order before handover; stock restores once',async()=>{
      current=await fixture();
      assert.equal((await api(`/orders/${current.order.id}/cancel`,0,'PATCH')).status,200);
      assert.equal((await Product.findById(current.product.id))!.stock,10);
      assert.equal((await api(`/orders/${current.order.id}/cancel`,0,'PATCH')).status,409);
      assert.equal((await Product.findById(current.product.id))!.stock,10);
    });
    await t.test('paid cancellation preserves captured money and requests separate refund',async()=>{
      current=await fixture(PaymentMethod.SEPAY,true);
      assert.equal((await api(`/orders/${current.order.id}/cancel`,0,'PATCH')).status,200);
      const payment=await Payment.findOne({orderId:current.order._id});
      assert.equal(payment!.status,'PAID');assert.equal(payment!.refundStatus,'REQUESTED');assert.ok(payment!.refundRequestedAt);
      assert.equal((await Order.findById(current.order.id))!.status,'CANCELLED');assert.equal((await Product.findById(current.product.id))!.stock,10);
    });
    await t.test('customer cancellation first confirms cancellation with GHN; handover blocks later cancellation',async()=>{
      current=await fixture();assert.equal((await call('create')).status,200);
      assert.equal((await api(`/orders/${current.order.id}/cancel`,0,'PATCH')).status,200);assert.equal(remote().status,'cancel');
      current=await fixture();assert.equal((await call('create')).status,200);setStatus('picked');assert.equal((await call('sync')).status,200);
      assert.equal((await api(`/orders/${current.order.id}/cancel`,0,'PATCH')).status,409);assert.equal((await Product.findById(current.product.id))!.stock,8);
    });
    await t.test('customer summary separates unpaid online orders and orders awaiting approval',async()=>{
      current=await fixture(PaymentMethod.SEPAY);await Order.updateOne({_id:current.order._id},{$set:{status:OrderStatus.PENDING}});
      const cod=await fixture();await Order.updateOne({_id:cod.order._id},{$set:{status:OrderStatus.PENDING}});
      const summary=await api('/orders/summary',0);assert.equal(summary.status,200);assert.equal(summary.body.data.awaitingPayment,1);assert.equal(summary.body.data.awaitingApproval,1);
      const adminSummary=await api('/admin/orders/summary');assert.equal(adminSummary.status,200);assert.equal(adminSummary.body.data.awaitingApproval,1);assert.equal(adminSummary.body.data.awaitingPayment,1);
      assert.equal((await api('/admin/orders/summary',0)).status,403);
    });
    const historicalBooking=async()=>{
      const booking=await GhnBooking.create({orderId:current.order._id,actorId:users[2]._id,shopId:123,clientCode:'BC-'+current.order.id,state:'UNCERTAIN',payload:parcel});
      await GhnBooking.collection.updateOne({_id:booking._id},{$set:{updatedAt:new Date(Date.now()-120000)}});
      return booking;
    };
    await t.test('old failed request without any GHN order can be cancelled and paid money stays pending refund',async()=>{
      current=await fixture(PaymentMethod.SEPAY,true);const booking=await historicalBooking();
      const res=await api(`/orders/${current.order.id}/cancel`,0,'PATCH');assert.equal(res.status,200,JSON.stringify(res.body));
      assert.equal((await GhnBooking.findById(booking._id))!.state,'CANCELLED');
      assert.equal((await Product.findById(current.product.id))!.stock,10);
      const payment=await Payment.findOne({orderId:current.order._id});assert.equal(payment!.status,'PAID');assert.equal(payment!.refundStatus,'REQUESTED');
      assert.equal((await call('create')).status,409);
    });
    await t.test('carrier unavailability keeps cancellation locked and a later cancellation retry reconciles safely',async()=>{
      current=await fixture();const booking=await historicalBooking();lookupUnavailable=true;
      try{assert.equal((await api(`/orders/${current.order.id}/cancel`,0,'PATCH')).status,502);}finally{lookupUnavailable=false;}
      assert.equal((await Order.findById(current.order.id))!.status,'CONFIRMED');assert.equal((await Product.findById(current.product.id))!.stock,8);
      assert.equal((await GhnBooking.findById(booking._id))!.state,'CANCEL_CHECK');assert.equal((await call('create')).status,409);
      assert.equal((await api(`/orders/${current.order.id}/cancel`,0,'PATCH')).status,200);
    });
    await t.test('an uncertain request that exists remotely is cancelled and verified without creating another shipment',async()=>{
      current=await fixture();await historicalBooking();
      remotes.set('BC-'+current.order.id,{order_code:'RECOVER001',client_order_code:'BC-'+current.order.id,shop_id:123,status:'ready_to_pick',cod_amount:20000,updated_date:new Date(now+=1000).toISOString()});
      assert.equal((await api(`/orders/${current.order.id}/cancel`,0,'PATCH')).status,200);assert.equal(remote().status,'cancel');assert.equal(await Shipment.countDocuments({orderId:current.order._id}),0);
    });
    await t.test('an active create lease or recent attempt blocks uncertain cancellation before contacting GHN',async()=>{
      current=await fixture();const booking=await historicalBooking();await GhnBooking.updateOne({_id:booking._id},{$set:{createLeaseUntil:new Date(Date.now()+60000)}});
      const before=remoteCalls;assert.equal((await api(`/orders/${current.order.id}/cancel`,0,'PATCH')).status,409);assert.equal(remoteCalls,before);
      await GhnBooking.updateOne({_id:booking._id},{$unset:{createLeaseUntil:1},$set:{lastCreateStartedAt:new Date()}});
      assert.equal((await api(`/orders/${current.order.id}/cancel`,0,'PATCH')).status,409);assert.equal(remoteCalls,before);
    });
    await t.test('concurrent create requests share a client code and persist a single shipment',async()=>{
      current=await fixture();const before=remotes.size;
      const results=await Promise.all([call('create'),call('create')]);
      assert.ok(results.some(r=>r.status===200),JSON.stringify(results));
      assert.ok(results.every(r=>[200,409].includes(r.status)),JSON.stringify(results));
      assert.equal(await Shipment.countDocuments({orderId:current.order._id}),1);assert.equal(await GhnBooking.countDocuments({orderId:current.order._id}),1);assert.equal(remotes.size,before+1);
    });
  }finally{globalThis.fetch=httpFetch;if(server)await new Promise<void>(resolve=>server!.close(()=>resolve()));await mongoose.disconnect();await mongo.stop();}
});
